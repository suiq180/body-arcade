// 음량·음높이 실시간 그래프 (기획서 8.4: 마이크 게임은 항상 표시). 준비 화면과 게임이 함께 쓴다.

import type { MicFrame, VoiceRange } from '../input/mic';

export interface GraphMarks {
  /** 음량 선 (0~1 level 기준) */
  lines?: { level: number; color: string; label: string }[];
  /** 음높이 목표 구간 (MIDI 번호) */
  pitchBand?: { low: number; high: number; color: string } | null;
}

export class MicGraph {
  private history: MicFrame[] = [];

  constructor(private canvas: HTMLCanvasElement, private windowMs = 5000) {}

  push(f: MicFrame): void {
    this.history.push(f);
    while (this.history.length && f.time - this.history[0].time > this.windowMs) this.history.shift();
  }

  draw(range: VoiceRange, marks: GraphMarks = {}): void {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,14,30,.85)';
    ctx.fillRect(0, 0, W, H);
    const now = this.history[this.history.length - 1]?.time ?? 0;
    const x = (t: number) => W - ((now - t) / this.windowMs) * W;
    const pLow = range.low - 5, pHigh = range.high + 5;
    const py = (p: number) => H - ((p - pLow) / (pHigh - pLow)) * H;

    if (marks.pitchBand) {
      const b = marks.pitchBand;
      ctx.fillStyle = b.color;
      ctx.fillRect(0, py(b.high), W, py(b.low) - py(b.high));
    }
    // 음량 (아래에서 차오르는 면)
    ctx.beginPath();
    ctx.moveTo(x(this.history[0]?.time ?? now), H);
    for (const f of this.history) ctx.lineTo(x(f.time), H - f.level * H);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(77,171,247,.45)';
    ctx.fill();
    for (const l of marks.lines ?? []) {
      const y = H - l.level * H;
      ctx.strokeStyle = l.color; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = l.color; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(l.label, 6, y - 3);
    }
    // 음높이 점
    ctx.fillStyle = '#ffd43b';
    for (const f of this.history) {
      if (f.pitch === null) continue;
      const y = py(Math.max(pLow, Math.min(pHigh, f.pitch)));
      ctx.beginPath(); ctx.arc(x(f.time), y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('● 음높이  ▮ 음량', W - 6, 13);
  }
}
