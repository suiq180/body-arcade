// 리듬·악기 입력 어댑터 (기획서 8.2): Web MIDI + 게임패드 + 키보드(대체 입력)
// 게임은 장치를 직접 다루지 않고 { role, time, velocity } 만 받는다.
//   - role : 키 배정 결과 (예: 'p1', 'mold1'). 게임이 역할 목록을 정하고, 준비 화면에서 패드·키를 배정한다
//   - time : 지연 보정이 끝난 시각 (performance.now 기준 ms)
// MIDI·키보드·게임패드 이벤트 시각은 모두 performance.now()와 같은 시계라서 서로 비교할 수 있다.

export type RawSource = 'midi' | 'gamepad' | 'key';

/** 배정 전의 날것 입력 */
export interface RawHit {
  /** 장치 안에서 버튼을 구분하는 값 (예: 'midi:36', 'gp:0:3', 'key:KeyA') */
  code: string;
  label: string;
  source: RawSource;
  velocity: number;
  time: number;
  down: boolean;
}

/** 배정된 역할 입력 */
export interface RoleHit {
  role: string;
  velocity: number;
  /** 지연 보정된 시각 */
  time: number;
  rawTime: number;
  down: boolean;
  source: RawSource;
}

/** 게임이 정하는 역할 하나 (예: P1 패드, 1번 틀) */
export interface RhythmRole {
  id: string;
  label: string;
  /** 기본 키보드 배정 (KeyboardEvent.code) */
  key: string;
}

type Events = {
  raw: RawHit;
  hit: RoleHit;
  release: RoleHit;
  devices: void;
  /** 쓰던 MIDI 장치·게임패드가 빠졌을 때 */
  disconnect: string;
};

const OFFSET_KEY = 'rhythm:offset-ms';
const MAP_KEY = (game: string) => `rhythm:map:${game}`;
/** 키보드·디지털 버튼의 세기 (Shift를 누르면 세게) */
const KEY_VELOCITY = 90;
const KEY_HARD_VELOCITY = 127;

