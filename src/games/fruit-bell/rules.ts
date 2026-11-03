// 땡! 과일벨 규칙 계산 (화면·소리와 분리된 순수 함수)
// 무작위는 rng를 주입받아서 시드를 고정한 시험이 가능하다.

import type { FruitBellConfig, SongConfig } from './config';

export type Rng = () => number;

/** 직접 고른 과일 이모지 4종 (원작 카드 그림을 쓰지 않는다) */
export const FRUITS = ['🍓', '🍌', '🍇', '🍋'];

export interface Card {
  fruit: number;
  count: number;
  /** 함정 카드: 그림 대신 숫자로만 표시 */
  number: boolean;
}

export type Table = (Card | null)[];

/** 과일별 합계 */
export function fruitSums(table: Table, kinds: number): number[] {
  const sums = new Array(kinds).fill(0);
  for (const c of table) if (c) sums[c.fruit] += c.count;
  return sums;
}

/** 어떤 과일의 합이 정확히 target이면 그 과일 번호, 아니면 -1 */
export function chanceFruit(table: Table, kinds: number, target: number): number {
  return fruitSums(table, kinds).findIndex((s) => s === target);
}

/** 박자 하나에 넘어가는 카드 묶음 */
export interface FlipSlot {
  /** 박자 위치 (반박자 구간은 .5) */
  beat: number;
  /** 넘어가는 자리 번호들 */
  seats: number[];
}

/**
 * 곡 하나의 카드 넘김 시각표. 자리는 차례대로 돈다.
 * doubleFlip 곡: 평소엔 한 박에 2장, 반박자 구간에서는 반 박마다 1장.
 */
export function flipSchedule(song: SongConfig, seats: number, cfg: FruitBellConfig): FlipSlot[] {
  const slots: FlipSlot[] = [];
  let seat = 0;
  const take = () => { const s = seat; seat = (seat + 1) % seats; return s; };
  for (let b = 0; b < cfg.beatsPerSong; b++) {
    const half = song.doubleFlip && cfg.halfBeatSections.some(([a, z]) => b >= a && b < z);
    if (half) { slots.push({ beat: b, seats: [take()] }, { beat: b + 0.5, seats: [take()] }); }
    else if (song.doubleFlip && seats > 1) slots.push({ beat: b, seats: [take(), take()] });
    else slots.push({ beat: b, seats: [take()] });
  }
  return slots;
}

/**
 * 다음 카드(들)를 만든다. 지금까지의 정답 기회 비율이 목표 범위를 벗어나면 일부러 맞추거나 피한다
 * (기획서 6장: 너무 드물거나 잦지 않게).
 */
export function makeCards(
  table: Table, seats: number[], song: SongConfig, stats: { events: number; chances: number },
  cfg: FruitBellConfig, rng: Rng,
): Card[] {
  const [lo, hi] = cfg.chanceRatePerSong;
  const rate = stats.events ? stats.chances / stats.events : (lo + hi) / 2;
  const want: 'chance' | 'avoid' | 'any' = rate < lo ? 'chance' : rate > hi ? 'avoid' : 'any';
  const kinds = song.kinds;
  const [cMin, cMax] = cfg.countRange;
  const all: Card[] = [];
  for (let f = 0; f < kinds; f++) for (let c = cMin; c <= cMax; c++) all.push({ fruit: f, count: c, number: false });
  const pick = (list: Card[]): Card => ({ ...list[Math.floor(rng() * list.length)], number: rng() < (song.numberCards ?? 0) });

  const out: Card[] = [];
  const work = [...table];
  seats.forEach((seat, k) => {
    const last = k === seats.length - 1;
    let candidates = all;
    // 여러 장이 넘어가면 마지막 장으로 기회 여부를 맞춘다
    if (last && want !== 'any') {
      const filtered = all.filter((c) => {
        const t = [...work]; t[seat] = c;
        return (chanceFruit(t, kinds, cfg.targetCount) >= 0) === (want === 'chance');
      });
      if (filtered.length) candidates = filtered;
    }
    const card = pick(candidates);
    work[seat] = card;
    out.push(card);
  });
  return out;
}

export interface HitScore {
  points: number;
  onBeat: boolean;
  hard: boolean;
}

/** 정답 점수: 기본 + 박자 맞춤 + 세게 치기 */
export function scoreCorrect(offsetMs: number, velocity: number, cfg: FruitBellConfig): HitScore {
  const onBeat = Math.abs(offsetMs) <= cfg.onBeatWindowMs;
  const hard = velocity >= cfg.hardHitVelocity;
  return { points: cfg.scoreCorrect + (onBeat ? cfg.scoreOnBeat : 0) + (hard ? cfg.scoreHardHit : 0), onBeat, hard };
}

/** AI 반응 시간: 기본값 ± 흔들림 */
export function aiReaction(base: number, cfg: FruitBellConfig, rng: Rng): number {
  return base * (1 + (rng() * 2 - 1) * cfg.aiReactionJitter);
}
