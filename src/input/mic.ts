// 마이크 어댑터 (기획서 8.2): 음량·소리 길이·음높이·단어
// 게임은 마이크·Web Audio를 직접 다루지 않고 이 어댑터의 값만 받는다.
//   - 'status' : 준비 단계 / 오류 종류
//   - 'frame'  : 매 프레임 음량(dB, 소음 보정 후 0~1), 음높이(반음 단위 MIDI 번호, 없으면 null)
//   - 'word'   : 음성 인식 결과 (크롬 계열만, 지원 안 되면 supportsSpeech = false)
// 게임이 끝나면 반드시 stop()으로 마이크를 끈다.

export type MicStatus =
  | { state: 'idle' }
  | { state: 'requesting' }
  | { state: 'running' }
  | { state: 'error'; kind: 'denied' | 'no-mic' | 'busy' | 'unsupported' | 'unknown'; message: string };

export interface MicFrame {
  /** 음량 (dBFS, 대략 -100 ~ 0) */
  db: number;
  /** 소음 보정 후 음량 0~1 (소음 바닥 = 0, 소음 + rangeDb = 1) */
  level: number;
  /** 음높이 (MIDI 번호, 소수 포함 — 60 = 가운데 도). 소리가 없거나 불분명하면 null */
  pitch: number | null;
  time: number;
}

export interface WordEvent { text: string; final: boolean; time: number }

type Events = { status: MicStatus; frame: MicFrame; word: WordEvent };

/** 개인 음역 (반음 단위). 준비 화면에서 재고, 없으면 기본값 */
export interface VoiceRange { low: number; high: number }

const NOISE_KEY = 'mic:noise-db';
const RANGE_KEY = 'mic:range';
const LEVEL_RANGE_DB = 40;
const DEFAULT_RANGE: VoiceRange = { low: 50, high: 67 };

interface SpeechRecognitionLike extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function speechCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class MicAdapter {
  status: MicStatus = { state: 'idle' };
  last: MicFrame = { db: -100, level: 0, pitch: null, time: 0 };
  /** 주변 소음 바닥 (dB) — 준비 화면에서 잰다 */
  noiseDb = -60;
  range: VoiceRange = { ...DEFAULT_RANGE };
  readonly supportsSpeech = !!speechCtor();
  speechError: string | null = null;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(2048);
  private speech: SpeechRecognitionLike | null = null;
  private wantSpeech = false;
  private raf = 0;
  private stopped = true;
  private listeners = new Map<keyof Events, Set<(v: never) => void>>();

