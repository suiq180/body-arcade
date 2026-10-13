// 카메라 화면 위에 뼈대·색 버튼을 겹쳐 그리는 공통 함수 (준비 화면과 게임이 함께 씀)
// 영상은 <video>(object-fit: contain, 거울 모드)로 따로 보여 주고, 여기서는 투명 캔버스에만 그린다.

import { TOUCH_BUTTONS, type Point, type PoseAction } from '../input/pose-actions';

export const PLAYER_COLORS = ['#ff6b6b', '#4dabf7'];

export const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export interface VideoRect { ox: number; oy: number; dw: number; dh: number }

/** 캔버스 크기를 화면 크기에 맞추고, 영상이 그려진 영역(contain)을 계산한다 */
export function fitCanvas(canvas: HTMLCanvasElement, video: HTMLVideoElement): VideoRect {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const scale = Math.min(r.width / vw, r.height / vh);
  const dw = vw * scale, dh = vh * scale;
  return { ox: (r.width - dw) / 2, oy: (r.height - dh) / 2, dw, dh };
}

export const toPx = (rect: VideoRect, p: { x: number; y: number }) => ({ x: rect.ox + p.x * rect.dw, y: rect.oy + p.y * rect.dh });

const vis = (p: Point | undefined): p is Point => !!p && p.visibility >= 0.5;

export function drawSkeleton(ctx: CanvasRenderingContext2D, rect: VideoRect, lm: Point[], color: string, width = 5): void {
  ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.strokeStyle = color;
  for (const [a, b] of BONES) {
    if (!vis(lm[a]) || !vis(lm[b])) continue;
    const p = toPx(rect, lm[a]), q = toPx(rect, lm[b]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  for (const i of JOINTS) {
    if (!vis(lm[i])) continue;
    const p = toPx(rect, lm[i]);
    ctx.beginPath(); ctx.arc(p.x, p.y, i === 15 || i === 16 ? width * 1.6 : width, 0, Math.PI * 2); ctx.fill();
  }
}

/** 플레이어 영역 안의 빨강·파랑·노랑 버튼 (치기 동작 목표) */
export function drawButtons(
  ctx: CanvasRenderingContext2D, rect: VideoRect, region: [number, number], radius: number, active: PoseAction | null,
): void {
  const [x0, x1] = region;
  for (const b of TOUCH_BUTTONS) {
    const c = toPx(rect, { x: x0 + b.x * (x1 - x0), y: b.y });
    const r = radius * rect.dh;
    const hit = active === b.id;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = b.color + (hit ? 'ee' : '66'); ctx.fill();
    ctx.lineWidth = hit ? 5 : 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
}

export function drawCenterLine(ctx: CanvasRenderingContext2D, rect: VideoRect, warn: boolean): void {
  const x = rect.ox + rect.dw / 2;
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = warn ? 4 : 2;
  ctx.strokeStyle = warn ? '#ff922b' : 'rgba(255,255,255,.6)';
  ctx.beginPath(); ctx.moveTo(x, rect.oy); ctx.lineTo(x, rect.oy + rect.dh); ctx.stroke();
  ctx.restore();
}
