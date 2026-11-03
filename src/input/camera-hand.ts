// 카메라 손 추적 어댑터 (기획서 8.2)
// 게임은 카메라·MediaPipe를 직접 다루지 않고 이 어댑터의 값만 받는다.
//   - 'status' : 준비 단계 / 오류 종류 (전신 포즈 어댑터와 같은 형식)
//   - 'frame'  : 매 프레임 손 위치(거울 화면 기준 0~1, 부드럽게 보정), 손 상태, 손목 회전각
//   - 'state'  : 손 상태(open / pinch / fist)가 바뀔 때
// 손이 여러 개 잡히면 가장 큰 손 하나만 쓴다. 게임이 끝나면 stop()으로 카메라를 끈다.

import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { cameraError, type CameraStatus } from './camera-pose';
import {
  DEFAULT_HAND_THRESHOLDS, classifyHand, handAnchor, handSize, pickLargestHand, wristAngle,
  type HandPoint, type HandState, type HandThresholds,
} from './hand-gestures';

export interface HandFrame {
  /** 손이 보이는지 */
  present: boolean;
  /** 조작 기준점(엄지·검지 사이), 거울 화면 기준 0~1, 부드럽게 보정된 값 */
  x: number;
  y: number;
  state: HandState | null;
  /** 손목 회전각 (라디안, 손가락이 위 = 0, 시계 방향 +) */
  angle: number;
  /** 손 크기 (화면 높이 기준) — 카메라와의 거리 안내에 사용 */
  size: number;
  /** 관절 21개 (거울 화면 기준). 손이 없으면 null */
  landmarks: HandPoint[] | null;
  time: number;
}

type Events = {
  status: CameraStatus;
  frame: HandFrame;
  state: HandState | null;
};

const BASE = import.meta.env.BASE_URL;
const WASM_PATH = `${BASE}mediapipe/wasm`;
const MODEL_PATH = `${BASE}mediapipe/hand_landmarker.task`;

export interface CameraHandOptions extends HandThresholds {
  /** 0이면 보정 없음, 1에 가까울수록 이전 위치를 많이 남긴다 (떨림 줄이기) */
  smoothing: number;
}

export class CameraHandAdapter {
  readonly video: HTMLVideoElement;
  status: CameraStatus = { state: 'idle' };
  last: HandFrame = emptyFrame(0);
  readonly opts: CameraHandOptions;

  private stream: MediaStream | null = null;
  private landmarker: HandLandmarker | null = null;
  private aspect = 16 / 9;
  private raf = 0;
  private lastVideoTime = -1;
  private stopped = false;
  private listeners = new Map<keyof Events, Set<(v: never) => void>>();

  constructor(opts: Partial<CameraHandOptions> = {}) {
    this.opts = { ...DEFAULT_HAND_THRESHOLDS, smoothing: 0.35, ...opts };
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
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
      const create = (delegate: 'GPU' | 'CPU') => vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'VIDEO',
        numHands: 2, // 두 손이 잡혀도 큰 손 하나를 고를 수 있게
      });
      this.landmarker = await create('GPU').catch(() => create('CPU'));
    } catch (err) {
      console.error(err);
      this.setStatus({ state: 'error', kind: 'model', message: '손 인식 모델을 불러오지 못했어요. 새로고침해 보세요.' });
      this.releaseCamera();
      return;
    }
    if (this.stopped) { this.stop(); return; }
    this.last = emptyFrame(performance.now());
    this.setStatus({ state: 'running' });
    this.loop();
  }

  async switchCamera(deviceId: string): Promise<void> {
    if (deviceId === this.deviceId) return;
    this.releaseCamera();
    if (await this.openCamera(deviceId) && this.landmarker) this.setStatus({ state: 'running' });
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
    this.aspect = (this.video.videoWidth || 16) / (this.video.videoHeight || 9);
    this.lastVideoTime = -1;
    return true;
  }

  private loop = (): void => {
    if (this.stopped || !this.landmarker) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    const now = performance.now();
    const res = this.landmarker.detectForVideo(this.video, now);
    const hands: HandPoint[][] = res.landmarks.map((raw) => raw.map((p) => ({ x: 1 - p.x, y: p.y })));
    this.feed(pickLargestHand(hands, this.aspect), now);
  };

  /**
   * 관절 좌표 한 프레임을 넣는다. 카메라 루프가 부르며,
   * 테스트할 때는 가짜 좌표를 직접 넣어 게임을 모의 플레이할 수 있다.
   */
  feed(lm: HandPoint[] | null, now = performance.now()): void {
    const prev = this.last;
    let next: HandFrame;
    if (!lm) {
      next = { ...prev, present: false, state: null, landmarks: null, time: now };
    } else {
      const a = handAnchor(lm);
      const k = prev.present ? this.opts.smoothing : 0; // 손이 다시 나타난 첫 프레임은 보정하지 않음
      next = {
        present: true,
        x: prev.x * k + a.x * (1 - k),
        y: prev.y * k + a.y * (1 - k),
        state: classifyHand(lm, this.aspect, prev.state, this.opts),
        angle: wristAngle(lm, this.aspect),
        size: handSize(lm, this.aspect),
        landmarks: lm,
        time: now,
      };
    }
    this.last = next;
    this.emit('frame', next);
    if (next.state !== prev.state) this.emit('state', next.state);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.landmarker?.close();
    this.landmarker = null;
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

function emptyFrame(time: number): HandFrame {
  return { present: false, x: 0.5, y: 0.5, state: null, angle: 0, size: 0, landmarks: null, time };
}
