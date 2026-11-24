// 합체 로봇 조종석 3D 화면 (Three.js) — 판정은 rules.ts의 2D 상태, 여기서는 그리기만 한다
// 옆에서 본 카메라. 로봇·보스·탄·배경은 모두 기본 도형으로 직접 만든다 (외부 모델·텍스처 없음).
// 로봇 모델(관절 다리 IK)은 robot3d.ts, 먼지·불꽃 효과는 shared/fx3d.ts.

import * as THREE from 'three';
import { Effects } from '../../shared/fx3d';
import { RobotModel } from './robot3d';
import { ARENA_W, type Attack, type MechSim, type Shot } from './rules';

/** 카메라: 경기장(0~18칸)이 딱 들어오게 */
const CAM = { fov: 34, y: 4.0, z: 16, lookY: 2.0 };

const C = {
  low: 0xff4d4f, high: 0xff922b, beam: 0xff2d55, warn: 0xff3b30, crate: 0xb08968, laser: 0x66e3ff, missile: 0xffd43b, combo: 0xfff3bf, pull: 0xbe4bdb,
};

/** 보스 모양 (스테이지별) + 가만히 있을 때 움직임 */
function makeBoss(stage: number): { group: THREE.Group; flashMats: THREE.MeshStandardMaterial[]; animate: (t: number) => void } {
  const g = new THREE.Group();
  const flashMats: THREE.MeshStandardMaterial[] = [];
  const mat = (c: number, metal = 0.45, rough = 0.4) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }); flashMats.push(m); return m; };
  const glow = (c: number) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 2.4 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0, parent: THREE.Object3D = g) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  let animate = (_t: number) => {};
  switch (stage) {
    case 0: { // 연습용 표적: 기둥 + 회전하는 과녁
      add(new THREE.CylinderGeometry(0.9, 1.1, 0.3, 24), mat(0x495057), 0, 0.15);
      add(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 16), mat(0x868e96), 0, 1.4);
      const target = new THREE.Group(); target.position.set(0, 2.8, 0); g.add(target);
      add(new THREE.CylinderGeometry(1.3, 1.3, 0.25, 40), mat(0xf1f3f5, 0.1, 0.6), 0, 0, 0, target).rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.9, 0.9, 0.28, 40), mat(0xfa5252, 0.1, 0.5), -0.02, 0, 0, target).rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32), mat(0xf1f3f5, 0.1, 0.6), -0.04, 0, 0, target).rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 16), glow(0xff6b6b), -0.06, 0, 0, target).rotation.z = Math.PI / 2;
      animate = (t) => { target.rotation.x = t / 900; };
      break;
    }
    case 1: { // 바퀴 탱크
      add(new THREE.BoxGeometry(3.2, 1.2, 2.2), mat(0x5c940d), 0, 1.1);
      add(new THREE.BoxGeometry(3.4, 0.25, 2.4), mat(0x3b5e08), 0, 1.75);
      const turret = new THREE.Group(); turret.position.set(0.3, 2.3, 0); g.add(turret);
      add(new THREE.BoxGeometry(1.7, 0.9, 1.5), mat(0x74b816), 0, 0, 0, turret);
      add(new THREE.CylinderGeometry(0.17, 0.2, 1.9, 14), mat(0x2b2f36), -1.4, 0.1, 0, turret).rotation.z = Math.PI / 2;
      add(new THREE.BoxGeometry(0.1, 0.18, 0.9), glow(0xff6b6b), -0.86, 0.15, 0, turret);
      const wheels: THREE.Mesh[] = [];
      for (const x of [-1.1, 0, 1.1]) for (const z of [-1.15, 1.15]) {
        const w = add(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 22), mat(0x212529, 0.2, 0.8), x, 0.5, z);
        w.rotation.x = Math.PI / 2; wheels.push(w);
      }
      animate = (t) => { turret.rotation.z = Math.sin(t / 700) * 0.06; wheels.forEach((w) => { w.rotation.y = t / 300; }); };
      break;
    }
    case 2: { // 공중 포대
      add(new THREE.SphereGeometry(1.15, 32, 20), mat(0x4dabf7, 0.6, 0.25), 0, 1.2);
      const ring = add(new THREE.TorusGeometry(1.55, 0.1, 10, 48), mat(0xadb5bd, 0.8, 0.2), 0, 1.2);
      ring.rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.15, 0.18, 1.6, 14), mat(0x2b2f36), -1.15, 0.75, 0).rotation.z = Math.PI / 2.6;
      add(new THREE.SphereGeometry(0.3, 16, 12), glow(0xff6b6b), -0.95, 1.35, 0);
      const jets: THREE.Mesh[] = [];
      for (const x of [-0.6, 0.6]) {
        const j = add(new THREE.ConeGeometry(0.2, 0.7, 12), new THREE.MeshBasicMaterial({ color: 0x66e3ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), x, -0.15, 0);
        j.rotation.x = Math.PI; j.castShadow = false; jets.push(j);
      }
      animate = (t) => { ring.rotation.z = t / 600; jets.forEach((j, i) => j.scale.setScalar(0.85 + Math.sin(t / 50 + i) * 0.15)); };
      break;
    }
    case 3: { // 거대 기계 거미: 다리가 번갈아 들썩임
      add(new THREE.SphereGeometry(1.3, 32, 20), mat(0x343a40, 0.7, 0.3), 0, 2.3);
      add(new THREE.SphereGeometry(0.62, 20, 14), mat(0x495057, 0.7, 0.3), -1.25, 2.4);
      for (const [y, z] of [[2.55, 0.25], [2.55, -0.25], [2.3, 0.4], [2.3, -0.4]]) add(new THREE.SphereGeometry(0.1, 10, 8), glow(0xff2d55), -1.8, y, z);
      const legs: THREE.Group[] = [];
      for (let i = 0; i < 4; i++) for (const z of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(-1.0 + i * 0.7, 2.3, z * 0.9); g.add(hip);
        const upper = add(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8), mat(0x212529), 0, 0.5, z * 0.5, hip);
        upper.rotation.x = -z * 0.9;
        const lower = add(new THREE.CylinderGeometry(0.08, 0.05, 2.0, 8), mat(0x212529), 0, -0.6, z * 1.3, hip);
        lower.rotation.x = z * 0.3;
        legs.push(hip);
      }
      animate = (t) => { legs.forEach((h, i) => { h.rotation.z = Math.sin(t / 220 + i * 1.3) * 0.12; }); };
      break;
    }
    default: { // 최종 보스
      add(new THREE.BoxGeometry(3, 3.0, 2.3), mat(0x862e9c, 0.6, 0.3), 0, 1.6);
      add(new THREE.BoxGeometry(3.2, 0.3, 2.5), mat(0x5f3dc4, 0.6, 0.3), 0, 0.15);
      const head = new THREE.Group(); head.position.set(0, 3.8, 0); g.add(head);
      add(new THREE.BoxGeometry(1.9, 1.2, 1.7), mat(0xbe4bdb, 0.6, 0.3), 0, 0, 0, head);
      add(new THREE.ConeGeometry(0.28, 1, 12), mat(0xffd43b, 0.8, 0.2), -0.6, 1.0, 0, head);
      add(new THREE.ConeGeometry(0.28, 1, 12), mat(0xffd43b, 0.8, 0.2), 0.6, 1.0, 0, head);
      for (const z of [0.45, -0.45]) add(new THREE.SphereGeometry(0.22, 14, 10), glow(0xff2d55), -0.95, 0.1, z, head);
      add(new THREE.BoxGeometry(0.1, 1.6, 1.6), glow(0xe64980), -1.52, 1.6, 0);
      animate = (t) => { head.rotation.z = Math.sin(t / 500) * 0.05; head.position.y = 3.8 + Math.sin(t / 300) * 0.05; };
    }
  }
  return { group: g, flashMats, animate };
}

