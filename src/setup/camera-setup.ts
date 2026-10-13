// 📷 카메라 모션 장치 준비 화면 (기획서 5.3)
// 권한 요청 → 거울 미리보기 + 전신 뼈대 → 모든 플레이어의 어깨~무릎이 보이면 시작 버튼 활성화
// 화면을 나가면(정리 함수 호출) 카메라가 꺼진다. 게임으로 넘기면 카메라는 게임이 이어서 쓴다.

import { CONFIG } from '../games/body-rebel/config';
import { CameraPoseAdapter, type CameraStatus, type PoseFrame } from '../input/camera-pose';
import { LM, POSE_ACTIONS, actionLabel, type PoseAction } from '../input/pose-actions';
import { escapeHtml } from '../shared/html';
import { PLAYER_COLORS, drawButtons, drawCenterLine, drawSkeleton, fitCanvas } from '../shared/pose-draw';

export interface CameraSetupOptions {
  /** 준비가 끝나면 이어서 할 게임 제목. 없으면 장치 테스트 모드 */
  gameTitle?: string;
  /** 인원 (2인은 화면을 좌/우 반씩 나눔) */
  players?: 1 | 2;
  /** 시작 버튼을 눌렀을 때 (어댑터를 넘겨받아 게임이 계속 쓴다) */
  onStart?: (adapter: CameraPoseAdapter) => void;
  backHref: string;
}

/** 시작 버튼을 켜기 전에 전신이 계속 보여야 하는 시간 */
const READY_HOLD_MS = 1000;

const BODY_PARTS: { label: string; idx: number[] }[] = [
  { label: '어깨', idx: [LM.leftShoulder, LM.rightShoulder] },
  { label: '엉덩이', idx: [LM.leftHip, LM.rightHip] },
  { label: '무릎', idx: [LM.leftKnee, LM.rightKnee] },
];

