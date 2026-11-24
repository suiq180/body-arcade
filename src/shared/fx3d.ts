// 3D 게임 공용 효과 — 먼지·불꽃·총구 섬광·폭발 (합체 로봇, 두 다리 거인). 도형만 사용, 외부 텍스처 없음
// 작은 공을 미리 만들어 두고 돌려 쓴다.

import * as THREE from 'three';

const MAX = 220;

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
}

export interface BurstOptions {
  color: number;
  count: number;
  speed: number;
  size: number;
  life: number;
  /** 빛나는(더하기 합성) 입자인지 — 불꽃·섬광은 true, 먼지·연기는 false */
  glow?: boolean;
  /** 퍼지는 방향 (없으면 사방) */
  dir?: THREE.Vector3;
  spread?: number;
  grow?: number;
  gravity?: number;
  drag?: number;
  opacity?: number;
}

export class Effects {
  readonly group = new THREE.Group();
  private pool: Particle[] = [];
  private geo = new THREE.SphereGeometry(1, 10, 8);

  constructor() {
    for (let i = 0; i < MAX; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0.1, grow: 0, gravity: 0, drag: 0 });
    }
  }

  burst(pos: THREE.Vector3, o: BurstOptions): void {
    for (let n = 0; n < o.count; n++) {
      const p = this.pool.find((x) => x.life <= 0);
      if (!p) return;
      const dir = o.dir
        ? o.dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * (o.spread ?? 0.6), (Math.random() - 0.5) * (o.spread ?? 0.6), (Math.random() - 0.5) * (o.spread ?? 0.6))).normalize()
        : new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      p.vel.copy(dir).multiplyScalar(o.speed * (0.5 + Math.random() * 0.7));
      p.life = p.maxLife = o.life * (0.7 + Math.random() * 0.6);
      p.size = o.size * (0.6 + Math.random() * 0.8);
      p.grow = o.grow ?? 0;
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 2;
      p.mat.color.setHex(o.color);
      p.mat.opacity = o.opacity ?? 1;
      p.mat.blending = o.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
      p.mat.needsUpdate = true;
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(p.size);
      p.mesh.visible = true;
      p.mesh.userData.startOpacity = p.mat.opacity;
    }
  }

  /** 발자국·착지 먼지 */
  dust(pos: THREE.Vector3, strength = 1): void {
    this.burst(pos.clone().setY(0.05), {
      color: 0x8a8f99, count: Math.round(6 * strength), speed: 1.4 * strength, size: 0.09, life: 0.5,
      dir: new THREE.Vector3(0, 0.25, 0), spread: 2.2, grow: 0.5, gravity: -0.4, drag: 3.5, opacity: 0.55,
    });
  }

  /** 총구 섬광 */
  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, color: number, big = false): void {
    this.burst(pos, { color, count: big ? 10 : 5, speed: big ? 5 : 3.5, size: big ? 0.11 : 0.07, life: 0.14, glow: true, dir, spread: 0.7, grow: -0.3, drag: 6 });
    this.burst(pos, { color: 0xffffff, count: 1, speed: 0, size: big ? 0.3 : 0.18, life: 0.06, glow: true, grow: 1 });
  }

  /** 맞았을 때 불꽃 */
  sparks(pos: THREE.Vector3, color = 0xffc078, count = 12): void {
    this.burst(pos, { color, count, speed: 6, size: 0.06, life: 0.35, glow: true, spread: 2, gravity: 9, drag: 1.5 });
  }

  /** 큰 폭발 (보스 격파·내려찍기) */
  explosion(pos: THREE.Vector3, scale = 1): void {
    this.burst(pos, { color: 0xffa94d, count: Math.round(30 * scale), speed: 7 * scale, size: 0.16 * scale, life: 0.7, glow: true, grow: 0.8, drag: 2.5 });
    this.burst(pos, { color: 0x495057, count: Math.round(18 * scale), speed: 3 * scale, size: 0.25 * scale, life: 1.2, grow: 1.2, gravity: -0.8, drag: 2, opacity: 0.6 });
  }

  /** 대시 잔상 */
  trail(pos: THREE.Vector3): void {
    this.burst(pos, { color: 0x66e3ff, count: 2, speed: 0.4, size: 0.18, life: 0.25, glow: true, grow: -0.5, opacity: 0.5 });
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.vel.y = Math.abs(p.vel.y) * 0.3; }
      const k = p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.001, p.size * (1 + p.grow * (1 - k))));
      p.mat.opacity = (p.mesh.userData.startOpacity as number) * k;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.pool.forEach((p) => p.mat.dispose());
  }
}
