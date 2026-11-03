// 박자 붕어빵 규칙 계산 (화면·소리와 분리된 순수 함수)

import type { Judgement } from '../../rhythm/clock';
import type { BeatBungeoConfig, DayConfig, Filling, Quality } from './config';

export type Rng = () => number;

export const FILLING_INFO: Record<Filling, { icon: string; name: string }> = {
  red: { icon: '🫘', name: '팥' },
  cream: { icon: '🍮', name: '슈크림' },
  pizza: { icon: '🍕', name: '피자' },
};

export const QUALITY_LABEL: Record<Quality, string> = { golden: '황금', normal: '보통', ugly: '못생김', burnt: '탐' };

/** 반죽 붓기: 누른 길이(박)가 목표에 얼마나 가까운지 */
export function judgePour(holdBeats: number, cfg: BeatBungeoConfig): Judgement {
  const d = Math.abs(holdBeats - cfg.pourTargetBeats);
  return d <= cfg.pourTolerance.perfect ? 'perfect' : d <= cfg.pourTolerance.good ? 'good' : 'miss';
}

export type FlipResult = Judgement | 'early';

/**
 * 뒤집기: 노트 시각과의 차이(ms).
 * 판정 범위보다 이르면 덜 익음(MISS), 늦으면 MISS, 노트 뒤 burnAfterBeats가 지나면 탐(별도 처리).
 */
export function judgeFlip(offsetMs: number, cfg: BeatBungeoConfig): FlipResult {
  const a = Math.abs(offsetMs);
  if (a <= cfg.judge.perfectMs) return 'perfect';
  if (a <= cfg.judge.goodMs) return 'good';
  return offsetMs < 0 ? 'early' : 'miss';
}

const POINTS: Record<Judgement, number> = { perfect: 2, good: 1, miss: 0 };

/** 공정 판정들 → 붕어빵 품질 */
export function qualityOf(judges: Judgement[], cfg: BeatBungeoConfig): Quality {
  const pts = judges.reduce((s, j) => s + POINTS[j], 0);
  return pts >= cfg.goldenMinPoints ? 'golden' : pts >= cfg.normalMinPoints ? 'normal' : 'ugly';
}

export function priceOf(q: Quality, cfg: BeatBungeoConfig): number {
  return Math.round(cfg.basePrice * cfg.qualityPrice[q]);
}

export type Order = Partial<Record<Filling, number>>;

/** 손님 주문: 그날 파는 속 중에서 1~2개 (단체 손님 날은 가끔 4개) */
export function makeOrder(day: DayConfig, rng: Rng): Order {
  const n = day.groupOrders && rng() < 0.4 ? 4 : 1 + Math.floor(rng() * 2);
  const order: Order = {};
  for (let i = 0; i < n; i++) {
    const f = day.fillings[Math.floor(rng() * day.fillings.length)];
    order[f] = (order[f] ?? 0) + 1;
  }
  return order;
}

export const orderCount = (o: Order): number => Object.values(o).reduce((s, n) => s + (n ?? 0), 0);

export interface Packed { filling: Filling; quality: Quality }

/**
 * 포장대에서 주문을 채울 붕어빵을 고른다 (좋은 것부터). 다 채울 수 없으면 null.
 * 돌려준 번호들은 포장대 배열의 위치.
 */
export function pickForOrder(tray: Packed[], order: Order): number[] | null {
  const rank: Record<Quality, number> = { golden: 0, normal: 1, ugly: 2, burnt: 3 };
  const picks: number[] = [];
  for (const [f, n] of Object.entries(order) as [Filling, number][]) {
    const idx = tray.map((p, i) => ({ p, i })).filter(({ p, i }) => p.filling === f && p.quality !== 'burnt' && !picks.includes(i))
      .sort((a, b) => rank[a.p.quality] - rank[b.p.quality]).slice(0, n).map(({ i }) => i);
    if (idx.length < n) return null;
    picks.push(...idx);
  }
  return picks;
}

/** 팥·슈 입력 → 속 종류. 두 패드를 화음으로 치면 피자 (그날 피자를 팔 때만) */
export function fillingFromPads(red: boolean, cream: boolean, day: DayConfig): Filling | null {
  if (red && cream) return day.fillings.includes('pizza') ? 'pizza' : null;
  if (red) return 'red';
  if (cream) return day.fillings.includes('cream') ? 'cream' : null;
  return null;
}
