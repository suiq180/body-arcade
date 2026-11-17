// 두 다리 거인 규칙 계산 (화면·스틱과 분리된 순수 로직)
// 코스 만들기(장애물 순서·위치를 매번 섞음)와 거인 한 명의 걷기·균형·넘어짐을 계산한다.
// 입력은 "다리 들기 / 내딛기 / 팔 / 웅크리기 / 점프 / 일으키기" 함수로 넣는다 → 가짜 입력으로 시험 가능.

import type { GiantConfig } from './config';

export type Rng = () => number;
/** 0 = 왼다리(P1), 1 = 오른다리(P2) */
export type Leg = 0 | 1;
export type ObstacleKind = 'stones' | 'ice' | 'wind' | 'branch' | 'pit' | 'seesaw';

export const OBSTACLE_INFO: Record<ObstacleKind, { icon: string; name: string; tip: string }> = {
  stones: { icon: '🪨', name: '돌다리', tip: '레버 ↗↖로 보폭을 맞춰 돌 위에만!' },
  ice: { icon: '🧊', name: '빙판', tip: '보폭을 작게, 천천히!' },
  wind: { icon: '🌬️', name: '옆바람', tip: '둘이 같이 웅크리고, 바람 반대쪽 팔 흔들기!' },
  branch: { icon: '🌿', name: '낮은 나뭇가지', tip: '둘이 웅크린 채로 걸어요!' },
  pit: { icon: '🕳️', name: '구덩이', tip: '둘이 동시에 점프!' },
  seesaw: { icon: '⚖️', name: '시소 다리', tip: '가운데를 넘으면 기우는 방향이 바뀌어요!' },
};

export interface Obstacle {
  kind: ObstacleKind;
  /** 시작·끝 x (px) */
  a: number;
  b: number;
  /** 돌다리: 돌 가운데 x 목록 */
  stones?: number[];
  /** 옆바람: −1 = 왼쪽(뒤로 기울임) / +1 = 오른쪽 */
  dir?: -1 | 1;
}

export interface Course {
  index: number;
  name: string;
  length: number;
  obstacles: Obstacle[];
  /** 체크포인트 x 목록 (0 포함, 오름차순) */
  checkpoints: number[];
}

/** 기획서 6장: 코스별 이름·길이·장애물 종류 */
export const COURSE_DEFS: { name: string; theme: string; obstacles: ObstacleKind[] }[] = [
  { name: '들판', theme: '🌼', obstacles: [] },
  { name: '개울', theme: '🏞️', obstacles: ['stones', 'stones'] },
  { name: '겨울 산', theme: '🏔️', obstacles: ['ice', 'wind', 'ice', 'wind'] },
  { name: '숲', theme: '🌲', obstacles: ['branch', 'pit', 'branch', 'pit', 'pit'] },
  { name: '구름 다리', theme: '☁️', obstacles: ['seesaw', 'stones', 'ice', 'wind', 'branch', 'pit', 'seesaw'] },
];

const WIDTH: Record<ObstacleKind, number> = { stones: 380, ice: 420, wind: 420, branch: 240, pit: 110, seesaw: 420 };
/** 장애물 앞뒤 평지 (px) */
const LEAD_IN = 260;
const GAP_MIN = 160;
const GAP_MAX = 280;
const FIRST_COURSE_LENGTH = 1300;
const STONE_HALF = 26;

/** 코스 만들기: 종류는 기획서대로, 순서와 위치는 매번 섞는다 (사용자 결정) */
export function makeCourse(index: number, rng: Rng = Math.random): Course {
  const def = COURSE_DEFS[index];
  const kinds = [...def.obstacles];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const obstacles: Obstacle[] = [];
  const checkpoints = [0];
  let x = LEAD_IN;
  for (const kind of kinds) {
    x += GAP_MIN + rng() * (GAP_MAX - GAP_MIN);
    checkpoints.push(Math.round(x - 120)); // 장애물 바로 앞
    const o: Obstacle = { kind, a: Math.round(x), b: Math.round(x + WIDTH[kind]) };
    if (kind === 'stones') {
      // 돌 간격을 들쭉날쭉하게 → 보폭 조절이 필요. 가장 큰 보폭(60 × 1.5 = 90)보다 좁게 (마지막 돌 → 땅도)
      const stones: number[] = [];
      let s = o.a + 30;
      while (s < o.b - 20) { stones.push(Math.round(s)); s += 50 + rng() * 35; }
      o.stones = stones;
      o.b = stones[stones.length - 1] + 40; // 물 끝 = 마지막 돌 바로 뒤 (건너편 땅까지 닿게)
    }
    if (kind === 'wind') o.dir = rng() < 0.5 ? -1 : 1;
    obstacles.push(o);
    x = o.b;
  }
  const length = kinds.length ? Math.round(x + LEAD_IN) : FIRST_COURSE_LENGTH;
  return { index, name: def.name, length, obstacles, checkpoints };
}

