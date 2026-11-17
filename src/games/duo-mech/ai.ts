// 1인 + AI 모드: AI가 다리 또는 팔 한쪽을 맡는다 (기획서 9장: AI는 담당 패턴만 반응)
// 보스 공격은 예고가 시작되고 aiReactionMs가 지나야 "보인다" → 사람처럼 반응이 늦다.

import { NO_ARMS, NO_LEGS, type ArmsInput, type LegsInput, type MechSim } from './rules';

/** 합동 신호는 사람에게 맞춰 이 시간 뒤에 누른다 (허용 시간차보다 짧게) */
const SYNC_DELAY_MS = 120;
const PREFERRED_X = 5;
const COMBO_JUMP_EVERY_MS = 2600;

export class MechAI {
  private lastJump = 0;
  private syncAnswered = -Infinity;
  private missileHeld = false;

  /** 공격이 AI 눈에 보이는지 (예고 시작 + 반응 시간) */
  private seen(sim: MechSim, kind: string, state?: 'telegraph' | 'active') {
    return sim.attacks.filter((a) => a.kind === kind && sim.time - a.t0 >= sim.cfg.aiReactionMs && (!state || a.state === state));
  }

  /** 사람이 합동 신호를 눌렀으면 잠깐 뒤 따라 누른다 (부활·합동 기술) */
  private answerSync(sim: MechSim, human: 'legs' | 'arms'): boolean {
    const t = sim.lastSync[human];
    if (t > this.syncAnswered && sim.time - t >= SYNC_DELAY_MS) { this.syncAnswered = t; return true; }
    return false;
  }

  legs(sim: MechSim): LegsInput {
    const out: LegsInput = { ...NO_LEGS };
    out.sync = this.answerSync(sim, 'arms');
    if (sim.state !== 'fight') return out;
    const r = sim.robot;
    if (this.seen(sim, 'pull', 'active').length) { out.brace = true; return out; }
    const slam = this.seen(sim, 'slam', 'telegraph')[0];
    if (slam && Math.abs(r.x - slam.cx) < sim.cfg.slamHalfWidth + 1.2) {
      // 대시로 빠지고, 예고가 끝날 때까지 계속 바깥쪽으로
      const away = slam.cx >= sim.maxRobotX - 3 || r.x < slam.cx ? -1 : 1;
      out.move = r.x <= 1 ? 1 : away;
      out.dash = sim.time >= r.dashUntil && Math.abs(r.x - slam.cx) < sim.cfg.slamHalfWidth + 0.7;
      return out;
    }
    const low = this.seen(sim, 'low', 'active').find((a) => a.x - r.x > 0 && a.x - r.x < 2.6);
    if (low && r.onGround) { out.jump = true; this.lastJump = sim.time; return out; }
    // 탄이 몸을 완전히 지나갈 때까지 웅크린 채로
    const high = this.seen(sim, 'high', 'active').find((a) => a.x - r.x > -1.3 && a.x - r.x < 3.5);
    if (high) { out.crouch = true; return out; }
    // 평소: 자리 지키기 + 합동 공격을 위해 가끔 점프
    if (Math.abs(r.x - PREFERRED_X) > 0.3) out.move = r.x < PREFERRED_X ? 1 : -1;
    else if (sim.time - this.lastJump > COMBO_JUMP_EVERY_MS && !sim.attacks.length) { out.jump = true; this.lastJump = sim.time; }
    return out;
  }

  arms(sim: MechSim): ArmsInput {
    const out: ArmsInput = { ...NO_ARMS };
    out.sync = this.answerSync(sim, 'legs');
    if (sim.state !== 'fight') return out;
    const b = sim.boss, tip = sim.armTip();
    // 보스를 8방향 중 가까운 쪽으로 조준
    const ang = Math.atan2(b.y + b.h / 2 - tip.y, b.x - tip.x);
    const cx = Math.cos(ang), cy = Math.sin(ang);
    out.aimX = Math.abs(cx) > 0.38 ? (Math.sign(cx) as -1 | 1) : 0;
    out.aimY = Math.abs(cy) > 0.38 ? (Math.sign(cy) as -1 | 1) : 0;
    const crate = this.seen(sim, 'throw', 'active').find((a) => Math.hypot(a.x - tip.x, a.y - tip.y) < sim.cfg.grabRange - 0.3);
    if (crate) { out.grab = true; return out; }
    const beam = this.seen(sim, 'beam').length > 0;
    const pull = this.seen(sim, 'pull', 'active').length > 0;
    if (beam || pull) { out.shield = true; return out; }
    out.laser = true;
    // 에너지가 넉넉하면 미사일 충전 → 다 차면 발사
    const chargeMs = sim.cfg.missileChargeSec * 1000;
    if (this.missileHeld) {
      if (sim.robot.missileCharge >= chargeMs) this.missileHeld = false;
    } else if (sim.energy >= sim.cfg.missileCost + 20 && sim.robot.missileCharge === 0) this.missileHeld = true;
    out.missile = this.missileHeld;
    return out;
  }
}
