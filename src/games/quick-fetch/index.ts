// 번개 심부름: 화면에 뜬 물건을 찾아 내 칸에 먼저 보여 주면 라운드 1등 (docs/games/quick-fetch.md)
// 웹캠 한 대를 인원수만큼 세로 칸으로 나누고, 칸마다 사물 인식 결과로 누가 먼저였는지 자동 판정한다.
// 입력은 사물 인식 어댑터(src/input/camera-object.ts)로만 받는다.

import type { ObjectFrame } from '../../input/camera-object';
import { mountDebugPanel } from '../../shared/debug-panel';
import { escapeHtml } from '../../shared/html';
import { drawZones } from '../../shared/object-draw';
import { fitCanvas } from '../../shared/pose-draw';
import { sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { CONFIG, EMPTY_TEXT, ITEMS, MODEL_DIR, ZONE_COLORS } from './config';
import { Baseline, ConfirmTracker, isMatch, makeOrder, roundScore } from './rules';
import './style.css';

type Phase = 'prep' | 'go' | 'reveal';

interface RoundLog {
  round: number;
  target: string;
  /** 1등 칸 번호 (아무도 못 하면 빈 배열) */
  winners: number[];
  /** 걸린 시간 (ms), 못 찾으면 null */
  ms: number | null;
  /** 칸별 준비 때 목표 물건 기준값 */
  baseline: number[];
  /** 칸별로 다른 물건을 보여 준 횟수 */
  wrongShown: number[];
  /**
   * 칸별 빈 화면 유사도 (emptySim 기준값 조정용, 기록 전이면 null)
   * prepAvg: 준비 때 평균 / goMin: 출발 뒤 가장 낮았던 값 / atConfirm: 확정 순간 (1등 칸만)
   */
  emptySim: { prepAvg: (number | null)[]; goMin: (number | null)[]; atConfirm: (number | null)[] };
}

const round3 = (v: number | null) => (v === null ? null : Number(v.toFixed(3)));

const game: GameModule<'camera-object'> = {
  setup: 'camera-object',
  modes: [
    { players: 2, label: '▶ 2명' },
    { players: 3, label: '▶ 3명' },
    { players: 4, label: '▶ 4명' },
  ],
  // 준비 화면(src/setup/object-setup.ts): 물건 테스트 + 빈 화면 기록
  objectSetup: {
    items: ITEMS,
    colors: ZONE_COLORS,
    seenProb: CONFIG.confirmProb,
    emptyThreshold: CONFIG.emptySim,
    emptyRecordMs: CONFIG.emptyRecordMs,
    emptyCountdownMs: CONFIG.emptyCountdownMs,
    adapterOptions: { modelDir: MODEL_DIR, intervalMs: CONFIG.recognizeIntervalMs, boxScale: CONFIG.boxScale },
  },

  start(container, input, { players, onFinish }) {
    input.setZones(players);
    const names = Array.from({ length: players }, (_, i) => `P${i + 1}`);
    // 모델에 있는 라벨만 문제로 낸다
    const targets = ITEMS.map((it) => ({ ...it, idx: input.labels.indexOf(it.label) })).filter((t) => t.idx >= 0);
    const labelText = (i: number) => {
      const name = input.labels[i] ?? '?';
      const it = ITEMS.find((x) => x.label === name);
      return it ? `${it.emoji} ${name}` : EMPTY_TEXT;
    };
    const isItem = (i: number) => targets.some((t) => t.idx === i);

    container.innerHTML = `
      <div class="br-hud qf-hud">
        <span data-el="round"></span>
        <span class="qf-scores" data-el="scores">${names.map((n, i) =>
          `<span class="qf-chip" style="--c:${ZONE_COLORS[i]}"><b>${n}</b> <span data-score="${i}">0</span></span>`).join('')}</span>
      </div>
      <div class="qf-target" data-el="target"></div>
      <div class="br-stage qf-stage" data-el="stage">
        <div class="stage-video-slot" data-el="videoSlot"></div>
        <canvas class="stage-canvas" data-el="canvas"></canvas>
        <div class="qf-timebar"><i data-el="timebar"></i></div>
        <div class="br-pause" data-el="pause" hidden><div><b>⏸ 잠깐 멈췄어요</b><p>카메라 연결이 끊겼어요. 웹캠을 다시 연결해 주세요.</p></div></div>
      </div>`;
    const $ = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
    const canvas = $<HTMLCanvasElement>('[data-el="canvas"]');
    const ctx = canvas.getContext('2d')!;
    const targetEl = $('[data-el="target"]');
    const timebar = $('[data-el="timebar"]');
    const pauseEl = $('[data-el="pause"]');
    input.video.className = 'stage-video';
    $('[data-el="videoSlot"]').appendChild(input.video);

    const order = makeOrder(targets.length, CONFIG.rounds);
    const scores = names.map(() => 0);
    const wins = names.map(() => 0);
    const winTimes: number[][] = names.map(() => []);
    const log: RoundLog[] = [];
    const baseline = new Baseline();
    const tracker = new ConfirmTracker();

    let round = 0;
    let phase: Phase = 'prep';
    let phaseMs = 0;
    let progress: number[] = [];
    let notes: (string | null)[] = [];
    let noteUntil: number[] = [];
    let wrongShown: number[] = [];
    // 빈 화면 유사도 통계 (라운드마다 초기화)
    let simSum: number[] = [];
    let simCount: number[] = [];
    let simGoMin: (number | null)[] = [];
    let simAtConfirm: (number | null)[] = [];
    let lastCount = 0;
    let finished = false;
    let raf = 0;
    let last = performance.now();

    const target = () => targets[order[round]];

    function enterPrep(): void {
      phase = 'prep';
      phaseMs = 0;
      baseline.reset();
      tracker.reset();
      progress = []; notes = []; noteUntil = []; wrongShown = names.map(() => 0);
      simSum = names.map(() => 0); simCount = names.map(() => 0);
      simGoMin = names.map(() => null); simAtConfirm = names.map(() => null);
      lastCount = 0;
      targetEl.className = 'qf-target hidden-item';
    }

    function enterGo(): void {
      phase = 'go';
      phaseMs = 0;
      tracker.reset();
      const t = target();
      targetEl.className = 'qf-target go';
      targetEl.innerHTML = `<span class="qf-emoji">${t.emoji}</span><span><b>${escapeHtml(t.label)}</b> 가져와!</span>`;
      sfx.roundStart();
    }

    function enterReveal(winners: number[]): void {
      const ms = winners.length ? phaseMs : null;
      log.push({
        round: round + 1,
        target: target().label,
        winners,
        ms: ms === null ? null : Math.round(ms),
        baseline: names.map((_, i) => Number(baseline.get(i, target().idx).toFixed(3))),
        wrongShown,
        emptySim: {
          prepAvg: names.map((_, i) => (simCount[i] ? round3(simSum[i] / simCount[i]) : null)),
          goMin: simGoMin.map(round3),
          atConfirm: simAtConfirm.map(round3),
        },
      });
      phase = 'reveal';
      phaseMs = 0;
      notes = [];
      if (ms !== null) {
        const pts = roundScore(ms, CONFIG);
        for (const w of winners) {
          scores[w] += pts;
          wins[w]++;
          winTimes[w].push(ms);
          container.querySelector(`[data-score="${w}"]`)!.textContent = String(scores[w]);
        }
        progress = names.map((_, i) => (winners.includes(i) ? 1 : 0));
        // 안내는 영상 위쪽 띠에만 (영상 위 칸 표시와 겹치지 않게)
        targetEl.className = 'qf-target win';
        targetEl.innerHTML = `<span class="qf-emoji">🏆</span><span>${winners.map((w) => `<b style="color:${ZONE_COLORS[w]}">${names[w]}</b>`).join(' · ')} 1등!</span>
          <small>${escapeHtml(target().label)} · ${(ms / 1000).toFixed(1)}초 · +${pts}점</small>`;
        sfx.correct();
      } else {
        progress = [];
        targetEl.className = 'qf-target timeout';
        targetEl.innerHTML = `<span class="qf-emoji">⏰</span><span>시간 초과!</span><small>아무도 못 찾았어요</small>`;
        sfx.wrong();
      }
    }

    function finish(): void {
      finished = true;
      cancelAnimationFrame(raf);
      sfx.finish();
      onFinish({
        scores,
        names,
        colors: ZONE_COLORS,
        details: names.map((_, i) => {
          const t = winTimes[i];
          return t.length ? `1등 ${wins[i]}회 · 평균 ${(t.reduce((a, b) => a + b, 0) / t.length / 1000).toFixed(1)}초` : '1등 0회';
        }),
        summary: log.map((r) => {
          const it = ITEMS.find((x) => x.label === r.target);
          const who = r.winners.length ? `${r.winners.map((w) => names[w]).join(' · ')} (${((r.ms ?? 0) / 1000).toFixed(1)}초)` : '시간 초과';
          return `${r.round}라운드 ${it?.emoji ?? ''} ${r.target} — ${who}`;
        }),
        log: { rounds: log, config: { ...CONFIG } },
      });
    }

    // 인식 결과가 올 때마다 판정 (약 120ms마다)
    const offFrame = input.on('frame', (f: ObjectFrame) => {
      if (!input.cameraOn || finished) return;
      // 빈 화면 보정: 빈 상자로 판단된 칸은 어떤 물건 확률도 0으로 본다
      const probsOf = (z: ObjectFrame['zones'][number]) => (z.empty ? z.probs.map(() => 0) : z.probs);
      if (phase === 'prep') {
        f.zones.forEach((z, i) => {
          baseline.add(i, probsOf(z));
          if (z.emptySim !== null) { simSum[i] += z.emptySim; simCount[i]++; }
        });
        return;
      }
      if (phase !== 'go') return;
      const t = target();
      const done: number[] = [];
      progress = f.zones.map((z, i) => {
        if (z.emptySim !== null) simGoMin[i] = Math.min(simGoMin[i] ?? 1, z.emptySim);
        const p = probsOf(z)[t.idx] ?? 0;
        const pr = tracker.update(i, isMatch(p, baseline.get(i, t.idx), CONFIG), f.time, CONFIG);
        if (pr >= 1) { done.push(i); simAtConfirm[i] = z.emptySim; }
        // 다른 물건을 보여 주면 잠깐 알려 준다 (벌점 없음)
        // 빈 칸이 원래 그 물건처럼 보이는 경우(준비 때 기준값이 이미 높음)는 안내하지 않는다
        if (!z.empty && z.top !== t.idx && isItem(z.top) && z.topProb >= CONFIG.wrongHintProb
          && z.topProb - baseline.get(i, z.top) >= CONFIG.minRise) {
          if (!notes[i]) wrongShown[i]++;
          notes[i] = `그건 ${labelText(z.top)}${copula(input.labels[z.top] ?? '')}!`;
          noteUntil[i] = f.time + 800;
        } else if ((noteUntil[i] ?? 0) < f.time) {
          notes[i] = null;
        }
        return pr;
      });
      if (done.length) enterReveal(done);
    });

    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      last = now;
      input.emptyThreshold = CONFIG.emptySim;      // 디버그 패널에서 바꾼 값 바로 반영
      const paused = !input.cameraOn;            // 입력이 끊기면 일시정지 (기획서 8.4)
      // 빈 화면 자동 갱신은 준비 시간에만 (물건을 찾는 중에는 기록을 건드리지 않는다)
      input.emptyAdaptRate = phase === 'prep' && !paused ? CONFIG.emptyAdaptRate : 0;
      input.emptyAdaptMinSim = CONFIG.emptyAdaptMinSim;
      pauseEl.hidden = !paused;
      if (!paused) {
        phaseMs += dt;
        if (phase === 'prep') {
          const left = Math.ceil((CONFIG.prepMs - phaseMs) / 1000);
          if (left !== lastCount && left > 0) {
            lastCount = left;
            sfx.tick();
            targetEl.innerHTML = `<span class="qf-emoji">❓</span><span>다음 물건은… <b class="qf-count">${left}</b></span><small>물건을 내려놓고 자기 칸에 서세요</small>`;
          }
          if (phaseMs >= CONFIG.prepMs) enterGo();
        } else if (phase === 'go') {
          if (phaseMs >= CONFIG.roundLimitMs) enterReveal([]);
        } else if (phaseMs >= CONFIG.revealMs) {
          round++;
          if (round >= order.length) { finish(); return; }
          enterPrep();
        }
      } else {
        tracker.reset();
      }

      $('[data-el="round"]').textContent = `${Math.min(round + 1, order.length)} / ${order.length} 라운드`
        + (phase === 'go' ? ` · 남은 시간 ${Math.max(0, Math.ceil((CONFIG.roundLimitMs - phaseMs) / 1000))}초` : '');
      timebar.style.width = phase === 'go' ? `${Math.max(0, 1 - phaseMs / CONFIG.roundLimitMs) * 100}%` : '0%';

      // 그리기: 칸·인식 상자·지금 인식 결과를 항상 보여 준다
      const rect = fitCanvas(canvas, input.video);
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      drawZones(ctx, rect, input, {
        colors: ZONE_COLORS,
        labelText,
        names,
        progress,
        notes,
        emptyText: EMPTY_TEXT,
        focusLabel: phase === 'prep' ? undefined : target().idx,
      });
    }

    const offDebug = mountDebugPanel(container, CONFIG, '번개 심부름');
    (window as unknown as { __quickFetch?: unknown }).__quickFetch = { input, scores, log };
    enterPrep();
    raf = requestAnimationFrame(tick);

    return {
      // 게임을 나가면 루프·이벤트를 모두 정리 (카메라는 흐름 쪽에서 끈다)
      destroy() {
        finished = true;
        input.emptyAdaptRate = 0;
        cancelAnimationFrame(raf);
        offFrame();
        offDebug();
        container.innerHTML = '';
      },
    };
  },
};

/** 받침 있으면 '이에요', 없으면 '예요' */
function copula(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이에요' : '예요';
}

export default game;
