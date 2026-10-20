import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { extractFeatures, TemporalBuffer, FEATURE_SCHEMA } from './features';
import { extractFeaturesV2, TemporalBufferV2, FEATURE_SCHEMA_V2 } from './features-v2';
import { isFeatureSchema, type FeatureSchema } from './schemas';
import { mapResults } from './map-results';
import { diagnoseFrame } from './diagnostics';
import type { VisionRequest, VisionResponse } from './protocol';

let hands: HandLandmarker | undefined;
let pose: PoseLandmarker | undefined;
let initializing = false;
let windows = 0;
let continuity = 0;
let lastTimestamp = -1;
let diagnosticsEnabled = false;
const buffer = new TemporalBuffer();
const bufferV2 = new TemporalBufferV2();
let schema: FeatureSchema = FEATURE_SCHEMA;
const send = (response: VisionResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(response, transfer);
const local = (path: string) => new URL(path, self.location.href).href;

self.onmessage = async (event: MessageEvent<VisionRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'INITIALIZE') {
      if (initializing || hands) return;
      initializing = true;
      diagnosticsEnabled = request.diagnostics === true;
      if (request.schema !== undefined && !isFeatureSchema(request.schema)) throw new Error('Unsupported feature schema.');
      schema = request.schema ?? FEATURE_SCHEMA;
      const files = await FilesetResolver.forVisionTasks(local('vendor/mediapipe/wasm'));
      try {
        hands = await HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: local('models/hand_landmarker.task'), delegate: 'GPU' },
          runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
      } catch {
        hands = await HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: local('models/hand_landmarker.task'), delegate: 'CPU' },
          runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
      }
      try {
        pose = await PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: local('models/pose_landmarker_lite.task'), delegate: 'GPU' },
          runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
          minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
      } catch {
        pose = await PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: local('models/pose_landmarker_lite.task'), delegate: 'CPU' },
          runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
          minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
      }
      send({ type: 'READY' });
    } else if (request.type === 'FRAME') {
      try {
        if (!hands || !pose) throw new Error('Landmark detectors are not ready.');
        const started = performance.now();
        const t0 = performance.now();
        const handResult = hands.detectForVideo(request.bitmap, request.timestampMs);
        const handMs = performance.now() - t0;
        const t1 = performance.now();
        const poseResult = pose.detectForVideo(request.bitmap, request.timestampMs);
        const poseMs = performance.now() - t1;
        let frame;
        try { frame = mapResults(handResult, poseResult, request.timestampMs, request.bitmap.width, request.bitmap.height); }
        finally { poseResult.close(); }
        const featureStart = performance.now();
        const features = schema === FEATURE_SCHEMA_V2 ? extractFeaturesV2(frame) : extractFeatures(frame);
        const diagnostics = diagnosticsEnabled ? { ...diagnoseFrame(frame, features),
          handedness: handResult.handedness.map((categories, index) => ({
            category: categories[0]?.categoryName ?? '', score: categories[0]?.score ?? 0,
            points: handResult.landmarks[index]?.length ?? 0,
          })) } : undefined;
        if (!features.usable || (lastTimestamp >= 0 && frame.timestampMs - lastTimestamp > 250)) continuity++;
        lastTimestamp = frame.timestampMs;
        const values = features.schema === FEATURE_SCHEMA_V2 ? bufferV2.push(features) : buffer.push(features);
        const selectedBuffer = schema === FEATURE_SCHEMA_V2 ? bufferV2 : buffer;
        const sequence = values ? { values, timestamps: selectedBuffer.timestamps, schema, samplingHz: schema === FEATURE_SCHEMA_V2 ? 30 as const : 15 as const } : undefined;
        if (sequence) windows++;
        send({ type: 'RESULT', frame, processingMs: performance.now() - started, featureMs: performance.now() - featureStart,
          handMs, poseMs, bufferSize: selectedBuffer.size, windows, featureState: features.reason, continuity, sequence, diagnostics }, values ? [values.buffer] : []);
      } finally { request.bitmap.close(); }
    }
  } catch (error) {
    hands?.close(); pose?.close(); hands = undefined; pose = undefined; buffer.clear(); bufferV2.clear();
    send({ type: 'ERROR', message: error instanceof Error ? error.message : 'Local landmark processing failed.' });
  }
};
