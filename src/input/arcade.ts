// 🕹️ 2인용 아케이드 스틱 어댑터 (기획서 8.2)
// 스틱은 USB로 연결하면 보통 게임패드 2개로, 기기에 따라 키보드로 잡힌다.
// 어느 쪽이든 날것 입력(키·패드 버튼·패드 축)을 "P1/P2의 레버 방향·버튼"으로 배정해서 쓴다.
//   - 'input'   : 배정된 입력이 눌리거나 떼질 때 { player, control, down, time }
//   - 'raw'     : 배정과 상관없는 모든 날것 입력 (키 배정 화면에서 사용)
//   - 'devices' : 게임패드가 연결·해제될 때
// 게임은 held()/lever()로 지금 상태를, 'input' 이벤트로 누른 순간을 받는다.

export type ArcadeControl = 'up' | 'down' | 'left' | 'right' | 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'start';
export type Player = 0 | 1;

export const CONTROLS: ArcadeControl[] = ['up', 'down', 'left', 'right', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'start'];
export const CONTROL_LABEL: Record<ArcadeControl, string> = {
  up: '레버 ↑', down: '레버 ↓', left: '레버 ←', right: '레버 →',
  b1: '버튼 1', b2: '버튼 2', b3: '버튼 3', b4: '버튼 4', b5: '버튼 5', b6: '버튼 6', start: 'START',
};

/** 플레이어별 [조작 → 날것 입력 코드 목록]. 코드: key:KeyW / gp:0:b3 / gp:0:a1- */
export type ArcadeMap = [Record<ArcadeControl, string[]>, Record<ArcadeControl, string[]>];

export interface ArcadeEvent { player: Player; control: ArcadeControl; down: boolean; time: number }
export interface RawInput { code: string; label: string; down: boolean; time: number }

type Events = { input: ArcadeEvent; raw: RawInput; devices: undefined };

const STORE_KEY = 'arcade:map';
/** 축이 이 값보다 많이 기울면 그 방향을 누른 것으로 본다 */
const AXIS_ON = 0.5;
/**
 * 햇 스위치 레버: 표준 배치가 아닌 스틱(DirectInput)은 레버 8방향을 축 하나에 숫자로 보낸다.
 * 놓으면 범위 밖 값(약 3.29), 누르면 -1(↑)부터 1(↖)까지 8칸. 크롬 윈도우에서는 보통 축 9.
 */
const HAT_REST = 1.05;
const HAT_AXIS_GUESS = 9;
/** 8칸 순서(↑ ↗ → ↘ ↓ ↙ ← ↖)별로 눌린 방향 */
const HAT_DIRS: string[][] = [['U'], ['U', 'R'], ['R'], ['D', 'R'], ['D'], ['D', 'L'], ['L'], ['U', 'L']];

/** 햇 스위치 값 → 눌린 방향 목록 (U/D/L/R) */
export function hatDirs(v: number): string[] {
  if (!Number.isFinite(v) || Math.abs(v) > HAT_REST) return [];
  return HAT_DIRS[Math.round((v + 1) / (2 / 7)) % 8];
}

/** 알려진 스틱별 기본 배정 (게임패드 id에 들어 있는 제조사·제품 번호로 찾는다) */
export interface StickProfile {
  match: RegExp;
  /** 버튼 1~6에 해당하는 패드 버튼 번호 */
  buttons: [number, number, number, number, number, number];
  start: number;
  /** true면 번호가 큰 패드가 P1 */
  p1HighIndex: boolean;
}
const STICK_PROFILES: StickProfile[] = [
  // HORI 2인용 스틱 (0f0d:00ad) — 2026-11-24 실제 기기로 확인
  { match: /0f0d.*00ad/i, buttons: [1, 3, 0, 2, 4, 6], start: 9, p1HighIndex: true },
];

const emptyRecord = (): Record<ArcadeControl, string[]> =>
  Object.fromEntries(CONTROLS.map((c) => [c, []])) as unknown as Record<ArcadeControl, string[]>;

const keys = (list: string[]): string[] => list.map((k) => `key:${k}`);

