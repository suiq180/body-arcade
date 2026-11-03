// 🎤 마이크 장치 준비 화면 (기획서 5.3)
// 권한 요청 → 주변 소음 측정 → 음량·음높이 그래프 → "소리를 내 보세요" → 개인 음역 보정(선택) → 단어 인식 확인(선택)
// 화면을 나가면 마이크가 꺼진다. 게임으로 넘기면 마이크는 게임이 이어서 쓴다.

import { MicAdapter, midiName, type MicFrame, type MicStatus } from '../input/mic';
import { escapeHtml } from '../shared/html';
import { MicGraph } from '../shared/mic-graph';

export interface MicSetupOptions {
  gameTitle?: string;
  onStart?: (mic: MicAdapter) => void;
  backHref: string;
}

const NOISE_MS = 2000;
/** 소음보다 이만큼 크면 "소리 나는 중" */
const ACTIVE_DB = 8;
const SOUND_TEST_MS = 500;
const RANGE_MS = 2500;

export function mountMicSetup(root: HTMLElement, opts: MicSetupOptions): () => void {
  const testMode = !opts.onStart;
  root.innerHTML = `
    <div class="setup">
      <header class="setup-top"><div class="container setup-top-inner">
        <a class="back" href="${opts.backHref}">← ${testMode ? '허브로' : '나가기'}</a>
        <span class="setup-crumb">장치 준비${opts.gameTitle ? ` · ${escapeHtml(opts.gameTitle)}` : ' · 마이크 테스트'}</span>
      </div></header>
      <div class="container setup-wrap">
        <div class="setup-title">
          <h1>🎤 마이크 준비</h1>
          <p class="muted">게임 소리가 마이크로 다시 들어가지 않게 <b>이어폰</b>을 쓰면 더 잘 돼요.</p>
        </div>
        <div class="setup-body">
          <div class="mic-stage">
            <canvas class="mic-graph" data-el="graph"></canvas>
            <div class="mic-now"><span>음량 <b data-el="db">—</b></span><span>음높이 <b data-el="pitch">—</b></span></div>
            <div class="stage-overlay" data-el="overlay"></div>
          </div>
          <aside class="setup-panel">
            <ol class="steps">
              <li data-step="mic"><span class="step-dot"></span><div class="step-main"><b>마이크 연결</b><small data-el="micText">아직 연결 전이에요</small></div></li>
              <li data-step="noise"><span class="step-dot"></span><div><b>주변 소음 측정</b><small data-el="noiseText">연결하면 2초 동안 조용히 해 주세요</small></div></li>
              <li data-step="sound"><span class="step-dot"></span><div><b>소리 내 보기</b><small>"아~" 하고 소리를 내 보세요</small></div></li>
              <li data-step="range"><span class="step-dot"></span><div><b>내 음역 보정 (선택)</b><small data-el="rangeText"></small>
                <div class="rs-row"><button type="button" class="btn ghost small" data-act="low">가장 낮은 소리</button><button type="button" class="btn ghost small" data-act="high">가장 높은 소리</button></div></div></li>
              <li data-step="word"><span class="step-dot"></span><div><b>단어 인식 (선택)</b><small data-el="wordText"></small></div></li>
            </ol>
            <button type="button" class="btn primary start-btn" data-el="startBtn" disabled>${testMode ? '준비 완료' : '게임 시작'}</button>
            <p class="small muted" data-el="startHint">소음 측정과 소리 테스트가 끝나면 버튼이 켜져요.</p>
          </aside>
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const step = (n: string) => $(`[data-step="${n}"]`);
  const overlay = $('[data-el="overlay"]');
  const startBtn = $<HTMLButtonElement>('[data-el="startBtn"]');
  const mic = new MicAdapter();
  const graph = new MicGraph($<HTMLCanvasElement>('[data-el="graph"]'));
  let handedOff = false;
  let noiseSamples: number[] | null = null;
  let noiseUntil = 0;
  let noiseDone = false;
  let soundMs = 0;
  let soundDone = false;
  let rangeRec: { kind: 'low' | 'high'; until: number; pitches: number[] } | null = null;

  const showOverlay = (html: string) => { overlay.innerHTML = html; overlay.hidden = !html; };
  showOverlay(`<div class="overlay-box"><p>마이크를 켜면 소리의 크기와 높이를 그래프로 보여 줘요.</p>
    <button type="button" class="btn primary" data-act="start-mic">마이크 켜기</button>
    <p class="small">소리는 이 컴퓨터 안에서만 처리되고 저장되지 않아요.</p></div>`);
  renderRange();
  $('[data-el="wordText"]').textContent = mic.supportsSpeech ? '게임에서 "점화!" 같은 단어를 말해요' : '이 브라우저는 음성 인식이 안 돼요 → 단어 미션은 "소리 길이" 미션으로 바뀌어요';
  step('word').className = mic.supportsSpeech ? 'done' : '';

  const offStatus = mic.on('status', (s: MicStatus) => {
    step('mic').className = s.state === 'running' ? 'done' : s.state === 'error' ? 'fail' : s.state === 'idle' ? '' : 'active';
    if (s.state === 'requesting') {
      $('[data-el="micText"]').textContent = '마이크 권한을 허용해 주세요';
      showOverlay('<div class="overlay-box"><div class="spinner"></div><p>브라우저 위쪽의 <b>마이크 권한 요청</b>에서 "허용"을 눌러 주세요.</p></div>');
    } else if (s.state === 'running') {
      $('[data-el="micText"]').textContent = '연결됨';
      showOverlay('');
      noiseSamples = []; noiseUntil = performance.now() + NOISE_MS;
      step('noise').className = 'active';
      $('[data-el="noiseText"]').textContent = '2초 동안 조용히 해 주세요…';
    } else if (s.state === 'error') {
      $('[data-el="micText"]').textContent = '연결 실패';
      showOverlay(`<div class="overlay-box error"><p class="overlay-title">⚠️ 마이크를 켜지 못했어요</p><p>${escapeHtml(s.message)}</p>
        <button type="button" class="btn primary" data-act="start-mic">다시 시도</button></div>`);
    }
  });

  let lastT = 0;
  const offFrame = mic.on('frame', (f: MicFrame) => {
    const dt = lastT ? Math.min(100, f.time - lastT) : 0;
    lastT = f.time;
    graph.push(f);
    graph.draw(mic.range, { lines: [{ level: ACTIVE_DB / 40, color: '#69db7c', label: '소리 인식' }] });
    $('[data-el="db"]').textContent = `${Math.round(f.db)} dB`;
    $('[data-el="pitch"]').textContent = f.pitch === null ? '—' : midiName(f.pitch);
    if (noiseSamples) {
      noiseSamples.push(f.db);
      if (f.time >= noiseUntil) {
        const sorted = [...noiseSamples].sort((a, b) => a - b);
        mic.setNoise(sorted[Math.floor(sorted.length * 0.8)] ?? -60); // 가끔 튀는 소리는 빼고 대부분의 소음 수준
        noiseSamples = null; noiseDone = true;
        step('noise').className = 'done';
        step('sound').className = 'active';
        $('[data-el="noiseText"]').textContent = `소음 ${Math.round(mic.noiseDb)} dB`;
      }
      return;
    }
    if (!noiseDone) return;
    if (!soundDone) {
      soundMs = f.db > mic.noiseDb + ACTIVE_DB ? soundMs + dt : Math.max(0, soundMs - dt);
      if (soundMs >= SOUND_TEST_MS) { soundDone = true; step('sound').className = 'done'; }
    }
    if (rangeRec) {
      if (f.pitch !== null) rangeRec.pitches.push(f.pitch);
      if (f.time >= rangeRec.until) finishRange();
    }
    startBtn.disabled = !(noiseDone && soundDone);
    $('[data-el="startHint"]').textContent = startBtn.disabled ? '"아~" 하고 소리를 내 보세요.' : '준비됐어요!';
  });

  function renderRange(): void {
    $('[data-el="rangeText"]').textContent = `지금: ${midiName(mic.range.low)} ~ ${midiName(mic.range.high)} (높이 미션 목표가 이 안에서 나와요)`;
  }
  function finishRange(): void {
    if (!rangeRec) return;
    const p = [...rangeRec.pitches].sort((a, b) => a - b);
    if (p.length < 10) {
      $('[data-el="rangeText"]').textContent = '소리가 잘 안 잡혔어요. 다시 해 주세요.';
    } else {
      const v = rangeRec.kind === 'low' ? p[Math.floor(p.length * 0.2)] : p[Math.floor(p.length * 0.8)];
      const next = { ...mic.range, [rangeRec.kind]: Math.round(v) };
      if (next.high - next.low >= 5) mic.setRange(next);
      renderRange();
      step('range').className = 'done';
    }
    rangeRec = null;
  }

  const onClick = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'start-mic') void mic.start();
    if ((b.dataset.act === 'low' || b.dataset.act === 'high') && mic.status.state === 'running') {
      rangeRec = { kind: b.dataset.act, until: performance.now() + RANGE_MS, pitches: [] };
      step('range').className = 'active';
      $('[data-el="rangeText"]').textContent = `${b.dataset.act === 'low' ? '가장 낮은' : '가장 높은'} 소리로 "아~" 2초…`;
    }
  };
  root.addEventListener('click', onClick);
  startBtn.addEventListener('click', () => {
    if (opts.onStart) { handedOff = true; detach(); opts.onStart(mic); }
    else location.hash = opts.backHref;
  });
  const onPageHide = () => mic.stop();
  window.addEventListener('pagehide', onPageHide);
  (window as unknown as { __micSetup?: MicAdapter }).__micSetup = mic;

  function detach(): void {
    offStatus(); offFrame();
    root.removeEventListener('click', onClick);
    window.removeEventListener('pagehide', onPageHide);
  }
  return () => {
    detach();
    if (!handedOff) mic.stop();
  };
}
