// 두 다리 거인 3D 모델 — 관절 다리(허벅지·무릎·정강이·발)를 역운동학(IK)으로, 왼다리 P1 / 오른다리 P2
// 규칙(rules.ts)의 발 위치·들기·균형을 그대로 그리되, 보기 좋게 부드럽게 잇는다:
//   - 다리를 들고 있으면 발이 "놓으면 디딜 자리" 쪽으로 서서히 나아간다 (오래 들수록 멀리 = 규칙)
//   - 놓으면 발이 포물선을 그리며 착지 (순간이동 없음)
//   - 균형(좌우 기울기)은 몸통이 실제로 왼쪽·오른쪽으로 기운다
// 좌표: 1칸 = 50px (규칙의 px 단위를 나눔). 거인은 +x로 걷고, 왼쪽 = −z, 오른쪽 = +z.

import * as THREE from 'three';
import type { GiantConfig } from './config';
import type { GiantSim, Leg } from './rules';

export const PX = 1 / 50;
/** 허벅지·정강이 길이 (px) */
const L1 = 65, L2 = 65;
const HIP_Y = 125;
const CROUCH_HIP_Y = 84;
const HIP_Z = 0.46;
const TORSO_H = 1.9;
const JUMP_PX = 90;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const approach = (v: number, target: number, rate: number, dt: number) => lerp(v, target, 1 - Math.exp(-rate * dt));

interface LegRig { thigh: THREE.Group; knee: THREE.Group; ankle: THREE.Group; x: number; y: number; prevX: number | null }

export class GiantModel {
  readonly root = new THREE.Group();
  /** 발이 막 땅에 닿은 위치 (먼지 효과용, 이번 프레임) */
  readonly footsteps: THREE.Vector3[] = [];

