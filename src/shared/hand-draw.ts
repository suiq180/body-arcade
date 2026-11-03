// 카메라 화면 위에 손 뼈대를 겹쳐 그리는 공통 함수 (손 추적 준비 화면과 게임이 함께 씀)

import { HAND_BONES, type HandPoint, type HandState } from '../input/hand-gestures';
import { toPx, type VideoRect } from './pose-draw';

export const HAND_STATE_COLORS: Record<HandState, string> = {
  open: '#51cf66',
  pinch: '#ffd43b',
  fist: '#ff6b6b',
};

export function drawHand(ctx: CanvasRenderingContext2D, rect: VideoRect, lm: HandPoint[], color: string, width = 3): void {
  ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.strokeStyle = color;
  for (const [a, b] of HAND_BONES) {
    const p = toPx(rect, lm[a]), q = toPx(rect, lm[b]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  for (const pt of lm) {
    const p = toPx(rect, pt);
    ctx.beginPath(); ctx.arc(p.x, p.y, width * 0.9, 0, Math.PI * 2); ctx.fill();
  }
}
