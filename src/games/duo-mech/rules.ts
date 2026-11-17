// 합체 로봇 조종석 규칙 계산 (화면·스틱과 분리된 순수 로직)
// 판정은 옆에서 본 2D 평면(x: 왼→오른, y: 아래→위, 단위 "칸")에서 하고, 3D 화면은 이 상태를 그리기만 한다.
// 입력은 역할별 상태(다리 / 팔)로 넣는다 → 사람·AI·가짜 입력 모두 같은 방식.

import { BOSS_HP, type MechConfig, type UpgradeId } from './config';

export type Rng = () => number;
export type Role = 'legs' | 'arms';
export type PatternKind = 'low' | 'high' | 'beam' | 'slam' | 'throw' | 'pull';

/** action: 피하는 방법 (연습 스테이지 안내에 "P1(다리) 점프!"처럼 붙여 쓴다) */
export const PATTERN_INFO: Record<PatternKind, { icon: string; name: string; action: string; role: Role | 'both' }> = {
  low: { icon: '🔴', name: '낮은 탄', action: '점프! (버튼 1)', role: 'legs' },
  high: { icon: '🟠', name: '높은 탄', action: '웅크리기! (레버 ↓)', role: 'legs' },
  beam: { icon: '⚡', name: '정면 광선', action: '방패! (버튼 3)', role: 'arms' },
  slam: { icon: '💥', name: '내려찍기', action: '대시로 빠지기! (버튼 2)', role: 'legs' },
  throw: { icon: '📦', name: '던지기', action: '집게로 잡기! (버튼 4)', role: 'arms' },
  pull: { icon: '🧲', name: '끌어당기기', action: '버티기 + 방패 동시에! (둘 다 버튼 3)', role: 'both' },
};

export interface BossDef {
  name: string;
  icon: string;
  /** 단계별 공격 목록 (최종 보스만 3단계) */
  phases: PatternKind[][];
  /** 공중에 떠 있음 → 위쪽 조준 필요 */
  air?: boolean;
  /** 공격 두 개를 동시에 낼 확률 */
  double?: number;
  /** 연습: 패턴을 순서대로 하나씩, 화면 안내 */
  tutorial?: boolean;
}

/** 기획서 6장 */
export const BOSSES: BossDef[] = [
  { name: '연습용 표적 로봇', icon: '🎯', phases: [['low', 'high', 'beam', 'slam']], tutorial: true },
  { name: '바퀴 탱크', icon: '🛞', phases: [['low', 'high', 'slam']] },
  { name: '공중 포대', icon: '🛸', phases: [['low', 'high', 'throw', 'beam']], air: true },
  { name: '거대 기계 거미', icon: '🕷️', phases: [['low', 'high', 'beam', 'slam', 'throw', 'pull']], double: 0.5 },
  { name: '최종 보스', icon: '👹', phases: [['low', 'high', 'beam'], ['low', 'high', 'beam', 'slam', 'throw'], ['low', 'high', 'beam', 'slam', 'throw', 'pull']], double: 0.35 },
];

/** 다리 담당 입력. jump·dash·sync는 이번에 "눌렀는지" */
export interface LegsInput { move: -1 | 0 | 1; crouch: boolean; jump: boolean; dash: boolean; brace: boolean; sync: boolean }
/** 팔 담당 입력. grab·sync는 이번에 "눌렀는지", 나머지는 누르고 있는지 */
export interface ArmsInput { aimX: -1 | 0 | 1; aimY: -1 | 0 | 1; laser: boolean; missile: boolean; shield: boolean; grab: boolean; sync: boolean }
export const NO_LEGS: LegsInput = { move: 0, crouch: false, jump: false, dash: false, brace: false, sync: false };
export const NO_ARMS: ArmsInput = { aimX: 0, aimY: 0, laser: false, missile: false, shield: false, grab: false, sync: false };

export type Upgrades = Record<UpgradeId, number>;
export const NO_UPGRADES: Upgrades = { armor: 0, battery: 0, generator: 0, lens: 0, warhead: 0 };

export const ARENA_W = 18;
const ROBOT_HALF_W = 0.6;
const ROBOT_H = 2.0;
const ROBOT_CROUCH_H = 1.2;
const LOW_Y = 0.45;
const HIGH_Y = 1.75;
const SHOT_R = 0.35;
const BEAM_TOP = 2.8;
const THROW_FLIGHT_MS = 1100;

