// 📷 카메라 사물 인식 준비 화면 (기획서 5.3)
// 권한 요청 → 인식 모델 불러오기 → 빈 화면 기록(보정) → 거울 미리보기 + 칸별 인식 상자 → 물건을 보여 주면 하나씩 체크
// 빈 화면까지 기록하면 시작 버튼이 켜진다 (물건 테스트는 권장). 화면을 나가면 카메라가 꺼진다.

import { CameraObjectAdapter, type CameraObjectOptions, type ObjectFrame } from '../input/camera-object';
import type { CameraStatus } from '../input/camera-pose';
import { escapeHtml } from '../shared/html';
import { drawZones } from '../shared/object-draw';
import { fitCanvas } from '../shared/pose-draw';

export interface ObjectSetupItem { label: string; emoji: string }

/** 물건이 아닌 라벨(예: 모델의 '배경')을 보여 줄 이름 */
const EMPTY_TEXT = '⬜ 빈 상자';

export interface ObjectSetupOptions {
  gameTitle?: string;
  /** 칸 개수 (= 플레이어 수) */
  players: number;
  /** 테스트할 물건 (모델 라벨 이름 + 이모지) */
  items: ObjectSetupItem[];
  colors: string[];
  /** 물건 테스트에서 '알아봤다'로 칠 확률 */
  seenProb: number;
  /** 빈 화면 유사도가 이 값 이상이면 빈 상자 */
  emptyThreshold: number;
  /** 빈 화면 기록 시간 (ms), 기록 전 비켜설 시간 (ms) */
  emptyRecordMs: number;
  emptyCountdownMs: number;
  adapterOptions?: Partial<CameraObjectOptions>;
  onStart?: (adapter: CameraObjectAdapter) => void;
  backHref: string;
}

/** 게임이 GameModule.objectSetup으로 넘기는 설정 (인원·제목·콜백은 play.ts가 채운다) */
export type ObjectSetupConfig = Pick<ObjectSetupOptions,
  'items' | 'colors' | 'seenProb' | 'emptyThreshold' | 'emptyRecordMs' | 'emptyCountdownMs' | 'adapterOptions'>;