/** 키보드 하나로 둘이 할 때 (기획서: P1 W·A·S·D + F·G·H, P2 방향키 + J·K·L — 버튼 4~6과 START는 추가) */
export function keyboardMap(): ArcadeMap {
  const p1 = emptyRecord(), p2 = emptyRecord();
  Object.assign(p1, {
    up: keys(['KeyW']), down: keys(['KeyS']), left: keys(['KeyA']), right: keys(['KeyD']),
    b1: keys(['KeyF']), b2: keys(['KeyG']), b3: keys(['KeyH']), b4: keys(['KeyR']), b5: keys(['KeyT']), b6: keys(['KeyY']), start: keys(['Digit1']),
  });
  Object.assign(p2, {
    up: keys(['ArrowUp']), down: keys(['ArrowDown']), left: keys(['ArrowLeft']), right: keys(['ArrowRight']),
    b1: keys(['KeyJ']), b2: keys(['KeyK']), b3: keys(['KeyL']), b4: keys(['KeyU']), b5: keys(['KeyI']), b6: keys(['KeyO']), start: keys(['Digit2']),
  });
  return [p1, p2];
}

/** 게임패드 2개 (표준 배치): 왼쪽 축·십자키·햇 스위치 = 레버, 버튼 0~5 = 버튼 1~6, 버튼 9 = START */
export function gamepadMap(pads: [number, number], buttons: number[] = [0, 1, 2, 3, 4, 5], start = 9): ArcadeMap {
  return pads.map((p) => {
    const r = emptyRecord();
    Object.assign(r, {
      up: [`gp:${p}:a1-`, `gp:${p}:b12`, `gp:${p}:hU`], down: [`gp:${p}:a1+`, `gp:${p}:b13`, `gp:${p}:hD`],
      left: [`gp:${p}:a0-`, `gp:${p}:b14`, `gp:${p}:hL`], right: [`gp:${p}:a0+`, `gp:${p}:b15`, `gp:${p}:hR`],
      b1: [`gp:${p}:b${buttons[0]}`], b2: [`gp:${p}:b${buttons[1]}`], b3: [`gp:${p}:b${buttons[2]}`],
      b4: [`gp:${p}:b${buttons[3]}`], b5: [`gp:${p}:b${buttons[4]}`], b6: [`gp:${p}:b${buttons[5]}`],
      start: [`gp:${p}:b${start}`],
    });
    return r;
  }) as ArcadeMap;
}

/** 알려진 스틱이 패드 2개로 연결돼 있으면 그 스틱 이름을 돌려준다 */
export function knownStick(pads: { index: number; id: string }[]): StickProfile | null {
  return STICK_PROFILES.find((pr) => pads.filter((p) => pr.match.test(p.id)).length >= 2) ?? null;
}

/** 연결된 패드에 맞는 기본 배정 (알려진 스틱이면 그 스틱의 버튼 배치, 아니면 표준 배치) */
export function defaultPadMap(pads: { index: number; id: string }[]): ArcadeMap | null {
  const pr = knownStick(pads);
  if (pr) {
    const idx = pads.filter((p) => pr.match.test(p.id)).map((p) => p.index).sort((a, b) => a - b).slice(0, 2);
    const order = (pr.p1HighIndex ? [idx[1], idx[0]] : idx) as [number, number];
    return gamepadMap(order, pr.buttons, pr.start);
  }
  if (pads.length < 2) return null;
  return gamepadMap([pads[0].index, pads[1].index]);
}

/** P1과 P2 배정을 맞바꾼다 */
export function swapPlayers(map: ArcadeMap): ArcadeMap {
  return [map[1], map[0]];
}

/** 배정이 모든 조작에 하나 이상 있는지 */
export function mapComplete(map: ArcadeMap | null): map is ArcadeMap {
  return !!map && map.every((r) => CONTROLS.every((c) => r[c]?.length > 0));
}

export function rawLabel(code: string): string {
  const [kind, a, b] = code.split(':');
  if (kind === 'key') return a.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '방향키 ').replace('Up', '↑').replace('Down', '↓').replace('Left', '←').replace('Right', '→');
  if (kind === 'gp') {
    const pad = `패드${Number(a) + 1}`;
    if (b.startsWith('a')) return `${pad} 축${b.slice(1, -1)}${b.endsWith('-') ? '−' : '+'}`;
    if (b.startsWith('h')) return `${pad} 레버${({ U: '↑', D: '↓', L: '←', R: '→' } as Record<string, string>)[b.slice(1)] ?? b.slice(1)}`;
    return `${pad} 버튼${b.slice(1)}`;
  }
  return code;
}