export interface Attack {
  id: number;
  kind: PatternKind;
  t0: number;
  state: 'telegraph' | 'active' | 'done';
  /** 탄·던진 물건 위치·속도 */
  x: number; y: number; vx: number; vy: number;
  /** 내려찍기 가운데, 광선 다음 피해 시각 등 */
  cx: number;
  nextTick: number;
  until: number;
  blocked: boolean;
}

export interface Shot { id: number; x: number; y: number; vx: number; vy: number; dmg: number; kind: 'laser' | 'missile' | 'crate'; combo: boolean; fireT: number; alive: boolean }

export type MechEvent =
  | { type: 'hit'; kind: PatternKind; role: Role | 'both'; dmg: number }
  | { type: 'block'; kind: PatternKind }
  | { type: 'telegraph'; kind: PatternKind }
  | { type: 'combo'; count: number }
  | { type: 'special' }
  | { type: 'grab' }
  | { type: 'energy-empty'; role: Role }
  | { type: 'boss-hit'; dmg: number; combo: boolean }
  | { type: 'phase'; phase: number }
  | { type: 'down' }
  | { type: 'revive' }
  | { type: 'cleared' }
  | { type: 'failed' }
  | { type: 'move'; what: 'apex' | 'dash' | 'land' };

export interface MechStats {
  hits: Record<PatternKind, number>;
  hitsByRole: Record<Role | 'both', number>;
  combos: number;
  specials: number;
  energyUse: Record<Role, number>;
  shots: number;
}

export class MechSim {
  time = 0;
  state: 'fight' | 'down' | 'cleared' | 'failed' = 'fight';
  readonly def: BossDef;
  readonly robot = { x: 4, y: 0, vy: 0, onGround: true, crouch: false, brace: false, dashUntil: -1, dashDir: -1 as -1 | 1, armAngle: 0, shield: false, missileCharge: 0 };
  hp: number;
  hpMax: number;
  energy: number;
  energyMax: number;
  comboGauge = 0;
  reviveUsed: boolean;
  readonly boss: { hp: number; hpMax: number; x: number; y: number; w: number; h: number; phase: number; hitUntil: number };
  readonly attacks: Attack[] = [];
  readonly shots: Shot[] = [];
  readonly events: MechEvent[] = [];
  readonly stats: MechStats = {
    hits: { low: 0, high: 0, beam: 0, slam: 0, throw: 0, pull: 0 },
    hitsByRole: { legs: 0, arms: 0, both: 0 },
    combos: 0, specials: 0, energyUse: { legs: 0, arms: 0 }, shots: 0,
  };
  /** 마지막으로 합동 신호를 누른 시각 (AI가 사람에게 맞출 때 씀) */
  readonly lastSync: Record<Role, number> = { legs: -Infinity, arms: -Infinity };
  /** 합동 기술 연출 (화면용) */
  specialUntil = -1;

  private nextId = 1;
  private nextAttackT: number;
  private tutorialIndex = 0;
  private lastPattern: PatternKind | null = null;
  private nextLaser = 0;
  private prevMissileHeld = false;
  private moveEvents: { t: number; counted: boolean }[] = [];
  /** 다운된 시각 (부활 대기 시간 표시용) */
  downAt = 0;
  private energyEmptyShown = false;

  constructor(readonly stage: number, readonly cfg: MechConfig, readonly up: Upgrades = NO_UPGRADES, opts: { reviveUsed?: boolean; rng?: Rng } = {}) {
    this.rng = opts.rng ?? Math.random;
    this.def = BOSSES[stage];
    this.hpMax = this.hp = cfg.robotHp + up.armor * 20;
    this.energyMax = this.energy = cfg.energyMax + up.battery * 25;
    this.reviveUsed = !!opts.reviveUsed;
    const hp = BOSS_HP[stage];
    this.boss = this.def.air
      ? { hp, hpMax: hp, x: 14.5, y: 3.6, w: 2.6, h: 2.4, phase: 0, hitUntil: -1 }
      : { hp, hpMax: hp, x: 15, y: 0, w: 3, h: 4, phase: 0, hitUntil: -1 };
    this.nextAttackT = 1800; // 시작하고 잠깐 여유
  }

