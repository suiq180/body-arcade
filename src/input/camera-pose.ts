// 카메라 전신 포즈 어댑터 (기획서 8.2)
// 게임은 카메라·MediaPipe를 직접 다루지 않고 이 어댑터의 이벤트만 받는다.
//   - 'status' : 준비 단계 / 오류 종류
//   - 'frame'  : 매 프레임 플레이어별 관절 좌표(거울 화면 기준 0~1), 전신 보임 여부, 현재·확정 동작
//   - 'action' : 어떤 플레이어의 확정 동작이 바뀔 때 (0.3초 유지 확정)
// 게임이 끝나거나 화면을 나가면 반드시 stop()으로 카메라를 끈다.
//
// 2인 모드: 한 카메라 화면을 좌/우 반씩 나눠, 왼쪽 사람 = P1, 오른쪽 사람 = P2.
// 동작 판별은 각자 자기 영역 기준 좌표로 한다 (색 버튼도 영역마다 따로 있다).

import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { ActionRecognizer, bodyVisible, LM, type ActionThresholds, type Point, type PoseAction } from './pose-actions';

export type CameraStatus =
  | { state: 'idle' }
  | { state: 'requesting' }        // 카메라 권한 묻는 중
  | { state: 'loading' }           // 인식 모델 불러오는 중
  | { state: 'running' }
  | { state: 'error'; kind: CameraErrorKind; message: string };

export type CameraErrorKind = 'denied' | 'no-camera' | 'busy' | 'unsupported' | 'model' | 'unknown';

export interface PlayerFrame {
  /** 관절 33개 (거울 화면 전체 기준 좌표). 사람이 안 보이면 null */
  landmarks: Point[] | null;
  /** 어깨~무릎이 모두 자기 영역 안에 보이는지 */
  bodyVisible: boolean;
  candidate: PoseAction | null;
  action: PoseAction | null;
  /** 이 플레이어의 영역 [왼쪽 x, 오른쪽 x] (화면 전체 기준 0~1) */
  region: [number, number];
}

export interface PoseFrame {
  players: PlayerFrame[];
  /** 2인 모드에서 누군가 화면 중앙선을 넘었는지 */
  crossing: boolean;
  time: number;
}

export interface ActionEvent { player: number; action: PoseAction | null }

type Events = {
  status: CameraStatus;
  frame: PoseFrame;
  action: ActionEvent;
};

const BASE = import.meta.env.BASE_URL;
const WASM_PATH = `${BASE}mediapipe/wasm`;
const MODEL_PATH = `${BASE}mediapipe/pose_landmarker_lite.task`;
/** 중앙선에서 이만큼 안쪽까지 몸 중심이 들어오면 "넘었다"로 본다 */
const CENTER_MARGIN = 0.03;

export class CameraPoseAdapter {
  readonly video: HTMLVideoElement;
  readonly playerCount: number;
  status: CameraStatus = { state: 'idle' };
  last: PoseFrame;

  private stream: MediaStream | null = null;
  private landmarker: PoseLandmarker | null = null;
  private recognizers: ActionRecognizer[];
  private regions: [number, number][];
  private raf = 0;
  private lastVideoTime = -1;
  private stopped = false;
  private listeners = new Map<keyof Events, Set<(v: never) => void>>();

