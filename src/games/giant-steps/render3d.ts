// 두 다리 거인 3D 화면 (Three.js) — 규칙(rules.ts)은 그대로, 여기서는 그리기만 한다
// 거인 뒤쪽 비스듬한 곳에서 따라가는 카메라: 화면 왼쪽 = 왼다리(P1), 오른쪽 = 오른다리(P2), 앞으로 갈 길이 보인다.
// 코스·장애물·배경은 모두 기본 도형으로 직접 만든다 (외부 모델·텍스처 없음). 효과는 shared/fx3d.ts.

import * as THREE from 'three';
import { ARCADE_COLORS } from '../../shared/arcade-panel';
import { Effects } from '../../shared/fx3d';
import type { GiantConfig } from './config';
import { GiantModel, PX } from './giant3d';
import type { Course, GiantSim, Obstacle, SimEvent } from './rules';

/** 코스별 하늘(위·아래)·땅·풀 색 */
const THEMES = [
  { skyTop: '#4dabf7', skyBottom: '#d0ebff', grass: 0x69db7c, path: 0xc0a080, hill: 0x8ce99a, fog: 0xbfe0ff, deco: 'tree' },
  { skyTop: '#3bc9db', skyBottom: '#e3fafc', grass: 0x51cf66, path: 0xb8977a, hill: 0x69db7c, fog: 0xc5f0f5, deco: 'tree' },
  { skyTop: '#748ffc', skyBottom: '#f1f3f5', grass: 0xf1f3f5, path: 0xdee2e6, hill: 0xffffff, fog: 0xe9ecef, deco: 'pine' },
  { skyTop: '#2f9e44', skyBottom: '#b2f2bb', grass: 0x2f9e44, path: 0x8d6e4a, hill: 0x37b24d, fog: 0xa9dfb3, deco: 'pine' },
  { skyTop: '#7048e8', skyBottom: '#f3d9fa', grass: 0xe5dbff, path: 0xd0bfff, hill: 0xffffff, fog: 0xeadcff, deco: 'cloud' },
] as const;
const PATH_W = 3.2;
const GROUND_DEPTH = 3;
/** 카메라: 거인 뒤쪽 비스듬한 위 */
const CAM = { back: 6.5, side: 6.0, up: 5.2, aheadX: 3.2, lookY: 2.2 };

