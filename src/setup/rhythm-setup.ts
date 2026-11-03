// 🥁 리듬·악기 장치 준비 화면 (기획서 5.3)
// 장치 연결 확인(MIDI·게임패드·키보드) → 키 배정(역할마다 패드 치기) → 지연 보정(메트로놈에 맞춰 8번) → 시작
// 키보드는 늘 대체 입력으로 쓸 수 있어서, 장치가 없어도 시작할 수 있다.

import { RhythmInput, type RawHit, type RhythmRole } from '../input/midi';
import { medianOffset, toAudioTime } from '../rhythm/clock';
import { click } from '../rhythm/music';
import { escapeHtml } from '../shared/html';
import { audioCtx } from '../shared/sfx';

export interface RhythmSetupOptions {
  gameId: string;
  gameTitle?: string;
  roles: RhythmRole[];
  onStart?: (input: RhythmInput) => void;
  backHref: string;
}

const CAL_BPM = 90;
const CAL_COUNT_IN = 4;
const CAL_HITS = 8;

export function mountRhythmSetup(root: HTMLElement, opts: RhythmSetupOptions): () => void {
  const testMode = !opts.onStart;
  const input = new RhythmInput();
  input.setRoles(opts.gameId, opts.roles);

  root.innerHTML = `
    <div class="setup">
      <header class="setup-top"><div class="container setup-top-inner">
        <a class="back" href="${opts.backHref}">← ${testMode ? '허브로' : '나가기'}</a>
        <span class="setup-crumb">장치 준비${opts.gameTitle ? ` · ${escapeHtml(opts.gameTitle)}` : ' · 리듬 테스트'}</span>
      </div></header>
      <div class="container setup-wrap">
        <div class="setup-title">
          <h1>🥁 리듬·악기 준비</h1>
          <p class="muted">MIDI 드럼 패드·건반, 게임패드를 연결하세요. 장치가 없으면 <b>키보드</b>로 할 수 있어요 (Shift를 누르고 치면 세게 치기).</p>
        </div>
        <div class="rs-grid">
          <section class="rs-card">
            <h2>1. 장치 연결</h2>
            <ul class="rs-devices" data-el="devices"></ul>
          </section>
          <section class="rs-card">
            <h2>2. 키 배정</h2>
            <p class="small muted">"배정"을 누르고 쓸 패드·건반·버튼을 한 번 치세요. 키보드 기본 키는 그대로 함께 쓸 수 있어요.</p>
            <table class="rs-roles"><tbody data-el="roles"></tbody></table>
            <div class="rs-row">
              <button type="button" class="btn ghost small" data-act="assign-all">순서대로 모두 배정</button>
              <button type="button" class="btn ghost small" data-act="reset">장치 배정 지우기</button>
            </div>
          </section>
          <section class="rs-card">
            <h2>3. 지연 보정</h2>
            <p class="small muted">딸깍 소리 4번을 들은 뒤, 이어지는 <b>8번의 딸깍</b>에 맞춰 아무 패드나 치세요. 장치·스피커 지연을 재서 판정에 반영해요.</p>
            <div class="rs-cal">
              <div class="rs-beats" data-el="beats">${Array.from({ length: CAL_HITS }, () => '<i></i>').join('')}</div>
              <p data-el="calText">현재 보정값: <b>${input.offsetMs}ms</b>${input.hasSavedOffset ? '' : ' (아직 보정 안 함)'}</p>
              <button type="button" class="btn ghost" data-act="calibrate">보정 시작</button>
            </div>
          </section>
          <section class="rs-card">
            <h2>입력 테스트</h2>
            <div class="now-action"><small>마지막 입력</small><strong data-el="last">—</strong></div>
            <button type="button" class="btn primary start-btn" data-act="start">${testMode ? '준비 완료' : '게임 시작'}</button>
          </section>
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  let assigning: string[] = [];
  let calibrating: { clicks: number[]; hits: number[]; until: number } | null = null;
  let calTimer = 0;
  let handedOff = false;

  function renderDevices(): void {
    const midi = input.midiDevices, pads = input.gamepads;
    $('[data-el="devices"]').innerHTML = [
      input.midiSupported
        ? `<li class="${midi.length ? 'ok' : ''}">🎹 MIDI: ${midi.length ? midi.map(escapeHtml).join(', ') : input.midiError ? escapeHtml(input.midiError) : '연결된 장치 없음'}</li>`
        : '<li>🎹 MIDI: 이 브라우저에서는 사용할 수 없어요 (크롬·엣지에서 돼요)</li>',
      `<li class="${pads.length ? 'ok' : ''}">🎮 게임패드: ${pads.length ? pads.map(escapeHtml).join(', ') : '없음 (연결 후 버튼을 한 번 눌러 주세요)'}</li>`,
      '<li class="ok">⌨️ 키보드: 사용 가능</li>',
    ].join('');
  }

  function renderRoles(): void {
    $('[data-el="roles"]').innerHTML = opts.roles.map((r) => `
      <tr class="${assigning[0] === r.id ? 'waiting' : ''}" data-role="${r.id}">
        <th>${escapeHtml(r.label)}</th>
        <td>${assigning[0] === r.id ? '<b>패드를 치세요…</b>' : input.bindingsOf(r.id).map(escapeHtml).join(' · ')}</td>
        <td><button type="button" class="btn ghost small" data-act="assign" data-id="${r.id}">배정</button></td>
      </tr>`).join('');
  }

  const offDevices = input.on('devices', renderDevices);
  const offRaw = input.on('raw', (raw: RawHit) => {
    if (!raw.down) return;
    if (assigning.length) {
      input.assign(assigning.shift()!, raw);
      renderRoles();
      return;
    }
    if (calibrating) calibrating.hits.push(raw.time);
  });
  const offHit = input.on('hit', (h) => {
    const role = opts.roles.find((r) => r.id === h.role);
    $('[data-el="last"]').textContent = `${role?.label ?? h.role} · 세기 ${h.velocity}`;
  });

  function startCalibration(): void {
    const ctx = audioCtx();
    const beat = 60000 / CAL_BPM;
    const t0 = performance.now() + 600;
    const clicks: number[] = [];
    for (let i = 0; i < CAL_COUNT_IN + CAL_HITS; i++) {
      const t = t0 + i * beat;
      click(ctx, toAudioTime(ctx, t), i < CAL_COUNT_IN);
      if (i >= CAL_COUNT_IN) clicks.push(t);
    }
    calibrating = { clicks, hits: [], until: clicks[clicks.length - 1] + beat };
    $('[data-el="calText"]').textContent = '딸깍 4번 뒤부터 맞춰 치세요…';
    root.querySelectorAll('.rs-beats i').forEach((el) => el.className = '');
    clearInterval(calTimer);
    calTimer = window.setInterval(() => {
      if (!calibrating) return;
      const now = performance.now();
      calibrating.clicks.forEach((c, i) => {
        const el = root.querySelectorAll('.rs-beats i')[i];
        const got = calibrating!.hits.some((h) => Math.abs(h - c) < beat / 2);
        el.className = got ? 'hit' : now > c ? 'now' : '';
      });
      if (now < calibrating.until) return;
      clearInterval(calTimer);
      // 각 딸깍에 가장 가까운 입력 하나씩 (반 박 안쪽만)
      const diffs = calibrating.clicks.flatMap((c) => {
        const near = calibrating!.hits.filter((h) => Math.abs(h - c) < beat / 2).sort((a, b) => Math.abs(a - c) - Math.abs(b - c))[0];
        return near === undefined ? [] : [near - c];
      });
      calibrating = null;
      if (diffs.length < CAL_HITS / 2) {
        $('[data-el="calText"]').innerHTML = `입력이 ${diffs.length}번만 잡혔어요. 다시 해 주세요. (현재 보정값 <b>${input.offsetMs}ms</b>)`;
        return;
      }
      input.setOffset(medianOffset(diffs));
      $('[data-el="calText"]').innerHTML = `보정 완료! <b>${input.offsetMs}ms</b> (${diffs.length}/${CAL_HITS}번 인식) — 저장했어요.`;
    }, 50);
  }

  const onClick = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    (b as HTMLButtonElement).blur(); // 스페이스 키 입력이 버튼을 다시 누르지 않게
    switch (b.dataset.act) {
      case 'assign': assigning = [b.dataset.id!]; renderRoles(); break;
      case 'assign-all': assigning = opts.roles.map((r) => r.id); renderRoles(); break;
      case 'reset': assigning = []; input.resetAssignments(); renderRoles(); break;
      case 'calibrate': startCalibration(); break;
      case 'start':
        if (opts.onStart) { handedOff = true; detach(); opts.onStart(input); }
        else location.hash = opts.backHref;
        break;
    }
  };
  root.addEventListener('click', onClick);

  renderDevices();
  renderRoles();
  void input.start().then(renderDevices);
  (window as unknown as { __rhythmSetup?: RhythmInput }).__rhythmSetup = input;

  function detach(): void {
    clearInterval(calTimer);
    offDevices(); offRaw(); offHit();
    root.removeEventListener('click', onClick);
  }
  return () => {
    detach();
    if (!handedOff) input.stop();
  };
}
