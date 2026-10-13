// 몸이 말을 안 들어! — 게임 진입점 (기획서 8.3: start(container, input) / destroy())
// 상세 기획: docs/games/body-rebel.md

import type { CameraPoseAdapter, PoseFrame } from '../../input/camera-pose';
import { actionLabel, type PoseAction } from '../../input/pose-actions';
import { mountDebugPanel } from '../../shared/debug-panel';
import { PLAYER_COLORS, drawButtons, drawCenterLine, drawSkeleton, fitCanvas, toPx } from '../../shared/pose-draw';
import { sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { CONFIG } from './config';
import { COLORS, expectedAction, planRound, ruleHelp, ruleName, type Question, type RoundPlan, type Rng } from './rules';

type Item = 'fog' | 'mirror' | 'rush';
const ITEMS: Record<Item, { icon: string; name: string; desc: string }> = {
  fog: { icon: '🌫️', name: '안개', desc: '상대 화면을 3초 흐리게' },
  mirror: { icon: '🪞', name: '거울', desc: '상대 좌우 판정 2문제 반전' },
  rush: { icon: '⏩', name: '빨리빨리', desc: '상대 제한 시간 절반' },
};

export interface LogEntry {
  round: number;
  question: number;
  player: number;
  rule: string;
  kind: 'action' | 'hold';
  text: string;
  inkColor: string | null;
  redText: boolean;
  said: PoseAction;
  expected: PoseAction | null;
  answer: PoseAction | null;
  correct: boolean;
  timedOut: boolean;
  reactionMs: number;
  timeLimitMs: number;
  mirrored: boolean;
  rushed: boolean;
}

export interface GameResult {
  scores: number[];
  correctCounts: number[];
  questionCount: number;
  log: LogEntry[];
  /** 입력 인식 실패(사람이 안 보여 일시정지된) 횟수 */
  inputLossCount: number;
  durationMs: number;
}

interface PlayerState {
  score: number;
  roundGain: number;
  correct: number;
  streak: number;
  item: Item | null;
  fogUntil: number;
  mirrorLeft: number;
  rushNext: boolean;
  // 현재 문제
  expected: PoseAction | null;
  deadline: number;
  limitMs: number;
  mirrored: boolean;
  rushed: boolean;
  resolved: boolean;
  holdMs: number;
  flash: { color: string; until: number } | null;
}

type Phase = 'roundIntro' | 'ruleChange' | 'question' | 'feedback' | 'roundResult' | 'done';

export interface StartOptions {
  onFinish: (r: GameResult) => void;
  rng?: Rng;
}

export function start(container: HTMLElement, input: CameraPoseAdapter, opts: StartOptions): { destroy: () => void } {
  const rng = opts.rng ?? Math.random;
  const n = input.playerCount;
  const two = n === 2;

  container.innerHTML = `
    <div class="br">
      <div class="br-hud">
        <span class="br-progress" data-el="progress"></span>
        <span class="br-rule" data-el="rule"></span>
        <span class="br-scores" data-el="scores"></span>
      </div>
      <div class="br-stage" data-el="stage">
        <div class="stage-video-slot" data-el="videoSlot"></div>
        <canvas class="stage-canvas" data-el="canvas"></canvas>
        ${Array.from({ length: n }, (_, i) => `
          <div class="br-fog" data-fog="${i}" style="left:${two ? i * 50 : 0}%;width:${two ? 50 : 100}%" hidden></div>
          <div class="br-feedback" data-fb="${i}" style="left:${two ? i * 50 : 0}%;width:${two ? 50 : 100}%" hidden></div>
          <div class="br-doll ${two ? (i === 0 ? 'left' : 'right') : 'right'}" style="--pc:${PLAYER_COLORS[i]}">
            <canvas width="120" height="140" data-doll="${i}"></canvas>
            <span class="br-doll-name">${two ? `P${i + 1}` : '인식 상태'}</span>
            <strong data-doll-label="${i}">—</strong>
            <span class="br-doll-status" data-doll-status="${i}"></span>
          </div>`).join('')}
        <div class="br-bubble" data-el="bubble" hidden>
          <span class="br-bubble-text" data-el="bubbleText"></span>
          <div class="br-bar"><i data-el="timer"></i></div>
          <div class="br-bar hold" data-el="holdBars" hidden></div>
        </div>
        <div class="br-banner" data-el="banner" hidden></div>
        <div class="br-pause" data-el="pause" hidden>
          <div><b>⏸ 잠깐 멈췄어요</b><p data-el="pauseText">몸이 화면에 다 보이게 서 주세요.</p></div>
        </div>
        <div class="br-toast" data-el="toast" hidden></div>
      </div>
      <p class="br-help muted">${two ? '두 팔을 가슴 앞에서 <b>X자로 교차</b>하면 아이템 사용 · ' : ''}<kbd>\`</kbd> 키: 디버그 패널</p>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
  const stage = $('[data-el="stage"]');
  const canvas = $<HTMLCanvasElement>('[data-el="canvas"]');
  const ctx = canvas.getContext('2d')!;
  const bubble = $('[data-el="bubble"]');
  const bubbleText = $('[data-el="bubbleText"]');
  const timerBar = $('[data-el="timer"]');
  const holdBars = $('[data-el="holdBars"]');
  const banner = $('[data-el="banner"]');
  const pauseEl = $('[data-el="pause"]');
  const pauseText = $('[data-el="pauseText"]');
  const toastEl = $('[data-el="toast"]');
  const progressEl = $('[data-el="progress"]');
  const ruleEl = $('[data-el="rule"]');
  const scoresEl = $('[data-el="scores"]');

  input.video.className = 'stage-video';
  $('[data-el="videoSlot"]').appendChild(input.video);
  const { videoWidth: vw, videoHeight: vh } = input.video;
  if (vw && vh) stage.style.aspectRatio = `${vw} / ${vh}`;

  const players: PlayerState[] = Array.from({ length: n }, () => ({
    score: 0, roundGain: 0, correct: 0, streak: 0, item: null, fogUntil: 0, mirrorLeft: 0, rushNext: false,
    expected: null, deadline: 0, limitMs: 0, mirrored: false, rushed: false, resolved: true, holdMs: 0, flash: null,
  }));
  const log: LogEntry[] = [];
  let round = 0, qi = 0;
  let plan: RoundPlan = planRound(CONFIG, 0, rng);
  let q: Question | null = null;
  let qStart = 0;
  let firstCorrectTaken = false;
  let phase: Phase = 'roundIntro';
  let phaseUntil = 0;
  let paused = false, pausedAt = 0, lostSince = 0, inputLossCount = 0;
  const startedAt = performance.now();
  let raf = 0, last = performance.now();
  let toastTimer = 0;

  // ── 진행 ───────────────────────────────
  function startRound(r: number, now: number): void {
    round = r; qi = 0;
    plan = planRound(CONFIG, r, rng);
    players.forEach((p) => { p.roundGain = 0; });
    showBanner(`<small>라운드 ${r + 1} / ${CONFIG.roundCount}</small><b>${ruleName(plan.rule)}</b><p>${ruleHelp(plan.rule)}</p>`);
    sfx.roundStart();
    setPhase('roundIntro', now + CONFIG.roundIntroMs);
  }

  function beginQuestion(now: number, ruleChangeShown = false): void {
    q = plan.questions[qi];
    if (q.ruleChangeBefore && !ruleChangeShown) {
      showBanner(`<small>⚠️ 규칙 변경!</small><b>${ruleName(q.rule)}</b><p>${ruleHelp(q.rule)}</p>`, 'warn');
      stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
      sfx.warn();
      setPhase('ruleChange', now + CONFIG.ruleChangePauseMs);
      return;
    }
    hideBanner();
    qStart = now;
    firstCorrectTaken = false;
    const base = q.kind === 'hold' ? (q.holdSec + CONFIG.holdMissionSlackSec) * 1000 : CONFIG.timeLimitsSec[round] * 1000;
    players.forEach((p) => {
      p.mirrored = p.mirrorLeft > 0 && q!.kind === 'action';
      if (p.mirrored) p.mirrorLeft--;
      p.rushed = p.rushNext;
      p.rushNext = false;
      p.expected = expectedAction(q!, p.mirrored);
      p.limitMs = base * (p.rushed ? CONFIG.itemDurations.rush : 1);
      p.deadline = now + p.limitMs;
      p.resolved = false;
      p.holdMs = 0;
    });
    bubbleText.textContent = q.text;
    bubbleText.style.color = q.ink ?? '';
    bubble.hidden = false;
    holdBars.hidden = q.kind !== 'hold';
    holdBars.innerHTML = players.map((_, i) => `<i data-hold="${i}" style="--pc:${PLAYER_COLORS[i]}"></i>`).join('');
    ruleEl.textContent = `규칙: ${ruleName(q.rule)}`;
    progressEl.textContent = `라운드 ${round + 1}/${CONFIG.roundCount} · 문제 ${qi + 1}/${CONFIG.questionsPerRound}`;
    sfx.question();
    setPhase('question', Infinity);
  }

  function resolve(i: number, answer: PoseAction | null, timedOut: boolean, now: number): void {
    const p = players[i];
    if (p.resolved || !q) return;
    p.resolved = true;
    const correct = p.expected === null ? answer === null : answer === p.expected;
    let gain = 0;
    if (correct) {
      gain = CONFIG.scoreCorrect;
      if (two && !firstCorrectTaken) { gain += CONFIG.scoreFastest; firstCorrectTaken = true; }
      p.correct++; p.streak++;
      if (two && p.streak % CONFIG.itemEveryStreak === 0 && !p.item) {
        p.item = pick(Object.keys(ITEMS) as Item[]);
        toast(`P${i + 1} 아이템 획득! ${ITEMS[p.item].icon} ${ITEMS[p.item].name} — 팔을 X자로 교차하면 사용`);
      }
      sfx.correct();
    } else {
      p.streak = 0;
      sfx.wrong();
    }
    p.score += gain; p.roundGain += gain;
    p.flash = { color: correct ? '#51cf66' : '#fa5252', until: now + CONFIG.feedbackMs };
    showFeedback(i, correct, gain, p.expected);

    log.push({
      round: round + 1, question: qi + 1, player: i + 1, rule: ruleName(q.rule), kind: q.kind,
      text: q.text, inkColor: q.inkColor, redText: q.red, said: q.said,
      expected: p.expected, answer, correct, timedOut,
      reactionMs: Math.round(now - qStart), timeLimitMs: Math.round(p.limitMs), mirrored: p.mirrored, rushed: p.rushed,
    });

    if (players.every((x) => x.resolved)) {
      bubble.hidden = true;
      setPhase('feedback', now + CONFIG.feedbackMs);
    }
  }

  function nextQuestion(now: number): void {
    players.forEach((_, i) => hideFeedback(i));
    qi++;
    if (qi < plan.questions.length) { beginQuestion(now); return; }
    // 라운드 결과
    q = null;
    showBanner(`<small>라운드 ${round + 1} 결과</small>${players.map((p, i) =>
      `<div class="br-round-row" style="--pc:${PLAYER_COLORS[i]}"><span>${two ? `P${i + 1}` : '획득 점수'}</span><b>+${p.roundGain}</b><small>총 ${p.score}점</small></div>`).join('')}`);
    setPhase('roundResult', now + CONFIG.roundResultMs);
  }

  function finish(now: number): void {
    setPhase('done', Infinity);
    hideBanner();
    sfx.finish();
    opts.onFinish({
      scores: players.map((p) => p.score),
      correctCounts: players.map((p) => p.correct),
      questionCount: CONFIG.roundCount * CONFIG.questionsPerRound,
      log,
      inputLossCount,
      durationMs: Math.round(now - startedAt),
    });
  }

  function setPhase(p: Phase, until: number): void { phase = p; phaseUntil = until; }

  // ── 아이템 (2인) ─────────────────────────
  function useItem(i: number, now: number): void {
    const p = players[i];
    if (!two || !p.item) return;
    const opp = players[1 - i];
    const item = p.item;
    p.item = null;
    if (item === 'fog') opp.fogUntil = now + CONFIG.itemDurations.fog;
    if (item === 'mirror') opp.mirrorLeft += CONFIG.itemDurations.mirrorQuestions;
    if (item === 'rush') opp.rushNext = true;
    sfx.item();
    toast(`P${i + 1}이(가) ${ITEMS[item].icon} ${ITEMS[item].name} 사용! → P${2 - i}: ${ITEMS[item].desc}`);
  }

  // ── 입력 ───────────────────────────────
  const offAction = input.on('action', ({ player, action }) => {
    const now = performance.now();
    if (action === 'cross-arms') { if (phase !== 'done') useItem(player, now); return; }
    // 판정: 문제 중 처음으로 확정된 동작만 (가만히·X자는 대답으로 보지 않음)
    if (phase !== 'question' || paused || !q || q.kind !== 'action') return;
    if (action === null || action === 'freeze') return;
    resolve(player, action, false, now);
  });

  // ── 매 프레임 ──────────────────────────
  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(100, now - last); last = now;
    const f = input.last;

    updatePause(f, now);
    if (!paused) {
      if (phase === 'question' && q) {
        players.forEach((p, i) => {
          if (p.resolved) return;
          if (q!.kind === 'hold') {
            if (q!.said === 'freeze') p.holdMs = input.stillFor(i, now);
            else p.holdMs = f.players[i].candidate === q!.said ? p.holdMs + dt : 0;
            if (p.holdMs >= q!.holdSec * 1000) { resolve(i, q!.said, false, now); return; }
          }
          if (now >= p.deadline) resolve(i, null, true, now);
        });
      } else if (now >= phaseUntil) {
        if (phase === 'roundIntro') beginQuestion(now);
        else if (phase === 'ruleChange') beginQuestion(now, true);
        else if (phase === 'feedback') nextQuestion(now);
        else if (phase === 'roundResult') {
          if (round + 1 < CONFIG.roundCount) startRound(round + 1, now); else finish(now);
        }
      }
    }
    render(f, now);
  }

  /** 사람이 화면에서 벗어나면 자동 일시정지 (기획서 8.4), 돌아오면 남은 시간 그대로 이어서 */
  function updatePause(f: PoseFrame, now: number): void {
    if (phase === 'done') return;
    const lost = f.players.some((p) => !p.bodyVisible) || f.crossing;
    if (lost) { lostSince ||= now; } else { lostSince = 0; }
    if (!paused && lost && now - lostSince >= CONFIG.pauseAfterLostMs) {
      paused = true; pausedAt = now; inputLossCount++;
      pauseText.textContent = f.crossing ? '화면 가운데 선을 넘지 않게 각자 자기 쪽에 서 주세요.'
        : two ? '두 사람 모두 어깨부터 무릎까지 화면에 보이게 서 주세요.' : '어깨부터 무릎까지 화면에 보이게 서 주세요.';
      pauseEl.hidden = false;
    } else if (paused && !lost) {
      const d = now - pausedAt;
      paused = false;
      players.forEach((p) => { p.deadline += d; p.fogUntil += d; });
      qStart += d;
      if (Number.isFinite(phaseUntil)) phaseUntil += d;
      pauseEl.hidden = true;
    }
  }

  // ── 그리기 ─────────────────────────────
  function render(f: PoseFrame, now: number): void {
    const rect = fitCanvas(canvas, input.video);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (two) drawCenterLine(ctx, rect, f.crossing);
    f.players.forEach((pf, i) => {
      const p = players[i];
      drawButtons(ctx, rect, pf.region, CONFIG.buttonHitRadius, pf.candidate);
      const flash = p.flash && p.flash.until > now ? p.flash.color : null;
      if (pf.landmarks) drawSkeleton(ctx, rect, pf.landmarks, flash ?? (two ? PLAYER_COLORS[i] : '#ffd43b'), flash ? 8 : 5);
      // 2인일 때 머리 위에 P1/P2 표시
      if (two && pf.landmarks && pf.landmarks[0].visibility > 0.5) {
        const h = toPx(rect, pf.landmarks[0]);
        ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = PLAYER_COLORS[i];
        ctx.fillText(`P${i + 1}`, h.x, h.y - 40);
      }
      drawDoll(i, pf.landmarks);
      container.querySelector(`[data-doll-label="${i}"]`)!.textContent = actionLabel(pf.action) || '—';
      container.querySelector(`[data-doll-status="${i}"]`)!.innerHTML = [
        p.item ? `<span>${ITEMS[p.item].icon} ${ITEMS[p.item].name} 보유</span>` : '',
        p.mirrorLeft > 0 || (p.mirrored && !p.resolved) ? '<span class="bad">🪞 좌우 반전</span>' : '',
        p.rushNext || (p.rushed && !p.resolved) ? '<span class="bad">⏩ 빨리빨리</span>' : '',
      ].join('');
      (container.querySelector(`[data-fog="${i}"]`) as HTMLElement).hidden = !(p.fogUntil > now);
    });

    // 남은 시간 · 유지 게이지
    if (phase === 'question' && q) {
      const p0 = players.reduce((a, b) => (b.deadline > a.deadline ? b : a));
      const remain = Math.max(0, p0.deadline - (paused ? pausedAt : now)) / p0.limitMs;
      timerBar.style.width = `${remain * 100}%`;
      timerBar.style.background = remain < 0.3 ? '#fa5252' : '';
      if (q.kind === 'hold') {
        players.forEach((p, i) => {
          const el = holdBars.querySelector<HTMLElement>(`[data-hold="${i}"]`);
          if (el) el.style.width = `${Math.min(1, p.holdMs / (q!.holdSec * 1000)) * (100 / n)}%`;
        });
      }
    }
    scoresEl.innerHTML = players.map((p, i) => `<span style="color:${two ? PLAYER_COLORS[i] : 'inherit'}">${two ? `P${i + 1} ` : ''}${p.score}점</span>`).join(' · ');
  }

  function drawDoll(i: number, lm: PoseFrame['players'][number]['landmarks']): void {
    const c = container.querySelector<HTMLCanvasElement>(`[data-doll="${i}"]`)!;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    if (!lm) return;
    // 몸 전체가 작은 칸에 들어오도록 맞춘다
    const pts = lm.filter((p) => p.visibility > 0.5);
    if (pts.length < 5) return;
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
    const s = Math.min((c.width - 16) / Math.max(0.01, maxX - minX), (c.height - 16) / Math.max(0.01, maxY - minY));
    const rect = { ox: (c.width - (maxX - minX) * s) / 2 - minX * s, oy: (c.height - (maxY - minY) * s) / 2 - minY * s, dw: s, dh: s };
    drawSkeleton(g, rect, lm, PLAYER_COLORS[i], 3);
  }

  // ── 표시 도우미 ─────────────────────────
  function showBanner(html: string, tone = ''): void {
    banner.innerHTML = html; banner.className = `br-banner ${tone}`; banner.hidden = false;
    bubble.hidden = true;
  }
  function hideBanner(): void { banner.hidden = true; }

  function showFeedback(i: number, correct: boolean, gain: number, expected: PoseAction | null): void {
    const el = container.querySelector<HTMLElement>(`[data-fb="${i}"]`)!;
    el.className = `br-feedback ${correct ? 'ok' : 'bad'}`;
    el.innerHTML = correct
      ? `<b>성공!</b><span>+${gain}</span>`
      : `<b>앗!</b><span>정답: ${expected ? actionLabel(expected) : '아무것도 안 하기'}</span>`;
    el.hidden = false;
  }
  function hideFeedback(i: number): void { container.querySelector<HTMLElement>(`[data-fb="${i}"]`)!.hidden = true; }

  function toast(msg: string): void {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  // ── 시작 ───────────────────────────────
  const offDebug = mountDebugPanel(container, CONFIG as unknown as Record<string, unknown>, '몸이 말을 안 들어!');
  startRound(0, performance.now());
  raf = requestAnimationFrame(tick);

  // 개발 중 확인용
  (window as unknown as { __bodyRebel?: unknown }).__bodyRebel = {
    get phase() { return phase; }, get question() { return q; }, get round() { return round; }, players, log, COLORS,
  };

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(toastTimer);
      offAction();
      offDebug();
      container.innerHTML = '';
    },
  };
}

// ── 공통 게임 모듈 (src/games/types.ts) ─────────────
const game: GameModule<'camera-pose'> = {
  setup: 'camera-pose',
  modes: [
    { players: 1, label: '👤 혼자 하기' },
    { players: 2, label: '👥 둘이 대결 (한 카메라)' },
  ],
  start(container, input, { onFinish }) {
    return start(container, input, {
      onFinish: (r) => onFinish({
        scores: r.scores,
        details: r.correctCounts.map((c) => `${r.questionCount}문제 중 ${c}개 성공`),
        summary: [`플레이 시간 ${Math.round(r.durationMs / 1000)}초`, `인식이 끊겨 멈춘 횟수 ${r.inputLossCount}번`],
        log: r,
      }),
    });
  },
};
export default game;
