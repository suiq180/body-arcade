// 카메라 사물 인식 어댑터 (기획서 8.2)
// Teachable Machine 이미지 모델로 카메라 화면 속 물건을 알아본다.
// 화면을 세로 칸 n개로 나누고(거울 화면 기준 왼쪽부터 0번), 칸마다 가운데 정사각형 상자만 따로 인식한다.
//   - 'status' : 준비 단계 / 오류 종류 (전신 포즈 어댑터와 같은 형식)
//   - 'frame'  : 인식할 때마다 칸별 라벨 확률 + 빈 화면 유사도
// 빈 화면 보정: recordEmpty()로 아무도 없는 칸의 모습(모델 특징값)을 기록해 두면,
// 칸이 그 모습과 충분히 비슷할 때(emptyThreshold 이상) 모델 추측과 상관없이 '빈 상자'(empty)로 본다.
// → 학습 때 못 본 배경(창문·벽 등)을 물건으로 착각하는 문제를 장소마다 재학습 없이 막는다.
// 자동 갱신: emptyAdaptRate > 0이면, 빈 화면과 이미 아주 비슷한 칸(emptyAdaptMinSim 이상)의 기록을
// 지금 모습 쪽으로 조금씩 옮긴다 → 조명이 서서히 바뀌어도 다시 기록할 필요가 없다. (게임이 켜고 끈다)
// 게임이 끝나면 stop()으로 카메라를 끈다.

import type { LayersModel } from '@tensorflow/tfjs';
import { cameraError, type CameraStatus } from './camera-pose';

export interface ZoneReading {
  /** 라벨 순서대로의 확률 (합 1) */
  probs: number[];
  /** 가장 높은 라벨 번호와 확률 */
  top: number;
  topProb: number;
  /** 기록해 둔 빈 화면과의 유사도 (코사인, 0~1). 기록 전이면 null */
  emptySim: number | null;
  /** 빈 화면과 충분히 비슷함 → 물건 없음으로 본다 */
  empty: boolean;
}

export interface ObjectFrame {
  zones: ZoneReading[];
  time: number;
}

/** 인식 상자 (거울 화면 기준, 영상 크기 대비 0~1) */
export interface ZoneBox { x: number; y: number; w: number; h: number }

type Events = {
  status: CameraStatus;
  frame: ObjectFrame;
};

export interface CameraObjectOptions {
  /** 모델 폴더 (model.json, weights.bin, metadata.json) — public/ 기준 */
  modelDir: string;
  /** 인식 주기 (ms). 칸 여러 개를 한 번에 묶어 인식한다 */
  intervalMs: number;
  /** 칸 너비 대비 인식 상자 크기 */
  boxScale: number;
}

const BASE = import.meta.env.BASE_URL;
const DEFAULTS: CameraObjectOptions = { modelDir: 'models/quick-fetch', intervalMs: 120, boxScale: 0.9 };

/** n칸 중 i번 칸의 인식 상자. aspect = 영상 가로/세로 */
export function zoneBox(i: number, n: number, aspect: number, boxScale: number): ZoneBox {
  const zoneW = 1 / n;
  // 정사각형 한 변 (영상 높이 기준) = min(칸 너비, 영상 높이)
  const sideH = Math.min(zoneW * aspect, 1) * boxScale;
  const w = sideH / aspect;
  return { x: i * zoneW + (zoneW - w) / 2, y: (1 - sideH) / 2, w, h: sideH };
}

export class CameraObjectAdapter {
  readonly video: HTMLVideoElement;
  status: CameraStatus = { state: 'idle' };
  last: ObjectFrame = { zones: [], time: 0 };
  /** 모델 라벨 (metadata.json 순서) */
  labels: string[] = [];
  readonly opts: CameraObjectOptions;
  /** 빈 화면 유사도가 이 값 이상이면 빈 상자. 게임이 config 값으로 바꿔 쓴다 */
  emptyThreshold = 0.9;
  /** 빈 화면 자동 갱신 비율 (인식 1번마다, 0 = 끔). 게임이 준비 시간에만 켠다 */
  emptyAdaptRate = 0;
  /** 이 유사도 이상인 칸만 자동 갱신 (사람·물건이 있는 칸은 건드리지 않음) */
  emptyAdaptMinSim = 0.93;

  private zoneCount = 1;
  private stream: MediaStream | null = null;
  private tf: typeof import('@tensorflow/tfjs') | null = null;
  private model: LayersModel | null = null;
  private inputSize = 224;
  private scratch = document.createElement('canvas');
  private timer = 0;
  private stopped = false;
  private listeners = new Map<keyof Events, Set<(v: never) => void>>();
  /** 칸별 빈 화면 특징값 (길이 1로 정규화) */
  private emptyRefs: (number[] | null)[] = [];
  private recording: { sums: number[][]; counts: number[]; until: number; done: (ok: boolean) => void } | null = null;

