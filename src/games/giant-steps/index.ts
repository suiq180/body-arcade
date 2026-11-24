// 두 다리 거인 — 거인 한 명의 왼다리는 P1, 오른다리는 P2가 맡아 번갈아 걷는 협동 게임 (docs/games/giant-steps.md)
// 입력: 아케이드 스틱 어댑터 (P1 레버·버튼 = 왼다리, P2 = 오른다리)
// 흐름: 코스 고르기(스틱으로) → 걷기·장애물 → 결승선 → 결과. 코스를 깨면 다음 코스가 열린다 (브라우저에 저장).
// 판정은 rules.ts, 3D 그리기는 render3d.ts(코스·장애물) + giant3d.ts(관절 다리 거인).

import type { ArcadeEvent, Player } from '../../input/arcade';
import { ARCADE_COLORS, mountArcadePanel } from '../../shared/arcade-panel';
import { mountDebugPanel } from '../../shared/debug-panel';
import { sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { ALL_COURSES_OPEN, CONFIG, STAR_TIMES_SEC } from './config';
import { GiantView } from './render3d';
import {
  COURSE_DEFS, FALL_LABEL, GiantSim, OBSTACLE_INFO, makeCourse, scoreFor, starsFor,
  type Leg,
} from './rules';
import './style.css';

const SAVE_KEY = 'giant-steps:progress';
const BUTTON_NAMES = { b1: '팔', b2: '웅크리기', b3: '점프' };

interface Progress { unlocked: number; stars: number[] }

function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Progress | null;
    if (p && typeof p.unlocked === 'number') return p;
  } catch { /* 저장 내용이 깨졌으면 처음부터 */ }
  return { unlocked: 1, stars: [] };
}

function saveProgress(p: Progress): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch { /* 저장 못 해도 진행은 됨 */ }
}

