// 📷 카메라 손 추적 준비 화면 (기획서 5.3)
// 권한 요청 → 거울 미리보기 + 손 뼈대 → 손이 1초 동안 보이면 시작 버튼 활성화
// 손 펴기·집기·주먹을 해 보면 하나씩 체크된다. 화면을 나가면 카메라가 꺼진다.

import { CameraHandAdapter, type CameraHandOptions, type HandFrame } from '../input/camera-hand';
import type { CameraStatus } from '../input/camera-pose';
import { HAND_STATE_LABEL, type HandState } from '../input/hand-gestures';
import { HAND_STATE_COLORS, drawHand } from '../shared/hand-draw';
import { escapeHtml } from '../shared/html';
import { fitCanvas } from '../shared/pose-draw';

export interface HandSetupOptions {
  gameTitle?: string;
  /** 어댑터 설정 (게임의 config에서 넘긴다) */
  adapterOptions?: Partial<CameraHandOptions>;
  onStart?: (adapter: CameraHandAdapter) => void;
  backHref: string;
}

const READY_HOLD_MS = 1000;
/** 손 크기가 이보다 작으면 "카메라에 조금 더 가까이" 안내 */
const MIN_HAND_SIZE = 0.07;
const STATES: HandState[] = ['open', 'pinch', 'fist'];

