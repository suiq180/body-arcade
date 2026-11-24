// 합체 로봇 3D 모델 — 관절 다리(허벅지·무릎·정강이·발)를 역운동학(IK)으로 움직인다
// 걸음은 시간이 아니라 실제로 움직인 거리만큼 나아가서 발이 땅에서 미끄러지지 않는다.
// 판정(rules.ts)의 상태만 읽어 자세를 만든다: 걷기 / 웅크리기 / 점프(접었다 폄) / 착지 눌림 / 버티기 / 대시.
// 다리는 다리 담당 색, 팔은 팔 담당 색 (setColors).

import * as THREE from 'three';
import type { MechSim } from './rules';

/** 허벅지·정강이 길이 (칸) */
const L1 = 0.6, L2 = 0.6;
/** 서 있을 때 골반 높이 — 다리 길이(1.2)보다 조금 낮게: 무릎이 살짝만 굽은 자세 */
const HIP_Y = 1.16;
const CROUCH_HIP_Y = 0.42;
const BRACE_HIP_Y = 0.88;
/** 한 걸음 보폭과 발 드는 높이 */
const STRIDE = 0.9;
const LIFT = 0.26;
const HIP_Z = 0.3;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const approach = (v: number, target: number, rate: number, dt: number) => lerp(v, target, 1 - Math.exp(-rate * dt));

interface LegRig { thigh: THREE.Group; knee: THREE.Group; ankle: THREE.Group; footY: number; prevU: number }

export class RobotModel {
  readonly root = new THREE.Group();
  /** 발이 막 땅에 닿은 위치 (먼지 효과용, 이번 프레임) */
  readonly footsteps: THREE.Vector3[] = [];
  landed = false;

  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private gunArm = new THREE.Group();
  private backArm = new THREE.Group();
  private muzzle = new THREE.Object3D();
  private shield: THREE.Mesh;
  private thrusters: THREE.Mesh[] = [];
  private legs: LegRig[] = [];

