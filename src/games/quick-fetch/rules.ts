// 번개 심부름 규칙 계산 (화면·카메라와 분리된 순수 로직)

export interface JudgeConfig {
  confirmProb: number;
  minRise: number;
  confirmHoldMs: number;
}

export interface ScoreConfig {
  winScore: number;
  speedBonusMax: number;
  speedBonusFullMs: number;
  roundLimitMs: number;
}

/** 라운드 순서: 물건을 한 번씩 섞어 쓰고, 모자라면 다시 섞는다 (같은 물건 연속 없음) */
export function makeOrder(itemCount: number, rounds: number, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  while (out.length < rounds) {
    const bag = Array.from({ length: itemCount }, (_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (out.length && itemCount > 1 && bag[0] === out[out.length - 1]) [bag[0], bag[1]] = [bag[1], bag[0]];
    out.push(...bag);
  }
  return out.slice(0, rounds);
}

/** 칸별 기준값: 준비 시간 동안 들어온 확률의 평균 */
export class Baseline {
  private sum: number[][] = [];
  private count: number[] = [];

  reset(): void { this.sum = []; this.count = []; }

  add(zone: number, probs: number[]): void {
    const s = (this.sum[zone] ??= probs.map(() => 0));
    probs.forEach((p, i) => { s[i] += p; });
    this.count[zone] = (this.count[zone] ?? 0) + 1;
  }

  /** 기준값이 없으면(준비 중 인식 없음) 0 */
  get(zone: number, label: number): number {
    const c = this.count[zone];
    return c ? this.sum[zone][label] / c : 0;
  }
}

/** 이번 인식에서 목표 물건으로 인정되는지 */
export function isMatch(prob: number, base: number, cfg: JudgeConfig): boolean {
  return prob >= cfg.confirmProb && prob - base >= cfg.minRise;
}

/** 칸별로 '목표 물건이 이어서 보인 시간'을 재서 확정한다 */
export class ConfirmTracker {
  private since: (number | null)[] = [];

  reset(): void { this.since = []; }

  /** 진행도 0~1을 돌려준다. 1 = 확정 */
  update(zone: number, match: boolean, now: number, cfg: JudgeConfig): number {
    if (!match) { this.since[zone] = null; return 0; }
    const start = (this.since[zone] ??= now);
    return cfg.confirmHoldMs <= 0 ? 1 : Math.min(1, (now - start) / cfg.confirmHoldMs);
  }
}

/** 라운드 1등 점수 (속도 보너스 포함) */
export function roundScore(elapsedMs: number, cfg: ScoreConfig): number {
  const span = Math.max(1, cfg.roundLimitMs - cfg.speedBonusFullMs);
  const k = elapsedMs <= cfg.speedBonusFullMs ? 1 : Math.max(0, 1 - (elapsedMs - cfg.speedBonusFullMs) / span);
  return Math.round(cfg.winScore + cfg.speedBonusMax * k);
}