  private hips = new THREE.Group();
  private pitch = new THREE.Group();
  private roll = new THREE.Group();
  private arms: THREE.Group[] = [];
  private legs: LegRig[] = [];
  private stars = new THREE.Group();
  private face: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; current: string };
  private armWaveUntil = [0, 0];

  private crouchAmt = 0;
  /** 몸통 x (px): 발을 디딘 뒤에 체중이 옮겨가도록 규칙의 몸 위치를 부드럽게 따라감 */
  private bodyX: number | null = null;
  private fallAmt = 0;
  private fallSide = 1;
  private rollNow = 0;
  private prevT = 0;
  private time = 0;

  constructor(colors: [string, string]) {
    const std = (color: number | string, rough = 0.55, metal = 0.15) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const suit = std(0x868e96, 0.6, 0.25), dark = std(0x2b2f36, 0.7, 0.2), skin = std(0xffd8a8, 0.7, 0);
    const legMats = colors.map((c) => std(c, 0.45, 0.2));
    const glowMats = colors.map((c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 1.8 }));
    const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m;
    };
    const ball = (r: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat); m.position.set(x, y, z); m.castShadow = true; return m;
    };

    // 골반 → 숙이기(pitch) → 좌우 기울기(roll) → 몸통·팔·머리
    this.root.add(this.hips);
    this.hips.add(box(0.9, 0.45, 1.25, dark));
    this.hips.add(this.pitch);
    this.pitch.add(this.roll);
    const torso = box(1.05, TORSO_H, 1.55, suit, 0, TORSO_H / 2 + 0.15, 0);
    this.roll.add(torso);
    this.roll.add(box(1.08, 0.28, 1.58, dark, 0, 0.35, 0)); // 허리띠
    this.roll.add(box(0.1, 0.9, 0.5, glowMats[0], 0.53, 1.2, -0.38)); // 가슴 줄 (P1 색 / P2 색)
    this.roll.add(box(0.1, 0.9, 0.5, glowMats[1], 0.53, 1.2, 0.38));
    // 팔: 왼팔 P1 색, 오른팔 P2 색
    for (const side of [-1, 1]) {
      const i = side < 0 ? 0 : 1;
      const arm = new THREE.Group();
      arm.position.set(0, TORSO_H - 0.1, side * 0.98);
      arm.add(ball(0.32, legMats[i]));
      arm.add(box(0.36, 1.35, 0.36, legMats[i], 0, -0.75, 0));
      arm.add(ball(0.26, skin, 0, -1.5, 0));
      this.roll.add(arm);
      this.arms.push(arm);
    }
    // 머리 + 얼굴 (이모지 표정을 캔버스로 그림)
    const headY = TORSO_H + 0.75;
    this.roll.add(ball(0.62, skin, 0, headY, 0));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const facePlane = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    facePlane.rotation.y = Math.PI / 2;
    facePlane.position.set(0.6, headY, 0);
    this.roll.add(facePlane);
    this.face = { canvas, tex, current: '' };
    this.setFace('🙂');
    this.roll.add(box(0.9, 0.22, 1.0, dark, -0.05, headY + 0.5, 0)); // 모자
    this.roll.add(box(0.5, 0.08, 1.0, dark, 0.45, headY + 0.42, 0)); // 모자 챙
    // 넘어졌을 때 머리 위를 도는 별
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffd43b }));
      s.position.set(Math.cos((k / 4) * Math.PI * 2) * 0.75, 0, Math.sin((k / 4) * Math.PI * 2) * 0.75);
      this.stars.add(s);
    }
    this.stars.position.y = headY + 0.9;
    this.stars.visible = false;
    this.roll.add(this.stars);

    // 다리: 왼다리(−z) P1, 오른다리(+z) P2
    for (const [i, z] of [[0, -HIP_Z], [1, HIP_Z]] as const) {
      const thigh = new THREE.Group(); thigh.position.set(0, 0, z);
      thigh.add(ball(0.3, dark));
      thigh.add(box(0.5, L1 * PX - 0.1, 0.5, legMats[i], 0, (-L1 * PX) / 2, 0));
      const knee = new THREE.Group(); knee.position.y = -L1 * PX; thigh.add(knee);
      knee.add(ball(0.27, dark));
      knee.add(box(0.44, L2 * PX - 0.1, 0.44, legMats[i], 0, (-L2 * PX) / 2, 0));
      knee.add(box(0.12, L2 * PX * 0.5, 0.3, glowMats[i], 0.24, (-L2 * PX) / 2, 0));
      const ankle = new THREE.Group(); ankle.position.y = -L2 * PX; knee.add(ankle);
      ankle.add(box(0.95, 0.28, 0.58, dark, 0.18, -0.1, 0)); // 신발
      ankle.add(box(0.3, 0.2, 0.6, legMats[i], 0.55, -0.06, 0)); // 신발 코
      this.hips.add(thigh);
      this.legs.push({ thigh, knee, ankle, x: 0, y: 0, prevX: null });
    }
  }

  private setFace(emoji: string): void {
    if (this.face.current === emoji) return;
    this.face.current = emoji;
    const ctx = this.face.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = '100px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 70);
    this.face.tex.needsUpdate = true;
  }

  /** 버튼 1(팔 흔들기)을 눌렀을 때 그쪽 팔을 휘두른다 */
  armWave(leg: Leg): void { this.armWaveUntil[leg] = this.time + 450; }

  /** 2관절 IK: 골반 기준 발 목표 (px)로 허벅지·무릎 각도 */
  private solveLeg(leg: LegRig, fx: number, fy: number): void {
    const d = Math.min(L1 + L2 - 0.5, Math.max(2, Math.hypot(fx, fy)));
    const a = Math.atan2(fy, fx);
    const cosHip = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const cosKnee = Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
    leg.thigh.rotation.z = a + Math.acos(cosHip) + Math.PI / 2;
    leg.knee.rotation.z = -(Math.PI - Math.acos(cosKnee));
    leg.ankle.rotation.z = -(leg.thigh.rotation.z + leg.knee.rotation.z);
  }

  update(sim: GiantSim, cfg: GiantConfig): void {
    const dt = Math.min(0.05, Math.max(0, (sim.time - this.prevT) / 1000));
    this.prevT = sim.time;
    this.time = sim.time;
    this.footsteps.length = 0;
    const fallen = sim.state === 'fallen';
    this.crouchAmt = approach(this.crouchAmt, sim.crouch ? 1 : 0, 16, dt);

    // 발 위치: 규칙의 발 x를 따라가되, 들고 있으면 디딜 자리 쪽으로, 놓으면 포물선
    ([0, 1] as Leg[]).forEach((i) => {
      const l = sim.legs[i], other = sim.legs[1 - i], rig = this.legs[i];
      let tx = l.x, ty = 0;
      if (l.lifted) {
        const lift = sim.liftAmount(i);
        const scale = l.stride > 0 ? cfg.stepBigScale : l.stride < 0 ? cfg.stepSmallScale : 1;
        const predicted = other.x + cfg.stepBase * Math.max(0.15, lift) * scale * (sim.crouch ? cfg.crouchStepScale : 1);
        tx = lerp(l.x, predicted, lift * 0.85);
        ty = lift * cfg.liftHeight;
      }
      if (rig.prevX === null || Math.abs(tx - rig.x) > 220) { rig.x = tx; rig.y = ty; } // 처음·체크포인트 이동은 바로
      const wasMoving = Math.abs(rig.x - tx) > 3;
      rig.x = approach(rig.x, tx, l.lifted ? 10 : 16, dt);
      const remaining = Math.abs(rig.x - tx);
      // 놓은 뒤 남은 거리만큼 발을 띄워 포물선처럼
      rig.y = l.lifted ? approach(rig.y, ty, 14, dt) : Math.max(0, Math.min(36, remaining * 0.9));
      if (!l.lifted && wasMoving && remaining <= 3) this.footsteps.push(new THREE.Vector3(rig.x * PX, 0, i ? HIP_Z : -HIP_Z));
      rig.prevX = rig.x;
    });

    // 든 발이 앞으로 나가도 몸은 딛고 선 발 위에 남아 있다가, 디딘 뒤에 옮겨감
    if (this.bodyX === null || Math.abs(this.bodyX - sim.bodyX) > 220) this.bodyX = sim.bodyX;
    this.bodyX = sim.state === 'jump' ? sim.bodyX : approach(this.bodyX, sim.bodyX, 7, dt);
    const bodyX = this.bodyX;
    const jumpUp = sim.jumpHeight * JUMP_PX;
    const hipY = lerp(HIP_Y, CROUCH_HIP_Y, this.crouchAmt);
    this.hips.position.y = hipY * PX;

    // 다리 IK (점프 중엔 다리를 접는다)
    this.legs.forEach((rig, i) => {
      const fx = rig.x - bodyX;
      const fy = rig.y + (jumpUp > 5 ? 28 * sim.jumpHeight : 0) - hipY;
      this.solveLeg(rig, fallen ? (i ? 30 : 10) : fx, fallen ? -hipY * 0.75 : fy);
    });

    // 몸통: 웅크리면 앞으로 숙이고, 균형만큼 좌우로 기울고, 한 발로 서면 조금 더 흔들
    this.pitch.rotation.z = -0.72 * this.crouchAmt;
    const wobble = sim.legs.some((l) => l.lifted) ? Math.sin(sim.time / 110) * 0.04 : 0;
    this.rollNow = approach(this.rollNow, sim.balance * 0.5 + wobble, 12, dt);
    this.roll.rotation.x = this.rollNow;

    // 넘어짐: 기운 쪽 옆으로 쓰러지고, 일으키기 연타만큼 조금씩 일어남, 머리 위 별
    if (fallen && this.fallAmt < 0.05) this.fallSide = sim.balance < 0 ? -1 : sim.balance > 0 ? 1 : (this.fallSide || 1);
    const getUpK = fallen ? sim.getUp / cfg.getUpPresses : 0;
    this.fallAmt = approach(this.fallAmt, fallen ? 1 - getUpK * 0.45 : 0, 9, dt);
    this.root.rotation.x = this.fallSide * 1.35 * this.fallAmt;
    this.stars.visible = this.fallAmt > 0.5;
    this.stars.rotation.y = sim.time / 300;

    // 팔: 걸을 땐 다리와 반대로 흔들고, 버튼 1이면 바깥으로 크게 휘두름, 많이 기울면 허우적
    this.arms.forEach((arm, i) => {
      const side = i ? 1 : -1;
      const swing = ((this.legs[1 - i].x - this.legs[i].x) / 90) * 0.5;
      const waving = this.time < this.armWaveUntil[i];
      const flail = Math.abs(sim.balance) > 0.55 ? Math.sin(sim.time / 70 + i) * 0.35 : 0;
      arm.rotation.z = approach(arm.rotation.z, swing, 10, dt);
      const outward = waving ? 1.9 + Math.sin(sim.time / 45) * 0.4 : 0.12 + Math.abs(flail);
      arm.rotation.x = approach(arm.rotation.x, -side * outward, waving ? 20 : 10, dt);
    });

    this.setFace(fallen ? '😵' : Math.abs(sim.balance) > 0.6 ? '😰' : sim.crouch ? '😤' : sim.state === 'jump' ? '😆' : '🙂');
    this.root.position.set(bodyX * PX, jumpUp * PX, 0);
  }
}