  private rng: Rng;

  get invulnerable(): boolean { return this.time < this.robot.dashUntil; }
  get robotHeight(): number { return this.robot.crouch ? ROBOT_CROUCH_H : ROBOT_H; }
  get bossFront(): number { return this.boss.x - this.boss.w / 2; }
  get maxRobotX(): number { return this.bossFront - 1.2; }

  /** 팔 끝 위치 (탄이 나가는 곳) */
  armTip(): { x: number; y: number } {
    const r = this.robot;
    const sy = r.y + (r.crouch ? 1.0 : 1.6);
    return { x: r.x + 0.3 + Math.cos(r.armAngle) * 1.1, y: sy + Math.sin(r.armAngle) * 1.1 };
  }

  get hint(): string | null {
    const a = this.attacks.find((x) => x.state === 'telegraph');
    return a ? `${PATTERN_INFO[a.kind].icon} ${PATTERN_INFO[a.kind].name} — ${PATTERN_INFO[a.kind].action}` : null;
  }

  // ── 한 걸음 ───────────────────────────────
  step(dt: number, legs: LegsInput, arms: ArmsInput): void {
    this.time += dt;
    const t = this.time, sec = dt / 1000, cfg = this.cfg, r = this.robot;
    if (legs.sync) this.lastSync.legs = t;
    if (arms.sync) this.lastSync.arms = t;
    const synced = (legs.sync || arms.sync) && Math.abs(this.lastSync.legs - this.lastSync.arms) <= cfg.syncWindowMs;

    if (this.state === 'down') {
      if (synced && !this.reviveUsed) {
        this.reviveUsed = true;
        this.hp = Math.round(this.hpMax * cfg.reviveHpRatio);
        this.state = 'fight';
        this.lastSync.legs = this.lastSync.arms = -Infinity;
        this.events.push({ type: 'revive' });
      } else if (t - this.downAt > cfg.reviveTimeoutMs) {
        this.state = 'failed';
        this.events.push({ type: 'failed' });
      }
      return;
    }
    if (this.state !== 'fight') return;

    // ── 다리 ──
    const dashing = t < r.dashUntil;
    r.brace = legs.brace && r.onGround && !dashing;
    r.crouch = legs.crouch && r.onGround && !dashing && !r.brace;
    if (legs.dash && !dashing) {
      if (this.spend('legs', cfg.dashCost)) {
        r.dashDir = legs.move === 1 ? 1 : -1;
        r.dashUntil = t + cfg.dashMs;
      }
    }
    const wasDashing = dashing;
    if (t < r.dashUntil) r.x += r.dashDir * cfg.dashSpeed * sec;
    else if (!r.brace && !r.crouch) r.x += legs.move * cfg.moveSpeed * sec;
    if (wasDashing && t >= r.dashUntil) this.moveEvent('dash');
    if (legs.jump && r.onGround && !r.brace) { r.vy = cfg.jumpSpeed; r.onGround = false; r.crouch = false; }
    if (!r.onGround) {
      const prev = r.vy;
      r.vy -= cfg.gravity * sec;
      r.y += r.vy * sec;
      if (prev > 0 && r.vy <= 0) this.moveEvent('apex');
      if (r.y <= 0) { r.y = 0; r.vy = 0; r.onGround = true; this.moveEvent('land'); }
    }
    r.x = Math.max(0.8, Math.min(this.maxRobotX, r.x));

    // ── 팔 ──
    if (arms.aimX || arms.aimY) {
      const target = Math.atan2(arms.aimY, arms.aimX);
      let d = target - r.armAngle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const stepA = cfg.armTurnSpeed * sec;
      r.armAngle += Math.abs(d) <= stepA ? d : Math.sign(d) * stepA;
    }
    r.shield = false;
    if (arms.shield) {
      const cost = cfg.shieldCostPerSec * sec;
      if (this.energy > 0) { r.shield = true; this.useEnergy('arms', Math.min(cost, this.energy)); }
      else this.emptyEnergy('arms');
    }
    if (arms.laser && t >= this.nextLaser && !r.shield) {
      this.fire('laser', cfg.laserDamage + this.up.lens, cfg.laserSpeed);
      this.nextLaser = t + cfg.laserIntervalMs;
    }
    if (arms.missile) r.missileCharge = Math.min(cfg.missileChargeSec * 1000, r.missileCharge + dt);
    else if (this.prevMissileHeld) {
      if (r.missileCharge >= cfg.missileChargeSec * 1000) {
        if (this.spend('arms', cfg.missileCost)) this.fire('missile', cfg.missileDamage + this.up.warhead * 6, cfg.missileSpeed);
      }
      r.missileCharge = 0;
    }
    this.prevMissileHeld = arms.missile;
    if (arms.grab) this.tryGrab();
    if (!r.shield) this.energy = Math.min(this.energyMax, this.energy + (cfg.energyRegenPerSec + this.up.generator * 4) * sec);
    if (this.energy > 1) this.energyEmptyShown = false;

    // ── 합동 기술 ──
    if (synced && this.comboGauge >= cfg.specialGaugeHits) {
      this.comboGauge = 0;
      this.stats.specials++;
      this.specialUntil = t + 900;
      this.lastSync.legs = this.lastSync.arms = -Infinity;
      this.damageBoss(cfg.specialDamage, false);
      this.events.push({ type: 'special' });
    }

    this.updateShots(sec);
    this.updateBoss();
    this.updateAttacks(sec);
    this.moveEvents = this.moveEvents.filter((e) => t - e.t <= cfg.comboWindowMs);
  }