  private bodyMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.55, roughness: 0.32 });
  private darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.5, roughness: 0.55 });
  private legMat = new THREE.MeshStandardMaterial({ color: 0xff922b, metalness: 0.35, roughness: 0.42 });
  private armMat = new THREE.MeshStandardMaterial({ color: 0x15aabf, metalness: 0.35, roughness: 0.42 });
  private legGlow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff922b, emissiveIntensity: 2.2 });
  private armGlow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x15aabf, emissiveIntensity: 2.2 });
  private visorMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, emissive: 0x66e3ff, emissiveIntensity: 2.6, metalness: 0.2, roughness: 0.2 });

  // 움직임 상태 (부드럽게 바뀌게)
  private phase = 0;
  private walkAmt = 0;
  private crouchAmt = 0;
  private braceAmt = 0;
  private airAmt = 0;
  private dashAmt = 0;
  private lean = 0;
  private landK = 0;
  private prevX: number | null = null;
  private prevT = 0;
  private wasGround = true;
  private hitFlash = 0;
  private prevHp = -1;

  constructor() {
    const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };
    const ball = (r: number, mat: THREE.Material) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat); m.castShadow = true; return m; };

    // 골반 + 몸통 (골반 높이에서 기울어짐)
    this.root.add(this.hips);
    this.hips.add(box(0.6, 0.28, 0.86, this.darkMat));
    this.hips.add(this.torso);
    this.torso.add(box(0.5, 0.3, 0.6, this.darkMat, 0, 0.2, 0)); // 허리
    this.torso.add(box(0.9, 0.7, 0.86, this.bodyMat, 0.02, 0.62, 0)); // 가슴
    this.torso.add(box(0.06, 0.42, 0.6, this.bodyMat, 0.48, 0.62, 0)); // 가슴판
    this.torso.add(box(0.07, 0.06, 0.5, this.armGlow, 0.51, 0.72, 0)); // 가슴 빛 줄
    this.torso.add(box(0.07, 0.06, 0.5, this.legGlow, 0.51, 0.52, 0));
    this.torso.add(box(0.4, 0.5, 0.6, this.darkMat, -0.6, 0.6, 0)); // 등 배낭
    for (const z of [-0.16, 0.16]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 12), new THREE.MeshBasicMaterial({ color: 0x66e3ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      t.rotation.z = Math.PI / 2; t.position.set(-1.05, 0.45, z); t.visible = false;
      this.thrusters.push(t); this.torso.add(t);
    }
    // 머리: 헬멧 + 빛나는 바이저 + 안테나
    this.head.position.set(0.05, 1.12, 0);
    this.head.add(box(0.58, 0.4, 0.56, this.bodyMat));
    this.head.add(box(0.06, 0.13, 0.46, this.visorMat, 0.3, 0.02, 0));
    this.head.add(box(0.04, 0.3, 0.04, this.darkMat, -0.15, 0.32, 0.18));
    const tip = ball(0.05, this.armGlow); tip.position.set(-0.15, 0.48, 0.18); this.head.add(tip);
    this.torso.add(this.head);

    // 총 팔 (앞쪽, 팔 담당): 어깨 보호대 + 윗팔 + 팔꿈치 + 총신
    // 어깨 높이 = 판정(rules.ts armTip)의 어깨 1.6칸 = 골반 1.16 + 0.44 → 탄이 총구에서 나가 보이게
    this.gunArm.position.set(0.1, 0.44, 0.52);
    const pad = box(0.46, 0.3, 0.3, this.armMat, 0, 0.12, 0); this.gunArm.add(pad);
    this.gunArm.add(box(0.5, 0.2, 0.22, this.armMat, 0.28, 0, 0));
    const elbow = ball(0.13, this.darkMat); elbow.position.x = 0.55; this.gunArm.add(elbow);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.62, 14), this.darkMat);
    barrel.rotation.z = Math.PI / 2; barrel.position.x = 0.92; barrel.castShadow = true; this.gunArm.add(barrel);
    this.gunArm.add(box(0.36, 0.05, 0.24, this.armGlow, 0.9, 0.12, 0));
    this.muzzle.position.x = 1.26; this.gunArm.add(this.muzzle);
    this.torso.add(this.gunArm);
    // 방패 (총 팔 앞)
    this.shield = new THREE.Mesh(new THREE.CircleGeometry(1.25, 6), new THREE.MeshBasicMaterial({ color: 0x66e3ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.shield.rotation.y = Math.PI / 2;
    this.shield.position.set(1.25, 0, 0);
    this.gunArm.add(this.shield);

    // 뒤쪽 팔 (장식, 걸을 때 흔들림)
    this.backArm.position.set(0.05, 0.78, -0.54);
    this.backArm.add(box(0.4, 0.28, 0.28, this.armMat, 0, 0.1, 0));
    this.backArm.add(box(0.2, 0.62, 0.2, this.armMat, 0, -0.3, 0));
    const fist = ball(0.13, this.darkMat); fist.position.y = -0.66; this.backArm.add(fist);
    this.torso.add(this.backArm);

    // 다리 2개: 골반 → 허벅지 → 무릎 → 정강이 → 발목 → 발
    for (const z of [HIP_Z, -HIP_Z]) {
      const thigh = new THREE.Group();
      thigh.position.set(0, 0, z);
      const hipBall = ball(0.2, this.darkMat); thigh.add(hipBall);
      thigh.add(box(0.34, L1 - 0.08, 0.34, this.legMat, 0, -L1 / 2, 0));
      thigh.add(box(0.05, L1 * 0.5, 0.2, this.legGlow, 0.18, -L1 / 2, 0));
      const knee = new THREE.Group(); knee.position.y = -L1; thigh.add(knee);
      const kneeBall = ball(0.17, this.darkMat); knee.add(kneeBall);
      knee.add(box(0.22, 0.24, 0.36, this.legMat, 0.13, -0.02, 0)); // 무릎 보호대
      knee.add(box(0.3, L2 - 0.06, 0.3, this.legMat, 0, -L2 / 2 - 0.02, 0));
      knee.add(box(0.36, 0.22, 0.34, this.darkMat, -0.02, -L2 + 0.12, 0)); // 정강이 아래 장갑
      const ankle = new THREE.Group(); ankle.position.y = -L2; knee.add(ankle);
      ankle.add(box(0.62, 0.14, 0.4, this.darkMat, 0.1, -0.05, 0)); // 발
      ankle.add(box(0.16, 0.1, 0.38, this.legMat, 0.36, -0.03, 0)); // 발끝
      ankle.add(box(0.14, 0.1, 0.34, this.legMat, -0.2, -0.03, 0)); // 뒤꿈치
      this.hips.add(thigh);
      this.legs.push({ thigh, knee, ankle, footY: 0, prevU: 0 });
    }
  }

  setColors(legs: string, arms: string): void {
    this.legMat.color.set(legs); this.legGlow.emissive.set(legs);
    this.armMat.color.set(arms); this.armGlow.emissive.set(arms);
  }

  /** 총구 세계 좌표 (총구 불꽃 효과용) */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.muzzle.getWorldPosition(out);
  }

  chestWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.torso.localToWorld(out.set(0, 0.62, 0));
  }

  /** 2관절 IK: 골반 기준 발 목표 (fx, fy)로 허벅지·무릎 각도를 정하고 발은 땅과 평행하게 */
  private solveLeg(leg: LegRig, fx: number, fy: number, footTilt = 0): void {
    const d = Math.min(L1 + L2 - 0.001, Math.max(0.05, Math.hypot(fx, fy)));
    const a = Math.atan2(fy, fx);
    const cosHip = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const cosKnee = Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
    const thighDir = a + Math.acos(cosHip); // 무릎이 앞(+x)으로 굽게
    leg.thigh.rotation.z = thighDir + Math.PI / 2;
    leg.knee.rotation.z = -(Math.PI - Math.acos(cosKnee));
    // 발목: 몸 기울기·허벅지·정강이 회전을 되돌려 발바닥을 수평으로
    leg.ankle.rotation.z = -(leg.thigh.rotation.z + leg.knee.rotation.z + this.hips.rotation.z) + footTilt;
  }

  update(sim: MechSim): void {
    const r = sim.robot;
    const dt = Math.min(0.05, Math.max(0, (sim.time - this.prevT) / 1000));
    this.prevT = sim.time;
    const dx = this.prevX === null ? 0 : r.x - this.prevX;
    this.prevX = r.x;
    this.footsteps.length = 0;
    this.landed = false;

    const dashing = sim.time < r.dashUntil;
    const grounded = r.onGround;
    const vx = dt > 0 ? dx / dt : 0;
    const walking = grounded && !dashing && !r.crouch && !r.brace && Math.abs(vx) > 0.3;
    this.walkAmt = approach(this.walkAmt, walking ? 1 : 0, 10, dt);
    this.crouchAmt = approach(this.crouchAmt, r.crouch ? 1 : 0, 18, dt);
    this.braceAmt = approach(this.braceAmt, r.brace ? 1 : 0, 12, dt);
    this.airAmt = approach(this.airAmt, grounded ? 0 : 1, 14, dt);
    this.dashAmt = approach(this.dashAmt, dashing ? 1 : 0, 20, dt);
    if (grounded && !this.wasGround) { this.landK = 1; this.landed = true; }
    this.wasGround = grounded;
    this.landK = Math.max(0, this.landK - dt * 5);
    // 걸음: 움직인 거리만큼 위상이 나아간다 (발 미끄러짐 없음)
    if (grounded && !dashing) this.phase += (dx / STRIDE) * Math.PI;

    // 골반 높이: 서기 → 웅크리기·버티기 쪽으로 섞고, 걸음마다 살짝 출렁, 착지하면 눌림
    let hipY = HIP_Y;
    hipY = lerp(hipY, BRACE_HIP_Y, this.braceAmt);
    hipY = lerp(hipY, CROUCH_HIP_Y, this.crouchAmt);
    hipY -= this.walkAmt * 0.05 * (1 + Math.cos(this.phase * 2)) * 0.5;
    hipY -= this.landK * this.landK * 0.28;
    this.hips.position.y = hipY;

    // 몸 기울기: 걷는 방향으로 조금, 웅크리면 앞으로 숙임, 대시는 크게, 버티기는 뒤로 버팀
    const targetLean = -(vx / 4.5) * 0.08 * this.walkAmt - this.crouchAmt * 0.45 - this.dashAmt * 0.38 * r.dashDir + this.braceAmt * 0.22;
    this.lean = approach(this.lean, targetLean, 14, dt);
    this.hips.rotation.z = this.lean;

    // 발 목표 (골반 기준)
    this.legs.forEach((leg, i) => {
      const p = this.phase + i * Math.PI;
      const u = ((p / (Math.PI * 2)) % 1 + 1) % 1;
      let cx: number, cy: number;
      if (u < 0.5) { cx = STRIDE / 2 - (u / 0.5) * STRIDE; cy = 0; } // 디딤: 발은 땅에 붙어 뒤로
      else { const k = (u - 0.5) / 0.5; const s = k * k * (3 - 2 * k); cx = -STRIDE / 2 + s * STRIDE; cy = LIFT * Math.sin(k * Math.PI); } // 들기
      // 발이 땅에 닿는 순간 (들기 → 디딤) → 발자국 먼지
      if (this.walkAmt > 0.5 && leg.prevU > 0.9 && u < 0.1) this.footsteps.push(leg.ankle.getWorldPosition(new THREE.Vector3()));
      leg.prevU = u;
      const restX = (i ? -0.1 : 0.12) * (1 - this.braceAmt) + (i ? -0.42 : 0.42) * this.braceAmt;
      let fx = lerp(restX, cx, this.walkAmt);
      let fy = lerp(0, cy, this.walkAmt) - hipY;
      // 공중: 오를 땐 다리를 접고, 떨어질 땐 펴서 착지 준비
      const tuck = r.vy > 0 ? 1 : Math.max(0, Math.min(1, 1 + r.vy / 6));
      const airX = i ? -0.12 : 0.22, airY = lerp(-0.98, -0.52, tuck) - (i ? 0.05 : 0);
      fx = lerp(fx, airX, this.airAmt); fy = lerp(fy, airY, this.airAmt);
      // 대시: 앞발 내딛고 뒷발 끌기
      fx = lerp(fx, (i ? -0.55 : 0.35) * r.dashDir, this.dashAmt);
      fy = lerp(fy, i ? -0.78 : -0.9, this.dashAmt);
      // 몸이 기울면 골반 좌표계도 돌아가므로 목표를 되돌려 준다
      const c = Math.cos(-this.lean), s = Math.sin(-this.lean);
      this.solveLeg(leg, fx * c - fy * s, fx * s + fy * c, this.airAmt * (i ? -0.3 : 0.2));
    });

    // 팔: 총 팔은 조준 방향 (몸 기울기 보정), 뒤 팔은 걸음과 반대로 흔들림
    this.gunArm.rotation.z = r.armAngle - this.lean;
    this.backArm.rotation.z = -0.15 + Math.sin(this.phase) * 0.45 * this.walkAmt + this.airAmt * 0.6 - this.lean;
    this.shield.visible = r.shield;
    (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(sim.time / 60) * 0.08;
    this.thrusters.forEach((t) => { t.visible = dashing || this.airAmt > 0.5 && r.vy > 0; t.scale.setScalar(dashing ? 1.4 : 0.8); });

    // 맞으면 빨갛게, 대시 중(무적)은 푸르게 빛남
    if (this.prevHp >= 0 && sim.hp < this.prevHp) this.hitFlash = 1;
    this.prevHp = sim.hp;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    const em = this.bodyMat.emissive;
    if (this.hitFlash > 0) em.setRGB(this.hitFlash * 0.9, 0.05, 0.05);
    else if (dashing) em.setRGB(0.1, 0.3, 0.45);
    else em.setRGB(0, 0, 0);

    this.root.position.set(r.x, r.y, 0);
    this.root.rotation.y = sim.time < sim.specialUntil ? ((sim.specialUntil - sim.time) / 900) * Math.PI * 4 : 0;
  }
}
