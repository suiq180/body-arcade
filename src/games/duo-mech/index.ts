// 합체 로봇 조종석 — 로봇 한 대를 둘이 나눠 탄다: 다리(이동·점프·대시) / 팔(조준·무기·방패) (docs/games/duo-mech.md)
// 입력: 아케이드 스틱 어댑터. 1인 + AI 모드는 사람이 P1 조작으로 한 역할, AI가 나머지 역할.
// 흐름: [스테이지 사이 화면: 역할 교대(선택) + 부품 강화 상점] → 보스전 → … 5스테이지 → 결과
// 판정은 rules.ts(2D), 그리기는 render3d.ts(Three.js).

import type { ArcadeControl, ArcadeEvent, Player } from '../../input/arcade';
import { ARCADE_COLORS, mountArcadePanel } from '../../shared/arcade-panel';
import { mountDebugPanel } from '../../shared/debug-panel';
import { escapeHtml } from '../../shared/html';
import { sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { MechAI } from './ai';
import { CONFIG, SHOP_ITEMS, SHOP_MAX_LEVEL, STAGE_SELECT, type UpgradeId } from './config';
import { MechView } from './render3d';
import {
  BOSSES, NO_ARMS, NO_LEGS, NO_UPGRADES, PATTERN_INFO, MechSim, stageParts, stageScore,
  type ArmsInput, type LegsInput, type PatternKind, type Role, type Upgrades,
} from './rules';
import './style.css';

type Pilot = Player | 'ai';
const ROLE_NAME: Record<Role, string> = { legs: '다리', arms: '팔' };
const BUTTONS: Record<Role, Partial<Record<ArcadeControl, string>>> = {
  legs: { b1: '점프', b2: '대시', b3: '버티기', b5: '합동', b6: '합동' },
  arms: { b1: '레이저', b2: '미사일', b3: '방패', b4: '집게', b5: '합동', b6: '합동' },
};
const AI_COLOR = '#adb5bd';

interface StageLog {
  stage: number;
  boss: string;
  pilots: Record<Role, string>;
  cleared: boolean;
  timeSec: number;
  hp: number;
  hits: Partial<Record<PatternKind, { count: number; role: string; pilot: string }>>;
  combos: number;
  specials: number;
  energyUse: Record<string, number>;
  score: number;
}

const game: GameModule<'arcade'> = {
  setup: 'arcade',
  modes: [{ players: 2, label: '▶ 둘이 협동' }, { players: 1, label: '혼자 + AI (다리 또는 팔)' }],
  arcadeRoles: (players) => (players === 1 ? ['나 (P1 레버·버튼)', 'P2 (쓰지 않음)'] : ['P1 · 처음엔 다리', 'P2 · 처음엔 팔']),

  start(container, input, { players, onFinish }) {
    const solo = players === 1;
    container.innerHTML = `
      <div class="dm-wrap">
        <div class="dm-hud">
          <div class="dm-meter"><span>🤖 체력</span><div class="dm-bar hp"><i data-el="hp"></i></div><b data-el="hpText"></b></div>
          <div class="dm-meter"><span>🔋 에너지</span><div class="dm-bar en"><i data-el="en"></i></div><b data-el="enText"></b></div>
          <div class="dm-meter"><span>🤝 합동</span><div class="dm-combo" data-el="combo"></div></div>
          <div class="dm-meter boss"><span data-el="bossName"></span><div class="dm-bar boss"><i data-el="bossHp"></i></div></div>
        </div>
        <div class="dm-stage" data-el="stage">
          <div class="dm-hint" data-el="hint" hidden></div>
          <div class="dm-toast" data-el="toast" hidden></div>
          <div class="dm-sub" data-el="sub"></div>
          <div class="dm-overlay" data-el="menu" hidden></div>
          <div class="dm-overlay" data-el="down" hidden><div class="dm-box"><b>💥 로봇 다운!</b><p>두 조종사가 <b>합동 신호(버튼 5 또는 6)</b>를 동시에 누르면 부활해요 (한 판에 1번)</p><p class="dm-count" data-el="downCount"></p></div></div>
          <div class="br-pause" data-el="pause" hidden><div><b>⏸ 잠깐 멈췄어요</b><p data-el="pauseText">START를 누르면 이어서 해요.</p></div></div>
        </div>
        <div class="dm-panels"><div data-el="p0"></div><div data-el="p1"></div></div>
      </div>`;
    const $ = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
    const stageEl = $('[data-el="stage"]');

    // ── 한 판 전체 상태 ──
    const run = {
      stage: 0,
      score: 0,
      parts: 0,
      upgrades: { ...NO_UPGRADES } as Upgrades,
      reviveUsed: false,
      /** 역할 → 맡은 사람. 1인 모드는 사람이 P1 조작으로 한 역할 */
      pilots: { legs: 0, arms: solo ? 'ai' : 1 } as Record<Role, Pilot>,
      logs: [] as StageLog[],
    };
    let sim: MechSim | null = null;
    let view: MechView | null = null;
    let ai = new MechAI();
    let phase: 'menu' | 'fight' | 'over' = 'menu';
    let paused = false;
    let raf = 0;
    let last = performance.now();
    let toastUntil = 0;
    let panelUpdaters: (() => void)[] = [];
    let menuCursor = 0;
    let menuItems: { label: string; act: () => void; disabled?: boolean }[] = [];
    const hitFlash: [number, number] = [0, 0];
    /** 이번 프레임에 "누른" 조작 (점프·대시·집게·합동 신호처럼 한 번만 반응하는 것) */
    const pressed: [Set<ArcadeControl>, Set<ArcadeControl>] = [new Set(), new Set()];

    const pilotName = (p: Pilot) => (p === 'ai' ? 'AI' : solo ? '나' : `P${p + 1}`);
    const pilotColor = (p: Pilot) => (p === 'ai' ? AI_COLOR : ARCADE_COLORS[p]);
    const humanOf = (role: Role): Player | null => (run.pilots[role] === 'ai' ? null : (run.pilots[role] as Player));
    const usedPlayers = (): Player[] => (solo ? [0] : [0, 1]);

    function mountPanels(): void {
      panelUpdaters = ([0, 1] as Player[]).map((p) => {
        const role = (Object.keys(run.pilots) as Role[]).find((r) => run.pilots[r] === p);
        const el = $(`[data-el="p${p}"]`);
        el.hidden = solo && p === 1;
        return mountArcadePanel(el, input, p, {
          title: role ? `${pilotName(p)} · ${ROLE_NAME[role]}` : `${pilotName(p)}`,
          color: ARCADE_COLORS[p],
          buttonNames: role ? BUTTONS[role] : undefined,
        });
      });
    }

    // ── 스테이지 사이 화면: 역할 교대(선택) + 부품 강화 상점 ──
    function showMenu(): void {
      phase = 'menu';
      const boss = BOSSES[run.stage];
      const menu = $('[data-el="menu"]');
      menu.hidden = false;
      menuItems = [];
      if (solo) {
        const mine = (Object.keys(run.pilots) as Role[]).find((r) => run.pilots[r] === 0)!;
        menuItems.push({ label: `내 역할: <b>${ROLE_NAME[mine]}</b> ⇄ (AI: ${ROLE_NAME[mine === 'legs' ? 'arms' : 'legs']})`, act: swapRoles });
      } else {
        menuItems.push({ label: `역할: <b style="color:${pilotColor(run.pilots.legs)}">${pilotName(run.pilots.legs)} 다리</b> · <b style="color:${pilotColor(run.pilots.arms)}">${pilotName(run.pilots.arms)} 팔</b> ⇄ 바꾸기`, act: swapRoles });
      }
      /** 아직 한 스테이지도 안 싸운 첫 화면 (시작 스테이지 고르기, 상점 없음) */
      const firstMenu = run.logs.length === 0;
      if (firstMenu && STAGE_SELECT) {
        menuItems.push({
          label: `시작 스테이지: <b>◀ ${run.stage + 1}. ${BOSSES[run.stage].icon} ${escapeHtml(BOSSES[run.stage].name)} ▶</b> <small>누를 때마다 다음 스테이지</small>`,
          act: () => { run.stage = (run.stage + 1) % BOSSES.length; sfx.tick(); showMenu(); },
        });
      }
      if (!firstMenu) {
        for (const it of SHOP_ITEMS) {
          const lv = run.upgrades[it.id];
          const maxed = lv >= SHOP_MAX_LEVEL;
          menuItems.push({
            label: `${it.icon} ${it.name} <small>${it.desc} · ${'●'.repeat(lv)}${'○'.repeat(SHOP_MAX_LEVEL - lv)}</small> <em>${maxed ? '최대' : `${it.cost} 부품`}</em>`,
            act: () => buy(it.id),
            disabled: maxed || run.parts < it.cost,
          });
        }
      }
      menuItems.push({ label: `▶ 스테이지 ${run.stage + 1} 시작`, act: startStage });
      menuCursor = Math.min(menuCursor, menuItems.length - 1);
      menu.innerHTML = `<div class="dm-box dm-menu">
        <small>스테이지 ${run.stage + 1} / ${BOSSES.length}</small>
        <b class="dm-boss-title">${boss.icon} ${escapeHtml(boss.name)}</b>
        ${!firstMenu ? `<p class="small">🔩 부품 <b>${run.parts}</b>개 · 점수 ${run.score.toLocaleString()}</p>` : `<p class="small">P1·P2 중 누가 다리, 누가 팔을 맡을지 정하세요. 스테이지마다 바꿀 수 있어요 (안 바꿔도 돼요).</p>`}
        <ul>${menuItems.map((m, i) => `<li><button type="button" class="dm-item${i === menuCursor ? ' on' : ''}" data-item="${i}" ${m.disabled ? 'disabled' : ''}>${m.label}</button></li>`).join('')}</ul>
        <p class="small muted">레버 ↑↓로 고르고 <b>버튼 1</b>로 선택 (마우스로 눌러도 돼요)</p></div>`;
    }

    function swapRoles(): void {
      const { legs, arms } = run.pilots;
      run.pilots = { legs: arms, arms: legs };
      sfx.tick();
      mountPanels();
      showMenu();
    }

    function buy(id: UpgradeId): void {
      const it = SHOP_ITEMS.find((x) => x.id === id)!;
      if (run.parts < it.cost || run.upgrades[id] >= SHOP_MAX_LEVEL) { sfx.wrong(); return; }
      run.parts -= it.cost;
      run.upgrades[id]++;
      sfx.item();
      showMenu();
    }

    $('[data-el="menu"]').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-item]');
      if (!b) return;
      menuCursor = Number(b.dataset.item);
      menuItems[menuCursor]?.act();
    });

    function startStage(): void {
      $('[data-el="menu"]').hidden = true;
      view?.dispose();
      sim = new MechSim(run.stage, CONFIG, run.upgrades, { reviveUsed: run.reviveUsed });
      view = new MechView(stageEl, run.stage);
      view.setRoleColors(pilotColor(run.pilots.legs), pilotColor(run.pilots.arms));
      ai = new MechAI();
      phase = 'fight';
      pressed.forEach((s) => s.clear());
      $('[data-el="bossName"]').textContent = `${BOSSES[run.stage].icon} ${BOSSES[run.stage].name}`;
      toast(`STAGE ${run.stage + 1} · ${BOSSES[run.stage].name}`, 1800);
      sfx.roundStart();
    }

    // ── 입력 ──
    const offInput = input.on('input', (e: ArcadeEvent) => {
      if (phase === 'over') return;
      if (e.down && e.control === 'start') { if (phase === 'fight') paused = !paused; return; }
      if (solo && e.player === 1) return;
      if (phase === 'menu') {
        if (!e.down || $('[data-el="menu"]').hidden) return;
        if (e.control === 'up' || e.control === 'down') {
          menuCursor = (menuCursor + (e.control === 'down' ? 1 : -1) + menuItems.length) % menuItems.length;
          sfx.tick();
          showMenu();
        } else if (e.control === 'b1') menuItems[menuCursor]?.act();
        return;
      }
      if (e.down) pressed[e.player].add(e.control);
    });

    /** 사람이 맡은 역할의 입력을 스틱 상태로 만든다 */
    function legsInput(p: Player): LegsInput {
      const lv = input.lever(p);
      const once = pressed[p];
      return {
        move: lv.x, crouch: lv.y < 0, brace: input.held(p, 'b3'),
        jump: once.has('b1'), dash: once.has('b2'), sync: once.has('b5') || once.has('b6'),
      };
    }

    function armsInput(p: Player): ArmsInput {
      const lv = input.lever(p);
      const once = pressed[p];
      return {
        aimX: lv.x, aimY: lv.y, laser: input.held(p, 'b1'), missile: input.held(p, 'b2'), shield: input.held(p, 'b3'),
        grab: once.has('b4'), sync: once.has('b5') || once.has('b6'),
      };
    }

    function toast(text: string, ms = 1200): void {
      const el = $('[data-el="toast"]');
      el.innerHTML = text;
      el.hidden = false;
      toastUntil = performance.now() + ms;
    }

    function flashPilot(role: Role | 'both'): void {
      const roles: Role[] = role === 'both' ? ['legs', 'arms'] : [role];
      roles.forEach((r) => { const p = run.pilots[r]; if (p !== 'ai') hitFlash[p] = performance.now() + 450; });
    }

    function handleEvents(s: MechSim): void {
      for (const ev of s.events.splice(0)) {
        switch (ev.type) {
          case 'telegraph': (ev.kind === 'low' || ev.kind === 'high' ? sfx.question : sfx.warn)(); break;
          case 'hit': sfx.wrong(); view?.bump(0.35); flashPilot(ev.role); break;
          case 'block': toast(`${PATTERN_INFO[ev.kind].icon} 막았다!`, 700); break;
          case 'combo': sfx.correct(); toast('🤝 합동!', 600); view?.bump(0.12); break;
          case 'special': sfx.finish(); toast('🌀 합동 기술!', 1400); view?.bump(0.6); break;
          case 'grab': sfx.item(); toast('🦾 잡았다! 되던지기', 900); break;
          case 'energy-empty': sfx.tick(); toast('🔋 에너지 부족', 800); break;
          case 'phase': sfx.warn(); toast(`⚠️ 보스가 화났어요! (${ev.phase + 1}단계)`, 1600); break;
          case 'revive': run.reviveUsed = true; sfx.roundStart(); toast('✨ 부활!', 1400); break;
          case 'cleared': endStage(true); break;
          case 'failed': endStage(false); break;
          default: break;
        }
      }
    }

    function stageLog(s: MechSim, cleared: boolean, score: number): StageLog {
      const hits: StageLog['hits'] = {};
      (Object.keys(s.stats.hits) as PatternKind[]).forEach((k) => {
        if (!s.stats.hits[k]) return;
        const role = PATTERN_INFO[k].role;
        hits[k] = { count: s.stats.hits[k], role, pilot: role === 'both' ? '둘 다' : pilotName(run.pilots[role]) };
      });
      const energyUse: Record<string, number> = {};
      (['legs', 'arms'] as Role[]).forEach((r) => {
        const who = pilotName(run.pilots[r]);
        energyUse[who] = Math.round((energyUse[who] ?? 0) + s.stats.energyUse[r]);
      });
      return {
        stage: s.stage + 1, boss: s.def.name,
        pilots: { legs: pilotName(run.pilots.legs), arms: pilotName(run.pilots.arms) },
        cleared, timeSec: Number((s.time / 1000).toFixed(1)), hp: s.hp, hits,
        combos: s.stats.combos, specials: s.stats.specials, energyUse, score,
      };
    }

    function endStage(cleared: boolean): void {
      const s = sim!;
      const score = cleared ? stageScore(s) : 0;
      run.score += score;
      run.logs.push(stageLog(s, cleared, score));
      if (cleared) {
        run.parts += stageParts(s);
        sfx.roundStart();
        if (run.stage + 1 < BOSSES.length) {
          toast(`🏆 ${s.def.name} 격파! +${score}점`, 1800);
          run.stage++;
          window.setTimeout(() => { if (phase !== 'over') showMenu(); }, 1600);
          phase = 'menu';
          return;
        }
      }
      finishGame(cleared);
    }

    function finishGame(allClear: boolean): void {
      phase = 'over';
      cancelAnimationFrame(raf);
      sfx.finish();
      const cleared = run.logs.filter((l) => l.cleared).length;
      const combos = run.logs.reduce((a, l) => a + l.combos, 0);
      onFinish({
        scores: [run.score],
        names: [solo ? '나 + AI' : '로봇 팀 (P1 + P2)'],
        details: [`${allClear ? '모든 보스 격파!' : `스테이지 ${cleared}/${BOSSES.length}`} · 합동 공격 ${combos}회`],
        summary: run.logs.map((l) => `${l.stage}. ${l.boss} — ${l.cleared ? `격파 ${l.timeSec}초, 남은 체력 ${l.hp}` : '다운'} · 다리 ${l.pilots.legs} / 팔 ${l.pilots.arms}`),
        log: { mode: solo ? '1인+AI' : '2인', stages: run.logs, upgrades: run.upgrades, reviveUsed: run.reviveUsed, config: { ...CONFIG } },
      });
    }

    // ── 매 프레임 ──
    function hud(s: MechSim): void {
      $<HTMLElement>('[data-el="hp"]').style.width = `${(s.hp / s.hpMax) * 100}%`;
      $('[data-el="hpText"]').textContent = `${Math.ceil(s.hp)}`;
      $<HTMLElement>('[data-el="en"]').style.width = `${(s.energy / s.energyMax) * 100}%`;
      $('[data-el="enText"]').textContent = `${Math.floor(s.energy)}`;
      $<HTMLElement>('[data-el="bossHp"]').style.width = `${(s.boss.hp / s.boss.hpMax) * 100}%`;
      const full = s.comboGauge >= CONFIG.specialGaugeHits;
      $('[data-el="combo"]').innerHTML = Array.from({ length: CONFIG.specialGaugeHits }, (_, i) => `<i class="${i < s.comboGauge ? 'on' : ''}"></i>`).join('')
        + (full ? '<b class="dm-ready">합동 기술! 버튼 5·6 같이</b>' : '');
      // 예고 안내: 연습 스테이지는 누가 무엇을 할지까지
      const tele = s.attacks.find((a) => a.state === 'telegraph');
      const hint = $('[data-el="hint"]');
      if (tele) {
        const info = PATTERN_INFO[tele.kind];
        const who = info.role === 'both' ? '둘이' : `${pilotName(run.pilots[info.role])}(${ROLE_NAME[info.role]})`;
        hint.innerHTML = s.def.tutorial ? `${info.icon} <b>${info.name}</b> — ${who} ${info.action}` : `${info.icon} <b>${info.name}</b>`;
        hint.hidden = false;
      } else hint.hidden = true;
      const r = s.robot;
      const charge = r.missileCharge / (CONFIG.missileChargeSec * 1000);
      $('[data-el="sub"]').innerHTML = charge > 0 ? `🚀 미사일 충전 ${Math.round(charge * 100)}%${charge >= 1 ? ' — 버튼을 떼면 발사!' : ''}` : '';
      $('[data-el="down"]').hidden = s.state !== 'down';
      if (s.state === 'down') $('[data-el="downCount"]').textContent = `${Math.max(0, Math.ceil((CONFIG.reviveTimeoutMs - (s.time - s.downAt)) / 1000))}초 안에!`;
    }

    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(50, now - last);
      last = now;
      // 컨트롤러가 빠지면 자동 일시정지 (기획서 8.4)
      const lost = usedPlayers().filter((p) => !input.connected(p));
      if (lost.length && phase === 'fight' && !paused) {
        paused = true;
        $('[data-el="pauseText"]').textContent = `${lost.map((p) => `P${p + 1}`).join(', ')} 컨트롤러가 빠졌어요. 다시 꽂고 START를 누르세요.`;
      } else if (!lost.length && paused) $('[data-el="pauseText"]').textContent = 'START를 누르면 이어서 해요.';
      $('[data-el="pause"]').hidden = !paused;
      if (sim && view && phase !== 'over') {
        if (phase === 'fight' && !paused && (sim.state === 'fight' || sim.state === 'down')) {
          const lp = humanOf('legs'), ap = humanOf('arms');
          sim.step(dt, lp === null ? ai.legs(sim) : legsInput(lp), ap === null ? ai.arms(sim) : armsInput(ap));
          pressed.forEach((s) => s.clear());
          handleEvents(sim);
        }
        // handleEvents가 판을 끝냈을 수 있다 (phase는 함수 안에서 바뀜)
        if ((phase as string) !== 'over') { hud(sim); view.render(sim); }
      }
      panelUpdaters.forEach((u) => u());
      ([0, 1] as Player[]).forEach((p) => $(`[data-el="p${p}"]`).classList.toggle('dm-hitflash', now < hitFlash[p]));
      if (now > toastUntil) $('[data-el="toast"]').hidden = true;
    }

    const onResize = () => view?.resize();
    window.addEventListener('resize', onResize);
    const offDebug = mountDebugPanel(container, CONFIG, '합체 로봇 조종석');
    mountPanels();
    showMenu();
    (window as unknown as { __mech?: unknown }).__mech = { input, run, get sim() { return sim; }, get view() { return view; }, startStage, showMenu, legsInput, armsInput, NO_LEGS, NO_ARMS };
    raf = requestAnimationFrame(tick);

    return {
      destroy() {
        phase = 'over';
        cancelAnimationFrame(raf);
        offInput();
        offDebug();
        window.removeEventListener('resize', onResize);
        view?.dispose();
        view = null;
        container.innerHTML = '';
      },
    };
  },
};

export default game;