export type FallCause = 'lean-left' | 'lean-right' | 'both-legs' | 'jump-solo' | 'branch' | 'water' | 'pit';
export const FALL_LABEL: Record<FallCause, string> = {
  'lean-left': '왼쪽으로 기울어짐', 'lean-right': '오른쪽으로 기울어짐', 'both-legs': '두 다리를 동시에 듦',
  'jump-solo': '한 명만 점프', branch: '나뭇가지에 쿵', water: '물에 빠짐', pit: '구덩이에 빠짐',
};

export type SimEvent =
  | { type: 'step'; leg: Leg; dist: number }
  | { type: 'fall'; cause: FallCause }
  | { type: 'respawn'; x: number }
  | { type: 'getup' }
  | { type: 'sync'; action: 'crouch' | 'jump'; diffMs: number }
  | { type: 'land' }
  | { type: 'checkpoint'; x: number }
  | { type: 'finish' };

interface LegState {
  x: number;
  lifted: boolean;
  liftAt: number;
  /** 들고 있는 동안의 레버 좌우: +1 = ↗ 큰 보폭, −1 = ↖ 작은 보폭 */
  stride: -1 | 0 | 1;
}

/** 거인 한 명의 상태와 물리. 시간은 ms(게임 시간, 일시정지 제외) */
export class GiantSim {
  legs: [LegState, LegState];
  /** 균형: −1 왼쪽 끝 … 0 안정 … +1 오른쪽 끝 */
  balance = 0;
  state: 'stand' | 'jump' | 'fallen' | 'respawn' | 'done' = 'stand';
  crouch = false;
  /** 넘어졌을 때 일으키기 연타 수 */
  getUp = 0;
  checkpoint = 0;
  time = 0;
  readonly events: SimEvent[] = [];
  /** 동시 동작 시간차 기록 (밸런싱용) */
  readonly syncDiffs: { action: 'crouch' | 'jump'; diffMs: number; ok: boolean }[] = [];
  readonly falls: { x: number; cause: FallCause; t: number }[] = [];

  private lastStepLeg: Leg | null = null;
  private crouchHeld: [number | null, number | null] = [null, null];
  private jumpPending: { leg: Leg; t: number } | null = null;
  private jumpState: { t0: number; from: number } | null = null;
  private stateUntil = 0;
  private pendingRespawn: number | null = null;

  constructor(readonly course: Course, readonly cfg: GiantConfig, private rng: Rng = Math.random) {
    this.legs = [this.newLeg(-12), this.newLeg(12)];
  }

  private newLeg(x: number): LegState { return { x, lifted: false, liftAt: 0, stride: 0 }; }

  get bodyX(): number {
    if (this.state === 'jump' && this.jumpState) {
      const k = Math.min(1, (this.time - this.jumpState.t0) / this.cfg.jumpMs);
      return this.jumpState.from + this.cfg.jumpDistance * k;
    }
    return (this.legs[0].x + this.legs[1].x) / 2;
  }

  /** 점프 중 높이 0~1 (화면 표시용) */
  get jumpHeight(): number {
    if (this.state !== 'jump' || !this.jumpState) return 0;
    const k = Math.min(1, (this.time - this.jumpState.t0) / this.cfg.jumpMs);
    return 4 * k * (1 - k);
  }

  get progress(): number { return Math.min(1, Math.max(0, this.bodyX / this.course.length)); }

  /** 들고 있는 다리의 높이 0~1 (화면 표시용) */
  liftAmount(leg: Leg): number {
    const l = this.legs[leg];
    return l.lifted ? Math.min(1, (this.time - l.liftAt) / this.cfg.liftMaxMs) : 0;
  }

  obstacleAt(x: number): Obstacle | undefined {
    return this.course.obstacles.find((o) => x >= o.a && x <= o.b);
  }

  private get canAct(): boolean { return this.state === 'stand'; }

  // ── 입력 ─────────────────────────────────
  /** 레버 ↑: 다리 들기 */
  lift(leg: Leg, stride: -1 | 0 | 1 = 0): void {
    if (!this.canAct || this.legs[leg].lifted) return;
    const other = this.legs[1 - leg];
    if (other.lifted) { this.fall('both-legs'); return; } // 두 다리를 동시에 들면 바로 넘어짐
    Object.assign(this.legs[leg], { lifted: true, liftAt: this.time, stride });
  }

  /** 들고 있는 동안 레버 좌우 (↗ / ↖) */
  setStride(leg: Leg, stride: -1 | 0 | 1): void {
    if (this.legs[leg].lifted && stride) this.legs[leg].stride = stride;
  }

