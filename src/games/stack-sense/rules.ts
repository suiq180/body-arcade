// 눈치껏 쌓아라 규칙 계산 (화면·물리와 분리된 순수 함수)
// 무작위는 rng를 주입받아서 시드를 고정한 시험이 가능하다.

import type { ItemId, ShapeId, StackSenseConfig } from './config';

export type Rng = () => number;
export type GameMode = 'normal' | 'traitor' | 'special';

export const MODE_LABEL: Record<GameMode, string> = {
  normal: '일반전',
  traitor: '배신자 모드',
  special: '스페셜 모드',
};

export const ITEM_INFO: Record<ItemId, { icon: string; name: string; desc: string }> = {
  glue: { icon: '🧴', name: '접착제', desc: '다음 내 블록이 닿은 블록에 붙어요' },
  wind: { icon: '🌬️', name: '바람', desc: '다음 사람 차례에 옆바람 3초' },
  ice: { icon: '🧊', name: '미끄럼', desc: '다음 사람 블록이 얼음처럼 미끄러워요' },
  remove: { icon: '🔨', name: '블록 빼기', desc: '탑에서 블록 하나를 빼요 (무너질 수도!)' },
};

export const AI_NAMES = ['로봇 하나', '로봇 둘', '로봇 셋', '로봇 넷', '로봇 다섯'];

export interface Player {
  name: string;
  /** null이면 사람, 숫자면 AI 실력 단계 (0 = 가장 정확) */
  ai: number | null;
  coins: number;
  item: ItemId | null;
  roundWins: number;
  /** 지금까지 성공한 층 수 (점수용) */
  floors: number;
  /** 이번 라운드에 아직 남아 있는지 */
  alive: boolean;
}

/** 사람 humans명 + AI ais명. AI 실력은 순서대로 정확 → 서툼으로 돌아가며 배정 */
export function createPlayers(humans: number, ais: number, aiLevels: number): Player[] {
  const list: Player[] = [];
  for (let i = 0; i < humans; i++) list.push(blank(`P${i + 1}`, null));
  for (let i = 0; i < ais; i++) list.push(blank(AI_NAMES[i] ?? `로봇 ${i + 1}`, i % aiLevels));
  return list;
}

function blank(name: string, ai: number | null): Player {
  return { name, ai, coins: 0, item: null, roundWins: 0, floors: 0, alive: true };
}

/** 혼자 연습(사람 1, AI 0): 탈락 없이 무너질 때까지 층수 도전 */
export const isPractice = (players: Player[]): boolean => players.length === 1;

/** current 다음 차례인 살아 있는 플레이어 (없으면 -1) */
export function nextAlive(players: Player[], current: number): number {
  for (let step = 1; step <= players.length; step++) {
    const i = (current + step) % players.length;
    if (players[i].alive) return i;
  }
  return -1;
}

/** 라운드가 끝났으면 승자 번호, 아직이면 null. 연습 모드는 무너지면 끝 (승자 없음 = -1) */
export function roundWinner(players: Player[]): number | null {
  if (isPractice(players)) return players[0].alive ? null : -1;
  const alive = players.flatMap((p, i) => (p.alive ? [i] : []));
  if (alive.length > 1) return null;
  return alive.length === 1 ? alive[0] : -1;
}

/** 탑 층수에 맞는 블록 모양. 스페셜 모드는 일정 확률로 특수 블록 */
export function pickShape(floors: number, mode: GameMode, cfg: StackSenseConfig, rng: Rng): ShapeId {
  if (mode === 'special' && rng() < cfg.specialBlockChance) return pickOne(cfg.specialShapes, rng);
  let shapes = cfg.shapeStages[0].shapes;
  for (const s of cfg.shapeStages) if (floors >= s.fromFloor) shapes = s.shapes;
  return pickOne(shapes, rng);
}

export function pickOne<T>(list: readonly T[], rng: Rng): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