  private spend(role: Role, cost: number): boolean {
    if (this.energy < cost) { this.emptyEnergy(role); return false; }
    this.useEnergy(role, cost);
    return true;
  }

  private useEnergy(role: Role, amount: number): void {
    this.energy -= amount;
    this.stats.energyUse[role] += amount;
  }

  private emptyEnergy(role: Role): void {
    if (this.energyEmptyShown) return;
    this.energyEmptyShown = true;
    this.events.push({ type: 'energy-empty', role });
  }

  /** 다리 동작 순간(점프 최고점·대시 끝·착지) → 전후 범위의 탄을 합동 공격으로 */
  private moveEvent(what: 'apex' | 'dash' | 'land'): void {
    const e = { t: this.time, counted: false };
    this.moveEvents.push(e);
    this.events.push({ type: 'move', what });
    for (const s of this.shots) {
      if (s.alive && !s.combo && s.kind !== 'crate' && this.time - s.fireT <= this.cfg.comboWindowMs) this.markCombo(s, e);
    }
  }

  private markCombo(s: Shot, e: { counted: boolean }): void {
    s.combo = true;
    if (e.counted) return;
    e.counted = true;
    this.stats.combos++;
    this.comboGauge = Math.min(this.cfg.specialGaugeHits, this.comboGauge + 1);
    this.events.push({ type: 'combo', count: this.stats.combos });
  }

  private fire(kind: 'laser' | 'missile' | 'crate', dmg: number, speed: number, from = this.armTip(), angle = this.robot.armAngle): void {
    const s: Shot = { id: this.nextId++, x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg, kind, combo: false, fireT: this.time, alive: true };
    if (kind !== 'crate') {
      const e = this.moveEvents.find((m) => this.time - m.t <= this.cfg.comboWindowMs);
      if (e) this.markCombo(s, e);
      this.stats.shots++;
    }
    this.shots.push(s);
  }

  private tryGrab(): void {
    const tip = this.armTip();
    const a = this.attacks.find((x) => x.kind === 'throw' && x.state === 'active' && Math.hypot(x.x - tip.x, x.y - tip.y) <= this.cfg.grabRange);
    if (!a) return;
    a.state = 'done';
    a.blocked = true;
    const b = this.boss;
    const ang = Math.atan2(b.y + b.h / 2 - a.y, b.x - a.x);
    this.fire('crate', this.cfg.throwBackDamage, 12, { x: a.x, y: a.y }, ang);
    this.events.push({ type: 'grab' });
  }