  /** 레버를 놓거나 ↓: 내딛기 */
  place(leg: Leg): void {
    const l = this.legs[leg];
    if (!l.lifted || this.state !== 'stand') { l.lifted = false; return; }
    const cfg = this.cfg;
    const held = this.time - l.liftAt;
    const frac = Math.max(0.15, Math.min(1, held / cfg.liftMaxMs));
    const scale = l.stride > 0 ? cfg.stepBigScale : l.stride < 0 ? cfg.stepSmallScale : 1;
    let dist = cfg.stepBase * frac * scale * (this.crouch ? cfg.crouchStepScale : 1);
    const other = this.legs[1 - leg];
    const sign = leg === 0 ? -1 : 1;
    // 같은 다리로 연속 두 번 디디면 그쪽으로 크게 기운다
    if (this.lastStepLeg === leg) this.balance += sign * cfg.sameLegLean;
    if (held < cfg.hurryLiftMs) this.balance += (this.rng() < 0.5 ? -1 : 1) * cfg.hurryLean;
    const ground = this.obstacleAt(other.x + dist);
    if (ground?.kind === 'ice') {
      dist *= 1 + cfg.iceSlip;
      this.balance += (this.rng() < 0.5 ? -1 : 1) * cfg.iceSlip * 2 * (dist / cfg.stepBase);
    }
    l.x = other.x + dist;
    l.lifted = false;
    this.lastStepLeg = leg;
    this.events.push({ type: 'step', leg, dist });
    this.checkLanding([l.x]);
  }

  /** 버튼 1: 내 쪽 팔을 흔들어 반대쪽 기울기 보정 (P1 = 왼쪽으로 당김, P2 = 오른쪽으로 당김) */
  arm(leg: Leg): void {
    if (this.state === 'fallen') { this.getUpPress(); return; }
    if (this.state !== 'stand' && this.state !== 'jump') return;
    this.balance += (leg === 0 ? -1 : 1) * this.cfg.armRecover;
  }

  /** 버튼 2 누름·뗌: 둘이 허용 시간차 안에 눌러야 웅크린다 */
  crouchPress(leg: Leg): void {
    if (this.state === 'fallen') { this.getUpPress(); return; }
    this.crouchHeld[leg] = this.time;
    const other = this.crouchHeld[1 - leg];
    if (other !== null && !this.crouch) {
      const diff = this.time - other;
      const ok = diff <= this.cfg.syncWindowMs;
      this.syncDiffs.push({ action: 'crouch', diffMs: diff, ok });
      if (ok && this.state === 'stand') { this.crouch = true; this.events.push({ type: 'sync', action: 'crouch', diffMs: diff }); }
    }
  }

  crouchRelease(leg: Leg): void {
    this.crouchHeld[leg] = null;
    this.crouch = false;
  }

  /** 버튼 3: 둘이 허용 시간차 안에 눌러야 점프. 한 명만 뛰면 넘어짐 */
  jumpPress(leg: Leg): void {
    if (this.state === 'fallen') { this.getUpPress(); return; }
    if (this.state !== 'stand') return;
    const p = this.jumpPending;
    if (p && p.leg !== leg) {
      const diff = this.time - p.t;
      this.jumpPending = null;
      this.syncDiffs.push({ action: 'jump', diffMs: diff, ok: true });
      this.events.push({ type: 'sync', action: 'jump', diffMs: diff });
      const x = this.bodyX;
      this.legs.forEach((l) => { l.lifted = false; l.x = x; });
      this.jumpState = { t0: this.time, from: x };
      this.state = 'jump';
      this.crouch = false;
      return;
    }
    this.jumpPending = { leg, t: this.time };
  }

  /** 넘어졌을 때 아무 버튼 연타 (둘 합산) */
  getUpPress(): void {
    if (this.state !== 'fallen') return;
    this.getUp++;
    if (this.getUp < this.cfg.getUpPresses) return;
    this.getUp = 0;
    this.balance = 0;
    this.lastStepLeg = null;
    if (this.pendingRespawn !== null) { this.respawnTo(this.pendingRespawn); return; }
    this.state = 'stand';
    const x = this.bodyX;
    this.legs.forEach((l, i) => { l.lifted = false; l.x = x + (i ? 12 : -12); });
    this.events.push({ type: 'getup' });
  }