export function keyLabel(code: string): string {
  const k = code.replace(/^Key/, '').replace(/^Digit/, '');
  return ({ Space: '스페이스', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", Enter: '엔터' } as Record<string, string>)[k] ?? k;
}

function noteName(n: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
}

export class RhythmInput {
  /** 지연 보정값 (ms): 실제 입력 시각에서 이만큼 뺀다 */
  offsetMs = 0;
  roles: RhythmRole[] = [];
  midiSupported = 'requestMIDIAccess' in navigator;
  midiError: string | null = null;
  private map = new Map<string, string>();
  private labels = new Map<string, string>();
  private gameId = '';
  private midi: MIDIAccess | null = null;
  private usedDevices = new Set<string>();
  private pads = new Map<number, boolean[]>();
  private held = new Set<string>();
  private raf = 0;
  private stopped = true;
  private listeners = new Map<keyof Events, Set<(v: never) => void>>();

  constructor() {
    try { this.offsetMs = Number(localStorage.getItem(OFFSET_KEY)) || 0; } catch { /* 저장소를 못 쓰면 0 */ }
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

  // ── 역할 배정 ─────────────────────────────
  /** 게임의 역할 목록을 정하고, 저장된 배정을 불러온다 (없으면 기본 키보드 배정) */
  setRoles(gameId: string, roles: RhythmRole[]): void {
    this.gameId = gameId;
    this.roles = roles;
    this.map.clear();
    for (const r of roles) this.map.set(`key:${r.key}`, r.id);
    try {
      const saved = JSON.parse(localStorage.getItem(MAP_KEY(gameId)) || 'null') as { code: string; role: string; label: string }[] | null;
      for (const s of saved ?? []) {
        if (!roles.some((r) => r.id === s.role)) continue;
        this.map.set(s.code, s.role);
        this.labels.set(s.code, s.label);
      }
    } catch { /* 무시 */ }
  }

  /** 패드·키 하나를 역할에 배정한다 (같은 패드가 다른 역할에 있으면 옮긴다). 키보드 기본 배정은 늘 남겨 둔다 */
  assign(role: string, raw: RawHit): void {
    this.map.set(raw.code, role);
    this.labels.set(raw.code, raw.label);
    this.save();
  }

  /** 장치로 배정한 것을 모두 지우고 기본 키보드 배정만 남긴다 */
  resetAssignments(): void {
    this.setRoles(this.gameId, this.roles);
    for (const code of [...this.map.keys()]) if (!code.startsWith('key:')) this.map.delete(code);
    this.save();
  }

  private save(): void {
    const list = [...this.map].filter(([code]) => !this.roles.some((r) => `key:${r.key}` === code))
      .map(([code, role]) => ({ code, role, label: this.labels.get(code) ?? code }));
    try { localStorage.setItem(MAP_KEY(this.gameId), JSON.stringify(list)); } catch { /* 무시 */ }
  }

  /** 역할에 배정된 입력 이름들 (화면 안내용) */
  bindingsOf(role: string): string[] {
    return [...this.map].filter(([, r]) => r === role).map(([code]) =>
      code.startsWith('key:') ? `${keyLabel(code.slice(4))} 키` : this.labels.get(code) ?? code);
  }

  setOffset(ms: number): void {
    this.offsetMs = Math.round(ms);
    try { localStorage.setItem(OFFSET_KEY, String(this.offsetMs)); } catch { /* 무시 */ }
  }

  get hasSavedOffset(): boolean {
    try { return localStorage.getItem(OFFSET_KEY) !== null; } catch { return false; }
  }

  // ── 장치 ─────────────────────────────────
  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('gamepadconnected', this.onPadChange);
    window.addEventListener('gamepaddisconnected', this.onPadGone);
    this.pollPads();
    if (this.midiSupported && !this.midi) {
      try {
        this.midi = await navigator.requestMIDIAccess({ sysex: false });
        this.midi.addEventListener('statechange', this.onMidiState);
      } catch (err) {
        this.midiError = err instanceof DOMException && err.name === 'SecurityError'
          ? 'MIDI 사용이 거부되었어요. 주소창 왼쪽 아이콘에서 허용으로 바꿔 주세요.'
          : 'MIDI 장치에 연결하지 못했어요.';
      }
    }
    if (this.stopped) return;
    this.midi?.inputs.forEach((inp) => { inp.onmidimessage = this.onMidi; });
    this.emit('devices', undefined);
  }

  get midiDevices(): string[] {
    const list: string[] = [];
    this.midi?.inputs.forEach((i) => { if (i.state === 'connected') list.push(i.name ?? 'MIDI 장치'); });
    return list;
  }

  get gamepads(): string[] {
    return [...(navigator.getGamepads?.() ?? [])].filter((g): g is Gamepad => !!g).map((g) => g.id);
  }

  private onMidiState = (e: Event): void => {
    const port = (e as MIDIConnectionEvent).port;
    if (port?.type === 'input') {
      if (port.state === 'connected') (port as MIDIInput).onmidimessage = this.onMidi;
      else if (this.usedDevices.has(port.id)) this.emit('disconnect', port.name ?? 'MIDI 장치');
    }
    this.emit('devices', undefined);
  };

  private onMidi = (e: MIDIMessageEvent): void => {
    const d = e.data;
    if (!d || d.length < 3) return;
    const kind = d[0] & 0xf0, note = d[1], vel = d[2];
    const on = kind === 0x90 && vel > 0, off = kind === 0x80 || (kind === 0x90 && vel === 0);
    if (!on && !off) return;
    this.usedDevices.add((e.target as MIDIInput).id);
    this.feed({ code: `midi:${note}`, label: `MIDI 노트 ${note} (${noteName(note)})`, source: 'midi', velocity: on ? vel : 0, time: e.timeStamp, down: on });
  };

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (e.repeat || (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'))) return;
    const code = `key:${e.code}`;
    if (this.map.has(code) && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    this.feed({ code, label: `${keyLabel(e.code)} 키`, source: 'key', velocity: e.shiftKey ? KEY_HARD_VELOCITY : KEY_VELOCITY, time: e.timeStamp, down: e.type === 'keydown' });
  };

  private onPadChange = (): void => this.emit('devices', undefined);
  private onPadGone = (e: GamepadEvent): void => {
    if (this.pads.has(e.gamepad.index)) this.emit('disconnect', e.gamepad.id);
    this.pads.delete(e.gamepad.index);
    this.emit('devices', undefined);
  };

  private pollPads = (): void => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.pollPads);
    for (const g of navigator.getGamepads?.() ?? []) {
      if (!g) continue;
      const prev = this.pads.get(g.index) ?? [];
      const now = g.buttons.map((b) => b.pressed);
      now.forEach((p, b) => {
        if (p === !!prev[b]) return;
        const v = g.buttons[b].value;
        this.feed({
          code: `gp:${g.index}:${b}`, label: `게임패드${g.index + 1} 버튼 ${b}`, source: 'gamepad',
          velocity: p ? (v > 0 && v < 1 ? Math.round(v * 127) : KEY_VELOCITY) : 0, time: performance.now(), down: p,
        });
      });
      this.pads.set(g.index, now);
    }
  };

  /**
   * 날것 입력 하나를 넣는다. 장치 이벤트가 부르며,
   * 테스트할 때는 가짜 입력을 직접 넣어 게임을 모의 플레이할 수 있다.
   */
  feed(raw: RawHit): void {
    // 같은 버튼의 눌림·뗌이 짝이 맞게 (뗌만 오는 경우 무시)
    if (raw.down) this.held.add(raw.code);
    else if (!this.held.delete(raw.code)) return;
    this.emit('raw', raw);
    const role = this.map.get(raw.code);
    if (!role) return;
    const hit: RoleHit = { role, velocity: raw.velocity, time: raw.time - this.offsetMs, rawTime: raw.time, down: raw.down, source: raw.source };
    this.emit(raw.down ? 'hit' : 'release', hit);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('gamepadconnected', this.onPadChange);
    window.removeEventListener('gamepaddisconnected', this.onPadGone);
    this.midi?.inputs.forEach((inp) => { inp.onmidimessage = null; });
    this.midi?.removeEventListener('statechange', this.onMidiState);
    this.midi = null;
    this.held.clear();
  }
}