  constructor() {
    try {
      const n = localStorage.getItem(NOISE_KEY);
      if (n !== null) this.noiseDb = Number(n);
      const r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null') as VoiceRange | null;
      if (r && r.high > r.low) this.range = r;
    } catch { /* 기본값 */ }
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

  private setStatus(s: MicStatus): void {
    this.status = s;
    this.emit('status', s);
  }

  async start(): Promise<void> {
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      this.setStatus({ state: 'error', kind: 'unsupported', message: '이 브라우저(또는 HTTPS가 아닌 주소)에서는 마이크를 쓸 수 없어요.' });
      return;
    }
    this.setStatus({ state: 'requesting' });
    try {
      // 게임 효과음이 마이크로 다시 들어가지 않게 에코 제거를 켠다 (dont-say 기획서 9장)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch (err) {
      this.setStatus(micError(err));
      return;
    }
    if (this.stopped) { this.release(); return; }
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      this.setStatus({ state: 'error', kind: 'no-mic', message: '마이크 연결이 끊겼어요. 다시 연결해 주세요.' });
    });
    this.setStatus({ state: 'running' });
    this.loop();
  }

  private loop = (): void => {
    if (this.stopped || !this.analyser || !this.ctx) return;
    this.raf = requestAnimationFrame(this.loop);
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    const db = 20 * Math.log10(rms + 1e-9);
    const pitch = db > this.noiseDb + 6 ? detectPitch(this.buf, this.ctx.sampleRate) : null;
    this.feed(db, pitch);
  };

  /** 음량(dB)·음높이 한 프레임을 넣는다. 마이크 루프가 부르며, 테스트할 때는 가짜 값을 직접 넣을 수 있다 */
  feed(db: number, pitch: number | null, time = performance.now()): void {
    const level = Math.max(0, Math.min(1, (db - this.noiseDb) / LEVEL_RANGE_DB));
    this.last = { db, level, pitch, time };
    this.emit('frame', this.last);
  }

  /** 테스트용: 인식된 단어를 직접 넣는다 */
  feedWord(text: string, final = true): void {
    this.emit('word', { text, final, time: performance.now() });
  }

  setNoise(db: number): void {
    this.noiseDb = db;
    try { localStorage.setItem(NOISE_KEY, String(db)); } catch { /* 무시 */ }
  }

  setRange(r: VoiceRange): void {
    this.range = r;
    try { localStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch { /* 무시 */ }
  }

  /** 음성 인식 켜기 (게임이 단어 미션 동안만 켠다). 끝나면 자동으로 다시 시작 */
  startSpeech(): void {
    const Ctor = speechCtor();
    if (!Ctor || this.wantSpeech) return;
    this.wantSpeech = true;
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        this.emit('word', { text: r[0].transcript, final: r.isFinal, time: performance.now() });
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.speechError = '음성 인식이 허용되지 않았어요'; this.wantSpeech = false; }
    };
    rec.onend = () => { if (this.wantSpeech && !this.stopped) { try { rec.start(); } catch { /* 이미 시작됨 */ } } };
    this.speech = rec;
    try { rec.start(); } catch { /* 무시 */ }
  }

  stopSpeech(): void {
    this.wantSpeech = false;
    try { this.speech?.abort(); } catch { /* 무시 */ }
    this.speech = null;
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.stopSpeech();
    this.release();
    if (this.status.state !== 'error') this.setStatus({ state: 'idle' });
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.analyser = null;
  }

  get micOn(): boolean {
    return !!this.stream?.getTracks().some((t) => t.readyState === 'live');
  }
}

/** 주파수(Hz) → MIDI 번호 */
export const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

const NOTE_NAMES = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
export function midiName(n: number): string {
  const r = Math.round(n);
  return `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

/**
 * 음높이 추정 (YIN 방식 간단판): 70~1000Hz 사이의 기본 주파수.
 * 분명한 음이 아니면 null.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = Math.min(1024, buf.length >> 1);
  const minLag = Math.floor(sampleRate / 1000), maxLag = Math.min(n - 1, Math.floor(sampleRate / 70));
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) { const x = buf[i] - buf[i + lag]; s += x * x; }
    d[lag] = s;
  }
  // 누적 평균으로 나눈 차이 함수
  let running = 0;
  const cm = new Float32Array(maxLag + 1);
  cm[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) { running += d[lag]; cm[lag] = running ? (d[lag] * lag) / running : 1; }
  const THRESH = 0.15;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cm[lag] < THRESH) {
      while (lag + 1 <= maxLag && cm[lag + 1] < cm[lag]) lag++;
      const a = cm[lag - 1] ?? cm[lag], b = cm[lag], c = cm[lag + 1] ?? cm[lag];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return hzToMidi(sampleRate / (lag + (Number.isFinite(shift) ? shift : 0)));
    }
  }
  return null;
}

function micError(err: unknown): MicStatus {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { state: 'error', kind: 'denied', message: '마이크 사용이 거부되었어요. 주소창 왼쪽 아이콘을 눌러 마이크를 "허용"으로 바꾼 뒤 다시 시도해 주세요.' };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { state: 'error', kind: 'no-mic', message: '연결된 마이크를 찾지 못했어요. 마이크가 연결되어 있는지 확인해 주세요.' };
    case 'NotReadableError':
    case 'AbortError':
      return { state: 'error', kind: 'busy', message: '다른 프로그램이 마이크를 쓰고 있어요. 그 프로그램을 닫고 다시 시도해 주세요.' };
    default:
      return { state: 'error', kind: 'unknown', message: `마이크를 켜지 못했어요. (${err instanceof Error ? err.message : String(err)})` };
  }
}