export function randRange(min: number, max: number, rng: Rng): number {
  return min + (max - min) * rng();
}

/** 정규분포 난수 (평균 0, 표준편차 1) */
export function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface TraitorMission { player: number; floor: number }

/** 배신자 한 명과 목표 층수를 정한다 */
export function assignTraitor(playerCount: number, cfg: StackSenseConfig, rng: Rng): TraitorMission {
  return {
    player: Math.floor(rng() * playerCount),
    floor: cfg.traitorFloorMin + Math.floor(rng() * (cfg.traitorFloorMax - cfg.traitorFloorMin + 1)),
  };
}

/** 배신자가 자기 차례에, 정확히 목표 층수였던 탑을 무너뜨렸는지 */
export function traitorSucceeded(m: TraitorMission | null, collapser: number, floorsBefore: number): boolean {
  return !!m && m.player === collapser && floorsBefore === m.floor;
}

export function canBuy(p: Player, item: ItemId, cfg: StackSenseConfig): boolean {
  return p.item === null && p.coins >= cfg.itemPrice[item];
}

/** 아이템 사기 (한 사람이 아이템은 하나만 가질 수 있다). 성공하면 true */
export function buy(p: Player, item: ItemId, cfg: StackSenseConfig): boolean {
  if (!canBuy(p, item, cfg)) return false;
  p.coins -= cfg.itemPrice[item];
  p.item = item;
  return true;
}

/** AI의 상점 선택: 살 수 있는 것 중 무작위, 없으면 null */
export function aiShopChoice(p: Player, cfg: StackSenseConfig, rng: Rng): ItemId | null {
  const options = (Object.keys(cfg.itemPrice) as ItemId[]).filter((it) => canBuy(p, it, cfg));
  return options.length && rng() < 0.7 ? pickOne(options, rng) : null;
}

export interface AiAim {
  /** 놓을 x 좌표 */
  x: number;
  /** 놓는 속도 (화면 높이/초): 아래 방향 양수 */
  vx: number;
  vy: number;
}

/**
 * AI가 블록을 놓을 위치·속도. 실력 단계가 클수록 오차가 크다.
 * 배신자 임무 층수에 도달했으면 일부러 크게 빗나가게 던진다.
 */
export function aiAim(topX: number, level: number, cfg: StackSenseConfig, rng: Rng, sabotage = false): AiAim {
  const err = cfg.aiErrorPx[Math.min(level, cfg.aiErrorPx.length - 1)] * (sabotage ? 5 : 1);
  const speed = cfg.aiDropSpeed[Math.min(level, cfg.aiDropSpeed.length - 1)] * (sabotage ? 6 : 1);
  return {
    x: topX + gaussian(rng) * err,
    vx: gaussian(rng) * speed * 0.5,
    vy: Math.abs(gaussian(rng)) * speed,
  };
}

/** 최종 점수 = 라운드 승리 + 성공한 층 수 */
export function finalScore(p: Player, cfg: StackSenseConfig): number {
  return p.roundWins * cfg.scoreRoundWin + p.floors * cfg.scorePerFloor;
}

/** 각도를 snapDeg 단위로 맞춘다 (라디안) */
export function snapAngle(rad: number, snapDeg: number): number {
  const step = (snapDeg * Math.PI) / 180;
  return Math.round(rad / step) * step;
}

/** 손 속도(화면 높이/초)를 놓는 속도로 바꾼다: 비율을 곱하고 상한으로 자른다 */
export function releaseVelocity(vx: number, vy: number, cfg: StackSenseConfig): { vx: number; vy: number } {
  const sx = vx * cfg.releaseVelocityScale, sy = vy * cfg.releaseVelocityScale;
  const mag = Math.hypot(sx, sy);
  if (mag <= cfg.releaseVelocityMax || mag === 0) return { vx: sx, vy: sy };
  const k = cfg.releaseVelocityMax / mag;
  return { vx: sx * k, vy: sy * k };
}