export function mountObjectSetup(root: HTMLElement, opts: ObjectSetupOptions): () => void {
  const testMode = !opts.onStart;
  root.innerHTML = `
    <div class="setup">
      <header class="setup-top">
        <div class="container setup-top-inner">
          <a class="back" href="${opts.backHref}">← ${testMode ? '허브로' : '나가기'}</a>
          <span class="setup-crumb">장치 준비${opts.gameTitle ? ` · ${escapeHtml(opts.gameTitle)}` : ' · 물건 인식 테스트'}</span>
        </div>
      </header>
      <div class="container setup-wrap">
        <div class="setup-title">
          <h1>📦 물건 인식 준비</h1>
          <p class="muted">화면이 <b>${opts.players}칸</b>으로 나뉘어요. 자기 칸의 <b>네모 상자</b>에 물건을 가까이 보여 주면 인식해요.</p>
        </div>
        <div class="setup-body">
          <div class="stage">
            <div class="stage-video-slot" data-el="videoSlot"></div>
            <canvas class="stage-canvas"></canvas>
            <div class="stage-overlay" data-el="overlay"></div>
          </div>
          <aside class="setup-panel">
            <ol class="steps">
              <li data-step="camera"><span class="step-dot"></span><div class="step-main"><b>카메라 연결</b><small data-el="camText">아직 연결 전이에요</small>
                <select class="cam-select" data-el="camSelect" aria-label="사용할 카메라" hidden></select></div></li>
              <li data-step="model"><span class="step-dot"></span><div><b>물건 인식 모델</b><small data-el="modelText">카메라를 켜면 불러와요</small></div></li>
              <li data-step="empty"><span class="step-dot"></span><div class="step-main"><b>빈 화면 기록</b><small data-el="emptyText">모두 화면 밖으로 비켜선 뒤 눌러 주세요</small>
                <button type="button" class="btn ghost" data-act="record-empty" disabled>빈 화면 기록</button>
                <small class="muted" data-el="simText"></small></div></li>
              <li data-step="items"><span class="step-dot"></span><div><b>물건 테스트</b><small>아무 칸에나 보여 주면 하나씩 체크돼요 (권장). 옆 숫자는 칸 중 가장 높은 지금 확률</small></div></li>
            </ol>
            <ul class="action-grid">
              ${opts.items.map((it) => `<li data-item="${escapeHtml(it.label)}">${it.emoji} ${escapeHtml(it.label)} <b class="item-pct" data-pct="${escapeHtml(it.label)}"></b></li>`).join('')}
            </ul>
            <button type="button" class="btn primary start-btn" data-el="startBtn" disabled>${testMode ? '준비 완료' : '게임 시작'}</button>
            <p class="small muted" data-el="startHint">빈 화면까지 기록하면 버튼이 켜져요.</p>
          </aside>
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const canvas = $<HTMLCanvasElement>('.stage-canvas');
  const ctx = canvas.getContext('2d')!;
  const overlay = $('[data-el="overlay"]');
  const camText = $('[data-el="camText"]');
  const modelText = $('[data-el="modelText"]');
  const startBtn = $<HTMLButtonElement>('[data-el="startBtn"]');
  const startHint = $('[data-el="startHint"]');
  const stage = $('.stage');
  const camSelect = $<HTMLSelectElement>('[data-el="camSelect"]');
  const step = (name: string) => $(`[data-step="${name}"]`);
  const emptyText = $('[data-el="emptyText"]');
  const simText = $('[data-el="simText"]');
  const recordBtn = $<HTMLButtonElement>('[data-act="record-empty"]');

  const adapter = new CameraObjectAdapter(opts.adapterOptions);
  adapter.setZones(opts.players);
  adapter.emptyThreshold = opts.emptyThreshold;
  let recordingEmpty = false;
  let countdownTimer = 0;
  adapter.video.className = 'stage-video';
  $('[data-el="videoSlot"]').appendChild(adapter.video);
  const seen = new Set<string>();
  let handedOff = false;
  const labelText = (i: number) => {
    const name = adapter.labels[i] ?? '?';
    const item = opts.items.find((it) => it.label === name);
    return item ? `${item.emoji} ${name}` : EMPTY_TEXT;
  };

  function showOverlay(html: string): void {
    overlay.innerHTML = html;
    overlay.hidden = !html;
  }
  showOverlay(`<div class="overlay-box">
    <p>카메라를 켜면 화면이 ${opts.players}칸으로 나뉘고,<br>칸마다 보여 준 물건을 알아봐요.</p>
    <button type="button" class="btn primary" data-act="start-camera">카메라 켜기</button>
    <p class="small">영상은 이 컴퓨터 안에서만 처리되고 저장되지 않아요.</p>
  </div>`);

  const offStatus = adapter.on('status', (s: CameraStatus) => {
    step('camera').className = s.state === 'running' || s.state === 'loading' ? 'done' : s.state === 'error' ? 'fail' : s.state === 'idle' ? '' : 'active';
    step('model').className = s.state === 'running' ? 'done' : s.state === 'loading' ? 'active' : s.state === 'error' && s.kind === 'model' ? 'fail' : '';
    switch (s.state) {
      case 'requesting':
        camText.textContent = '카메라 권한을 허용해 주세요';
        showOverlay('<div class="overlay-box"><div class="spinner"></div><p>브라우저 위쪽의 <b>카메라 권한 요청</b>에서 "허용"을 눌러 주세요.</p></div>');
        break;
      case 'loading':
        camText.textContent = '연결됨';
        modelText.textContent = '불러오는 중…';
        showOverlay('<div class="overlay-box"><div class="spinner"></div><p>물건 인식 모델을 불러오는 중이에요…</p></div>');
        break;
      case 'running':
        camText.textContent = '연결됨';
        modelText.textContent = `준비됨 (물건 ${adapter.labels.length}종)`;
        showOverlay('');
        void fillCameraList();
        matchStageToVideo();
        updateEmptyUI();
        break;
      case 'error':
        camText.textContent = s.kind === 'model' ? '연결됨' : '연결 실패';
        if (s.kind === 'model') modelText.textContent = '불러오기 실패';
        startBtn.disabled = true;
        recordBtn.disabled = true;
        showOverlay(`<div class="overlay-box error">
          <p class="overlay-title">⚠️ ${s.kind === 'model' ? '인식 모델을 불러오지 못했어요' : '카메라를 켜지 못했어요'}</p>
          <p>${escapeHtml(s.message)}</p>
          <button type="button" class="btn primary" data-act="start-camera">다시 시도</button>
        </div>`);
        break;
      case 'idle':
        break;
    }
  });

  const offFrame = adapter.on('frame', (f: ObjectFrame) => {
    for (const z of f.zones) {
      if (z.empty) continue;
      const name = adapter.labels[z.top];
      if (z.topProb < opts.seenProb || !name || seen.has(name) || !opts.items.some((it) => it.label === name)) continue;
      seen.add(name);
      root.querySelector(`[data-item="${CSS.escape(name)}"]`)?.classList.add('seen');
    }
    // 물건별 지금 확률 (칸 중 최대) — 인식이 안 되는 물건을 바로 알 수 있게
    for (const it of opts.items) {
      const idx = adapter.labels.indexOf(it.label);
      const el = root.querySelector(`[data-pct="${CSS.escape(it.label)}"]`);
      if (!el) continue;
      el.textContent = idx < 0 ? '모델에 없음' : `${Math.round(Math.max(0, ...f.zones.map((z) => (z.empty ? 0 : z.probs[idx] ?? 0))) * 100)}%`;
    }
    step('items').className = seen.size >= opts.items.length ? 'done' : 'active';
    // 칸별 빈 화면 유사도 — 기준값(emptyThreshold) 조정용
    simText.textContent = f.zones.some((z) => z.emptySim !== null)
      ? `빈 화면 유사도 ${f.zones.map((z, i) => `P${i + 1} ${z.emptySim === null ? '—' : Math.round(z.emptySim * 100) + '%'}`).join(' · ')} (기준 ${Math.round(opts.emptyThreshold * 100)}%)`
      : '';
  });

  /** 빈 화면 기록 상태에 맞춰 단계·버튼 표시 */
  function updateEmptyUI(): void {
    const running = adapter.status.state === 'running';
    const can = adapter.canCalibrate;
    const ok = adapter.emptyRecorded || (running && !can);
    recordBtn.disabled = !running || !can || recordingEmpty;
    recordBtn.textContent = adapter.emptyRecorded ? '다시 기록' : '빈 화면 기록';
    if (!recordingEmpty) {
      emptyText.textContent = !running ? '카메라와 모델이 준비되면 기록할 수 있어요'
        : !can ? '이 모델은 보정을 지원하지 않아 건너뛰어요'
        : adapter.emptyRecorded ? '기록됨 — 빈 칸은 "빈 상자 ✓"로 보여요. 장소·조명이 바뀌면 다시 기록하세요'
        : '모두 화면 밖으로 비켜선 뒤 눌러 주세요';
    }
    step('empty').className = ok ? 'done' : running ? 'active' : '';
    startBtn.disabled = !running || !ok || recordingEmpty;
    startHint.textContent = !running ? '카메라와 인식 모델이 준비되면 버튼이 켜져요.'
      : !ok ? '빈 화면을 기록하면 버튼이 켜져요.'
      : '물건을 하나씩 보여 주며 잘 인식되는지 확인해 보세요.';
  }

  /** 비켜설 시간을 준 뒤 빈 화면을 기록한다 */
  function startEmptyRecord(): void {
    if (recordingEmpty) return;
    recordingEmpty = true;
    adapter.clearEmpty();
    updateEmptyUI();
    const until = performance.now() + opts.emptyCountdownMs;
    const countdown = () => {
      const left = Math.ceil((until - performance.now()) / 1000);
      if (left > 0) {
        emptyText.textContent = `${left}초 뒤 기록해요 — 모두 화면 밖으로 비켜 주세요!`;
        countdownTimer = window.setTimeout(countdown, 200);
        return;
      }
      emptyText.textContent = '기록 중… 움직이지 마세요';
      void adapter.recordEmpty(opts.emptyRecordMs).then((ok) => {
        recordingEmpty = false;
        updateEmptyUI();
        if (!ok && adapter.status.state === 'running') emptyText.textContent = '기록하지 못했어요. 다시 눌러 주세요';
      });
    };
    countdown();
  }

  // 인식 결과는 120ms마다 오지만 그리기는 매 프레임 (창 크기 변화에도 바로 맞춤)
  let raf = 0;
  const draw = () => {
    raf = requestAnimationFrame(draw);
    const rect = fitCanvas(canvas, adapter.video);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (adapter.status.state === 'running') drawZones(ctx, rect, adapter, { colors: opts.colors, labelText });
  };
  raf = requestAnimationFrame(draw);

  async function fillCameraList(): Promise<void> {
    const cams = await adapter.listCameras().catch(() => []);
    camSelect.innerHTML = cams.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('');
    camSelect.value = adapter.deviceId ?? '';
    camSelect.hidden = cams.length < 2;
  }
  camSelect.addEventListener('change', async () => {
    camText.textContent = '카메라 바꾸는 중…';
    await adapter.switchCamera(camSelect.value);
    adapter.clearEmpty(); // 다른 카메라 = 다른 화면 → 다시 기록
    updateEmptyUI();
    matchStageToVideo();
  });

  function matchStageToVideo(): void {
    const { videoWidth: w, videoHeight: h } = adapter.video;
    if (w && h) stage.style.aspectRatio = `${w} / ${h}`;
  }

  const onClick = (e: Event) => {
    if ((e.target as HTMLElement).closest('[data-act="start-camera"]')) void adapter.start();
    if ((e.target as HTMLElement).closest('[data-act="record-empty"]')) startEmptyRecord();
  };
  root.addEventListener('click', onClick);
  startBtn.addEventListener('click', () => {
    if (opts.onStart) { handedOff = true; detach(); opts.onStart(adapter); }
    else location.hash = opts.backHref;
  });
  const onPageHide = () => adapter.stop();
  window.addEventListener('pagehide', onPageHide);

  (window as unknown as { __objectSetup?: CameraObjectAdapter }).__objectSetup = adapter;

  function detach(): void {
    offStatus(); offFrame();
    cancelAnimationFrame(raf);
    clearTimeout(countdownTimer);
    root.removeEventListener('click', onClick);
    window.removeEventListener('pagehide', onPageHide);
  }

  return () => {
    detach();
    if (!handedOff) adapter.stop();
  };
}
