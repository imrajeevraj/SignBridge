import { expect, it } from 'vitest';
import golden from '../../ml/tests/golden-vector-v2.json';
import { extractFeatures } from '../src/vision/features';
import { extractFeaturesV2, TemporalBufferV2 } from '../src/vision/features-v2';

it('matches the shared v2 golden vector without altering v1 rejection', () => {
  expect(extractFeatures(golden.frame).reason).toBe('pose_unavailable');
  const result = extractFeaturesV2(golden.frame);
  expect(result.usable).toBe(true); expect(Array.from(result.values)).toEqual(golden.expected);
  expect(result.values.slice(153,159)).toEqual(new Float32Array(6));
  expect(Array.from(result.values.slice(170))).toEqual([0,0]);
});
it('retains mandatory shoulders and actual hand validity', () => {
  for (const index of [11,12]) {
    const frame = structuredClone(golden.frame);frame.pose[index]!.visibility=.49;
    expect(extractFeaturesV2(frame).reason).toBe('pose_unavailable');
  }
  expect(extractFeaturesV2({...golden.frame,leftHand:null,rightHand:null}).reason).toBe('no_hands');
  const frame=structuredClone(golden.frame);frame.leftHand[0]!.x=NaN;
  const result=extractFeaturesV2(frame);expect(result.values[159]).toBe(0);
  expect(Array.from(result.values.slice(0,63)).every(v=>v===0)).toBe(true);
});
it('preserves exact 32 frames, stride 8, resets, gaps and timestamp ordering', () => {
  const buffer=new TemporalBufferV2();const emitted=[];
  for(let i=0;i<48;i++) {
    const sequence=buffer.push(extractFeaturesV2({...golden.frame,timestampMs:i*70}));
    if(sequence){emitted.push(i);expect(sequence).toHaveLength(5504);}
  }
  expect(emitted).toEqual([31,39,47]);
  buffer.push(extractFeaturesV2({...golden.frame,timestampMs:4000}));expect(buffer.size).toBe(1);
  expect(()=>buffer.push(extractFeaturesV2({...golden.frame,timestampMs:4000}))).toThrow('increase');
  buffer.push(extractFeaturesV2({...golden.frame,timestampMs:4070,leftHand:null,rightHand:null}));expect(buffer.size).toBe(0);
});
