// 눈치껏 쌓아라 — 손으로 블록을 집어 탑 위에 놓는 심리전 쌓기 게임 (docs/games/stack-sense.md)
// 입력: 카메라 손 추적 어댑터 (손 위치, open / pinch / fist, 손목 회전각)
// 흐름: 대기실(인원·모드) → (배신자 임무 확인) → 라운드 × 5 [차례 → 놓기 → 3초 버티기] → 상점 → 결과
// 혼자 할 때는 AI 상대(로봇)와 겨루고, AI 없이 혼자면 탈락 없는 연습 모드.

import type Matter from 'matter-js';
import type { HandFrame } from '../../input/camera-hand';
import { angleDiff, type HandState } from '../../input/hand-gestures';
import { mountDebugPanel } from '../../shared/debug-panel';
import { HAND_STATE_COLORS, drawHand } from '../../shared/hand-draw';
import { escapeHtml } from '../../shared/html';
import { fitCanvas } from '../../shared/pose-draw';
import { sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { CONFIG, type ItemId, type ShapeId } from './config';
import { TowerWorld } from './physics';
import {
  ITEM_INFO, MODE_LABEL, aiAim, aiShopChoice, assignTraitor, buy, canBuy, createPlayers, finalScore,
  isPractice, nextAlive, pickShape, randRange, releaseVelocity, roundWinner, snapAngle, traitorSucceeded,
  type GameMode, type Player, type TraitorMission,
} from './rules';

type MBody = Matter.Body;
type Phase =
  | 'lobby' | 'reveal' | 'roundIntro' | 'turnIntro' | 'aim' | 'aiThink' | 'aiMove'
  | 'settle' | 'collapse' | 'roundEnd' | 'shop' | 'done';

const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b'];
const HAND_ICON: Record<HandState, string> = { open: '✋', pinch: '🤏', fist: '✊' };
const AI_LEVELS = CONFIG.aiErrorPx.length;

interface TurnLog {
  round: number; player: string; ai: boolean; shape: ShapeId; floorsBefore: number;
  /** 놓는 속도 (화면 높이/초, 상한 적용 후) */
  releaseSpeed: number; x: number; result: 'ok' | 'fell' | 'collapse' | 'timeout-ok' | 'timeout-fell';
  item?: ItemId; handLostMs: number;
}

const game: GameModule<'camera-hand'> = {
  setup: 'camera-hand',
  modes: [{ players: 1, label: '▶ 시작하기 (인원·모드 고르기)' }],

  start(container, input, { onFinish }) {
    Object.assign(input.opts, { smoothing: CONFIG.handSmoothing });
    container.innerHTML = `
      <div class="br-hud"><span class="br-progress" data-el="roundInfo"></span><span class="br-scores" data-el="turnInfo"></span></div>
      <div class="ss-stage" data-el="stage">
        <canvas class="ss-canvas" data-el="canvas"></canvas>
        <aside class="ss-players" data-el="players"></aside>
        <div class="ss-cam"><div class="ss-cam-slot" data-el="camSlot"></div><canvas data-el="camCanvas"></canvas></div>
        <div class="ss-toast" data-el="toast" hidden></div>
        <div class="ss-banner" data-el="banner" hidden></div>
        <div class="ss-overlay" data-el="overlay" hidden></div>
        <div class="br-pause" data-el="pause" hidden><div><b>⏸ 손이 안 보여요</b><p>카메라 앞에 손을 보여 주면 이어서 해요.<br>들고 있던 블록은 그 자리에 멈춰 있어요.</p></div></div>
        <div class="ss-cursor" data-el="cursor" hidden></div>
      </div>
      <p class="br-help muted">✋ 손 펴고 선반 위로 → 🤏 집기 → 손목 돌려 회전 → ✋ 펴서 놓기 · ✊ 주먹 1초 = 아이템 · 화면 버튼도 🤏 집기로 눌러요</p>`;

    const $ = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
    const stage = $('[data-el="stage"]');
    const canvas = $<HTMLCanvasElement>('[data-el="canvas"]');
    const ctx = canvas.getContext('2d')!;
    const camCanvas = $<HTMLCanvasElement>('[data-el="camCanvas"]');
    const camCtx = camCanvas.getContext('2d')!;
    const overlay = $('[data-el="overlay"]');
    const banner = $('[data-el="banner"]');
    const toastEl = $('[data-el="toast"]');
    const cursor = $('[data-el="cursor"]');
    const pauseEl = $('[data-el="pause"]');
    input.video.className = 'ss-cam-video';
    $('[data-el="camSlot"]').appendChild(input.video);

    const rng = Math.random;
    const world = new TowerWorld(CONFIG);
    const W = CONFIG.worldW, H = CONFIG.worldH;

    // ── 게임 상태 ───────────────────────────
    let phase: Phase = 'lobby';
    let phaseUntil = 0;
    let humans = 1, ais = 2;
    let mode: GameMode = 'normal';
    let players: Player[] = [];
    let current = 0;
    let round = 0;
    let traitor: TraitorMission | null = null;
    let revealIdx = 0, revealShown = false;
    let shopQueue: number[] = [];
    let turnStartFloors = 0;
    let fallenThisTurn = 0;
    let turnRemainMs = 0;
    let shelfBlock: MBody | null = null;
    let held: MBody | null = null;
    let placed: MBody | null = null;
    let grabAngle = 0;
    let fistSince = 0;
    let missionDone = false;
    let pending: { windFor: number | null; iceFor: number | null; glue: Set<number> } = { windFor: null, iceFor: null, glue: new Set() };
    let aiPlan: { from: { x: number; y: number }; to: { x: number; y: number }; vx: number; vy: number; start: number } | null = null;
    let turnLog: TurnLog | null = null;
    let handLostMs = 0;
    let lastDangerTick = 0;
    let slowMoUntil = 0;
    const removeQueue: { body: MBody; at: number }[] = [];
    const history: { t: number; x: number; y: number }[] = [];
    const log: { mode?: GameMode; humans?: number; ais?: number; traitor?: TraitorMission | null; turns: TurnLog[]; rounds: { round: number; winner: string | null; maxFloors: number }[]; handLostMs: number } =
      { turns: [], rounds: [], handLostMs: 0 };
    let roundMaxFloors = 0;
    let traitorWinner: number | null = null;

    let hand: HandFrame = input.last;
    let handWorld = { x: W / 2, y: H / 2 };
    /** 탑이 높아지면 화면을 아래로 내려 꼭대기가 보이게 한다 (화면 y = 물리 y + camY) */
    let camY = 0;
    const shelfPos = () => ({ x: CONFIG.shelfX, y: CONFIG.shelfY - camY });
    let hovered: HTMLElement | null = null;
    let raf = 0;
    let last = performance.now();
    let toastTimer = 0;

    // ── 화면 도우미 ─────────────────────────
    function toast(msg: string): void {
      toastEl.textContent = msg;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 2200);
    }
    function showBanner(html: string, warn = false): void {
      banner.innerHTML = html;
      banner.className = `ss-banner${warn ? ' warn' : ''}`;
      banner.hidden = false;
    }
    function hideBanner(): void { banner.hidden = true; }
    function showOverlay(html: string): void { overlay.innerHTML = html; overlay.hidden = false; }
    function hideOverlay(): void { overlay.hidden = true; overlay.innerHTML = ''; hovered = null; }

    const isHumanTurn = () => players[current]?.ai === null;
    const color = (i: number) => COLORS[i % COLORS.length];

    function renderPlayers(): void {
      $('[data-el="players"]').innerHTML = players.map((p, i) => `
        <div class="ss-player${i === current && phase !== 'lobby' ? ' now' : ''}${p.alive ? '' : ' out'}" style="--pc:${color(i)}">
          <span class="ss-dot"></span>
          <b>${escapeHtml(p.name)}${p.ai !== null ? ' 🤖' : ''}</b>
          <span class="ss-meta">🪙${p.coins}${p.item ? ` ${ITEM_INFO[p.item].icon}` : ''}${p.roundWins ? ` 🏆${p.roundWins}` : ''}</span>
        </div>`).join('');
    }
    function renderHud(): void {
      $('[data-el="roundInfo"]').textContent = phase === 'lobby' ? '대기실' : `라운드 ${round}/${CONFIG.roundsPerGame} · ${MODE_LABEL[mode]}${world.quake ? ' · 🌋 지진' : ''}`;
      const p = players[current];
      $('[data-el="turnInfo"]').textContent = !p || phase === 'lobby' || phase === 'reveal' || phase === 'shop' || phase === 'done' ? ''
        : `${p.name}의 차례${phase === 'aim' ? ` · ⏱ ${Math.max(0, Math.ceil(turnRemainMs / 1000))}초` : ''}`;
    }

    // ── 대기실 ─────────────────────────────
    function showLobby(): void {
      phase = 'lobby';
      const total = humans + ais;
      const traitorOk = total >= 3;
      if (!traitorOk && mode === 'traitor') mode = 'normal';
      showOverlay(`<div class="ss-panel">
        <h2>🧱 눈치껏 쌓아라</h2>
        <div class="ss-row"><span>사람</span><button class="btn ghost" data-act="h-">−</button><b>${humans}명</b><button class="btn ghost" data-act="h+">+</button></div>
        <div class="ss-row"><span>AI 상대 🤖</span><button class="btn ghost" data-act="a-">−</button><b>${ais}명</b><button class="btn ghost" data-act="a+">+</button></div>
        <p class="small">${total === 1 ? '혼자 연습: 탈락 없이 몇 층까지 쌓는지 도전해요.' : `모두 ${total}명 · 한 카메라 앞에서 차례로 해요${ais ? ' (AI는 자동으로 둬요)' : ''}`}</p>
        <div class="ss-row modes">
          ${(Object.keys(MODE_LABEL) as GameMode[]).map((m) => `<button class="btn ${m === mode ? 'primary' : 'ghost'}" data-act="mode-${m}" ${m === 'traitor' && !traitorOk ? 'disabled' : ''}>${MODE_LABEL[m]}</button>`).join('')}
        </div>
        <p class="small">${mode === 'normal' ? '기본 규칙: 탑을 무너뜨린 사람이 라운드 탈락!' : mode === 'traitor' ? '한 명이 몰래 "정확히 N층에서 무너뜨리기" 임무를 받아요 (3명 이상).' : '공·삼각형·긴 막대 같은 특수 블록과 "5층 넘기기" 미션이 나와요.'}</p>
        <button class="btn primary big" data-act="go">▶ 게임 시작</button>
      </div>`);
      renderPlayersPreview();
    }
    function renderPlayersPreview(): void {
      players = createPlayers(humans, ais, AI_LEVELS);
      renderPlayers();
    }

    function onAct(act: string): void {
      sfx.tick();
      const total = humans + ais;
      if (act === 'h-' && humans > 1) humans--;
      else if (act === 'h+' && total < CONFIG.maxPlayers) humans++;
      else if (act === 'a-' && ais > 0) ais--;
      else if (act === 'a+' && total < CONFIG.maxPlayers && ais < 5) ais++;
      else if (act.startsWith('mode-')) mode = act.slice(5) as GameMode;
      else if (act === 'go') { startGame(); return; }
      else if (act === 'reveal-show') { revealShown = true; showReveal(); return; }
      else if (act === 'reveal-next') { revealIdx++; revealShown = false; showReveal(); return; }
      else if (act.startsWith('buy-')) { shopBuy(act.slice(4) as ItemId); return; }
      else if (act === 'shop-skip') { nextShopper(); return; }
      if (phase === 'lobby') showLobby();
    }
    overlay.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (b && !b.disabled) onAct(b.dataset.act!);
    });

    // ── 게임 시작 · 배신자 임무 ─────────────────
    function startGame(): void {
      players = createPlayers(humans, ais, AI_LEVELS);
      log.mode = mode; log.humans = humans; log.ais = ais;
      traitor = mode === 'traitor' ? assignTraitor(players.length, CONFIG, rng) : null;
      log.traitor = traitor;
      round = 0;
      if (traitor && humans > 0) { phase = 'reveal'; revealIdx = 0; revealShown = false; showReveal(); }
      else { hideOverlay(); nextRound(); }
    }

    function showReveal(): void {
      if (revealIdx >= humans) { hideOverlay(); nextRound(); return; }
      const name = players[revealIdx].name;
      if (!revealShown) {
        showOverlay(`<div class="ss-panel"><h2>🙈 ${name}만 화면을 보세요</h2>
          <p>다른 사람은 눈을 감거나 뒤돌아 주세요.</p>
          <button class="btn primary big" data-act="reveal-show">${name} 임무 확인하기</button></div>`);
      } else {
        const mine = traitor!.player === revealIdx;
        showOverlay(`<div class="ss-panel ${mine ? 'traitor' : ''}"><h2>${mine ? '🕵️ 당신은 배신자!' : '🙂 임무 없음'}</h2>
          <p>${mine ? `자기 차례에 탑을 <b>정확히 ${traitor!.floor}층</b>일 때 무너뜨리면 단독 승리!` : '평소처럼 탑을 쌓아 끝까지 살아남으세요. 배신자를 조심!'}</p>
          <button class="btn primary big" data-act="reveal-next">가리고 다음으로</button></div>`);
      }
    }

    // ── 라운드 · 차례 ─────────────────────────
    function nextRound(): void {
      round++;
      players.forEach((p) => { p.alive = true; });
      world.clear();
      removeQueue.length = 0;
      world.quake = round >= CONFIG.quakeFromRound;
      missionDone = false;
      roundMaxFloors = 0;
      pending = { windFor: null, iceFor: null, glue: new Set() };
      current = (round - 1) % players.length;
      phase = 'roundIntro';
      phaseUntil = performance.now() + CONFIG.roundIntroMs;
      sfx.roundStart();
      showBanner(`<small>라운드 ${round} / ${CONFIG.roundsPerGame}</small><b>${MODE_LABEL[mode]}</b>
        <p>${world.quake ? '🌋 지진! 탑이 천천히 흔들려요<br>' : ''}${mode === 'special' ? `미션: 탑을 ${CONFIG.specialMissionFloor}층 넘기면 🪙+${CONFIG.specialMissionCoins}` : isPractice(players) ? '무너질 때까지 높이 쌓아요!' : '무너뜨린 사람은 탈락!'}</p>`);
      renderPlayers();
    }

    function startTurn(i: number): void {
      current = i;
      turnStartFloors = world.standing().length;
      fallenThisTurn = 0;
      handLostMs = 0;
      fistSince = 0;
      held = null; placed = null; aiPlan = null;
      const p = players[i];
      shelfBlock = world.makeBlock(pickShape(turnStartFloors, mode, CONFIG, rng), color(i), shelfPos().x, shelfPos().y);
      turnLog = { round, player: p.name, ai: p.ai !== null, shape: world.blockInfo(shelfBlock)!.shape, floorsBefore: turnStartFloors, releaseSpeed: 0, x: 0, result: 'ok', handLostMs: 0 };
      phase = 'turnIntro';
      phaseUntil = performance.now() + CONFIG.turnIntroMs;
      const effects = [pending.windFor === i ? '🌬️ 바람 주의!' : '', pending.iceFor === i ? '🧊 미끄러운 블록!' : ''].filter(Boolean).join(' ');
      showBanner(`<b style="color:${color(i)}">${escapeHtml(p.name)}의 차례!</b><p>${p.ai !== null ? '🤖 로봇이 쌓는 중…' : '카메라 앞에 손을 보여 주세요'}${effects ? `<br>${effects}` : ''}</p>`);
      renderPlayers();
    }

    function beginPlay(): void {
      hideBanner();
      const p = players[current];
      if (p.ai !== null) {
        if (p.item && rng() < CONFIG.aiItemChance) useItem(current);
        phase = 'aiThink';
        phaseUntil = performance.now() + randRange(CONFIG.aiThinkMinMs, CONFIG.aiThinkMaxMs, rng);
      } else {
        phase = 'aim';
        turnRemainMs = CONFIG.turnTimeSec * 1000;
      }
    }

    // ── 집기 · 놓기 ───────────────────────────
    function nearShelf(scale = 1): boolean {
      const sp = shelfPos();
      return Math.hypot(handWorld.x - sp.x, handWorld.y - sp.y) < CONFIG.grabRadius * scale;
    }

    function grab(): void {
      if (!shelfBlock) return;
      held = shelfBlock;
      shelfBlock = null;
      grabAngle = hand.angle;
      history.length = 0;
      sfx.question();
    }

    /** 놓기: vx·vy는 화면 높이/초 (상한 적용 전 손 속도) */
    function release(vxH: number, vyH: number, x: number, y: number, timeout = false): void {
      const body = held ?? shelfBlock;
      if (!body) return;
      const v = releaseVelocity(vxH, vyH, CONFIG);
      world.pose(body, x, y, body === held ? currentHeldAngle() : 0);
      world.drop(body, v.vx * H, v.vy * H, { glue: pending.glue.has(current), ice: pending.iceFor === current });
      pending.glue.delete(current);
      if (pending.iceFor === current) pending.iceFor = null;
      if (pending.windFor === current) { world.startWind(rng() < 0.5 ? -1 : 1); pending.windFor = null; }
      placed = body; held = null; shelfBlock = null;
      if (turnLog) { turnLog.releaseSpeed = Math.round(Math.hypot(v.vx, v.vy) * 100) / 100; turnLog.x = Math.round(x); if (timeout) turnLog.result = 'timeout-ok'; }
      phase = 'settle';
      phaseUntil = performance.now() + CONFIG.settleCheckSec * 1000;
      sfx.tick();
    }

    function currentHeldAngle(): number {
      return snapAngle(angleDiff(hand.angle, grabAngle), CONFIG.rotateSnapDeg);
    }

    function handVelocity(now: number): { vx: number; vy: number } {
      const old = history.find((h) => now - h.t <= CONFIG.velocityWindowMs) ?? history[0];
      const cur = history[history.length - 1];
      if (!old || !cur || cur.t - old.t < 16) return { vx: 0, vy: 0 };
      const dt = (cur.t - old.t) / 1000;
      return { vx: (cur.x - old.x) / dt / H, vy: (cur.y - old.y) / dt / H };
    }

    function timeoutDrop(): void {
      const top = world.top();
      if (!held && !shelfBlock) return;
      toast('⏰ 시간 초과! 블록이 무작위로 떨어져요');
      release(0, 0, top.x + randRange(-0.35, 0.35, rng) * CONFIG.baseWidth, top.y - 140, true);
    }

    function useItem(i: number): void {
      const p = players[i];
      const item = p.item;
      if (!item) return;
      p.item = null;
      sfx.item();
      if (turnLog) turnLog.item = item;
      const nxt = nextAlive(players, i);
      if (item === 'glue') pending.glue.add(i);
      if (item === 'wind') pending.windFor = nxt;
      if (item === 'ice') pending.iceFor = nxt;
      if (item === 'remove') world.removeRandom(rng);
      toast(`${ITEM_INFO[item].icon} ${p.name}: ${ITEM_INFO[item].name}! ${ITEM_INFO[item].desc}`);
      renderPlayers();
    }

    // ── 판정 ─────────────────────────────────
    function onFallen(n: number, now: number, bodies: MBody[]): void {
      bodies.forEach((b) => removeQueue.push({ body: b, at: now + 1200 }));
      if (!['aim', 'aiThink', 'aiMove', 'settle', 'turnIntro'].includes(phase)) return;
      fallenThisTurn += n;
      if (fallenThisTurn >= CONFIG.collapseFallenBlocks) collapse(now);
    }

    function collapse(now: number): void {
      const floorsBefore = turnStartFloors;
      roundMaxFloors = Math.max(roundMaxFloors, floorsBefore);
      if (turnLog) { turnLog.result = 'collapse'; pushTurnLog(); }
      phase = 'collapse';
      phaseUntil = now + CONFIG.slowMoMs;
      slowMoUntil = now + CONFIG.slowMoMs;
      world.setSlowMo(true);
      sfx.wrong(); sfx.warn();
      stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
      if (traitorSucceeded(traitor, current, floorsBefore)) {
        showBanner(`<b>와르르!</b><p>🕵️ ${escapeHtml(players[current].name)}는 배신자였어요!<br>정확히 ${traitor!.floor}층에서 무너뜨려 <b>단독 승리!</b></p>`, true);
        traitorWinner = current;
        phaseUntil = now + CONFIG.roundResultMs;
        return;
      }
      players[current].alive = false;
      showBanner(`<b>와르르!</b><p>${escapeHtml(players[current].name)}${isPractice(players) ? ` — ${floorsBefore}층에서 무너졌어요` : ' 탈락!'}</p>`, true);
      renderPlayers();
    }

    function afterCollapse(): void {
      world.setSlowMo(false);
      if (traitorWinner !== null) { finish(traitorWinner); return; }
      const w = roundWinner(players);
      if (w !== null) { endRound(w); return; }
      world.clear(); // 남은 사람끼리 새 탑으로 계속
      startTurn(nextAlive(players, current));
    }

    function settleDone(now: number): void {
      // 아직 흔들리고 있으면 최대 2초 더 기다린다
      if (!world.settled() && now - phaseUntil < 2000) return;
      const p = players[current];
      const info = placed ? world.blockInfo(placed) : undefined;
      const ok = !!info && !info.fallen;
      if (turnLog) { if (!ok) turnLog.result = turnLog.result === 'timeout-ok' ? 'timeout-fell' : 'fell'; pushTurnLog(); }
      if (ok) {
        p.floors++;
        p.coins += CONFIG.coinPerFloor;
        const floors = world.standing().length;
        roundMaxFloors = Math.max(roundMaxFloors, floors);
        sfx.correct();
        if (mode === 'special' && !missionDone && floors >= CONFIG.specialMissionFloor) {
          missionDone = true;
          p.coins += CONFIG.specialMissionCoins;
          toast(`🎯 미션 성공! ${p.name} 🪙+${CONFIG.specialMissionCoins}`);
        } else toast(`✅ 성공! ${floors}층 · 🪙+${CONFIG.coinPerFloor}`);
      } else {
        toast('😅 블록이 떨어졌어요');
      }
      renderPlayers();
      startTurn(isPractice(players) ? 0 : nextAlive(players, current));
    }

    function pushTurnLog(): void {
      if (!turnLog) return;
      turnLog.handLostMs = Math.round(handLostMs);
      log.turns.push(turnLog);
      turnLog = null;
    }

    function endRound(winner: number): void {
      phase = 'roundEnd';
      phaseUntil = performance.now() + CONFIG.roundResultMs;
      if (winner >= 0) players[winner].roundWins++;
      log.rounds.push({ round, winner: winner >= 0 ? players[winner].name : null, maxFloors: roundMaxFloors });
      sfx.finish();
      showBanner(winner >= 0
        ? `<small>라운드 ${round} 결과</small><b style="color:${color(winner)}">🏆 ${escapeHtml(players[winner].name)} 승리!</b>`
        : `<small>라운드 ${round} 결과</small><b>최고 ${roundMaxFloors}층</b>`);
      renderPlayers();
    }

    // ── 상점 ─────────────────────────────────
    function openShop(): void {
      hideBanner();
      players.forEach((p) => { if (p.ai !== null) { const c = aiShopChoice(p, CONFIG, rng); if (c) buy(p, c, CONFIG); } });
      const minPrice = Math.min(...Object.values(CONFIG.itemPrice));
      shopQueue = players.flatMap((p, i) => (p.ai === null && p.item === null && p.coins >= minPrice ? [i] : []));
      phase = 'shop';
      renderPlayers();
      nextShopper(true);
    }
    function nextShopper(first = false): void {
      if (!first) shopQueue.shift();
      const i = shopQueue[0];
      if (i === undefined) { hideOverlay(); nextRound(); return; }
      current = i;
      const p = players[i];
      showOverlay(`<div class="ss-panel"><h2>🛒 ${escapeHtml(p.name)}의 상점 · 🪙${p.coins}</h2>
        <p class="small">아이템은 하나만 가질 수 있어요. 내 차례에 ✊ 주먹 1초로 써요.</p>
        <div class="ss-shop">${(Object.keys(ITEM_INFO) as ItemId[]).map((it) => `
          <button class="btn ghost ss-item" data-act="buy-${it}" ${canBuy(p, it, CONFIG) ? '' : 'disabled'}>
            <span class="ss-item-icon">${ITEM_INFO[it].icon}</span><b>${ITEM_INFO[it].name} · 🪙${CONFIG.itemPrice[it]}</b><small>${ITEM_INFO[it].desc}</small>
          </button>`).join('')}</div>
        <button class="btn primary" data-act="shop-skip">그만 사기</button></div>`);
      renderPlayers();
    }
    function shopBuy(it: ItemId): void {
      const p = players[shopQueue[0]];
      if (p && buy(p, it, CONFIG)) { sfx.item(); nextShopper(); }
    }

    function finish(traitorWinner: number | null = null): void {
      phase = 'done';
      hideBanner(); hideOverlay();
      log.handLostMs = Math.round(log.turns.reduce((s, t) => s + t.handLostMs, 0));
      const scores = players.map((p, i) => finalScore(p, CONFIG) + (i === traitorWinner ? CONFIG.scoreTraitorWin : 0));
      sfx.finish();
      onFinish({
        scores,
        names: players.map((p) => `${p.ai !== null ? '🤖 ' : ''}${p.name}`),
        details: players.map((p) => `라운드 ${p.roundWins}승 · ${p.floors}층 성공`),
        summary: [
          `${MODE_LABEL[mode]} · ${round}라운드`,
          ...(traitor ? [`🕵️ 배신자: ${players[traitor.player].name} (목표 ${traitor.floor}층)${traitorWinner !== null ? ' — 단독 승리!' : ''}`] : []),
          `라운드 최고 층수: ${log.rounds.map((r) => r.maxFloors).join(' / ') || '-'}`,
        ],
        log,
      });
    }

    // ── 손 입력 ───────────────────────────────
    const offState = input.on('state', (s) => {
      // 놓기(손 펴기)는 매 프레임 tick에서 처리한다
      if (s !== 'pinch') return;
      if (!overlay.hidden && hovered) { hovered.click(); return; }
      if (phase === 'aim' && !held && nearShelf(1.2)) grab();
    });

    function updateHand(now: number): void {
      hand = input.last;
      const m = CONFIG.handMargin;
      const clamp = (v: number) => Math.max(0, Math.min(1, (v - m) / (1 - 2 * m)));
      handWorld = { x: clamp(hand.x) * W, y: clamp(hand.y) * H - camY };
      if (hand.present) {
        history.push({ t: now, x: handWorld.x, y: handWorld.y });
        while (history.length && now - history[0].t > 400) history.shift();
      } else history.length = 0; // 손이 다시 보일 때 튄 속도가 전달되지 않게

      // 화면 커서 + 버튼 가리키기
      const r = stage.getBoundingClientRect();
      const cx = (handWorld.x / W) * r.width, cy = ((handWorld.y + camY) / H) * r.height;
      const showCursor = hand.present && (isHumanTurn() || !overlay.hidden);
      cursor.hidden = !showCursor;
      if (showCursor) {
        cursor.style.transform = `translate(${cx}px, ${cy}px)`;
        cursor.textContent = hand.state ? HAND_ICON[hand.state] : '✋';
      }
      let target: HTMLElement | null = null;
      if (showCursor && !overlay.hidden) {
        const el = document.elementFromPoint(r.left + cx, r.top + cy) as HTMLElement | null;
        target = el?.closest<HTMLElement>('[data-act]:not([disabled])') ?? null;
        if (target && !overlay.contains(target)) target = null;
      }
      if (target !== hovered) { hovered?.classList.remove('hand-hover'); target?.classList.add('hand-hover'); hovered = target; }
    }

    // ── 매 프레임 ─────────────────────────────
    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(100, now - last);
      last = now;
      const camTarget = Math.max(0, CONFIG.viewTopMargin - world.top().y);
      camY += (camTarget - camY) * Math.min(1, dt / 400);
      updateHand(now);
      if (shelfBlock) world.pose(shelfBlock, shelfPos().x, shelfPos().y, 0);

      // 물리 + 떨어진 블록
      const fallen = world.step(dt);
      if (fallen.length) onFallen(fallen.length, now, fallen);
      for (let i = removeQueue.length - 1; i >= 0; i--) {
        if (now >= removeQueue[i].at) { world.remove(removeQueue[i].body); removeQueue.splice(i, 1); }
      }
      if (slowMoUntil && now >= slowMoUntil) { slowMoUntil = 0; world.setSlowMo(false); }

      // 단계 진행
      const paused = phase === 'aim' && !hand.present;
      pauseEl.hidden = !paused;
      switch (phase) {
        case 'roundIntro': if (now >= phaseUntil) startTurn(current); break;
        case 'turnIntro': if (now >= phaseUntil) beginPlay(); break;
        case 'aim': {
          if (paused) { handLostMs += dt; break; } // 입력 끊김: 타이머 정지, 든 블록은 그 자리에 멈춤
          turnRemainMs -= dt;
          if (held) {
            world.pose(held, handWorld.x, handWorld.y, currentHeldAngle());
            if (hand.state === 'open') { const v = handVelocity(now); release(v.vx, v.vy, handWorld.x, handWorld.y); }
          } else if (hand.state === 'fist' && players[current].item) {
            fistSince ||= now;
            if (now - fistSince >= CONFIG.itemFistHoldMs) { useItem(current); fistSince = 0; }
          } else fistSince = 0;
          if (turnRemainMs <= 0) timeoutDrop();
          break;
        }
        case 'aiThink':
          if (now >= phaseUntil && shelfBlock) {
            const p = players[current];
            const top = world.top();
            const sabotage = traitorSucceeded(traitor, current, world.standing().length);
            const aim = aiAim(top.x, p.ai ?? 0, CONFIG, rng, sabotage);
            const half = (shelfBlock.bounds.max.y - shelfBlock.bounds.min.y) / 2;
            held = shelfBlock; shelfBlock = null;
            aiPlan = { from: shelfPos(), to: { x: aim.x, y: top.y - half - 30 }, vx: aim.vx, vy: aim.vy, start: now };
            phase = 'aiMove';
          }
          break;
        case 'aiMove':
          if (aiPlan && held) {
            const k = Math.min(1, (now - aiPlan.start) / CONFIG.aiMoveMs);
            const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
            const x = aiPlan.from.x + (aiPlan.to.x - aiPlan.from.x) * e;
            const y = aiPlan.from.y + (aiPlan.to.y - aiPlan.from.y) * e - Math.sin(k * Math.PI) * 120;
            world.pose(held, x, y, 0);
            if (k >= 1) {
              grabAngle = hand.angle; // AI는 회전하지 않음
              const plan = aiPlan;
              aiPlan = null;
              release(plan.vx, plan.vy, plan.to.x, plan.to.y);
            }
          }
          break;
        case 'settle': if (now >= phaseUntil) settleDone(now); break;
        case 'collapse': if (now >= phaseUntil) afterCollapse(); break;
        case 'roundEnd':
          if (now >= phaseUntil) { if (round >= CONFIG.roundsPerGame) finish(); else openShop(); }
          break;
        default: break;
      }

      // 위험 감지
      const danger = (phase === 'settle' || phase === 'aim' || phase === 'aiMove') && world.maxTiltDeg() > CONFIG.dangerTiltDeg;
      stage.classList.toggle('danger', danger);
      if (danger && now - lastDangerTick > 450) { sfx.tick(); lastDangerTick = now; }

      renderHud();
      draw();
      drawCam();
    }

    // ── 그리기 ───────────────────────────────
    function draw(): void {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
      const s = canvas.width / W;
      ctx.setTransform(s, 0, 0, s, 0, 0);

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2b2f4a'); g.addColorStop(1, '#5c4b7d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // 선반 (화면에 고정)
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      roundRect(CONFIG.shelfX - 140, CONFIG.shelfY - 130, 280, 260, 22); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('블록 선반', CONFIG.shelfX, CONFIG.shelfY - 150);
      // 여기부터 물리 세계 (탑이 높으면 아래로 내려 그린다)
      ctx.save();
      ctx.translate(0, camY);
      ctx.fillStyle = '#3b3355'; ctx.fillRect(0, CONFIG.floorY, W, H - CONFIG.floorY + 400);
      // 받침대
      const b = world.base;
      ctx.fillStyle = '#8d7bb8';
      drawVerts(b.vertices); ctx.fill();
      // 높이 표시
      const floors = world.standing().length;
      if (floors > 0) {
        const top = world.top();
        ctx.save(); ctx.setLineDash([12, 10]); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(W / 2 - 360, top.y); ctx.lineTo(W / 2 + 360, top.y); ctx.stroke(); ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${floors}층`, W / 2 + 370, top.y + 10);
      }
      // 블록
      for (const body of world.blocks) drawBlock(body, false);
      if (shelfBlock && (phase === 'aim' || phase === 'aiThink' || phase === 'turnIntro')) {
        const hover = phase === 'aim' && hand.present && hand.state === 'open' && nearShelf();
        drawBlock(shelfBlock, hover);
      }
      if (held) drawBlock(held, true);
      // AI 손
      if (phase === 'aiMove' && held) {
        ctx.font = '64px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🤖', held.position.x, held.bounds.min.y - 18);
      }
      ctx.restore();
      // 바람
      if (world.windActive) {
        ctx.fillStyle = 'rgba(200,230,255,.7)'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(world.windDir > 0 ? '🌬️ ➡➡➡' : '⬅⬅⬅ 🌬️', W / 2, 120);
      }
    }

    function drawBlock(body: MBody, glow: boolean): void {
      const info = world.blockInfo(body);
      if (!info) return;
      ctx.save();
      if (info.fallen) ctx.globalAlpha = 0.45;
      ctx.fillStyle = info.color;
      if (info.shape === 'ball') { ctx.beginPath(); ctx.arc(body.position.x, body.position.y, body.circleRadius ?? 42, 0, Math.PI * 2); }
      else drawVerts(body.vertices);
      ctx.fill();
      ctx.lineWidth = glow ? 8 : 3;
      ctx.strokeStyle = glow ? '#fff3bf' : 'rgba(0,0,0,.35)';
      if (glow) { ctx.shadowColor = '#ffd43b'; ctx.shadowBlur = 24; }
      ctx.stroke();
      if (body.friction <= CONFIG.iceFriction) { ctx.fillStyle = 'rgba(180,230,255,.45)'; ctx.fill(); }
      ctx.restore();
    }

    function drawVerts(vs: Matter.Vector[]): void {
      ctx.beginPath();
      vs.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
      ctx.closePath();
    }
    function roundRect(x: number, y: number, w: number, h: number, rad: number): void {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, rad);
    }

    function drawCam(): void {
      const rect = fitCanvas(camCanvas, input.video);
      camCtx.clearRect(0, 0, camCanvas.clientWidth, camCanvas.clientHeight);
      if (hand.landmarks && hand.state) drawHand(camCtx, rect, hand.landmarks, HAND_STATE_COLORS[hand.state], 2);
    }

    const offDebug = mountDebugPanel(container, CONFIG, '눈치껏 쌓아라');
    (window as unknown as { __stackSense?: unknown }).__stackSense = {
      world, get phase() { return phase; }, get players() { return players; }, get current() { return current; }, get log() { return log; }, get camY() { return camY; }, onAct, CONFIG,
    };
    showLobby();
    raf = requestAnimationFrame(tick);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        clearTimeout(toastTimer);
        offState();
        offDebug();
        world.clear();
        delete (window as unknown as { __stackSense?: unknown }).__stackSense;
        container.innerHTML = '';
      },
    };
  },
};

export default game;
