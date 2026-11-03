// 눈치껏 쌓아라 2D 물리 (Matter.js)
// 받침대 위 탑, 떨어진 블록 판정, 접착제·바람·미끄럼·지진 효과를 담당한다. 화면 그리기는 index.ts.

import Matter from 'matter-js';
import type { ShapeId, StackSenseConfig } from './config';

const { Engine, Bodies, Body, Composite, Constraint, Events, Query } = Matter;
type MBody = Matter.Body;

/** 블록에 붙여 두는 게임 정보 */
export interface BlockInfo {
  shape: ShapeId;
  color: string;
  /** 모양의 기본 회전 (삼각형은 밑변이 아래로 오도록 돌려 둔다) */
  angleOffset: number;
  glue: boolean;
  /** 떨어진 블록으로 이미 셌는지 */
  fallen: boolean;
}

const STEP_MS = 1000 / 60;

export class TowerWorld {
  readonly engine = Engine.create();
  readonly base: MBody;
  readonly floor: MBody;
  readonly blocks = new Set<MBody>();
  private info = new WeakMap<MBody, BlockInfo>();
  private acc = 0;
  private time = 0;
  /** 옆바람: 남은 시간(ms), 방향 */
  private wind = { ms: 0, dir: 1 };
  quake = false;

  constructor(private cfg: StackSenseConfig) {
    const { worldW, baseWidth, baseTopY, floorY } = cfg;
    this.base = Bodies.rectangle(worldW / 2, baseTopY + 30, baseWidth, 60, { isStatic: true, friction: 1 });
    this.floor = Bodies.rectangle(worldW / 2, floorY + 40, worldW * 3, 80, { isStatic: true, friction: 0.8 });
    Composite.add(this.engine.world, [this.base, this.floor]);
    Events.on(this.engine, 'collisionStart', (e) => {
      for (const pair of e.pairs) { this.tryGlue(pair.bodyA, pair.bodyB); this.tryGlue(pair.bodyB, pair.bodyA); }
    });
  }

  /** 블록을 만든다 (아직 세상에 넣지 않음 — 손에 든 동안은 물리 영향 없음) */
  makeBlock(shape: ShapeId, color: string, x: number, y: number): MBody {
    const opts = { friction: this.cfg.blockFriction, frictionStatic: 1.2, restitution: 0.02, density: 0.002 };
    let body: MBody;
    let angleOffset = 0;
    switch (shape) {
      case 'box': body = Bodies.rectangle(x, y, 130, 70, opts); break;
      case 'bar': body = Bodies.rectangle(x, y, 240, 44, opts); break;
      case 'longbar': body = Bodies.rectangle(x, y, 340, 36, opts); break;
      case 'tri':
        angleOffset = Math.PI / 2;
        body = Bodies.polygon(x, y, 3, 78, opts);
        Body.setAngle(body, angleOffset);
        break;
      case 'ball': body = Bodies.circle(x, y, 42, { ...opts, friction: 0.5 }); break;
    }
    this.info.set(body, { shape, color, angleOffset, glue: false, fallen: false });
    return body;
  }

  blockInfo(b: MBody): BlockInfo | undefined {
    return this.info.get(b);
  }

  /** 손에 든 블록 위치·회전 맞추기 (회전은 모양 기본 회전에 더한다) */
  pose(b: MBody, x: number, y: number, angle: number): void {
    Body.setPosition(b, { x, y });
    Body.setAngle(b, (this.info.get(b)?.angleOffset ?? 0) + angle);
  }

  /**
   * 블록을 놓아 물리 상태로 바꾼다. 속도 단위는 world px/초.
   * 놓는 자리가 다른 블록과 겹치면 겹치지 않을 때까지 위로 올린다 (겹친 채 놓으면 튕겨 나감).
   */
  drop(b: MBody, vx: number, vy: number, o: { glue?: boolean; ice?: boolean } = {}): void {
    const inf = this.info.get(b)!;
    inf.glue = !!o.glue;
    if (o.ice) { b.friction = this.cfg.iceFriction; b.frictionStatic = 0.05; }
    const others = [...this.blocks, this.base];
    for (let i = 0; i < 40 && Query.collides(b, others).length; i++) Body.translate(b, { x: 0, y: -6 });
    Composite.add(this.engine.world, b);
    this.blocks.add(b);
    Body.setVelocity(b, { x: (vx * STEP_MS) / 1000, y: (vy * STEP_MS) / 1000 });
    Body.setAngularVelocity(b, 0);
  }

  remove(b: MBody): void {
    Composite.remove(this.engine.world, b);
    this.blocks.delete(b);
    for (const c of Composite.allConstraints(this.engine.world)) {
      if (c.bodyA === b || c.bodyB === b) Composite.remove(this.engine.world, c);
    }
  }