  private updateShots(sec: number): void {
    const b = this.boss;
    const bcx = b.x, bcy = b.y + b.h / 2;
    for (const s of this.shots) {
      if (!s.alive) continue;
      if (s.kind === 'missile') {
        // 유도: 보스 쪽으로 방향을 조금씩 튼다
        const want = Math.atan2(bcy - s.y, bcx - s.x);
        const cur = Math.atan2(s.vy, s.vx);
        let d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        d = Math.max(-4 * sec, Math.min(4 * sec, d));
        const sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(cur + d) * sp; s.vy = Math.sin(cur + d) * sp;
      }
      s.x += s.vx * sec; s.y += s.vy * sec;
      if (s.x >= b.x - b.w / 2 && s.x <= b.x + b.w / 2 && s.y >= b.y && s.y <= b.y + b.h) {
        s.alive = false;
        this.damageBoss(s.dmg * (s.combo ? this.cfg.comboMultiplier : 1), s.combo);
      } else if (s.x < -2 || s.x > ARENA_W + 2 || s.y < -1 || s.y > 12) s.alive = false;
    }
    for (let i = this.shots.length - 1; i >= 0; i--) if (!this.shots[i].alive) this.shots.splice(i, 1);
  }

  private damageBoss(dmg: number, combo: boolean): void {
    if (this.state !== 'fight') return;
    this.boss.hp = Math.max(0, this.boss.hp - dmg);
    this.boss.hitUntil = this.time + 120;
    this.events.push({ type: 'boss-hit', dmg, combo });
    if (this.boss.hp <= 0) {
      this.state = 'cleared';
      this.attacks.length = 0;
      this.events.push({ type: 'cleared' });
    }
  }

  private updateBoss(): void {
    if (this.state !== 'fight') return;
    const b = this.boss, cfg = this.cfg;
    const ratio = b.hp / b.hpMax;
    // 최종 보스: 체력 2/3, 1/3에서 다음 단계
    const phase = Math.min(this.def.phases.length - 1, Math.floor((1 - ratio) * this.def.phases.length));
    if (phase > b.phase) { b.phase = phase; this.events.push({ type: 'phase', phase }); }
    const live = this.attacks.filter((a) => a.state !== 'done').length;
    if (this.time < this.nextAttackT || live > 0) return;
    const pool = this.def.phases[b.phase];
    let first: PatternKind;
    if (this.def.tutorial) first = pool[this.tutorialIndex++ % pool.length];
    else {
      const choices = pool.length > 1 ? pool.filter((k) => k !== this.lastPattern) : pool;
      first = choices[Math.floor(this.rng() * choices.length)];
    }
    this.lastPattern = first;
    this.spawn(first);
    // 동시 공격: 끌어당기기와는 섞지 않고, 다른 종류 하나 더
    if (this.def.double && first !== 'pull' && (b.phase > 0 || this.def.phases.length === 1) && this.rng() < this.def.double) {
      const rest = pool.filter((k) => k !== first && k !== 'pull' && !(first === 'slam' && k === 'throw'));
      if (rest.length) this.spawn(rest[Math.floor(this.rng() * rest.length)]);
    }
    // 보스 체력이 줄수록 공격 속도 증가 (연습 보스는 느긋하게)
    const interval = cfg.attackIntervalMs * (1 - cfg.attackSpeedUp * (1 - ratio)) * (this.def.tutorial ? 1.4 : 1);
    this.nextAttackT = this.time + interval;
  }

  private spawn(kind: PatternKind): void {
    this.attacks.push({ id: this.nextId++, kind, t0: this.time, state: 'telegraph', x: 0, y: 0, vx: 0, vy: 0, cx: this.robot.x, nextTick: 0, until: 0, blocked: false });
    this.events.push({ type: 'telegraph', kind });
  }

