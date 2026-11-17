// 합체 로봇 조종석 3D 화면 (Three.js) — 판정은 rules.ts의 2D 상태, 여기서는 그리기만 한다
// 옆에서 본 고정 카메라. 로봇·보스·탄은 모두 기본 도형으로 직접 만든다 (외부 모델·텍스처 없음).
// 다리는 P1 색(주황), 팔은 P2 색(청록) — 역할을 바꾸면 색도 맡은 사람 색으로 바뀐다.

import * as THREE from 'three';
import { ARENA_W, type Attack, type MechSim, type Shot } from './rules';

const C = {
  ground: 0x3b3f4a, grid: 0x5c6370, body: 0x9aa3ad, dark: 0x343a40, boss: 0x7c3aed, bossHit: 0xffffff,
  low: 0xff4d4f, high: 0xff922b, beam: 0xff2d55, warn: 0xff3b30, crate: 0xb08968, laser: 0x66e3ff, missile: 0xffd43b, combo: 0xfff3bf,
};

/** 보스 모양 (스테이지별) */
function makeBoss(stage: number): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3 });
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); g.add(m); return m;
  };
  switch (stage) {
    case 0: // 연습용 표적: 기둥 + 과녁
      add(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 16), 0x868e96, 0, 1.2);
      add(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 32), 0xf8f9fa, 0, 2.8).rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.85, 0.85, 0.34, 32), 0xff6b6b, -0.02, 2.8).rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.35, 0.35, 0.38, 32), 0xf8f9fa, -0.04, 2.8).rotation.z = Math.PI / 2;
      break;
    case 1: // 바퀴 탱크
      add(new THREE.BoxGeometry(3, 1.4, 2), 0x5c940d, 0, 1.2);
      add(new THREE.BoxGeometry(1.6, 1, 1.4), 0x74b816, 0.3, 2.4);
      add(new THREE.CylinderGeometry(0.18, 0.18, 1.8, 12), C.dark, -1, 2.5).rotation.z = Math.PI / 2;
      for (const x of [-1, 0, 1]) for (const z of [-1.05, 1.05]) add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20), 0x212529, x, 0.5, z).rotation.x = Math.PI / 2;
      break;
    case 2: // 공중 포대
      add(new THREE.SphereGeometry(1.2, 24, 16), 0x4dabf7, 0, 1.2);
      add(new THREE.TorusGeometry(1.5, 0.12, 8, 32), 0xadb5bd, 0, 1.2).rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 12), C.dark, -1.2, 0.8).rotation.z = Math.PI / 2.6;
      break;
    case 3: { // 거대 기계 거미
      add(new THREE.SphereGeometry(1.3, 24, 16), 0x495057, 0, 2.2);
      add(new THREE.SphereGeometry(0.6, 16, 12), 0xfa5252, -1.2, 2.4);
      for (let i = 0; i < 4; i++) for (const z of [-1, 1]) {
        const leg = add(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8), 0x343a40, -1.2 + i * 0.8, 1.1, z * 1.2);
        leg.rotation.x = z * 0.6;
      }
      break;
    }
    default: // 최종 보스
      add(new THREE.BoxGeometry(3, 3.2, 2.2), 0x862e9c, 0, 1.6);
      add(new THREE.BoxGeometry(1.8, 1.2, 1.6), 0xbe4bdb, 0, 3.8);
      add(new THREE.ConeGeometry(0.3, 1, 12), 0xffd43b, -0.6, 4.8);
      add(new THREE.ConeGeometry(0.3, 1, 12), 0xffd43b, 0.6, 4.8);
      add(new THREE.SphereGeometry(0.25, 12, 8), 0xff2d55, -0.95, 3.9, 0.5);
      add(new THREE.SphereGeometry(0.25, 12, 8), 0xff2d55, -0.95, 3.9, -0.5);
  }
  return g;
}