  constructor(opts: Partial<CameraObjectOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
  }

  on<K extends keyof Events>(type: K, fn: (v: Events[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn as (v: never) => void);
    return () => { set.delete(fn as (v: never) => void); };
  }

  private emit<K extends keyof Events>(type: K, v: Events[K]): void {
    this.listeners.get(type)?.forEach((fn) => (fn as (v: Events[K]) => void)(v));
  }

  private setStatus(s: CameraStatus): void {
    this.status = s;
    this.emit('status', s);
  }

  /** 칸 개수 (= 플레이어 수) */
  get zones(): number { return this.zoneCount; }
  setZones(n: number): void {
    const next = Math.max(1, Math.round(n));
    if (next !== this.zoneCount) this.clearEmpty(); // 칸 모양이 바뀌면 기록도 무효
    this.zoneCount = next;
    this.last = { zones: [], time: this.last.time };
  }

  /** 모델에서 특징값을 꺼낼 수 있는지 (빈 화면 보정 가능 여부) */
  get canCalibrate(): boolean {
    return !!this.model && this.model.layers.length === 2;
  }

  /** 모든 칸의 빈 화면이 기록돼 있는지 */
  get emptyRecorded(): boolean {
    return this.emptyRefs.length === this.zoneCount && this.emptyRefs.every((r) => !!r);
  }

  clearEmpty(): void {
    this.emptyRefs = [];
    this.recording?.done(false);
    this.recording = null;
  }

  /** ms 동안 칸별 모습을 모아 빈 화면으로 기록한다. 모두 화면 밖으로 비켜선 상태에서 부른다 */
  recordEmpty(ms = 2000): Promise<boolean> {
    if (!this.canCalibrate) return Promise.resolve(false);
    this.recording?.done(false);
    return new Promise((resolve) => {
      this.recording = { sums: [], counts: [], until: performance.now() + ms, done: resolve };
    });
  }

  get aspect(): number {
    return (this.video.videoWidth || 16) / (this.video.videoHeight || 9);
  }

  box(i: number): ZoneBox {
    return zoneBox(i, this.zoneCount, this.aspect, this.opts.boxScale);
  }

  async listCameras(): Promise<{ id: string; label: string }[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `카메라 ${i + 1}` }));
  }

  get deviceId(): string | undefined {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId;
  }

  async start(deviceId?: string): Promise<void> {
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      this.setStatus({ state: 'error', kind: 'unsupported', message: '이 브라우저(또는 HTTPS가 아닌 주소)에서는 카메라를 쓸 수 없어요.' });
      return;
    }
    this.setStatus({ state: 'requesting' });
    if (!(await this.openCamera(deviceId))) return;
    if (this.stopped) { this.releaseCamera(); return; }

    this.setStatus({ state: 'loading' });
    try {
      await this.loadModel();
    } catch (err) {
      console.error(err);
      this.setStatus({ state: 'error', kind: 'model', message: '물건 인식 모델을 불러오지 못했어요. 새로고침해 보세요.' });
      this.releaseCamera();
      return;
    }
    if (this.stopped) { this.stop(); return; }
    this.setStatus({ state: 'running' });
    this.schedule();
  }

  private async loadModel(): Promise<void> {
    if (this.model) return;
    const tf = this.tf = await import('@tensorflow/tfjs');
    await tf.ready();
    const dir = `${BASE}${this.opts.modelDir}`;
    const meta = await fetch(`${dir}/metadata.json`).then((r) => r.json()) as { labels: string[]; imageSize?: number };
    this.labels = meta.labels;
    this.inputSize = meta.imageSize ?? 224;
    this.scratch.width = this.scratch.height = this.inputSize;
    this.model = await tf.loadLayersModel(`${dir}/model.json`);
    // 첫 인식이 느리지 않게 미리 한 번 돌려 둔다
    tf.tidy(() => { this.model!.predict(tf.zeros([1, this.inputSize, this.inputSize, 3])); });
  }

  async switchCamera(deviceId: string): Promise<void> {
    if (deviceId === this.deviceId) return;
    this.releaseCamera();
    if (await this.openCamera(deviceId) && this.model) this.setStatus({ state: 'running' });
  }

  private async openCamera(deviceId?: string): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
          width: { ideal: 1280 }, height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (err) {
      this.setStatus(cameraError(err));
      return false;
    }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => undefined);
    if (!this.video.videoWidth) await new Promise((r) => this.video.addEventListener('loadedmetadata', r, { once: true }));
    return true;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = window.setTimeout(() => {
      this.recognize();
      this.schedule();
    }, this.opts.intervalMs);
  }

  /** 칸마다 인식 상자를 잘라 한 번에 인식한다 */
  private recognize(): void {
    const tf = this.tf, model = this.model;
    if (!tf || !model || !this.cameraOn || this.video.readyState < 2) return;
    const W = this.video.videoWidth, H = this.video.videoHeight;
    const size = this.inputSize;
    const ctx = this.scratch.getContext('2d')!;
    const n = this.zoneCount;
    const split = this.canCalibrate;
    let probs: number[][] = [];
    let feats: number[][] | null = null;
    tf.tidy(() => {
      const crops = [];
      for (let i = 0; i < n; i++) {
        const b = this.box(i);
        // 화면은 거울 모드 → 원본 영상에서는 좌우가 뒤집힌 위치를 자른다.
        // 학습 데이터(Teachable Machine 웹캠)도 거울 모드라서 잘라 낸 그림도 뒤집어서 넣는다.
        ctx.setTransform(-1, 0, 0, 1, size, 0);
        ctx.drawImage(this.video, (1 - b.x - b.w) * W, b.y * H, b.w * W, b.h * H, 0, 0, size, size);
        crops.push(tf.browser.fromPixels(this.scratch));
      }
      const batch = tf.stack(crops).toFloat().div(127.5).sub(1); // Teachable Machine 정규화: -1 ~ 1
      type T = import('@tensorflow/tfjs').Tensor;
      if (!split) { probs = (model.predict(batch) as T).arraySync() as number[][]; return; }
      // Teachable Machine 모델 = [특징 추출(MobileNet), 분류] 두 단계 → 특징값도 같이 꺼낸다
      const f = model.layers[0].apply(batch) as T;
      probs = (model.layers[1].apply(f) as T).arraySync() as number[][];
      feats = f.arraySync() as number[][];
    });
    const now = performance.now();
    const fs = feats as number[][] | null; // tidy 안에서 채운 값 (타입 좁히기)
    if (fs) this.collectEmpty(fs, now);
    const sims = fs ? fs.map((f, i) => {
      const ref = this.emptyRefs[i];
      return ref ? cosine(f, ref) : null;
    }) : [];
    if (fs && this.emptyAdaptRate > 0 && !this.recording) this.adaptEmpty(fs, sims);
    this.feed(probs, now, sims);
  }

  /** 빈 칸으로 확실한 칸의 기록을 지금 모습 쪽으로 조금 옮긴다 */
  private adaptEmpty(feats: number[][], sims: (number | null)[]): void {
    const k = Math.min(1, this.emptyAdaptRate);
    feats.forEach((f, i) => {
      const ref = this.emptyRefs[i], sim = sims[i];
      if (!ref || sim === null || sim < this.emptyAdaptMinSim) return;
      const cur = normalize(f);
      this.emptyRefs[i] = normalize(ref.map((v, d) => v * (1 - k) + cur[d] * k));
    });
  }

  private collectEmpty(feats: number[][], now: number): void {
    const rec = this.recording;
    if (!rec) return;
    feats.forEach((f, i) => {
      const s = (rec.sums[i] ??= f.map(() => 0));
      f.forEach((v, k) => { s[k] += v; });
      rec.counts[i] = (rec.counts[i] ?? 0) + 1;
    });
    if (now < rec.until) return;
    this.emptyRefs = Array.from({ length: this.zoneCount }, (_, i) => (rec.counts[i] ? normalize(rec.sums[i]) : null));
    this.recording = null;
    rec.done(this.emptyRecorded);
  }

  /**
   * 칸별 확률 한 번을 넣는다. 인식 루프가 부르며,
   * 테스트할 때는 가짜 확률을 직접 넣어 게임을 모의 플레이할 수 있다.
   */
  feed(probsPerZone: number[][], now = performance.now(), sims: (number | null)[] = []): void {
    const zones = probsPerZone.map((probs, i) => {
      let top = 0;
      probs.forEach((p, k) => { if (p > probs[top]) top = k; });
      const emptySim = sims[i] ?? null;
      return { probs, top, topProb: probs[top] ?? 0, emptySim, empty: emptySim !== null && emptySim >= this.emptyThreshold };
    });
    this.last = { zones, time: now };
    this.emit('frame', this.last);
  }

  stop(): void {
    this.stopped = true;
    this.clearEmpty();
    clearTimeout(this.timer);
    this.model?.dispose();
    this.model = null;
    this.releaseCamera();
    if (this.status.state !== 'error') this.setStatus({ state: 'idle' });
  }

  private releaseCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  get cameraOn(): boolean {
    return !!this.stream?.getTracks().some((t) => t.readyState === 'live');
  }
}

function normalize(v: number[]): number[] {
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
}

/** ref는 이미 길이 1 */
function cosine(v: number[], ref: number[]): number {
  let dot = 0, len = 0;
  for (let k = 0; k < v.length; k++) { dot += v[k] * ref[k]; len += v[k] * v[k]; }
  return len ? dot / Math.sqrt(len) : 0;
}