export class ArcadeAdapter {
  map: ArcadeMap | null = null;
  private reverse = new Map<string, { player: Player; control: ArcadeControl }[]>();
  /** 지금 눌린 날것 코드 */
  private rawHeld = new Set<string>();
  private pressTime: [Map<ArcadeControl, number>, Map<ArcadeControl, number>] = [new Map(), new Map()];
  private padState = new Map<number, { buttons: boolean[]; axes: number[]; hats: Set<number>; hatDirs: Set<string> }>();
  private listeners = new Map<keyof Events, Set<(v: never) => void>>();
  private raf = 0;
  private stopped = true;

  constructor() {
    this.loadSaved();
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

  // ── 배정 ─────────────────────────────────
  setMap(map: ArcadeMap | null, save = true): void {
    this.map = map;
    this.reverse.clear();
    map?.forEach((r, p) => CONTROLS.forEach((c) => r[c].forEach((code) => {
      const list = this.reverse.get(code) ?? [];
      list.push({ player: p as Player, control: c });
      this.reverse.set(code, list);
    })));
    this.pressTime = [new Map(), new Map()];
    if (save && map) try { localStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch { /* 저장 못 해도 이번 판은 됨 */ }
  }

  loadSaved(): boolean {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') as ArcadeMap | null;
      if (mapComplete(saved)) { this.setMap(saved, false); return true; }
    } catch { /* 저장 내용이 깨졌으면 무시 */ }
    return false;
  }

  // ── 상태 읽기 ─────────────────────────────
  /** 그 조작이 지금 눌려 있는지 */
  held(player: Player, control: ArcadeControl): boolean {
    return !!this.map?.[player][control].some((code) => this.rawHeld.has(code));
  }

  /** 레버 방향: x = ←−1 / →+1, y = ↓−1 / ↑+1 */
  lever(player: Player): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
    const h = (c: ArcadeControl) => (this.held(player, c) ? 1 : 0);
    return { x: (h('right') - h('left')) as -1 | 0 | 1, y: (h('up') - h('down')) as -1 | 0 | 1 };
  }

  /** 마지막으로 누른 시각 (없으면 -Infinity) */
  pressedAt(player: Player, control: ArcadeControl): number {
    return this.pressTime[player].get(control) ?? -Infinity;
  }

  get pads(): { index: number; id: string }[] {
    return [...(navigator.getGamepads?.() ?? [])].filter((g): g is Gamepad => !!g).map((g) => ({ index: g.index, id: g.id }));
  }

  /** 그 플레이어에게 배정된 게임패드가 모두 연결돼 있는지 (키보드만 쓰면 항상 true) */
  connected(player: Player): boolean {
    if (!this.map) return false;
    const need = new Set<number>();
    CONTROLS.forEach((c) => this.map![player][c].forEach((code) => { if (code.startsWith('gp:')) need.add(Number(code.split(':')[1])); }));
    if (!need.size) return true;
    const have = new Set(this.pads.map((p) => p.index));
    return [...need].every((i) => have.has(i));
  }

