import { POSE_INDICES } from './features';
import type { LandmarkFrame, NormalizedLandmark } from './types';

const HAND_EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]] as const;
const POSE_EDGES = [[11,12],[11,13],[13,15],[15,17],[12,14],[14,16],[16,18],[11,23],[12,24],[23,24]] as const;
export function drawLandmarks(canvas: HTMLCanvasElement, frame: LandmarkFrame, enabled: boolean) {
  if (canvas.width !== frame.imageWidth) canvas.width = frame.imageWidth;
  if (canvas.height !== frame.imageHeight) canvas.height = frame.imageHeight;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!enabled) return;
  const visible = (point: NormalizedLandmark | undefined): point is NormalizedLandmark => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= 0.5);
  const draw = (points: readonly NormalizedLandmark[] | null, edges: readonly (readonly [number, number])[], color: string, indices?: readonly number[]) => {
    if (!points) return;
    context.strokeStyle = color; context.fillStyle = color; context.lineWidth = 3;
    for (const [a, b] of edges) {
      const first = points[a]; const second = points[b];
      if (!visible(first) || !visible(second)) continue;
      context.beginPath(); context.moveTo(first.x * canvas.width, first.y * canvas.height); context.lineTo(second.x * canvas.width, second.y * canvas.height); context.stroke();
    }
    points.forEach((point, index) => {
      if (!visible(point) || (indices && !indices.includes(index))) return;
      context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, 2 * Math.PI); context.fill();
    });
  };
  draw(frame.pose, POSE_EDGES, '#b4a4ff', POSE_INDICES);
  draw(frame.leftHand, HAND_EDGES, '#5eead4');
  draw(frame.rightHand, HAND_EDGES, '#fbbf24');
}