export function mountCameraSetup(root: HTMLElement, opts: CameraSetupOptions): () => void {
  const testMode = !opts.onStart;
  const players = opts.players ?? 1;
  const bodyChips = players === 1
    ? BODY_PARTS.map((p) => `<span class="part" data-part="${p.label}">${p.label}</span>`).join('')
    : [0, 1].map((i) => `<span class="part" data-player="${i}" style="--pc:${PLAYER_COLORS[i]}">P${i + 1} ${i === 0 ? '왼쪽' : '오른쪽'}</span>`).join('');

  root.innerHTML = `
    <div class="setup">
      <header class="setup-top">
        <div class="container setup-top-inner">
          <a class="back" href="${opts.backHref}">← ${testMode ? '허브로' : '나가기'}</a>
          <span class="setup-crumb">장치 준비${opts.gameTitle ? ` · ${escapeHtml(opts.gameTitle)}` : ' · 테스트'}${players === 2 ? ' · 2인' : ''}</span>
        </div>
      </header>
      <div class="container setup-wrap">
        <div class="setup-title">
          <h1>📷 카메라 모션 준비</h1>
          <p class="muted">${players === 2
            ? '두 사람이 화면 <b>왼쪽(P1)과 오른쪽(P2)</b>에 나란히 서서, 각자 <b>어깨부터 무릎까지</b> 들어오게 해 주세요.'
            : '카메라에서 2~3m 떨어져 서서, <b>어깨부터 무릎까지</b> 화면에 들어오게 해 주세요.'}</p>
        </div>
        <div class="setup-body">
          <div class="stage">
            <div class="stage-video-slot" data-el="videoSlot"></div>
            <canvas class="stage-canvas"></canvas>
            <div class="stage-overlay" data-el="overlay"></div>
            <div class="stage-action" data-el="actionTag" hidden></div>
          </div>
          <aside class="setup-panel">
            <ol class="steps">
              <li data-step="camera"><span class="step-dot"></span><div class="step-main"><b>카메라 연결</b><small data-el="camText">아직 연결 전이에요</small>
                <select class="cam-select" data-el="camSelect" aria-label="사용할 카메라" hidden></select>
                <p class="cam-warn" data-el="camWarn" hidden>영상이 까맣게 나와요. 카메라 가리개가 닫혀 있거나, 다른 카메라(가상 카메라 등)가 선택됐을 수 있어요. 위에서 카메라를 바꿔 보세요.</p></div></li>
              <li data-step="body"><span class="step-dot"></span><div><b>전신 확인</b>
                <div class="parts">${bodyChips}</div></div></li>
              <li data-step="action"><span class="step-dot"></span><div><b>동작 테스트</b><small>아래 동작을 해 보면 하나씩 체크돼요 (선택)</small></div></li>
            </ol>
            <div class="now-action">
              <small>지금 인식된 동작</small>
              <strong data-el="nowAction">—</strong>
            </div>
            <ul class="action-grid">
              ${POSE_ACTIONS.map((a) => `<li data-action="${a.id}">${a.label}</li>`).join('')}
            </ul>
            <button type="button" class="btn primary start-btn" data-el="startBtn" disabled>
              ${testMode ? '준비 완료' : '게임 시작'}
            </button>
            <p class="small muted" data-el="startHint">전신이 보이면 버튼이 켜져요.</p>
          </aside>
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const canvas = $<HTMLCanvasElement>('.stage-canvas');
  const ctx = canvas.getContext('2d')!;
  const overlay = $('[data-el="overlay"]');
  const actionTag = $('[data-el="actionTag"]');
  const camText = $('[data-el="camText"]');
  const nowAction = $('[data-el="nowAction"]');
  const startBtn = $<HTMLButtonElement>('[data-el="startBtn"]');
  const startHint = $('[data-el="startHint"]');
  const videoSlot = $('[data-el="videoSlot"]');
  const stage = $('.stage');
  const camSelect = $<HTMLSelectElement>('[data-el="camSelect"]');
  const camWarn = $('[data-el="camWarn"]');
  const step = (name: string) => $(`[data-step="${name}"]`);

  const adapter = new CameraPoseAdapter(CONFIG, players);
  // 영상은 화면에 직접 붙여서 보여 준다 (캔버스에 복사하면 일부 환경에서 검게 그려짐)
  adapter.video.className = 'stage-video';
  videoSlot.appendChild(adapter.video);
  const seen = new Set<PoseAction>();
  let visibleSince = 0;
  let handedOff = false;

  // ── 상태 표시 ───────────────────────────
  function showOverlay(html: string): void {
    overlay.innerHTML = html;
    overlay.hidden = !html;
  }
  function showIntro(): void {
    showOverlay(`<div class="overlay-box">
      <p>카메라를 켜면 내 모습이 거울처럼 보이고,<br>몸의 관절 위치를 인식해요.</p>
      <button type="button" class="btn primary" data-act="start-camera">카메라 켜기</button>
      <p class="small">영상은 이 컴퓨터 안에서만 처리되고 저장되지 않아요.</p>
    </div>`);
  }

  const offStatus = adapter.on('status', (s: CameraStatus) => {
    step('camera').className = s.state === 'running' ? 'done' : s.state === 'error' ? 'fail' : s.state === 'idle' ? '' : 'active';
    switch (s.state) {
      case 'requesting':
        camText.textContent = '카메라 권한을 허용해 주세요';
        showOverlay('<div class="overlay-box"><div class="spinner"></div><p>브라우저 위쪽의 <b>카메라 권한 요청</b>에서 "허용"을 눌러 주세요.</p></div>');
        break;
      case 'loading':
        camText.textContent = '동작 인식 준비 중…';
        showOverlay('<div class="overlay-box"><div class="spinner"></div><p>동작 인식 모델을 불러오는 중이에요…</p></div>');
        break;
      case 'running':
        camText.textContent = '연결됨';
        showOverlay('');
        void fillCameraList();
        matchStageToVideo();
        startDarkCheck();
        break;
      case 'error':
        camText.textContent = '연결 실패';
        showOverlay(`<div class="overlay-box error">
          <p class="overlay-title">⚠️ ${errorTitle(s.kind)}</p>
          <p>${escapeHtml(s.message)}</p>
          <button type="button" class="btn primary" data-act="start-camera">다시 시도</button>
        </div>`);
        break;
      case 'idle':
        break;
    }
  });

  const offFrame = adapter.on('frame', (f: PoseFrame) => {
    draw(f);
    const allVisible = f.players.every((p) => p.bodyVisible) && !f.crossing;
    if (players === 1) {
      const lm = f.players[0].landmarks;
      for (const p of BODY_PARTS) {
        const ok = !!lm && p.idx.every((i) => (lm[i]?.visibility ?? 0) >= 0.5);
        root.querySelector(`[data-part="${p.label}"]`)!.classList.toggle('ok', ok);
      }
    } else {
      f.players.forEach((p, i) => root.querySelector(`[data-player="${i}"]`)!.classList.toggle('ok', p.bodyVisible));
    }
    step('body').className = allVisible ? 'done' : 'active';
    if (allVisible) { visibleSince ||= f.time; } else { visibleSince = 0; }
    const ready = allVisible && f.time - visibleSince >= READY_HOLD_MS;
    startBtn.disabled = !ready;
    const anyone = f.players.some((p) => p.landmarks);
    startHint.textContent = !anyone ? '사람이 보이지 않아요. 카메라 앞에 서 주세요.'
      : f.crossing ? '화면 가운데 선을 넘지 않게 각자 자기 쪽에 서 주세요.'
      : players === 2 && !f.players.every((p) => p.landmarks) ? '두 사람 모두 보여야 해요.'
      : !allVisible ? '조금 뒤로 물러나서 무릎까지 보이게 해 주세요.'
      : ready ? '준비됐어요!' : '잠시 그대로 있어 주세요…';
  });

  const offAction = adapter.on('action', ({ player, action: a }) => {
    const label = a ? `${players === 2 ? `P${player + 1} · ` : ''}${actionLabel(a)}` : '—';
    nowAction.textContent = label;
    actionTag.hidden = !a;
    actionTag.textContent = label;
    if (a && a !== 'cross-arms' && !seen.has(a)) {
      seen.add(a);
      root.querySelector(`[data-action="${a}"]`)?.classList.add('seen');
      step('action').className = seen.size === POSE_ACTIONS.length ? 'done' : 'active';
    }
  });

  // ── 그리기 ─────────────────────────────
  function fit(): void { fitCanvas(canvas, adapter.video); }

  function draw(f: PoseFrame): void {
    const rect = fitCanvas(canvas, adapter.video);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (players === 2) drawCenterLine(ctx, rect, f.crossing);
    f.players.forEach((p, i) => {
      drawButtons(ctx, rect, p.region, CONFIG.buttonHitRadius, p.candidate);
      if (p.landmarks) drawSkeleton(ctx, rect, p.landmarks, p.bodyVisible ? (players === 2 ? PLAYER_COLORS[i] : '#51cf66') : '#ffa94d');
    });
  }

  // ── 카메라 선택 · 화면 비율 · 검은 화면 감시 ─────────────
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
    darkCount = 0; camWarn.hidden = true;
  });

  /** 미리보기 칸을 카메라 영상 비율에 맞춘다 (위아래·양옆 빈 띠 없애기) */
  function matchStageToVideo(): void {
    const { videoWidth: w, videoHeight: h } = adapter.video;
    if (w && h) stage.style.aspectRatio = `${w} / ${h}`;
    fit();
  }

  // 1초마다 영상 밝기를 재서 3초 연속 거의 검정이면 안내
  const probe = document.createElement('canvas');
  probe.width = 32; probe.height = 18;
  const pctx = probe.getContext('2d', { willReadFrequently: true })!;
  let darkTimer = 0, darkCount = 0;
  function startDarkCheck(): void {
    clearInterval(darkTimer);
    darkTimer = window.setInterval(() => {
      if (adapter.video.readyState < 2) return;
      pctx.drawImage(adapter.video, 0, 0, probe.width, probe.height);
      const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      const avg = sum / (d.length / 4) / 3;
      darkCount = avg < 10 ? darkCount + 1 : 0;
      camWarn.hidden = darkCount < 3;
    }, 1000);
  }

  // ── 버튼·정리 ───────────────────────────
  const onClick = (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act="start-camera"]');
    if (t) { fit(); void adapter.start(); }
  };
  root.addEventListener('click', onClick);
  startBtn.addEventListener('click', () => {
    if (opts.onStart) { handedOff = true; detach(); opts.onStart(adapter); }
    else location.hash = opts.backHref;
  });
  const onResize = () => fit();
  window.addEventListener('resize', onResize);
  const onPageHide = () => adapter.stop();
  window.addEventListener('pagehide', onPageHide);

  fit();
  showIntro();

  // 개발 중 확인용: 콘솔에서 카메라 상태를 볼 수 있게
  (window as unknown as { __cameraSetup?: CameraPoseAdapter }).__cameraSetup = adapter;

  /** 이 화면이 어댑터에 건 것을 모두 뗀다 (카메라는 그대로) */
  function detach(): void {
    clearInterval(darkTimer);
    offStatus(); offFrame(); offAction();
    root.removeEventListener('click', onClick);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onPageHide);
  }

  return () => {
    detach();
    if (!handedOff) adapter.stop();
  };
}

function errorTitle(kind: string): string {
  return ({
    denied: '카메라 권한이 거부됐어요',
    'no-camera': '카메라가 없어요',
    busy: '카메라를 사용할 수 없어요',
    unsupported: '지원하지 않는 브라우저예요',
    model: '인식 모델을 불러오지 못했어요',
  } as Record<string, string>)[kind] ?? '카메라를 켜지 못했어요';
}