  // ── 장치 ─────────────────────────────────
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('gamepadconnected', this.onPads);
    window.addEventListener('gamepaddisconnected', this.onPads);
    this.poll();
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('gamepadconnected', this.onPads);
    window.removeEventListener('gamepaddisconnected', this.onPads);
    this.rawHeld.clear();
  }

  private onPads = (e: GamepadEvent): void => {
    if (e.type === 'gamepaddisconnected') {
      // 빠진 패드의 눌림 상태는 지운다
      [...this.rawHeld].filter((c) => c.startsWith(`gp:${e.gamepad.index}:`)).forEach((c) => this.feedRaw(c, false));
      this.padState.delete(e.gamepad.index);
    }
    this.emit('devices', undefined);
  };

  /** 창이 포커스를 잃으면 키를 뗀 신호가 안 오므로 모두 뗀 것으로 */
  private onBlur = (): void => {
    [...this.rawHeld].filter((c) => c.startsWith('key:')).forEach((c) => this.feedRaw(c, false));
  };

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (e.repeat || (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'))) {
      if (e.repeat && this.reverse.has(`key:${e.code}`)) e.preventDefault();
      return;
    }
    const code = `key:${e.code}`;
    // 배정된 방향키·스페이스가 페이지를 스크롤하지 않게
    if (this.reverse.has(code)) e.preventDefault();
    this.feedRaw(code, e.type === 'keydown', e.timeStamp);
  };

  private poll = (): void => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.poll);
    this.pollOnce();
  };

  /** 게임패드 상태를 한 번 읽어 바뀐 것만 넘긴다 */
  pollOnce(now = performance.now()): void {
    for (const g of navigator.getGamepads?.() ?? []) {
      if (!g) continue;
      const prev = this.padState.get(g.index)
        ?? { buttons: [], axes: [], hats: new Set<number>(), hatDirs: new Set<string>() };
      // 햇 스위치 축 찾기: 범위 밖 값(놓은 상태)이 한 번이라도 보이면 햇으로 본다.
      // 표준 배치가 아닌 패드의 축 9는 처음부터 햇으로 본다 (레버를 민 채 연결해도 되게).
      if (g.mapping !== 'standard' && g.axes.length > HAT_AXIS_GUESS) prev.hats.add(HAT_AXIS_GUESS);
      g.axes.forEach((v, a) => { if (Math.abs(v) > HAT_REST) prev.hats.add(a); });

      const buttons = g.buttons.map((b) => b.pressed);
      buttons.forEach((p, b) => { if (p !== !!prev.buttons[b]) this.feedRaw(`gp:${g.index}:b${b}`, p, now); });
      const axes = g.axes.map((v, a) => (prev.hats.has(a) ? 0 : v > AXIS_ON ? 1 : v < -AXIS_ON ? -1 : 0));
      axes.forEach((v, a) => {
        const old = prev.axes[a] ?? 0;
        if (v === old) return;
        if (old) this.feedRaw(`gp:${g.index}:a${a}${old > 0 ? '+' : '-'}`, false, now);
        if (v) this.feedRaw(`gp:${g.index}:a${a}${v > 0 ? '+' : '-'}`, true, now);
      });
      const dirs = new Set<string>();
      prev.hats.forEach((a) => hatDirs(g.axes[a]).forEach((d) => dirs.add(d)));
      prev.hatDirs.forEach((d) => { if (!dirs.has(d)) this.feedRaw(`gp:${g.index}:h${d}`, false, now); });
      dirs.forEach((d) => { if (!prev.hatDirs.has(d)) this.feedRaw(`gp:${g.index}:h${d}`, true, now); });
      this.padState.set(g.index, { buttons, axes, hats: prev.hats, hatDirs: dirs });
    }
  }

  /**
   * 날것 입력 하나를 넣는다. 장치 이벤트가 부르며,
   * 테스트할 때는 가짜 입력을 직접 넣어 게임을 모의 플레이할 수 있다.
   */
  feedRaw(code: string, down: boolean, time = performance.now()): void {
    if (down === this.rawHeld.has(code)) return; // 같은 상태 반복은 무시
    if (down) this.rawHeld.add(code); else this.rawHeld.delete(code);
    this.emit('raw', { code, label: rawLabel(code), down, time });
    for (const { player, control } of this.reverse.get(code) ?? []) {
      // 같은 조작에 코드가 여러 개(축 + 십자키)면 첫 눌림·마지막 뗌만 알린다
      const others = this.map![player][control].some((c) => c !== code && this.rawHeld.has(c));
      if (others) continue;
      if (down) this.pressTime[player].set(control, time);
      this.emit('input', { player, control, down, time });
    }
  }

  /** 테스트용: 배정된 조작을 직접 누르고 뗀다 */
  feed(player: Player, control: ArcadeControl, down: boolean, time = performance.now()): void {
    const code = this.map?.[player][control][0];
    if (code) this.feedRaw(code, down, time);
  }
}