  private updateAttacks(sec: number): void {
    const cfg = this.cfg, t = this.time, r = this.robot, b = this.boss;
    for (const a of this.attacks) {
      if (a.state === 'done' || this.state !== 'fight') continue;
      if (a.state === 'telegraph') {
        if (t - a.t0 < cfg.telegraphMs) continue;
        a.state = 'active';
        const fx = this.bossFront - 0.2;
        switch (a.kind) {
          case 'low': case 'high':
            Object.assign(a, { x: fx, y: a.kind === 'low' ? LOW_Y : HIGH_Y, vx: -cfg.bossShotSpeed });
            break;
          case 'beam': Object.assign(a, { until: t + cfg.beamMs, nextTick: t }); break;
          case 'slam': a.until = t + 350; this.slamHit(a); break;
          case 'throw': {
            // 로봇이 지금 있는 곳으로 포물선
            const x0 = fx, y0 = b.y + b.h * 0.8, fl = THROW_FLIGHT_MS / 1000;
            Object.assign(a, { x: x0, y: y0, vx: (r.x - x0) / fl, vy: (0 - y0) / fl + 0.5 * cfg.gravity * 0.5 * fl });
            break;
          }
          case 'pull': a.until = t + cfg.pullMs; break;
        }
        continue;
      }
      switch (a.kind) {
        case 'low': case 'high':
          a.x += a.vx * sec;
          if (this.hitsRobot(a.x, a.y, SHOT_R)) { a.state = 'done'; this.hurt(a.kind, a.kind === 'low' ? cfg.lowShotDamage : cfg.highShotDamage); }
          else if (a.x < -1) a.state = 'done';
          break;
        case 'beam':
          if (t >= a.until) { a.state = 'done'; break; }
          if (t >= a.nextTick) {
            a.nextTick = t + cfg.beamTickMs;
            if (r.shield) { if (!a.blocked) { a.blocked = true; this.events.push({ type: 'block', kind: 'beam' }); } }
            else if (!this.invulnerable && r.y < BEAM_TOP) this.hurt('beam', cfg.beamDamagePerTick);
          }
          break;
        case 'slam':
          if (t >= a.until) a.state = 'done';
          break;
        case 'throw':
          a.vy -= cfg.gravity * 0.5 * sec;
          a.x += a.vx * sec; a.y += a.vy * sec;
          if (this.hitsRobot(a.x, a.y, 0.5)) { a.state = 'done'; this.hurt('throw', cfg.throwDamage); }
          else if (a.y < 0) a.state = 'done';
          break;
        case 'pull':
          if (t >= a.until) { a.state = 'done'; break; }
          if (r.brace && r.shield) { if (!a.blocked) { a.blocked = true; this.events.push({ type: 'block', kind: 'pull' }); } break; }
          r.x += cfg.pullSpeed * sec;
          if (r.x >= this.maxRobotX - 0.05) {
            a.state = 'done';
            this.hurt('pull', cfg.pullDamage);
            r.x = Math.max(0.8, r.x - 4);
          }
          break;
      }
    }
    for (let i = this.attacks.length - 1; i >= 0; i--) if (this.attacks[i].state === 'done') this.attacks.splice(i, 1);
  }

  private slamHit(a: Attack): void {
    if (!this.invulnerable && Math.abs(this.robot.x - a.cx) < this.cfg.slamHalfWidth + ROBOT_HALF_W) this.hurt('slam', this.cfg.slamDamage);
    else this.events.push({ type: 'block', kind: 'slam' });
  }

  private hitsRobot(x: number, y: number, rad: number): boolean {
    if (this.invulnerable) return false;
    const r = this.robot;
    const nx = Math.max(r.x - ROBOT_HALF_W, Math.min(x, r.x + ROBOT_HALF_W));
    const ny = Math.max(r.y, Math.min(y, r.y + this.robotHeight));
    return Math.hypot(x - nx, y - ny) <= rad;
  }

  private hurt(kind: PatternKind, dmg: number): void {
    if (this.state !== 'fight') return;
    this.hp = Math.max(0, this.hp - dmg);
    this.stats.hits[kind]++;
    const role = PATTERN_INFO[kind].role;
    this.stats.hitsByRole[role]++;
    this.events.push({ type: 'hit', kind, role, dmg });
    if (this.hp > 0) return;
    this.attacks.length = 0;
    if (this.reviveUsed) { this.state = 'failed'; this.events.push({ type: 'failed' }); return; }
    this.state = 'down';
    this.downAt = this.time;
    this.lastSync.legs = this.lastSync.arms = -Infinity;
    this.events.push({ type: 'down' });
  }
}

/** 스테이지 점수 (기획서: 남은 체력 + 걸린 시간 + 합동 공격 수) */
export function stageScore(sim: MechSim): number {
  const c = sim.cfg;
  return Math.round(sim.hp * c.scorePerHp + sim.stats.combos * c.scorePerCombo + Math.max(0, c.parTimeSec - sim.time / 1000) * c.scorePerSecSaved);
}

/** 상점에서 쓸 부품 포인트 */
export function stageParts(sim: MechSim): number {
  const c = sim.cfg;
  return c.partsPerClear + sim.stats.combos * c.partsPerCombo + Math.floor(sim.hp / 10) * c.partsPer10Hp;
}
