// 사물 인식 칸·상자·인식 결과를 카메라 화면 위에 겹쳐 그린다 (준비 화면과 게임이 함께 씀)

import type { CameraObjectAdapter } from '../input/camera-object';
import type { VideoRect } from './pose-draw';

export interface ZoneDrawOptions {
  /** 칸 색 (플레이어 색) */
  colors: string[];
  /** 라벨 번호 → 화면 이름 (이모지 포함) */
  labelText: (label: number) => string;
  /** 칸별 확정 진행도 0~1 (상자 테두리가 차오름) */
  progress?: number[];
  /** 이 라벨의 확률을 막대로 보여 준다 (없으면 가장 높은 라벨) */
  focusLabel?: number;
  /** 칸별 짧은 안내 (상자 위에 표시, 예: "그건 지갑이에요!") */
  notes?: (string | null)[];
  /** 빈 상자로 판단된 칸에 보일 이름 */
  emptyText?: string;
  /** 칸 이름 (없으면 P1, P2 …) */
  names?: string[];
}

export function drawZones(ctx: CanvasRenderingContext2D, rect: VideoRect, adapter: CameraObjectAdapter, o: ZoneDrawOptions): void {
  const n = adapter.zones;
  const font = Math.max(12, Math.min(22, rect.dw / (n * 9)));
  ctx.save();
  // 칸 구분선
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  for (let i = 1; i < n; i++) {
    const x = rect.ox + (rect.dw * i) / n;
    ctx.beginPath(); ctx.moveTo(x, rect.oy); ctx.lineTo(x, rect.oy + rect.dh); ctx.stroke();
  }
  ctx.setLineDash([]);

  for (let i = 0; i < n; i++) {
    const color = o.colors[i % o.colors.length];
    const b = adapter.box(i);
    const x = rect.ox + b.x * rect.dw, y = rect.oy + b.y * rect.dh, w = b.w * rect.dw, h = b.h * rect.dh;
    // 인식 상자
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.globalAlpha = 1;
    // 확정 진행도: 테두리가 시계 방향으로 차오름
    const p = o.progress?.[i] ?? 0;
    if (p > 0) {
      ctx.lineWidth = 8;
      ctx.setLineDash([2 * (w + h) * p, 1e5]);
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 칸 이름
    ctx.font = `800 ${font * 1.2}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    pill(ctx, o.names?.[i] ?? `P${i + 1}`, rect.ox + (rect.dw * i) / n + 8, rect.oy + 8, color, '#111');

    const note = o.notes?.[i];
    if (note) {
      fitFont(ctx, note, 800, font, w);
      pill(ctx, note, x + w / 2, Math.max(rect.oy + font * 2.2, y - font * 2), '#ff4d4f', '#fff', true);
    }

    // 지금 인식 결과 (항상 표시, 기획서 8.4)
    const z = adapter.last.zones[i];
    if (!z) continue;
    const label = o.focusLabel ?? z.top;
    const prob = z.empty ? 0 : z.probs[label] ?? 0;
    const by = y + h - font * 1.5 - 24; // 상자 안쪽 아래 (화면 밖으로 안 나가게)
    ctx.textAlign = 'center';
    const text = z.empty
      ? `${o.emptyText ?? '⬜ 빈 상자'} ✓` // 기록해 둔 빈 화면과 비슷함
      : `${o.labelText(z.top)} ${Math.round(z.topProb * 100)}%`;
    fitFont(ctx, text, 700, font, w);
    pill(ctx, text, x + w / 2, by, 'rgba(0,0,0,.65)', '#fff', true);
    // 확률 막대
    const barY = by + font * 1.5 + 6;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(x, barY, w, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x, barY, w * prob, 8);
  }
  ctx.restore();
}

/** 글자가 상자 너비를 넘으면 글자 크기를 줄인다 (칸이 좁은 4인용에서 옆 칸과 겹치지 않게) */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number): void {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size; // pill 좌우 여백 포함
  if (w > maxW) ctx.font = `${weight} ${Math.max(9, (size * maxW) / w)}px system-ui, sans-serif`;
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string, center = false): void {
  const m = ctx.measureText(text);
  const fs = parseFloat(ctx.font.split(' ')[1]) || 16;
  const w = m.width + fs, h = fs * 1.5;
  const left = center ? x - w / 2 : x;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(left, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + fs / 2, y + h / 2 + 1);
}