function skyTexture(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) { ctx.fillStyle = (x + y) % 2 ? '#212529' : '#ffffff'; ctx.fillRect(x * 16, y * 16, 16, 16); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class GiantView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private giant: GiantModel;
  private fx = new Effects();
  private courseGroup = new THREE.Group();
  private animated: ((t: number, sim: GiantSim | null) => void)[] = [];
  private flags: { x: number; mat: THREE.MeshStandardMaterial }[] = [];
  private course: Course | null = null;
  private shake = 0;
  private camX = 0;
  /** 넘어졌을 때 카메라가 물러나는 정도 (0~1) — 쓰러진 몸이 화면을 가리지 않게 */
  private camPull = 0;
  private lastTime = 0;

  constructor(private host: HTMLElement, private cfg: GiantConfig) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'gs-canvas';
    host.prepend(this.renderer.domElement); // 안내·코스 고르기 겹침 화면보다 뒤에

    this.scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x5c4a3a, 1.1));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -8, near: 1, far: 60 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.giant = new GiantModel(ARCADE_COLORS);
    this.scene.add(this.courseGroup, this.giant.root, this.fx.group);
    this.resize();
  }

  // ── 코스 만들기 ─────────────────────────────
  setCourse(course: Course): void {
    if (this.course === course) return;
    this.course = course;
    this.clearCourse();
    this.camPull = 0; // 새 코스는 카메라를 제자리에서 시작
    const theme = THEMES[course.index];
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.scene.background = skyTexture(theme.skyTop, theme.skyBottom);
    this.scene.fog = new THREE.Fog(theme.fog, 30, 85);
    const g = this.courseGroup;
    const std = (color: number, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const add = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0): T => {
      o.position.set(x, y, z);
      o.traverse((m) => { if (m instanceof THREE.Mesh) { m.castShadow = true; m.receiveShadow = true; } });
      g.add(o); return o;
    };
    const start = -12, end = course.length * PX + 25;
    // 물(돌다리)·구덩이 구간은 땅을 비운다
    const gaps = course.obstacles.filter((o) => o.kind === 'stones' || o.kind === 'pit').map((o) => [o.a * PX, o.b * PX] as const);
    let x0 = start;
    const grassMat = std(theme.grass), pathMat = std(theme.path, 0.95), dirtMat = std(0x7a5a3a);
    for (const [a, b] of [...gaps, [end, end] as const]) {
      if (a > x0) {
        const w = a - x0;
        add(new THREE.Mesh(new THREE.BoxGeometry(w, GROUND_DEPTH, 14), grassMat), x0 + w / 2, -GROUND_DEPTH / 2, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, PATH_W), pathMat), x0 + w / 2, 0.03, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(w, GROUND_DEPTH - 0.4, 0.2), dirtMat), x0 + w / 2, -GROUND_DEPTH / 2 - 0.2, 7.05);
      }
      x0 = b;
    }
    course.obstacles.forEach((o) => this.buildObstacle(o, add, std));
    // 체크포인트 깃발 (지나면 초록)
    course.checkpoints.slice(1).forEach((cx) => {
      const x = cx * PX;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), std(0x495057, 0.5, 0.4)), x, 1.5, -PATH_W / 2 - 0.3);
      const mat = new THREE.MeshStandardMaterial({ color: 0xadb5bd, side: THREE.DoubleSide, roughness: 0.6 });
      const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), mat), x + 0.5, 2.65, -PATH_W / 2 - 0.3);
      this.animated.push((t) => { flag.rotation.y = Math.sin(t / 300 + x) * 0.2; });
      this.flags.push({ x: cx, mat });
    });
    // 결승선: 기둥 두 개 + 체크무늬 현수막
    const fx = course.length * PX;
    for (const z of [-PATH_W / 2 - 0.4, PATH_W / 2 + 0.4]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 10), std(0xf8f9fa, 0.4, 0.3)), fx, 3, z);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, PATH_W + 0.8), [std(0xffffff), std(0xffffff), std(0xffffff), std(0xffffff), new THREE.MeshStandardMaterial({ map: checkerTexture() }), new THREE.MeshStandardMaterial({ map: checkerTexture() })]);
    add(banner, fx, 5.6, 0);
    this.decorate(course, theme, start, end, add, std);
  }

  private buildObstacle(o: Obstacle, add: <T extends THREE.Object3D>(o: T, x?: number, y?: number, z?: number) => T, std: (c: number, r?: number, m?: number) => THREE.MeshStandardMaterial): void {
    const a = o.a * PX, b = o.b * PX, w = b - a, mid = (a + b) / 2;
    switch (o.kind) {
      case 'stones': {
        const water = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 14), new THREE.MeshStandardMaterial({ color: 0x339af0, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88 }));
        add(water, mid, -0.55, 0).castShadow = false;
        add(new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, 14), std(0x1c4d7a)), mid, -2.1, 0);
        this.animated.push((t) => { water.position.y = -0.55 + Math.sin(t / 500) * 0.04; });
        o.stones!.forEach((sx, i) => {
          const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.7, 10), std(0x868e96, 0.9));
          stone.scale.set(1, 1, 1.2);
          add(stone, sx * PX, -0.3, 0).rotation.y = i * 0.7;
        });
        break;
      }
      case 'ice': {
        const ice = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, PATH_W + 0.6), new THREE.MeshStandardMaterial({ color: 0xd0ebff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.92 }));
        add(ice, mid, 0.06, 0);
        for (let x = a + 0.6; x < b; x += 1.6) add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })), x, 0.12, (Math.sin(x * 3) * PATH_W) / 3).rotation.y = 0.5;
        break;
      }
      case 'wind': {
        // 옆바람: 길을 가로질러 흐르는 바람 줄기 (+1 = 오른쪽으로)
        const dir = o.dir ?? 1;
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
        const streaks: THREE.Mesh[] = [];
        for (let i = 0; i < 26; i++) {
          const s = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.6), mat), a + ((i * 0.37) % 1) * w, 0.5 + ((i * 0.61) % 1) * 5, 0);
          s.castShadow = false;
          streaks.push(s);
        }
        this.animated.push((t) => streaks.forEach((s, i) => { s.position.z = ((((t / 1000) * 9 * dir + i * 1.7) % 14) + 14) % 14 - 7; }));
        const sign = add(new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 3), std(0x74c0fc, 0.5)), mid, 6.2, 0);
        sign.rotation.x = (dir * Math.PI) / 2;
        break;
      }
      case 'branch': {
        // 낮은 나뭇가지: 길 옆 나무 + 길 위로 뻗은 가지 (높이 4.24칸 = 규칙의 212px)
        const y = 4.24;
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 8, 12), std(0x6b4423)), b + 0.4, 4, -PATH_W / 2 - 1.2);
        const limb = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, w + 0.6, 10), std(0x5c3d1e)), mid, y + 0.25, -0.2);
        limb.rotation.z = Math.PI / 2;
        for (let x = a; x <= b; x += 0.9) add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + Math.sin(x) * 0.15, 0), std(0x2f9e44, 0.8)), x, y + 0.35 + Math.sin(x * 2) * 0.2, Math.cos(x * 3) * 0.6);
        add(new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), std(0x2b8a3e, 0.8)), b + 0.4, 8.5, -PATH_W / 2 - 1.2);
        break;
      }
      case 'pit': {
        add(new THREE.Mesh(new THREE.BoxGeometry(w, 4, 14), std(0x1a120c)), mid, -4.2, 0);
        for (const x of [a, b]) add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, PATH_W), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff922b, emissiveIntensity: 1.2 })), x, 0.05, 0);
        break;
      }
      case 'seesaw': {
        const plank = add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, PATH_W - 0.2), std(0xb08968, 0.75)), mid, 0.13, 0);
        plank.receiveShadow = true;
        add(new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 3), std(0x7f5539)), mid, -0.4, 0).rotation.x = Math.PI;
        this.animated.push((_t, sim) => {
          const bx = sim ? sim.bodyX * PX : -99;
          const on = bx >= a && bx <= b;
          plank.rotation.x = THREE.MathUtils.lerp(plank.rotation.x, on ? (bx < mid ? 0.06 : -0.06) : 0, 0.08);
        });
        break;
      }
    }
  }

  /** 길 옆 꾸미기: 언덕·나무·눈 덮인 산·구름 (테마별) */
  private decorate(course: Course, theme: (typeof THEMES)[number], start: number, end: number, add: <T extends THREE.Object3D>(o: T, x?: number, y?: number, z?: number) => T, std: (c: number, r?: number, m?: number) => THREE.MeshStandardMaterial): void {
    const rnd = (n: number) => { const v = Math.sin(n * 127.1 + course.index * 31.7) * 43758.5; return v - Math.floor(v); };
    for (let x = start - 10, i = 0; x < end + 30; x += 9, i++) {
      const hill = add(new THREE.Mesh(new THREE.SphereGeometry(8 + rnd(i) * 6, 20, 12), std(theme.hill, 1)), x, -3, -24 - rnd(i + 9) * 10);
      hill.scale.y = 0.45; hill.castShadow = false;
      if (course.index === 2 && i % 2 === 0) add(new THREE.Mesh(new THREE.ConeGeometry(4, 9, 4), std(0xf8f9fa, 0.9)), x + 4, 3, -34);
    }
    for (let x = start, i = 0; x < end; x += 2.4, i++) {
      if (rnd(i + 50) < 0.35) continue;
      const z = -(PATH_W / 2 + 2.5 + rnd(i + 70) * 5);
      if (course.obstacles.some((o) => o.kind === 'branch' && x > o.a * PX - 2 && x < o.b * PX + 3)) continue;
      if (theme.deco === 'cloud') {
        const c = add(new THREE.Group(), x, -0.8 + rnd(i) * 0.6, z - 2);
        for (let k = 0; k < 3; k++) c.add(new THREE.Mesh(new THREE.SphereGeometry(0.9 + rnd(i * 3 + k) * 0.6, 14, 10), std(0xffffff, 1)).translateX(k * 0.9 - 0.9));
        continue;
      }
      const h = 1.6 + rnd(i + 30) * 1.6;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, h, 8), std(0x6b4423)), x, h / 2, z);
      if (theme.deco === 'pine') add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 8), std(course.index === 2 ? 0xe9ecef : 0x2b8a3e, 0.9)), x, h + 0.9, z);
      else add(new THREE.Mesh(new THREE.IcosahedronGeometry(1 + rnd(i) * 0.4, 1), std(0x40c057, 0.9)), x, h + 0.7, z);
    }
    // 구름 다리: 발밑에도 구름
    if (theme.deco === 'cloud') for (let x = start, i = 0; x < end; x += 3, i++) add(new THREE.Mesh(new THREE.SphereGeometry(2 + rnd(i) * 1.5, 14, 10), std(0xffffff, 1)), x, -3.5, (rnd(i + 3) - 0.5) * 8).castShadow = false;
  }

  private clearCourse(): void {
    this.courseGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); });
      }
    });
    this.courseGroup.clear();
    this.animated = [];
    this.flags = [];
  }

  // ── 효과 ─────────────────────────────────
  bump(power = 0.3): void { this.shake = Math.max(this.shake, power); }
  armWave(leg: 0 | 1): void { this.giant.armWave(leg); }

  /** 규칙이 남긴 일을 효과로 */
  event(ev: SimEvent, sim: GiantSim): void {
    const body = new THREE.Vector3(sim.bodyX * PX, 0, 0);
    switch (ev.type) {
      case 'fall':
        if (ev.cause === 'water') this.fx.burst(body.clone().setY(0.2), { color: 0x74c0fc, count: 40, speed: 6, size: 0.12, life: 0.8, dir: new THREE.Vector3(0, 1, 0), spread: 1.4, gravity: 12, drag: 0.5 });
        else if (ev.cause === 'pit') this.fx.dust(body, 3);
        else if (ev.cause === 'branch') this.fx.burst(body.clone().setY(4.4), { color: 0x51cf66, count: 18, speed: 3, size: 0.12, life: 1.2, gravity: 3, drag: 1 });
        else this.fx.dust(body.clone().setZ(sim.balance < 0 ? -2 : 2), 3);
        this.bump(0.45);
        break;
      case 'getup': this.fx.dust(body, 1.5); break;
      case 'land': this.fx.dust(body, 2.5); this.bump(0.25); break;
      case 'respawn': this.fx.burst(body.clone().setY(2.5), { color: 0xffffff, count: 26, speed: 4, size: 0.18, life: 0.6, glow: true, grow: 0.5 }); break;
      case 'sync': this.fx.burst(body.clone().setY(3), { color: 0xffd43b, count: 22, speed: 5, size: 0.08, life: 0.5, glow: true }); break;
      case 'checkpoint': this.fx.burst(new THREE.Vector3(ev.x * PX, 2.6, -PATH_W / 2 - 0.3), { color: 0x69db7c, count: 20, speed: 3, size: 0.08, life: 0.7, glow: true }); break;
      case 'finish':
        for (let k = 0; k < 4; k++) this.fx.burst(body.clone().setY(4 + k * 0.5), { color: [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c][k], count: 25, speed: 7, size: 0.1, life: 1.4, gravity: 5, drag: 1, glow: true });
        break;
      default: break;
    }
  }

  // ── 매 프레임 ─────────────────────────────
  resize(): void {
    const w = this.host.clientWidth || 640, h = this.host.clientHeight || 360;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(sim: GiantSim): void {
    this.setCourse(sim.course);
    const dt = Math.min(0.05, Math.max(0, (sim.time - this.lastTime) / 1000));
    this.lastTime = sim.time;
    this.giant.update(sim, this.cfg);
    // 발이 땅에 닿을 때 먼지 (빙판이면 반짝이)
    this.giant.footsteps.forEach((p) => {
      const onIce = sim.course.obstacles.some((o) => o.kind === 'ice' && p.x >= o.a * PX && p.x <= o.b * PX);
      if (onIce) this.fx.burst(p.clone().setY(0.15), { color: 0xe7f5ff, count: 6, speed: 2, size: 0.06, life: 0.4, glow: true });
      else this.fx.dust(p, 0.8);
    });
    this.flags.forEach((f) => f.mat.color.setHex(f.x <= sim.checkpoint ? 0x40c057 : 0xadb5bd));
    this.animated.forEach((fn) => fn(sim.time, sim));
    this.fx.update(dt);
    this.camPull = THREE.MathUtils.lerp(this.camPull, sim.state === 'fallen' ? 1 : 0, 1 - Math.exp(-4 * dt));
    this.place(sim.bodyX * PX, dt);
  }

  /** 코스 고르기 화면: 거인이 출발선에 서 있는 모습 */
  renderPreview(sim: GiantSim): void {
    this.setCourse(sim.course);
    this.giant.update(sim, this.cfg);
    this.animated.forEach((fn) => fn(performance.now(), null));
    this.place(sim.bodyX * PX, 0.016);
  }

  private place(x: number, dt: number): void {
    this.camX = THREE.MathUtils.lerp(this.camX, x, 1 - Math.exp(-6 * Math.max(dt, 0.016)));
    if (Math.abs(this.camX - x) > 15) this.camX = x;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - 0.02);
    const pull = this.camPull;
    this.camera.position.set(this.camX - CAM.back - pull * 2 + sx, CAM.up + pull * 4 + sy, CAM.side + pull * 4);
    this.camera.lookAt(this.camX + CAM.aheadX, CAM.lookY, 0);
    // 그림자는 거인 근처만 (해가 따라다님)
    this.sun.position.set(this.camX - 6, 14, 8);
    this.sun.target.position.set(this.camX + 2, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.clearCourse();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); });
      }
    });
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.fx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
