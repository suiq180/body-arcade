// 🕹️ 아케이드 스틱 준비 화면 (기획서 5.3 방식)
// 장치 확인 → 버튼 배정(키보드 기본 / 게임패드 기본 / 직접 배정: P1 레버 ↑ → … → P2 START 순서로 한 번씩) → 눌러 보기
// 배정은 브라우저에 저장되어 다음부터는 바로 시작할 수 있다. 화면을 나가면 입력 감시를 멈춘다.

import {
  ArcadeAdapter, CONTROLS, CONTROL_LABEL, gamepadMap, keyboardMap, mapComplete, rawLabel,
  type ArcadeControl, type ArcadeMap, type Player,
} from '../input/arcade';
import { ARCADE_COLORS, mountArcadePanel } from '../shared/arcade-panel';
import { escapeHtml } from '../shared/html';

export interface ArcadeSetupOptions {
  gameTitle?: string;
  /** 패널 제목 (예: ['P1 · 왼다리', 'P2 · 오른다리']) */
  roleNames?: [string, string];
  onStart?: (adapter: ArcadeAdapter) => void;
  backHref: string;
}

/** 키보드 기본 배정 설명 (화면 표시용) */
const KEYBOARD_HELP = 'P1: W·A·S·D + F·G·H·R·T·Y, START 1 / P2: 방향키 + J·K·L·U·I·O, START 2';