export class MechView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  private robot = new THREE.Group();
  private legL: THREE.Mesh; private legR: THREE.Mesh;
  private arm = new THREE.Group();
  private shield: THREE.Mesh;
  private boss: THREE.Group;
  private bossMats: THREE.MeshStandardMaterial[] = [];
  private legMat = new THREE.MeshStandardMaterial({ color: 0xff922b });
  private armMat = new THREE.MeshStandardMaterial({ color: 0x15aabf });
  private dyn = new Map<string, THREE.Object3D>();
  private shake = 0;

  constructor(private host: HTMLElement, stage: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.domElement.className = 'dm-canvas';
    host.prepend(this.renderer.domElement); // 안내·메뉴 겹침 화면보다 뒤에
    this.scene.background = new THREE.Color(0x1b1e24);
    this.scene.fog = new THREE.Fog(0x1b1e24, 22, 40);
    this.scene.add(new THREE.HemisphereLight(0xdee2e6, 0x343a40, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-4, 10, 8);
    this.scene.add(sun);
    // 바닥 + 격자 (x: 0 ~ ARENA_W)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshStandardMaterial({ color: C.ground }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(ARENA_W / 2, 0, 0);
    this.scene.add(ground);
    const grid = new THREE.GridHelper(60, 60, C.grid, C.grid);
    grid.position.set(ARENA_W / 2, 0.01, 0);
    this.scene.add(grid);

    // 로봇: 몸통(회색) + 다리(다리 담당 색) + 팔(팔 담당 색)
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.9), new THREE.MeshStandardMaterial({ color: C.body }));
    body.position.y = 1.35; body.name = 'body';
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), new THREE.MeshStandardMaterial({ color: 0xced4da }));
    head.position.y = 2.1; head.name = 'head';
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.45), new THREE.MeshBasicMaterial({ color: 0x66e3ff }));
    eye.position.set(0.3, 2.12, 0); eye.name = 'eye';
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.32), this.legMat);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.32), this.legMat);
    this.legL.position.set(0, 0.45, 0.25); this.legR.position.set(0, 0.45, -0.25);
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.24), this.armMat);
    armMesh.position.x = 0.55;
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.4, 10), new THREE.MeshStandardMaterial({ color: C.dark }));
    gun.rotation.z = Math.PI / 2; gun.position.x = 1.2;
    this.arm.add(armMesh, gun);
    this.arm.position.set(0.3, 1.6, 0.55);
    this.shield = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color: 0x15aabf, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    this.shield.rotation.y = Math.PI / 2;
    this.shield.position.set(1.1, 1.2, 0);
    this.robot.add(body, head, eye, this.legL, this.legR, this.arm, this.shield);
    this.scene.add(this.robot);

    this.boss = makeBoss(stage);
    this.boss.traverse((o) => { if (o instanceof THREE.Mesh) this.bossMats.push(o.material as THREE.MeshStandardMaterial); });
    this.scene.add(this.boss);

    this.camera.position.set(ARENA_W / 2, 4.2, 17);
    this.camera.lookAt(ARENA_W / 2, 2.4, 0);
    this.resize();
  }

  /** 다리·팔 색 = 그 역할을 맡은 사람 색 */
  setRoleColors(legs: string, arms: string): void {
    this.legMat.color.set(legs);
    this.armMat.color.set(arms);
  }

  bump(power = 0.25): void { this.shake = Math.max(this.shake, power); }

  resize(): void {
    const w = this.host.clientWidth || 640, h = this.host.clientHeight || 360;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 좁은 화면에서도 경기장 전체가 보이게 거리 조절
    this.camera.position.z = 17 * Math.max(1, (16 / 9) / (w / h));
    this.camera.updateProjectionMatrix();
  }

  render(sim: MechSim): void {
    const r = sim.robot, t = sim.time;
    // 로봇
    const crouchK = r.crouch ? 0.6 : 1;
    this.robot.position.set(r.x, r.y, 0);
    this.robot.scale.set(1, crouchK, 1);
    this.robot.rotation.z = r.brace ? 0.18 : 0;
    const walk = r.onGround && !r.crouch ? Math.sin(t / 90) * 0.4 * (Math.abs(r.vy) < 0.01 ? 1 : 0) : 0;
    this.legL.rotation.z = walk; this.legR.rotation.z = -walk;
    this.arm.rotation.z = r.armAngle;
    this.arm.scale.y = 1 / crouchK;
    this.shield.visible = r.shield;
    // 대시 중(무적)에는 깜빡임
    this.robot.visible = t >= r.dashUntil || Math.floor(t / 50) % 2 === 0;
    if (t < sim.specialUntil) this.robot.rotation.y = ((sim.specialUntil - t) / 900) * Math.PI * 4;
    else this.robot.rotation.y = 0;

    // 보스 (맞으면 번쩍)
    const b = sim.boss;
    this.boss.position.set(b.x, b.y + (sim.def.air ? Math.sin(t / 400) * 0.15 : 0), 0);
    const flash = t < b.hitUntil;
    this.bossMats.forEach((m) => m.emissive.setHex(flash ? 0x553300 : 0x000000));
    this.boss.visible = sim.state !== 'cleared' || Math.floor(t / 100) % 2 === 0;

    // 탄·공격 (id로 메시를 재사용)
    const live = new Set<string>();
    sim.attacks.forEach((a) => this.drawAttack(a, sim, live));
    sim.shots.forEach((s) => this.drawShot(s, live));
    for (const [id, obj] of this.dyn) {
      if (live.has(id)) continue;
      this.scene.remove(obj);
      obj.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      this.dyn.delete(id);
    }

    // 화면 흔들림
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - 0.02);
    this.camera.position.x = ARENA_W / 2 + sx;
    this.renderer.render(this.scene, this.camera);
  }

  private get<T extends THREE.Object3D>(id: string, live: Set<string>, make: () => T): T {
    live.add(id);
    let o = this.dyn.get(id) as T | undefined;
    if (!o) { o = make(); this.dyn.set(id, o); this.scene.add(o); }
    return o;
  }

  private drawAttack(a: Attack, sim: MechSim, live: Set<string>): void {
    const t = sim.time;
    const blink = Math.floor(t / 90) % 2 === 0;
    const front = sim.bossFront;
    const basic = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
    if (a.state === 'telegraph') {
      // 예고: 패턴마다 다른 모양
      const id = `w${a.id}`;
      switch (a.kind) {
        case 'low': case 'high': {
          const y = a.kind === 'low' ? 0.45 : 1.75;
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.06), basic(a.kind === 'low' ? C.low : C.high, 0.8)));
          m.scale.x = front; m.position.set(front / 2, y, 0); m.visible = blink;
          break;
        }
        case 'beam': {
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.BoxGeometry(1, 2.8, 0.05), basic(C.beam, 0.15)));
          m.scale.x = front; m.position.set(front / 2, 1.4, -0.6); m.visible = blink;
          break;
        }
        case 'slam': {
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.RingGeometry(sim.cfg.slamHalfWidth - 0.15, sim.cfg.slamHalfWidth, 40), basic(C.warn, 0.9)));
          m.rotation.x = -Math.PI / 2; m.scale.set(1, 1, 1); m.position.set(a.cx, 0.03, 0); m.visible = blink;
          break;
        }
        case 'throw': {
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 24), basic(C.crate, 0.9)));
          m.rotation.x = -Math.PI / 2; m.position.set(sim.robot.x, 0.03, 0); m.visible = blink;
          break;
        }
        case 'pull': {
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 24), basic(0xbe4bdb, 0.9)));
          m.position.set(front - 0.5, 1.4, 0); m.rotation.y = Math.PI / 2; m.scale.setScalar(1 + ((t - a.t0) / sim.cfg.telegraphMs) * 0.6);
          break;
        }
      }
      return;
    }
    const id = `a${a.id}`;
    switch (a.kind) {
      case 'low': case 'high': {
        const m = this.get(id, live, () => new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), basic(a.kind === 'low' ? C.low : C.high)));
        m.position.set(a.x, a.y, 0);
        break;
      }
      case 'beam': {
        const m = this.get(id, live, () => new THREE.Mesh(new THREE.BoxGeometry(1, 2.8, 0.6), basic(C.beam, 0.55)));
        const end = sim.robot.shield ? sim.robot.x + 1.1 : 0;
        m.scale.x = front - end; m.position.set((front + end) / 2, 1.4, 0);
        break;
      }
      case 'slam': {
        const m = this.get(id, live, () => new THREE.Mesh(new THREE.CylinderGeometry(sim.cfg.slamHalfWidth, sim.cfg.slamHalfWidth, 0.4, 32), basic(C.warn, 0.7)));
        const k = Math.max(0, (a.until - t) / 350);
        m.position.set(a.cx, 0.2 + k * 4, 0);
        break;
      }
      case 'throw': {
        const m = this.get(id, live, () => new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: C.crate })));
        m.position.set(a.x, a.y, 0); m.rotation.z = t / 150;
        break;
      }
      case 'pull': {
        const m = this.get(id, live, () => new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.08), basic(0xbe4bdb, 0.8)));
        const from = sim.robot.x + 0.6;
        m.scale.x = Math.max(0.1, front - from); m.position.set((front + from) / 2, 1.4 + Math.sin(t / 40) * 0.05, 0);
        break;
      }
    }
  }

  private drawShot(s: Shot, live: Set<string>): void {
    const id = `s${s.id}`;
    const m = this.get(id, live, () => {
      if (s.kind === 'crate') return new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: C.crate, emissive: 0x332200 }));
      if (s.kind === 'missile') return new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 10), new THREE.MeshBasicMaterial({ color: s.combo ? C.combo : C.missile }));
      return new THREE.Mesh(new THREE.CapsuleGeometry(s.combo ? 0.16 : 0.08, s.combo ? 0.7 : 0.45, 4, 8), new THREE.MeshBasicMaterial({ color: s.combo ? C.combo : C.laser }));
    });
    m.position.set(s.x, s.y, 0);
    m.rotation.z = Math.atan2(s.vy, s.vx) - Math.PI / 2;
    if (s.combo && m instanceof THREE.Mesh) (m.material as THREE.MeshBasicMaterial).color.setHex(C.combo);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