/** 하늘 그라데이션 (캔버스로 직접 그림) */
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#070a14'); g.addColorStop(0.55, '#1a2140'); g.addColorStop(1, '#3a2f4f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MechView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.1, 160);
  private robot = new RobotModel();
  private fx = new Effects();
  private boss: ReturnType<typeof makeBoss>;
  private dyn = new Map<string, THREE.Object3D>();
  private shake = 0;
  // 효과 계기 감지용 (이전 프레임 상태)
  private prevTime = 0;
  private seenShots = new Map<number, THREE.Vector3>();
  private seenAttacks = new Set<string>();
  private prevHp = -1;
  private prevState = '';
  private trailAt = 0;
  private boomUntil = 0;
  private nextBoom = 0;

  constructor(private host: HTMLElement, stage: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'dm-canvas';
    host.prepend(this.renderer.domElement); // 안내·메뉴 겹침 화면보다 뒤에

    // 배경: 하늘 그라데이션 + 안개 + 먼 도시 실루엣
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0x1c2138, 30, 75);
    this.buildCity();

    // 조명: 하늘빛 + 따뜻한 주 조명(그림자) + 푸른 테두리 조명
    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a1a22, 0.85));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.position.set(ARENA_W / 2 - 6, 14, 9);
    key.target.position.set(ARENA_W / 2, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -13, right: 13, top: 10, bottom: -6, near: 1, far: 40 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x66e3ff, 1.1);
    rim.position.set(ARENA_W / 2 + 6, 5, -10);
    this.scene.add(rim);

    // 바닥: 경기장 판 + 은은한 격자 + 빛나는 가장자리
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 140), new THREE.MeshStandardMaterial({ color: 0x1f232c, roughness: 0.9, metalness: 0.1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(ARENA_W / 2, 0, -50); ground.receiveShadow = true;
    const arena = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_W + 4, 5), new THREE.MeshStandardMaterial({ color: 0x343a46, roughness: 0.55, metalness: 0.45 }));
    arena.rotation.x = -Math.PI / 2; arena.position.set(ARENA_W / 2, 0.005, 0); arena.receiveShadow = true;
    const grid = new THREE.GridHelper(ARENA_W + 4, (ARENA_W + 4) * 2, 0x5c6b8a, 0x3c4458);
    grid.position.set(ARENA_W / 2, 0.012, 0); grid.scale.z = 5 / (ARENA_W + 4);
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(ground, arena, grid);
    for (const z of [2.5, -2.5]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(ARENA_W + 4, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3bc9db, emissiveIntensity: 1.6 }));
      edge.position.set(ARENA_W / 2, 0.03, z);
      this.scene.add(edge);
    }

    this.scene.add(this.robot.root);
    this.robot.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    this.boss = makeBoss(stage);
    this.scene.add(this.boss.group);
    this.scene.add(this.fx.group);

    this.camera.position.set(ARENA_W / 2, CAM.y, CAM.z);
    this.camera.lookAt(ARENA_W / 2, CAM.lookY, 0);
    this.resize();
  }

  /** 먼 곳의 도시 실루엣 (불 켜진 창문 몇 개) */
  private buildCity(): void {
    // 멀리(안개 속) 낮게 깔린 실루엣 — 경기장보다 눈에 띄지 않게
    const dark = new THREE.MeshBasicMaterial({ color: 0x151a2c, fog: true });
    const win = new THREE.MeshBasicMaterial({ color: 0xffc078, fog: true });
    for (let i = 0; i < 30; i++) {
      const w = 3 + ((i * 37) % 5) * 0.9, h = 2.5 + ((i * 53) % 9) * 0.8;
      const x = -40 + i * 3.4 + ((i * 17) % 3) * 0.8;
      const z = -48 - ((i * 29) % 4) * 4;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), dark);
      b.position.set(x, h / 2, z);
      this.scene.add(b);
      for (let k = 0; k < 3; k++) {
        if ((i * 7 + k * 3) % 5 > 0) continue;
        const wnd = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), win);
        wnd.position.set(x - w / 3 + ((k * 13) % 3) * (w / 3), 1.5 + ((i + k * 5) % 7) * (h / 9), z + 1.51);
        this.scene.add(wnd);
      }
    }
  }

  /** 다리·팔 색 = 그 역할을 맡은 사람 색 */
  setRoleColors(legs: string, arms: string): void {
    this.robot.setColors(legs, arms);
  }

  bump(power = 0.25): void { this.shake = Math.max(this.shake, power); }

  resize(): void {
    const w = this.host.clientWidth || 640, h = this.host.clientHeight || 360;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 좁은 화면에서도 경기장 전체가 보이게 거리 조절
    this.camera.position.z = CAM.z * Math.max(1, (16 / 9) / (w / h));
    this.camera.updateProjectionMatrix();
  }

  render(sim: MechSim): void {
    const t = sim.time;
    const dt = Math.min(0.05, Math.max(0, (t - this.prevTime) / 1000));
    this.prevTime = t;

    // 로봇 자세 + 발자국·착지·대시 효과
    this.robot.update(sim);
    this.robot.footsteps.forEach((p) => this.fx.dust(p, 0.6));
    if (this.robot.landed) this.fx.dust(new THREE.Vector3(sim.robot.x, 0, 0), 1.8);
    if (t < sim.robot.dashUntil && t >= this.trailAt) { this.fx.trail(this.robot.chestWorld()); this.trailAt = t + 25; }
    if (this.prevHp >= 0 && sim.hp < this.prevHp) this.fx.sparks(this.robot.chestWorld(), 0xff6b6b, 16);
    this.prevHp = sim.hp;

    // 보스: 가만히 있을 때 움직임, 맞으면 번쩍, 격파되면 폭발
    const b = sim.boss;
    this.boss.group.position.set(b.x, b.y + (sim.def.air ? Math.sin(t / 400) * 0.15 : 0), 0);
    this.boss.animate(t);
    const flash = t < b.hitUntil;
    this.boss.flashMats.forEach((m) => m.emissive.setHex(flash ? 0x663300 : 0x000000));
    if (sim.state === 'cleared' && this.prevState !== 'cleared') { this.boomUntil = t + 1500; this.nextBoom = t; }
    this.prevState = sim.state;
    if (t < this.boomUntil && t >= this.nextBoom) {
      this.fx.explosion(new THREE.Vector3(b.x + (Math.random() - 0.5) * b.w, b.y + Math.random() * b.h, 0.3), 1.2);
      this.nextBoom = t + 220;
      this.bump(0.3);
    }
    this.boss.group.visible = sim.state !== 'cleared' || t < this.boomUntil - 400 || Math.floor(t / 100) % 2 === 0;
    if (sim.state === 'cleared' && t > this.boomUntil) this.boss.group.visible = false;

    // 탄·공격 (id로 메시를 재사용)
    const live = new Set<string>();
    sim.attacks.forEach((a) => this.drawAttack(a, sim, live));
    sim.shots.forEach((s) => this.drawShot(s, live));
    this.shotEffects(sim);
    for (const [id, obj] of this.dyn) {
      if (live.has(id)) continue;
      this.scene.remove(obj);
      obj.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      this.dyn.delete(id);
    }
    this.fx.update(dt);

    // 카메라: 로봇 쪽으로 살짝 따라가고, 화면 흔들림
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    this.shake = Math.max(0, this.shake - 0.02);
    this.camera.position.x = ARENA_W / 2 + (sim.robot.x - ARENA_W / 2) * 0.08 + sx;
    this.camera.position.y = CAM.y + sy;
    this.renderer.render(this.scene, this.camera);
  }

  /** 새로 쏜 탄 → 총구 섬광, 사라진 탄이 보스 근처면 → 불꽃 */
  private shotEffects(sim: MechSim): void {
    const b = sim.boss;
    const alive = new Set<number>();
    for (const s of sim.shots) {
      alive.add(s.id);
      if (!this.seenShots.has(s.id) && s.kind !== 'crate') {
        const dir = new THREE.Vector3(s.vx, s.vy, 0).normalize();
        this.fx.muzzle(this.robot.muzzleWorld(), dir, s.kind === 'missile' ? C.missile : s.combo ? C.combo : C.laser, s.kind === 'missile' || s.combo);
      }
      this.seenShots.set(s.id, new THREE.Vector3(s.x, s.y, 0));
      if (s.kind === 'missile') this.fx.burst(new THREE.Vector3(s.x, s.y, 0).addScaledVector(new THREE.Vector3(s.vx, s.vy, 0).normalize(), -0.4), { color: 0x868e96, count: 1, speed: 0.3, size: 0.12, life: 0.5, grow: 1.5, opacity: 0.5 });
    }
    for (const [id, pos] of this.seenShots) {
      if (alive.has(id)) continue;
      this.seenShots.delete(id);
      const nearBoss = pos.x >= b.x - b.w / 2 - 0.6 && pos.x <= b.x + b.w / 2 + 0.6 && pos.y >= b.y - 0.6 && pos.y <= b.y + b.h + 0.6;
      if (nearBoss) this.fx.sparks(pos, 0xffd43b, sim.state === 'cleared' ? 4 : 10);
    }
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
    const basic = (color: number, opacity = 1, add = false) => new THREE.MeshBasicMaterial({
      color, transparent: opacity < 1 || add, opacity, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add,
    });
    if (a.state === 'telegraph') {
      // 예고: 패턴마다 다른 모양 (깜빡임)
      const id = `w${a.id}`;
      switch (a.kind) {
        case 'low': case 'high': {
          const y = a.kind === 'low' ? 0.45 : 1.75;
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.07), basic(a.kind === 'low' ? C.low : C.high, 0.9, true)));
          m.scale.x = front; m.position.set(front / 2, y, 0); m.visible = blink;
          break;
        }
        case 'beam': {
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.BoxGeometry(1, 2.8, 0.05), basic(C.beam, 0.18, true)));
          m.scale.x = front; m.position.set(front / 2, 1.4, -0.6); m.visible = blink;
          break;
        }
        case 'slam': {
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.RingGeometry(sim.cfg.slamHalfWidth - 0.15, sim.cfg.slamHalfWidth, 48), basic(C.warn, 0.95, true)));
          m.rotation.x = -Math.PI / 2; m.position.set(a.cx, 0.03, 0); m.visible = blink;
          break;
        }
        case 'throw': {
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 24), basic(C.crate, 0.9, true)));
          m.rotation.x = -Math.PI / 2; m.position.set(sim.robot.x, 0.03, 0); m.visible = blink;
          break;
        }
        case 'pull': {
          const m = this.get(id, live, () => new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 32), basic(C.pull, 0.9, true)));
          m.position.set(front - 0.5, 1.4, 0); m.rotation.y = Math.PI / 2; m.scale.setScalar(1 + ((t - a.t0) / sim.cfg.telegraphMs) * 0.6);
          break;
        }
      }
      return;
    }
    const id = `a${a.id}`;
    const first = !this.seenAttacks.has(id);
    this.seenAttacks.add(id);
    switch (a.kind) {
      case 'low': case 'high': {
        const color = a.kind === 'low' ? C.low : C.high;
        const m = this.get(id, live, () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), basic(0xffffff)));
          g.add(new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), basic(color, 0.75, true)));
          return g;
        });
        m.position.set(a.x, a.y, 0);
        m.children[1].scale.setScalar(1 + Math.sin(t / 40) * 0.12);
        break;
      }
      case 'beam': {
        const m = this.get(id, live, () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 0.5), basic(C.beam, 0.5, true)));
          g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 0.2), basic(0xffe3e3, 0.8, true)));
          return g;
        });
        const end = sim.robot.shield ? sim.robot.x + 1.3 : 0;
        m.scale.x = Math.max(0.1, front - end); m.position.set((front + end) / 2, 1.4, 0);
        m.children[0].scale.y = 1 + Math.sin(t / 30) * 0.06;
        if (sim.robot.shield && blink) this.fx.sparks(new THREE.Vector3(end, 1.4 + (Math.random() - 0.5), 0.3), 0xffa8a8, 2);
        break;
      }
      case 'slam': {
        const m = this.get(id, live, () => new THREE.Mesh(new THREE.CylinderGeometry(sim.cfg.slamHalfWidth, sim.cfg.slamHalfWidth * 1.1, 0.45, 40), new THREE.MeshStandardMaterial({ color: 0x495057, metalness: 0.6, roughness: 0.4, emissive: 0x551100 })));
        const k = Math.max(0, (a.until - t) / 350);
        m.position.set(a.cx, 0.25 + k * 4, 0);
        if (first) { this.fx.explosion(new THREE.Vector3(a.cx, 0.2, 0), 0.8); this.fx.dust(new THREE.Vector3(a.cx - 1.5, 0, 0), 2.5); this.fx.dust(new THREE.Vector3(a.cx + 1.5, 0, 0), 2.5); this.bump(0.35); }
        break;
      }
      case 'throw': {
        const m = this.get(id, live, () => {
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: C.crate, roughness: 0.8 }));
          box.castShadow = true;
          return box;
        });
        m.position.set(a.x, a.y, 0); m.rotation.z = t / 150;
        if (a.y < 0.5) this.fx.dust(new THREE.Vector3(a.x, 0, 0), 1.2);
        break;
      }
      case 'pull': {
        const m = this.get(id, live, () => new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), basic(C.pull, 0.9, true)));
        const from = sim.robot.x + 0.6;
        m.rotation.z = Math.PI / 2;
        m.scale.y = Math.max(0.1, front - from); m.position.set((front + from) / 2, 1.4 + Math.sin(t / 40) * 0.05, 0);
        break;
      }
    }
  }

  private drawShot(s: Shot, live: Set<string>): void {
    const id = `s${s.id}`;
    const m = this.get(id, live, () => {
      const glowMat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      if (s.kind === 'crate') {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: C.crate, emissive: 0x442200 }));
        box.castShadow = true;
        return box;
      }
      const g = new THREE.Group();
      if (s.kind === 'missile') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xdee2e6, metalness: 0.6, roughness: 0.3 }));
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 10), new THREE.MeshStandardMaterial({ color: s.combo ? 0xfcc419 : 0xfa5252 }));
        nose.position.y = 0.41;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 10), glowMat(C.missile, 0.9));
        flame.rotation.x = Math.PI; flame.position.y = -0.5; flame.name = 'flame';
        g.add(body, nose, flame);
        return g;
      }
      const r = s.combo ? 0.11 : 0.06, len = s.combo ? 0.8 : 0.55;
      g.add(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      g.add(new THREE.Mesh(new THREE.CapsuleGeometry(r * 2.4, len * 1.1, 4, 10), glowMat(s.combo ? C.combo : C.laser, s.combo ? 0.75 : 0.6)));
      return g;
    });
    m.position.set(s.x, s.y, 0);
    m.rotation.z = Math.atan2(s.vy, s.vx) - Math.PI / 2;
    const flame = m.getObjectByName('flame');
    if (flame) flame.scale.setScalar(0.8 + Math.random() * 0.5);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.fx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