export function mountHandSetup(root: HTMLElement, opts: HandSetupOptions): () => void {
  const testMode = !opts.onStart;
  root.innerHTML = `
    <div class="setup">
      <header class="setup-top">
        <div class="container setup-top-inner">
          <a class="back" href="${opts.backHref}">← ${testMode ? '허브로' : '나가기'}</a>
          <span class="setup-crumb">장치 준비${opts.gameTitle ? ` · ${escapeHtml(opts.gameTitle)}` : ' · 손 추적 테스트'}</span>
        </div>
      </header>
      <div class="container setup-wrap">
        <div class="setup-title">
          <h1>✋ 손 추적 준비</h1>
          <p class="muted">카메라에서 <b>50cm~1m</b> 떨어져 앉아, 한 손을 화면에 보여 주세요. 손이 여러 개 보이면 가장 큰 손만 써요.</p>
        </div>
        <div class="setup-body">
          <div class="stage">
            <div class="stage-video-slot" data-el="videoSlot"></div>
            <canvas class="stage-canvas"></canvas>
            <div class="stage-overlay" data-el="overlay"></div>
            <div class="stage-action" data-el="stateTag" hidden></div>
          </div>
          <aside class="setup-panel">
            <ol class="steps">
              <li data-step="camera"><span class="step-dot"></span><div class="step-main"><b>카메라 연결</b><small data-el="camText">아직 연결 전이에요</small>
                <select class="cam-select" data-el="camSelect" aria-label="사용할 카메라" hidden></select></div></li>
              <li data-step="hand"><span class="step-dot"></span><div><b>손 확인</b><small data-el="handText">손을 화면에 보여 주세요</small></div></li>
              <li data-step="gesture"><span class="step-dot"></span><div><b>손 모양 테스트</b><small>아래 모양을 해 보면 하나씩 체크돼요</small></div></li>
            </ol>
            <div class="now-action"><small>지금 손 모양</small><strong data-el="nowState">—</strong></div>
            <ul class="action-grid">
              ${STATES.map((s) => `<li data-state="${s}">${HAND_STATE_LABEL[s]}</li>`).join('')}
            </ul>
            <button type="button" class="btn primary start-btn" data-el="startBtn" disabled>${testMode ? '준비 완료' : '게임 시작'}</button>
            <p class="small muted" data-el="startHint">손이 보이면 버튼이 켜져요.</p>
          </aside>
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const canvas = $<HTMLCanvasElement>('.stage-canvas');
  const ctx = canvas.getContext('2d')!;
  const overlay = $('[data-el="overlay"]');
  const stateTag = $('[data-el="stateTag"]');
  const camText = $('[data-el="camText"]');
  const handText = $('[data-el="handText"]');
  const nowState = $('[data-el="nowState"]');
  const startBtn = $<HTMLButtonElement>('[data-el="startBtn"]');
  const startHint = $('[data-el="startHint"]');
  const stage = $('.stage');
  const camSelect = $<HTMLSelectElement>('[data-el="camSelect"]');
  const step = (name: string) => $(`[data-step="${name}"]`);

  const adapter = new CameraHandAdapter(opts.adapterOptions);
  adapter.video.className = 'stage-video';
  $('[data-el="videoSlot"]').appendChild(adapter.video);
  const seen = new Set<HandState>();
  let visibleSince = 0;
  let handedOff = false;

  function showOverlay(html: string): void {
    overlay.innerHTML = html;
    overlay.hidden = !html;
  }
  showOverlay(`<div class="overlay-box">
    <p>카메라를 켜면 내 손이 거울처럼 보이고,<br>손가락 관절 위치를 인식해요.</p>
    <button type="button" class="btn primary" data-act="start-camera">카메라 켜기</button>
    <p class="small">영상은 이 컴퓨터 안에서만 처리되고 저장되지 않아요.</p>
  </div>`);

  const offStatus = adapter.on('status', (s: CameraStatus) => {
    step('camera').className = s.state === 'running' ? 'done' : s.state === 'error' ? 'fail' : s.state === 'idle' ? '' : 'active';
    switch (s.state) {
      case 'requesting':
        camText.textContent = '카메라 권한을 허용해 주세요';
        showOverlay('<div class="overlay-box"><div class="spinner"></div><p>브라우저 위쪽의 <b>카메라 권한 요청</b>에서 "허용"을 눌러 주세요.</p></div>');
        break;
      case 'loading':
        camText.textContent = '손 인식 준비 중…';
        showOverlay('<div class="overlay-box"><div class="spinner"></div><p>손 인식 모델을 불러오는 중이에요…</p></div>');
        break;
      case 'running':
        camText.textContent = '연결됨';
        showOverlay('');
        void fillCameraList();
        matchStageToVideo();
        break;
      case 'error':
        camText.textContent = '연결 실패';
        showOverlay(`<div class="overlay-box error">
          <p class="overlay-title">⚠️ 카메라를 켜지 못했어요</p>
          <p>${escapeHtml(s.message)}</p>
          <button type="button" class="btn primary" data-act="start-camera">다시 시도</button>
        </div>`);
        break;
      case 'idle':
        break;
    }
  });

  const offFrame = adapter.on('frame', (f: HandFrame) => {
    const rect = fitCanvas(canvas, adapter.video);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (f.landmarks && f.state) drawHand(ctx, rect, f.landmarks, HAND_STATE_COLORS[f.state], 4);
    const near = f.present && f.size >= MIN_HAND_SIZE;
    step('hand').className = near ? 'done' : 'active';
    handText.textContent = !f.present ? '손을 화면에 보여 주세요' : near ? '손이 잘 보여요' : '손이 너무 작아요. 카메라에 조금 더 가까이';
    if (near) { visibleSince ||= f.time; } else { visibleSince = 0; }
    const ready = near && f.time - visibleSince >= READY_HOLD_MS;
    startBtn.disabled = !ready;
    startHint.textContent = !f.present ? '손이 보이지 않아요.' : !near ? '카메라에 조금 더 가까이 와 주세요.' : ready ? '준비됐어요!' : '잠시 그대로 있어 주세요…';
  });

  const offState = adapter.on('state', (s) => {
    nowState.textContent = s ? HAND_STATE_LABEL[s] : '—';
    stateTag.hidden = !s;
    stateTag.textContent = s ? HAND_STATE_LABEL[s] : '';
    if (s && !seen.has(s)) {
      seen.add(s);
      root.querySelector(`[data-state="${s}"]`)?.classList.add('seen');
      step('gesture').className = seen.size === STATES.length ? 'done' : 'active';
    }
  });

  async function fillCameraList(): Promise<void> {
    const cams = await adapter.listCameras().catch(() => []);
    camSelect.innerHTML = cams.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('');
    camSelect.value = adapter.deviceId ?? '';
    camSelect.hidden = cams.length < 2;
  }
  camSelect.addEventListener('change', async () => {
    camText.textContent = '카메라 바꾸는 중…';
    await adapter.switchCamera(camSelect.value);
    matchStageToVideo();
  });

  function matchStageToVideo(): void {
    const { videoWidth: w, videoHeight: h } = adapter.video;
    if (w && h) stage.style.aspectRatio = `${w} / ${h}`;
    fitCanvas(canvas, adapter.video);
  }

  const onClick = (e: Event) => {
    if ((e.target as HTMLElement).closest('[data-act="start-camera"]')) void adapter.start();
  };
  root.addEventListener('click', onClick);
  startBtn.addEventListener('click', () => {
    if (opts.onStart) { handedOff = true; detach(); opts.onStart(adapter); }
    else location.hash = opts.backHref;
  });
  const onResize = () => fitCanvas(canvas, adapter.video);
  window.addEventListener('resize', onResize);
  const onPageHide = () => adapter.stop();
  window.addEventListener('pagehide', onPageHide);

  (window as unknown as { __handSetup?: CameraHandAdapter }).__handSetup = adapter;

  function detach(): void {
    offStatus(); offFrame(); offState();
    root.removeEventListener('click', onClick);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onPageHide);
  }

  return () => {
    detach();
    if (!handedOff) adapter.stop();
  };
}