  constructor(thresholds: ActionThresholds, players: 1 | 2 = 1) {
    this.playerCount = players;
    this.regions = players === 1 ? [[0, 1]] : [[0, 0.5], [0.5, 1]];
    this.recognizers = this.regions.map(() => new ActionRecognizer(thresholds));
    this.last = { players: this.regions.map((r) => emptyPlayer(r)), crossing: false, time: 0 };
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

  /** 연결된 카메라 목록 (권한을 받은 뒤에야 이름이 보인다) */
  async listCameras(): Promise<{ id: string; label: string }[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `카메라 ${i + 1}` }));
  }

  /** 지금 쓰고 있는 카메라의 deviceId */
  get deviceId(): string | undefined {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId;
  }

  /** 해당 플레이어가 거의 움직이지 않은 시간 (ms) — 유지형 미션 "가만히"에 사용 */
  stillFor(player: number, now = performance.now()): number {
    return this.recognizers[player]?.stillFor(now) ?? 0;
  }

  async start(deviceId?: string): Promise<void> {
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      this.setStatus({ state: 'error', kind: 'unsupported', message: '이 브라우저(또는 HTTPS가 아닌 주소)에서는 카메라를 쓸 수 없어요.' });
      return;
    }

    // 1) 카메라 권한
    this.setStatus({ state: 'requesting' });
    if (!(await this.openCamera(deviceId))) return;
    if (this.stopped) { this.releaseCamera(); return; } // 기다리는 사이 화면을 나갔으면 바로 끈다

    // 2) 인식 모델 (첫 실행 때만 내려받음)
    this.setStatus({ state: 'loading' });
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
      const create = (delegate: 'GPU' | 'CPU') => vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'VIDEO',
        numPoses: this.playerCount,
      });
      this.landmarker = await create('GPU').catch(() => create('CPU'));
    } catch (err) {
      console.error(err);
      this.setStatus({ state: 'error', kind: 'model', message: '동작 인식 모델을 불러오지 못했어요. 새로고침해 보세요.' });
      this.releaseCamera();
      return;
    }
    if (this.stopped) { this.stop(); return; }

    this.recognizers.forEach((r) => r.reset());
    this.setStatus({ state: 'running' });
    this.loop();
  }

  /** 실행 중에 다른 카메라로 바꾼다 (인식 모델은 그대로) */
  async switchCamera(deviceId: string): Promise<void> {
    if (deviceId === this.deviceId) return;
    this.releaseCamera();
    if (await this.openCamera(deviceId)) {
      this.recognizers.forEach((r) => r.reset());
      if (this.landmarker) this.setStatus({ state: 'running' });
    }
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
    // 영상 크기를 알아야 좌표 비율(가로/세로)을 맞출 수 있다
    if (!this.video.videoWidth) await new Promise((r) => this.video.addEventListener('loadedmetadata', r, { once: true }));
    const aspect = (this.video.videoWidth || 4) / (this.video.videoHeight || 3);
    this.recognizers.forEach((r, i) => r.setAspect(aspect * (this.regions[i][1] - this.regions[i][0])));
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
    // 거울 모드로 바꿔서 넘긴다 (화면에서 보는 그대로의 좌우)
    const poses: Point[][] = res.landmarks.map((raw) =>
      raw.map((p) => ({ x: 1 - p.x, y: p.y, visibility: p.visibility ?? 0 })));

    const { assigned, crossing } = this.assign(poses);
    const changed: ActionEvent[] = [];
    const players = this.regions.map((region, i) => {
      const lm = assigned[i];
      const local = lm ? toRegion(lm, region) : null;
      const rec = this.recognizers[i];
      if (rec.update(local, now)) changed.push({ player: i, action: rec.confirmed });
      return {
        landmarks: lm,
        bodyVisible: bodyVisible(local),
        candidate: rec.candidate,
        action: rec.confirmed,
        region,
      };
    });

    this.last = { players, crossing, time: now };
    this.emit('frame', this.last);
    changed.forEach((e) => this.emit('action', e));
  };

  /** 감지된 사람들을 플레이어 자리에 배정한다 (2인: 몸 중심 x로 왼쪽 = P1) */
  private assign(poses: Point[][]): { assigned: (Point[] | null)[]; crossing: boolean } {
    if (this.playerCount === 1) return { assigned: [poses[0] ?? null], crossing: false };
    const center = (lm: Point[]) => (lm[LM.leftHip].x + lm[LM.rightHip].x + lm[LM.leftShoulder].x + lm[LM.rightShoulder].x) / 4;
    const withX = poses.map((lm) => ({ lm, x: center(lm) })).sort((a, b) => a.x - b.x);
    const assigned: (Point[] | null)[] = [null, null];
    if (withX.length >= 2) {
      assigned[0] = withX[0].lm; assigned[1] = withX[1].lm;
    } else if (withX.length === 1) {
      assigned[withX[0].x < 0.5 ? 0 : 1] = withX[0].lm;
    }
    const crossing = (assigned[0] !== null && center(assigned[0]) > 0.5 - CENTER_MARGIN)
      || (assigned[1] !== null && center(assigned[1]) < 0.5 + CENTER_MARGIN);
    return { assigned, crossing };
  }

  /** 카메라·인식 루프를 모두 끈다. 여러 번 불러도 안전하다. */
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

  /** 카메라가 실제로 켜져 있는지 (테스트·확인용) */
  get cameraOn(): boolean {
    return !!this.stream?.getTracks().some((t) => t.readyState === 'live');
  }
}

function emptyPlayer(region: [number, number]): PlayerFrame {
  return { landmarks: null, bodyVisible: false, candidate: null, action: null, region };
}

/** 화면 전체 좌표 → 플레이어 영역 안 좌표 (영역 왼쪽 끝 = 0, 오른쪽 끝 = 1) */
function toRegion(lm: Point[], [x0, x1]: [number, number]): Point[] {
  if (x0 === 0 && x1 === 1) return lm;
  const w = x1 - x0;
  return lm.map((p) => ({ x: (p.x - x0) / w, y: p.y, visibility: p.visibility }));
}

function cameraError(err: unknown): CameraStatus {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { state: 'error', kind: 'denied', message: '카메라 사용이 거부되었어요. 주소창 왼쪽 아이콘을 눌러 카메라를 "허용"으로 바꾼 뒤 다시 시도해 주세요.' };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { state: 'error', kind: 'no-camera', message: '연결된 카메라를 찾지 못했어요. 웹캠이 연결되어 있는지 확인해 주세요.' };
    case 'NotReadableError':
    case 'AbortError':
      return { state: 'error', kind: 'busy', message: '다른 프로그램(줌, 팀즈 등)이 카메라를 쓰고 있어요. 그 프로그램을 닫고 다시 시도해 주세요.' };
    default:
      return { state: 'error', kind: 'unknown', message: `카메라를 켜지 못했어요. (${err instanceof Error ? err.message : String(err)})` };
  }
}
