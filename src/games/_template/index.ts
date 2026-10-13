// 견본 게임: 20초 동안 "두 손 머리 위로"를 몇 번 하는지 센다.
// 게임 하나가 갖춰야 할 최소한(기획서 8장)을 모두 보여 준다:
//   - GameModule 형식 (setup / modes / start → destroy)
//   - 입력은 어댑터 이벤트로만 받기 (카메라를 직접 다루지 않음)
//   - 인식 상태(뼈대) 항상 표시, 입력이 끊기면 일시정지
//   - 수치는 config.ts, 디버그 패널, 결과·플레이 기록 넘기기

import type { PoseFrame } from '../../input/camera-pose';
import { actionLabel } from '../../input/pose-actions';
import { mountDebugPanel } from '../../shared/debug-panel';
import { drawSkeleton, fitCanvas } from '../../shared/pose-draw';
import { sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { CONFIG } from './config';

const game: GameModule<'camera-pose'> = {
  setup: 'camera-pose',                         // 어떤 장치 준비 화면을 거칠지
  modes: [{ players: 1, label: '▶ 시작하기' }],   // 소개 페이지의 시작 버튼들

  start(container, input, { onFinish }) {
    container.innerHTML = `
      <div class="br-hud"><span class="br-progress" data-el="time"></span><span class="br-scores" data-el="score">0회</span></div>
      <div class="br-stage" data-el="stage">
        <div class="stage-video-slot" data-el="videoSlot"></div>
        <canvas class="stage-canvas" data-el="canvas"></canvas>
        <div class="br-bubble"><span class="br-bubble-text">두 손 머리 위로!</span></div>
        <div class="br-pause" data-el="pause" hidden><div><b>⏸ 잠깐 멈췄어요</b><p>몸이 화면에 다 보이게 서 주세요.</p></div></div>
      </div>`;
    const $ = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
    const canvas = $<HTMLCanvasElement>('[data-el="canvas"]');
    const ctx = canvas.getContext('2d')!;
    input.video.className = 'stage-video';
    $('[data-el="videoSlot"]').appendChild(input.video);

    let reps = 0;
    let remainMs = CONFIG.timeLimitSec * 1000;
    let last = performance.now();
    let raf = 0;
    const log: { t: number; action: string | null }[] = [];

    // 입력: 확정 동작이 바뀔 때마다 이벤트가 온다
    const offAction = input.on('action', ({ action }) => {
      log.push({ t: Math.round(CONFIG.timeLimitSec * 1000 - remainMs), action });
      if (action === 'raise-both') { reps++; sfx.correct(); }
    });

    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      const f: PoseFrame = input.last;
      const visible = f.players[0].bodyVisible;
      $('[data-el="pause"]').hidden = visible;            // 입력이 끊기면 일시정지 (기획서 8.4)
      if (visible) remainMs -= now - last;
      last = now;

      // 그리기: 인식 상태(뼈대)를 항상 보여 준다
      const rect = fitCanvas(canvas, input.video);
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      const lm = f.players[0].landmarks;
      if (lm) drawSkeleton(ctx, rect, lm, '#ffd43b');
      $('[data-el="time"]').textContent = `남은 시간 ${Math.max(0, Math.ceil(remainMs / 1000))}초 · 지금: ${actionLabel(f.players[0].action) || '—'}`;
      $('[data-el="score"]').textContent = `${reps}회`;

      if (remainMs <= 0) {
        cancelAnimationFrame(raf);
        sfx.finish();
        onFinish({
          scores: [reps * CONFIG.scorePerRep],
          details: [`${CONFIG.timeLimitSec}초 동안 ${reps}회`],
          log,
        });
      }
    }

    const offDebug = mountDebugPanel(container, CONFIG, '견본 게임');
    raf = requestAnimationFrame(tick);

    return {
      // 게임을 나가면 루프·이벤트를 모두 정리 (카메라는 play.ts가 끈다)
      destroy() {
        cancelAnimationFrame(raf);
        offAction();
        offDebug();
        container.innerHTML = '';
      },
    };
  },
};

export default game;