  // ── 시간 흐름 ─────────────────────────────
  update(dt: number): void {
    this.time += dt;
    const cfg = this.cfg, sec = dt / 1000;
    if (this.state === 'respawn') {
      if (this.time >= this.stateUntil) { this.state = 'stand'; this.events.push({ type: 'respawn', x: this.bodyX }); }
      return;
    }
    if (this.state === 'fallen' || this.state === 'done') return;

    // 한 명만 점프 버튼을 누르고 짝이 안 오면 → 한쪽만 뛰어 넘어짐
    if (this.jumpPending && this.time - this.jumpPending.t > cfg.syncWindowMs) {
      this.syncDiffs.push({ action: 'jump', diffMs: this.time - this.jumpPending.t, ok: false });
      this.jumpPending = null;
      if (this.state === 'stand') { this.fall('jump-solo'); return; }
    }

    if (this.state === 'jump' && this.jumpState) {
      if (this.time - this.jumpState.t0 >= cfg.jumpMs) {
        const x = this.jumpState.from + cfg.jumpDistance;
        this.jumpState = null;
        this.state = 'stand';
        this.legs.forEach((l, i) => { l.x = x + (i ? 12 : -12); });
        this.events.push({ type: 'land' });
        this.checkLanding([this.legs[0].x, this.legs[1].x]);
      }
      return;
    }

    // 한발로 서 있으면 들린 다리 쪽으로 흔들림
    const lifted = this.legs.findIndex((l) => l.lifted);
    if (lifted >= 0) this.balance += ((lifted ? 1 : -1) * 0.6 + (this.rng() - 0.5)) * cfg.oneLegWobble * sec;

    const here = this.obstacleAt(this.bodyX);
    if (here?.kind === 'wind') this.balance += (here.dir ?? 1) * cfg.windForce * sec * (this.crouch ? cfg.crouchWindScale : 1);
    if (here?.kind === 'seesaw') this.balance += ((this.bodyX < (here.a + here.b) / 2) ? 1 : -1) * cfg.seesawForce * sec;
    if (here?.kind === 'branch' && !this.crouch) {
      // 머리를 부딪히면 넘어지고, 가지 바로 앞으로 밀려난다
      this.fall('branch');
      this.pendingRespawn = null;
      this.legs.forEach((l, i) => { l.lifted = false; l.x = here.a - 40 + (i ? 12 : -12); });
      return;
    }

    if (this.balance <= -cfg.fallThreshold) this.fall('lean-left');
    else if (this.balance >= cfg.fallThreshold) this.fall('lean-right');

    // 체크포인트 통과
    const next = this.course.checkpoints.filter((c) => c > this.checkpoint && this.bodyX >= c).pop();
    if (next !== undefined) { this.checkpoint = next; this.events.push({ type: 'checkpoint', x: next }); }
    if (this.bodyX >= this.course.length) { this.state = 'done'; this.events.push({ type: 'finish' }); }
  }

  /** 디딘 발 위치가 물·구덩이인지 */
  private checkLanding(xs: number[]): void {
    for (const x of xs) {
      const o = this.obstacleAt(x);
      if (o?.kind === 'stones' && !o.stones!.some((s) => Math.abs(s - x) <= STONE_HALF)) { this.fallTo('water'); return; }
      if (o?.kind === 'pit') { this.fallTo('pit'); return; }
    }
  }

  private fall(cause: FallCause): void {
    if (this.state === 'fallen') return;
    this.state = 'fallen';
    this.crouch = false;
    this.getUp = 0;
    this.jumpPending = null;
    this.pendingRespawn = null;
    this.legs.forEach((l) => { l.lifted = false; });
    this.falls.push({ x: Math.round(this.bodyX), cause, t: Math.round(this.time) });
    this.events.push({ type: 'fall', cause });
  }

  /** 물·구덩이: 일으키기 없이 마지막 체크포인트로 */
  private fallTo(cause: 'water' | 'pit'): void {
    this.falls.push({ x: Math.round(this.bodyX), cause, t: Math.round(this.time) });
    this.events.push({ type: 'fall', cause });
    this.respawnTo(this.checkpoint);
  }

  private respawnTo(x: number): void {
    this.balance = 0;
    this.crouch = false;
    this.jumpPending = null;
    this.jumpState = null;
    this.pendingRespawn = null;
    this.lastStepLeg = null;
    this.legs.forEach((l, i) => { l.lifted = false; l.x = x + (i ? 12 : -12); });
    this.state = 'respawn';
    this.stateUntil = this.time + this.cfg.respawnMs;
  }
}

/** 별 개수 (0~3) */
export function starsFor(timeSec: number, times: [number, number, number]): number {
  return timeSec <= times[0] ? 3 : timeSec <= times[1] ? 2 : timeSec <= times[2] ? 1 : 0;
}

export function scoreFor(timeSec: number, stars: number, times: [number, number, number], cfg: GiantConfig): number {
  return Math.round(stars * cfg.scorePerStar + Math.max(0, times[2] - timeSec) * cfg.scorePerSecSaved);
}