export function mountArcadeSetup(root: HTMLElement, opts: ArcadeSetupOptions): () => void {
  const testMode = !opts.onStart;
  const names = opts.roleNames ?? ['P1', 'P2'];
  root.innerHTML = `
    <div class="setup">
      <header class="setup-top"><div class="container setup-top-inner">
        <a class="back" href="${opts.backHref}">← ${testMode ? '허브로' : '나가기'}</a>
        <span class="setup-crumb">장치 준비${opts.gameTitle ? ` · ${escapeHtml(opts.gameTitle)}` : ' · 아케이드 스틱 테스트'}</span>
      </div></header>
      <div class="container setup-wrap">
        <div class="setup-title">
          <h1>🕹️ 아케이드 스틱 준비</h1>
          <p class="muted">2인용 스틱을 USB로 연결하세요. 게임패드로 잡히든 키보드로 잡히든 <b>버튼을 한 번씩 눌러 배정</b>하면 돼요. 스틱이 없으면 게임패드 2개나 키보드 하나로도 할 수 있어요.</p>
        </div>
        <div class="setup-body">
          <div class="ac-stage">
            <div class="ac-panels"><div data-el="p0"></div><div data-el="p1"></div></div>
            <div class="ac-prompt" data-el="prompt" hidden></div>
          </div>
          <aside class="setup-panel">
            <ol class="steps">
              <li data-step="device"><span class="step-dot"></span><div><b>장치 확인</b><small data-el="devText"></small></div></li>
              <li data-step="map"><span class="step-dot"></span><div class="step-main"><b>버튼 배정</b><small data-el="mapText"></small>
                <div class="rs-row ac-map-btns">
                  <button type="button" class="btn ghost small" data-act="assign">직접 배정</button>
                  <button type="button" class="btn ghost small" data-act="pads" hidden>게임패드 2개 기본</button>
                  <button type="button" class="btn ghost small" data-act="keyboard">키보드 기본</button>
                </div></div></li>
              <li data-step="test"><span class="step-dot"></span><div><b>눌러 보기</b><small>두 사람 모두 레버와 버튼 1을 눌러 보세요. 왼쪽 표시가 켜지면 OK</small></div></li>
            </ol>
            <button type="button" class="btn primary start-btn" data-el="startBtn" disabled>${testMode ? '준비 완료' : '게임 시작'}</button>
            <p class="small muted" data-el="startHint">버튼 배정이 끝나면 버튼이 켜져요.</p>
          </aside>
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const step = (n: string) => $(`[data-step="${n}"]`);
  const prompt = $('[data-el="prompt"]');
  const startBtn = $<HTMLButtonElement>('[data-el="startBtn"]');
  const adapter = new ArcadeAdapter();
  adapter.start();
  const panels = ([0, 1] as Player[]).map((p) =>
    mountArcadePanel($(`[data-el="p${p}"]`), adapter, p, { title: names[p], color: ARCADE_COLORS[p] }));
  const tested: [Set<string>, Set<string>] = [new Set(), new Set()];
  let assign: { order: { player: Player; control: ArcadeControl }[]; i: number; map: ArcadeMap; used: Set<string> } | null = null;
  let handedOff = false;
  let raf = 0;

  function refresh(): void {
    const pads = adapter.pads;
    $('[data-el="devText"]').textContent = pads.length
      ? `게임패드 ${pads.length}개: ${pads.map((p) => p.id.replace(/\(.*?\)/g, '').trim()).join(', ')}`
      : '게임패드가 안 보여요. 키보드로 잡히는 스틱이거나, 아무 버튼이나 한 번 눌러야 보이는 기기일 수 있어요.';
    step('device').className = 'done';
    $('[data-act="pads"]').hidden = pads.length < 2;
    const ok = mapComplete(adapter.map);
    step('map').className = assign ? 'active' : ok ? 'done' : 'active';
    $('[data-el="mapText"]').textContent = assign ? '배정 중…' : ok ? `저장된 배정을 써요 (${describe(adapter.map!)})` : '아직 배정 전이에요';
    const bothTested = tested.every((s) => s.has('lever') && s.has('b1'));
    step('test').className = !ok ? '' : bothTested ? 'done' : 'active';
    startBtn.disabled = !ok || !!assign;
    $('[data-el="startHint"]').textContent = !ok ? '버튼 배정이 끝나면 버튼이 켜져요.'
      : bothTested ? '준비됐어요!' : '두 사람 모두 눌러 보면 좋아요 (건너뛰어도 돼요).';
  }

  function describe(map: ArcadeMap): string {
    const all = map.flatMap((r) => CONTROLS.flatMap((c) => r[c]));
    if (all.every((c) => c.startsWith('key:'))) return '키보드';
    if (all.every((c) => c.startsWith('gp:'))) return '게임패드';
    return '키보드 + 게임패드';
  }

  // ── 직접 배정: P1 11개 → P2 11개 순서로 날것 입력을 하나씩 받는다 ──
  function startAssign(): void {
    assign = {
      order: ([0, 1] as Player[]).flatMap((player) => CONTROLS.map((control) => ({ player, control }))),
      i: 0,
      map: [Object.fromEntries(CONTROLS.map((c) => [c, []])), Object.fromEntries(CONTROLS.map((c) => [c, []]))] as unknown as ArcadeMap,
      used: new Set(),
    };
    showPrompt();
    refresh();
  }

  function showPrompt(): void {
    if (!assign) { prompt.hidden = true; return; }
    const { player, control } = assign.order[assign.i];
    prompt.hidden = false;
    prompt.style.setProperty('--pc', ARCADE_COLORS[player]);
    prompt.innerHTML = `<small>${assign.i + 1} / ${assign.order.length}</small>
      <b><span>${escapeHtml(names[player])}</span> ${control === 'start' ? 'START 버튼을 눌러' : control.startsWith('b') ? `${CONTROL_LABEL[control]}을 눌러` : `${CONTROL_LABEL[control]}로 밀어`} 주세요</b>
      <div class="rs-row"><button type="button" class="btn ghost small" data-act="skip">이 칸 건너뛰기</button><button type="button" class="btn ghost small" data-act="cancel">취소</button></div>`;
  }

  function nextAssign(): void {
    if (!assign) return;
    assign.i++;
    if (assign.i < assign.order.length) { showPrompt(); return; }
    // 건너뛴 칸이 있으면 키보드 기본값으로 채운다
    const kb = keyboardMap();
    assign.map.forEach((r, p) => CONTROLS.forEach((c) => { if (!r[c].length) r[c] = kb[p][c]; }));
    adapter.setMap(assign.map);
    assign = null;
    showPrompt();
    refresh();
  }

  const offRaw = adapter.on('raw', (r) => {
    if (!assign || !r.down || assign.used.has(r.code)) return;
    const { player, control } = assign.order[assign.i];
    assign.map[player][control] = [r.code];
    assign.used.add(r.code);
    prompt.querySelector('b')!.insertAdjacentHTML('afterend', `<em>${escapeHtml(rawLabel(r.code))}</em>`);
    window.setTimeout(nextAssign, 180);
  });

  const offInput = adapter.on('input', (e) => {
    if (!e.down || assign) return;
    tested[e.player].add(['up', 'down', 'left', 'right'].includes(e.control) ? 'lever' : e.control);
    refresh();
  });
  const offDevices = adapter.on('devices', refresh);

  const onClick = (e: Event) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'assign') startAssign();
    else if (act === 'keyboard') { adapter.setMap(keyboardMap()); refresh(); prompt.hidden = false; prompt.innerHTML = `<small>키보드 기본 배정</small><b>${KEYBOARD_HELP}</b>`; window.setTimeout(() => { if (!assign) prompt.hidden = true; }, 4000); }
    else if (act === 'pads') { const p = adapter.pads; adapter.setMap(gamepadMap([p[0].index, p[1].index])); refresh(); }
    else if (act === 'skip') nextAssign();
    else if (act === 'cancel') { assign = null; showPrompt(); refresh(); }
  };
  root.addEventListener('click', onClick);
  startBtn.addEventListener('click', () => {
    if (opts.onStart) { handedOff = true; detach(); opts.onStart(adapter); }
    else location.hash = opts.backHref;
  });

  const draw = () => { raf = requestAnimationFrame(draw); panels.forEach((u) => u()); };
  raf = requestAnimationFrame(draw);
  refresh();
  (window as unknown as { __arcadeSetup?: ArcadeAdapter }).__arcadeSetup = adapter;

  function detach(): void {
    cancelAnimationFrame(raf);
    offRaw(); offInput(); offDevices();
    root.removeEventListener('click', onClick);
  }

  return () => {
    detach();
    if (!handedOff) adapter.stop();
  };
}
