// 공통 박자 시계 (fruit-bell, beat-bungeo 공유)
// 박자 위치는 performance.now() 기준 ms로 계산한다 — 입력 어댑터의 시각과 같은 시계라 바로 비교할 수 있다.
// 소리는 AudioContext 시계로 예약하므로, 예약할 때 performance 시각 → 오디오 시각으로 바꾼다.

export class BeatClock {
  /** 0번 박자의 시각 (performance.now 기준 ms) */
  startPerf: number;
  private pausedAt: number | null = null;

  constructor(public bpm: number, startPerf: number) {
    this.startPerf = startPerf;
  }

  get beatMs(): number { return 60000 / this.bpm; }

  /** 시각 t의 박자 위치 (소수 포함). 일시정지 중이면 멈춘 위치 */
  beatAt(t: number): number {
    return ((this.pausedAt ?? t) - this.startPerf) / this.beatMs;
  }

  /** 박자 위치 → 시각 */
  timeOf(beat: number): number {
    return this.startPerf + beat * this.beatMs;
  }

  /** 시각 t에서 가장 가까운 (1/sub)박까지의 차이(ms). 음수 = 박자보다 이르게 */
  offsetToGrid(t: number, sub = 1): number {
    const step = this.beatMs / sub;
    const rel = t - this.startPerf;
    return rel - Math.round(rel / step) * step;
  }

  get paused(): boolean { return this.pausedAt !== null; }

  pause(now: number): void {
    if (this.pausedAt === null) this.pausedAt = now;
  }

  /** 다시 시작: 멈춰 있던 시간만큼 0번 박자를 뒤로 민다 */
  resume(now: number): void {
    if (this.pausedAt === null) return;
    this.startPerf += now - this.pausedAt;
    this.pausedAt = null;
  }
}

/** performance 시각 → AudioContext 시각 (초) */
export function toAudioTime(ctx: AudioContext, perf: number): number {
  return ctx.currentTime + Math.max(0, perf - performance.now()) / 1000;
}

export type Judgement = 'perfect' | 'good' | 'miss';

/** 박자와의 차이(ms) → 판정 */
export function judge(offsetMs: number, perfectMs: number, goodMs: number): Judgement {
  const a = Math.abs(offsetMs);
  return a <= perfectMs ? 'perfect' : a <= goodMs ? 'good' : 'miss';
}

/** 지연 보정: 메트로놈 시각과 입력 시각 차이들 → 대표값(중앙값, 튀는 값에 강함) */
export function medianOffset(diffs: number[]): number {
  if (!diffs.length) return 0;
  const s = [...diffs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