const game: GameModule<'arcade'> = {
  setup: 'arcade',
  modes: [{ players: 2, label: '▶ 둘이 협동' }, { players: 1, label: '혼자 연습 (레버 2개를 양손으로)' }],
  arcadeRoles: (players) => (players === 1 ? ['왼손 레버 · 왼다리', '오른손 레버 · 오른다리'] : ['P1 · 왼다리', 'P2 · 오른다리']),

  start(container, input, { players, onFinish }) {
    const solo = players === 1;
    container.innerHTML = `
      <div class="gs-wrap">
        <div class="br-hud gs-hud">
          <span data-el="course">코스 고르기</span>
          <span class="gs-stats"><span>⏱ <b data-el="time">0.0</b>초</span><span>💥 <b data-el="falls">0</b>회</span><span>🚩 <b data-el="prog">0</b>%</span></span>
        </div>
        <div class="gs-balance"><span>⬅ 왼쪽</span><div class="gs-gauge"><i data-el="marker"></i></div><span>오른쪽 ➡</span></div>
        <div class="gs-stage br-stage" data-el="stage">
          <div class="gs-hint" data-el="hint"></div>
          <div class="gs-toast" data-el="toast" hidden></div>
          <div class="gs-overlay" data-el="select"></div>
          <div class="gs-overlay" data-el="fallen" hidden><div class="gs-box"><b>쿵! 넘어졌어요</b><p data-el="fallWhy"></p><p>둘이 <b>아무 버튼이나 연타</b>해서 일으키세요</p><div class="gs-bar"><i data-el="getup"></i></div></div></div>
          <div class="br-pause" data-el="pause" hidden><div><b>⏸ 잠깐 멈췄어요</b><p data-el="pauseText">START를 누르면 이어서 해요.</p></div></div>
        </div>
        <div class="gs-panels"><div data-el="p0"></div><div data-el="p1"></div></div>
      </div>`;
    const $ = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
    const roles = game.arcadeRoles!(players);
    const panels = ([0, 1] as Player[]).map((p) =>
      mountArcadePanel($(`[data-el="p${p}"]`), input, p, { title: roles[p], color: ARCADE_COLORS[p], buttonNames: BUTTON_NAMES }));

    const progress = loadProgress();
    /** 지금 고를 수 있는 코스 수 */
    const openCount = (): number => (ALL_COURSES_OPEN ? COURSE_DEFS.length : progress.unlocked);
    let selected = Math.min(progress.unlocked, COURSE_DEFS.length) - 1; // 처음엔 마지막으로 연 코스에 커서
    let sim: GiantSim | null = null;
    const view = new GiantView($('[data-el="stage"]'), CONFIG);
    /** 코스 고르기 중에 보여 줄 코스 (거인이 출발선에 서 있음) */
    let preview = new GiantSim(makeCourse(selected), CONFIG);
    let paused = false;
    let finished = false;
    let raf = 0;
    let last = performance.now();
    let toastUntil = 0;
    let warnAt = 0;
    const inputs = [0, 0];
    let nextHintLeg: Leg = 0;

    // ── 코스 고르기 (레버 ←→ + 버튼 1, 또는 클릭) ──
    function renderSelect(): void {
      const el = $('[data-el="select"]');
      el.hidden = false;
      el.innerHTML = `<div class="gs-box gs-select">
        <b>코스를 고르세요</b>
        <div class="gs-courses">${COURSE_DEFS.map((c, i) => {
          const locked = i >= openCount();
          const stars = progress.stars[i] ?? 0;
          return `<button type="button" class="gs-course${i === selected ? ' on' : ''}" data-course="${i}" ${locked ? 'disabled' : ''}>
            <span class="gs-course-icon">${locked ? '🔒' : c.theme}</span><b>${i + 1}. ${c.name}</b>
            <small>${c.obstacles.length ? [...new Set(c.obstacles)].map((k) => OBSTACLE_INFO[k].icon).join(' ') : '걷기 연습'}</small>
            <small class="gs-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</small></button>`;
        }).join('')}</div>
        <p class="small">레버 ←→로 고르고 <b>버튼 1</b>로 시작 · 장애물 위치는 매번 바뀌어요</p></div>`;
    }

    function startCourse(i: number): void {
      if (i >= openCount()) return;
      selected = i;
      sim = new GiantSim(makeCourse(i), CONFIG);
      $('[data-el="select"]').hidden = true;
      $('[data-el="course"]').textContent = `코스 ${i + 1} · ${COURSE_DEFS[i].name}`;
      inputs[0] = inputs[1] = 0;
      nextHintLeg = 0;
      sfx.roundStart();
    }

    $('[data-el="select"]').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-course]');
      if (b) startCourse(Number(b.dataset.course));
    });

    // ── 스틱 입력 → 거인 ──
    const offInput = input.on('input', (e: ArcadeEvent) => {
      if (finished) return;
      const leg = e.player as Leg;
      if (e.down && e.control === 'start') { if (sim && sim.state !== 'done') togglePause(); return; }
      if (!sim) {
        if (!e.down) return;
        if (e.control === 'left' || e.control === 'right') {
          const max = openCount() - 1;
          selected = Math.max(0, Math.min(max, selected + (e.control === 'right' ? 1 : -1)));
          preview = new GiantSim(makeCourse(selected), CONFIG);
          sfx.tick();
          renderSelect();
        } else if (e.control === 'b1') startCourse(selected);
        return;
      }
      if (paused) return;
      if (e.down) inputs[e.player]++;
      const { x } = input.lever(e.player);
      switch (e.control) {
        case 'up': if (e.down) sim.lift(leg, x); else sim.place(leg); break;
        case 'down': if (e.down) sim.place(leg); break;
        case 'left': case 'right': if (e.down) sim.setStride(leg, x); break;
        case 'b1': if (e.down) { sim.arm(leg); view.armWave(leg); } break;
        case 'b2': if (e.down) sim.crouchPress(leg); else sim.crouchRelease(leg); break;
        case 'b3': if (e.down) sim.jumpPress(leg); break;
        default: if (e.down) sim.getUpPress();
      }
    });

    function togglePause(): void {
      paused = !paused;
      $('[data-el="pauseText"]').textContent = 'START를 누르면 이어서 해요.';
    }

    function toast(text: string, ms = 1200): void {
      const el = $('[data-el="toast"]');
      el.textContent = text;
      el.hidden = false;
      toastUntil = performance.now() + ms;
    }

    /** 시뮬레이션이 남긴 일(디딤·넘어짐·동시 동작 등)을 화면·소리로 */
    function handleEvents(s: GiantSim): void {
      for (const ev of s.events.splice(0)) {
        view.event(ev, s);
        switch (ev.type) {
          case 'step': sfx.question(); nextHintLeg = (1 - ev.leg) as Leg; break;
          case 'fall':
            sfx.wrong();
            $('[data-el="fallWhy"]').textContent = FALL_LABEL[ev.cause];
            if (ev.cause === 'water' || ev.cause === 'pit') toast(`${ev.cause === 'water' ? '💦 풍덩!' : '🕳️ 쿵!'} 체크포인트에서 다시`, 1400);
            break;
          case 'getup': toast('으라차차! 일어났어요'); break;
          case 'sync': sfx.correct(); toast(`호흡 척척! (${Math.round(ev.diffMs)}ms)`); break;
          case 'checkpoint': toast('🚩 체크포인트'); break;
          case 'land': sfx.tick(); break;
          case 'finish': finishCourse(s); break;
          case 'respawn': break;
        }
      }
    }

    function finishCourse(s: GiantSim): void {
      finished = true;
      const timeSec = s.time / 1000;
      const times = STAR_TIMES_SEC[s.course.index];
      const stars = starsFor(timeSec, times);
      const score = scoreFor(timeSec, stars, times, CONFIG);
      const i = s.course.index;
      progress.stars[i] = Math.max(progress.stars[i] ?? 0, stars);
      if (stars > 0) progress.unlocked = Math.max(progress.unlocked, Math.min(COURSE_DEFS.length, i + 2));
      saveProgress(progress);
      sfx.finish();
      cancelAnimationFrame(raf);
      const fallCount = s.falls.length;
      onFinish({
        scores: [score],
        names: [solo ? '혼자 연습' : '거인 팀 (P1 + P2)'],
        details: [`${timeSec.toFixed(1)}초 · ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · 넘어짐 ${fallCount}회`],
        summary: [
          `코스 ${i + 1} ${COURSE_DEFS[i].name} — 별 기준 ${times[0]}초 / ${times[1]}초 / ${times[2]}초`,
          stars > 0 ? (i + 1 < COURSE_DEFS.length ? `다음 코스 「${COURSE_DEFS[i + 1].name}」가 열렸어요` : '모든 코스를 깼어요!') : '별을 하나 이상 받으면 다음 코스가 열려요',
          ...(fallCount ? [`넘어진 이유: ${[...new Set(s.falls.map((f) => FALL_LABEL[f.cause]))].join(', ')}`] : []),
        ],
        log: {
          course: i + 1,
          obstacles: s.course.obstacles.map((o) => ({ kind: o.kind, a: o.a, b: o.b })),
          timeSec: Number(timeSec.toFixed(2)),
          stars,
          falls: s.falls,
          syncDiffs: s.syncDiffs,
          inputs: { p1: inputs[0], p2: inputs[1] },
          config: { ...CONFIG },
        },
      });
    }

    function hud(s: GiantSim): void {
      $('[data-el="time"]').textContent = (s.time / 1000).toFixed(1);
      $('[data-el="falls"]').textContent = String(s.falls.length);
      $('[data-el="prog"]').textContent = String(Math.round(s.progress * 100));
      const b = Math.max(-1, Math.min(1, s.balance / CONFIG.fallThreshold));
      const marker = $('[data-el="marker"]');
      marker.style.left = `${50 + b * 50}%`;
      marker.className = Math.abs(b) > 0.7 ? 'danger' : Math.abs(b) > 0.4 ? 'warn' : '';
      // 기울기 경고음: 많이 기울수록 빨라짐
      const now = performance.now();
      if (Math.abs(b) > 0.5 && s.state === 'stand' && now >= warnAt) { sfx.tick(); warnAt = now + 520 - Math.abs(b) * 400; }
      // 안내: 코스 1은 걷는 순서, 그 밖에는 다가오는 장애물 요령
      const ahead = s.course.obstacles.find((o) => o.b > s.bodyX && o.a - s.bodyX < 260);
      const hint = $('[data-el="hint"]');
      hint.innerHTML = ahead
        ? `${OBSTACLE_INFO[ahead.kind].icon} <b>${OBSTACLE_INFO[ahead.kind].name}</b> — ${OBSTACLE_INFO[ahead.kind].tip}`
        : s.course.index === 0
          ? `다음: <b style="color:${ARCADE_COLORS[nextHintLeg]}">${nextHintLeg ? '오른발 (P2)' : '왼발 (P1)'}</b> 레버 ↑ 들었다가 놓기`
          : '';
      hint.hidden = !hint.innerHTML;
      $('[data-el="fallen"]').hidden = s.state !== 'fallen';
      $<HTMLElement>('[data-el="getup"]').style.width = `${(s.getUp / CONFIG.getUpPresses) * 100}%`;
    }

    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(100, now - last);
      last = now;
      // 컨트롤러가 빠지면 자동 일시정지 (기획서 8.4)
      const lost = ([0, 1] as Player[]).filter((p) => !input.connected(p));
      if (lost.length && sim && !paused) {
        paused = true;
        $('[data-el="pauseText"]').textContent = `${lost.map((p) => roles[p]).join(', ')} 컨트롤러가 빠졌어요. 다시 꽂고 START를 누르세요.`;
      }
      $('[data-el="pause"]').hidden = !paused;
      if (sim && !paused && !finished) {
        sim.update(dt);
        handleEvents(sim);
      }
      if (finished) return;
      if (sim) { hud(sim); view.render(sim); } else view.renderPreview(preview);
      panels.forEach((u) => u());
      if (now > toastUntil) $('[data-el="toast"]').hidden = true;
    }

    renderSelect();
    const onResize = () => view.resize();
    window.addEventListener('resize', onResize);
    const offDebug = mountDebugPanel(container, CONFIG, '두 다리 거인');
    (window as unknown as { __giant?: unknown }).__giant = { input, get sim() { return sim; }, view, startCourse };
    raf = requestAnimationFrame(tick);

    return {
      destroy() {
        finished = true;
        cancelAnimationFrame(raf);
        offInput();
        offDebug();
        window.removeEventListener('resize', onResize);
        view.dispose();
        container.innerHTML = '';
      },
    };
  },
};

export default game;