  /** 탑에서 무작위 블록 하나 빼기 (아이템). 뺀 블록이 없으면 false */
  removeRandom(rng: () => number): boolean {
    const list = [...this.blocks].filter((b) => !this.info.get(b)?.fallen);
    if (!list.length) return false;
    this.remove(list[Math.floor(rng() * list.length)]);
    return true;
  }

  clear(): void {
    for (const b of [...this.blocks]) this.remove(b);
    this.wind.ms = 0;
  }

  startWind(dir: 1 | -1): void {
    this.wind = { ms: this.cfg.windDurationMs, dir };
  }

  get windActive(): boolean { return this.wind.ms > 0; }
  get windDir(): number { return this.wind.dir; }

  /** 실제 경과 시간만큼 고정 간격으로 물리를 진행한다. 새로 떨어진 블록 목록을 돌려준다 */
  step(dtMs: number): MBody[] {
    this.acc = Math.min(this.acc + dtMs, 250);
    const fallen: MBody[] = [];
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      const scaled = STEP_MS * this.engine.timing.timeScale;
      this.time += scaled;
      this.applyQuake();
      if (this.wind.ms > 0) {
        this.wind.ms -= scaled;
        const g = this.engine.gravity.scale * this.cfg.windForce * this.cfg.windToGravity;
        for (const b of this.blocks) Body.applyForce(b, b.position, { x: b.mass * g * this.wind.dir, y: 0 });
      }
      Engine.update(this.engine, STEP_MS);
      for (const b of this.blocks) {
        const inf = this.info.get(b)!;
        const out = b.position.y > this.cfg.baseTopY + this.cfg.fallenMargin
          || b.position.x < -200 || b.position.x > this.cfg.worldW + 200;
        if (out && !inf.fallen) { inf.fallen = true; fallen.push(b); }
      }
    }
    return fallen;
  }

  private applyQuake(): void {
    const cx = this.cfg.worldW / 2;
    const x = this.quake
      ? cx + Math.sin((this.time / 1000 / this.cfg.quakePeriodSec) * Math.PI * 2) * this.cfg.quakeAmplitude * this.cfg.worldW
      : cx;
    // 위치와 함께 속도도 맞춰 줘야 위에 놓인 블록이 마찰로 같이 흔들린다
    const dx = x - this.base.position.x;
    Body.setPosition(this.base, { x, y: this.base.position.y });
    Body.setVelocity(this.base, { x: dx, y: 0 });
  }

  /** 받침대 위에 서 있는(떨어지지 않은) 블록 */
  standing(): MBody[] {
    return [...this.blocks].filter((b) => !this.info.get(b)!.fallen);
  }

  /** 탑 꼭대기 (가장 높은 블록의 윗면 y와 그 블록의 x). 블록이 없으면 받침대 */
  top(): { x: number; y: number } {
    let best: { x: number; y: number } = { x: this.base.position.x, y: this.cfg.baseTopY };
    for (const b of this.standing()) if (b.bounds.min.y < best.y) best = { x: b.position.x, y: b.bounds.min.y };
    return best;
  }

  /** 가장 많이 기운 블록의 기울기(도). 모양의 대칭을 고려한다 (네모는 90°마다 같은 모양) */
  maxTiltDeg(): number {
    let max = 0;
    for (const b of this.standing()) {
      const inf = this.info.get(b)!;
      if (inf.shape === 'ball') continue;
      const sym = inf.shape === 'tri' ? (Math.PI * 2) / 3 : Math.PI / 2;
      const a = b.angle - inf.angleOffset;
      const d = ((a % sym) + sym) % sym;
      max = Math.max(max, (Math.min(d, sym - d) * 180) / Math.PI);
    }
    return max;
  }

  /** 모든 블록이 거의 멈췄는지 */
  settled(): boolean {
    return this.standing().every((b) => b.speed < 0.25 && Math.abs(b.angularVelocity) < 0.01);
  }

  private tryGlue(a: MBody, b: MBody): void {
    const inf = this.info.get(a);
    if (!inf?.glue || (b !== this.base && !this.blocks.has(b))) return;
    inf.glue = false; // 처음 닿은 블록 하나에만 붙는다
    const rel = { x: a.position.x - b.position.x, y: a.position.y - b.position.y };
    const arm = 24;
    for (const dx of [-arm, arm]) {
      Composite.add(this.engine.world, Constraint.create({
        bodyA: a, pointA: { x: dx, y: 0 },
        bodyB: b, pointB: { x: rel.x + dx, y: rel.y },
        length: 0, stiffness: 0.6, damping: 0.1,
      }));
    }
  }

  setSlowMo(on: boolean): void {
    this.engine.timing.timeScale = on ? this.cfg.slowMoScale : 1;
  }
}
