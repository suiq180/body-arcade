// 땡! 과일벨 — 박자마다 카드가 넘어가고, 같은 과일이 정확히 5개면 패드를 쳐서 종을 울린다 (docs/games/fruit-bell.md)
// 입력: 리듬 어댑터 { role: 'p1'~'p4', time(지연 보정), velocity }
// 흐름: 곡 4개 (80 → 100 → 120 → 140 BPM) → 결과. 혼자 하면 AI 3명과 겨룬다.

import type { RoleHit } from '../../input/midi';
import { BeatClock, toAudioTime } from '../../rhythm/clock';
import { MusicScheduler, STYLES, click } from '../../rhythm/music';
import { mountDebugPanel } from '../../shared/debug-panel';
import { escapeHtml } from '../../shared/html';
import { audioCtx, sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { CONFIG, type SongConfig } from './config';
import {
  FRUITS, aiReaction, chanceFruit, flipSchedule, makeCards, scoreCorrect,
  type Card, type FlipSlot, type Table,
} from './rules';

const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419'];
const KEYS = ['KeyQ', 'KeyP', 'KeyZ', 'KeyM'];
const AI_NAMES = ['로봇 빠름', '로봇 보통', '로봇 느림'];

interface FbPlayer {
  name: string;
  ai: number | null;
  score: number;
  correct: number;
  wrong: number;
  onBeat: number;
  hard: number;
  lockUntilBeat: number;
}

interface Chance { version: number; fruit: number; beat: number; claimed: boolean; claimBeat: number; firstHits: Map<number, number> }
interface PendingHit { player: number; beat: number; velocity: number; version?: number }

const game: GameModule<'rhythm'> = {
  setup: 'rhythm',
  modes: [
    { players: 1, label: '혼자 하기 (AI 3명과)' },
    { players: 2, label: '2인' },
    { players: 3, label: '3인' },
    { players: 4, label: '4인' },
  ],
  rhythmRoles: (players) => players === 1
    ? [{ id: 'p1', label: '내 패드', key: 'Space' }]
    : Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, label: `P${i + 1} 패드`, key: KEYS[i] })),

  start(container, input, { players: humanCount, onFinish }) {
    const solo = humanCount === 1;
    const players: FbPlayer[] = solo
      ? [blank('나', null), ...CONFIG.aiReactionMs.map((_, i) => blank(AI_NAMES[i], i))]
      : Array.from({ length: humanCount }, (_, i) => blank(`P${i + 1}`, null));
    const seats = players.length;

    container.innerHTML = `
      <div class="br-hud"><span class="br-progress" data-el="songInfo"></span><span class="br-scores" data-el="keys"></span></div>
      <div class="fb-stage" data-el="stage">
        <div class="fb-progress"><i data-el="progress"></i></div>
        <div class="fb-table" data-el="table">
          ${players.map((p, i) => `<div class="fb-seat" data-seat="${i}" style="--pc:${COLORS[i]};${seatPos(i, seats)}">
            <div class="fb-card" data-card="${i}"></div>
            <div class="fb-name"><b>${escapeHtml(p.name)}${p.ai !== null ? ' 🤖' : ''}</b><span data-score="${i}">0</span></div>
            <div class="fb-mark" data-mark="${i}" hidden></div>
          </div>`).join('')}
          <div class="fb-bell" data-el="bell">🔔</div>
        </div>
        <div class="fb-beat" data-el="beat">${'<i></i>'.repeat(4)}</div>
        <div class="fb-pop" data-el="pop" hidden></div>
        <div class="ss-banner" data-el="banner" hidden></div>
        <div class="ss-overlay" data-el="pause" hidden></div>
      </div>
      <p class="br-help muted">같은 과일이 <b>정확히 5개</b>면 내 패드를 쳐요 · 박자에 맞추면 +1 · 세게(벨로시티 100↑, 키보드는 Shift) +1 · 틀리면 −2 · 1박 잠김</p>`;

    const $ = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
    const stage = $('[data-el="stage"]');
    const bell = $('[data-el="bell"]');
    const banner = $('[data-el="banner"]');
    const pop = $('[data-el="pop"]');
    const pauseEl = $('[data-el="pause"]');
    $('[data-el="keys"]').textContent = input.roles.map((r) => `${r.label}: ${input.bindingsOf(r.id).join('/')}`).join(' · ');

    const rng = Math.random;
    const ctx = audioCtx();
    let songIdx = -1;
    let song: SongConfig = CONFIG.songs[0];
    let schedule: FlipSlot[] = [];
    let slotIdx = 0;
    let prepared: { slot: number; cards: Card[] } | null = null;
    let table: Table = new Array(seats).fill(null);
    let stats = { events: 0, chances: 0 };
    let version = 0;
    let chance: Chance | null = null;
    let lastState: { version: number; beat: number; chance: Chance | null } = { version: 0, beat: -Infinity, chance: null };
    let clock: BeatClock | null = null;
    let music: MusicScheduler | null = null;
    let phase: 'intro' | 'play' | 'done' = 'intro';
    let introUntil = 0;
    let paused = false;
    /** 마지막으로 누군가 정답을 친 박자 위치 */
    let lastClaimBeat = -Infinity;
    const hits: PendingHit[] = [];
    let aiHits: PendingHit[] = [];
    let raf = 0;
    let popTimer = 0;
    const markTimers: number[] = [];
    const log: {
      offsetMs: number;
      chances: { song: number; beat: number; fruit: string; winner: string | null; reactionsMs: Record<string, number> }[];
      wrongs: { song: number; beat: number; player: string }[];
      missedChances: number;
    } = { offsetMs: input.offsetMs, chances: [], wrongs: [], missedChances: 0 };

    // ── 곡 진행 ─────────────────────────────
    function nextSong(now: number): void {
      songIdx++;
      if (songIdx >= CONFIG.songs.length) { finish(); return; }
      song = CONFIG.songs[songIdx];
      schedule = flipSchedule(song, seats, CONFIG);
      slotIdx = 0;
      table = new Array(seats).fill(null);
      stats = { events: 0, chances: 0 };
      chance = null; prepared = null; aiHits = [];
      lastState = { version: ++version, beat: -Infinity, chance: null };
      phase = 'intro';
      introUntil = now + CONFIG.songIntroMs;
      renderTable([]);
      banner.innerHTML = `<small>곡 ${songIdx + 1} / ${CONFIG.songs.length}</small><b>♪ ${song.bpm} BPM</b>
        <p>${song.hint ? '정답일 때 종이 반짝여요 (연습)' : song.numberCards ? '⚠️ 함정 카드: 그림 대신 숫자만 나와요' : song.doubleFlip ? '⚡ 카드가 2장씩, 반박자 구간도 있어요' : '과일 4종!'}</p>`;
      banner.hidden = false;
      $('[data-el="songInfo"]').textContent = `곡 ${songIdx + 1}/${CONFIG.songs.length} · ${song.bpm} BPM`;
    }

    function startSong(now: number): void {
      banner.hidden = true;
      const beatMs = 60000 / song.bpm;
      clock = new BeatClock(song.bpm, now + 300 + CONFIG.countInBeats * beatMs);
      for (let i = 0; i < CONFIG.countInBeats; i++) click(ctx, toAudioTime(ctx, clock.timeOf(i - CONFIG.countInBeats)), i === 0);
      music = new MusicScheduler(ctx, clock, STYLES[song.style] ?? STYLES.fruitA, CONFIG.beatsPerSong);
      phase = 'play';
      prepare();
    }

    function prepare(): void {
      const slot = schedule[slotIdx];
      prepared = slot ? { slot: slotIdx, cards: makeCards(table, slot.seats, song, stats, CONFIG, rng) } : null;
    }

    function applySlot(): void {
      const slot = schedule[slotIdx];
      const cards = prepared?.slot === slotIdx ? prepared.cards : makeCards(table, slot.seats, song, stats, CONFIG, rng);
      slot.seats.forEach((s, k) => { table[s] = cards[k]; });
      slotIdx++;
      stats.events++;
      if (chance && !chance.claimed) recordChance(null);
      setState(slot.beat);
      renderTable(slot.seats);
      prepare();
    }

    /** 테이블이 바뀐 뒤 정답 기회 여부를 다시 계산한다 */
    function setState(beat: number): void {
      version++;
      const f = chanceFruit(table, song.kinds, CONFIG.targetCount);
      chance = f >= 0 ? { version, fruit: f, beat, claimed: false, claimBeat: 0, firstHits: new Map() } : null;
      lastState = { version, beat, chance };
      aiHits = [];
      if (chance) {
        stats.chances++;
        players.forEach((p, i) => {
          if (p.ai === null) return;
          aiHits.push({ player: i, beat: beat + aiReaction(CONFIG.aiReactionMs[p.ai], CONFIG, rng) / clock!.beatMs, velocity: 90, version });
        });
      }
    }

    function recordChance(winner: number | null): void {
      if (!chance) return;
      if (winner === null) log.missedChances++;
      log.chances.push({
        song: songIdx + 1, beat: chance.beat, fruit: FRUITS[chance.fruit],
        winner: winner === null ? null : players[winner].name,
        reactionsMs: Object.fromEntries([...chance.firstHits].map(([p, ms]) => [players[p].name, Math.round(ms)])),
      });
    }

    // ── 판정 ─────────────────────────────────
    function evaluate(h: PendingHit): void {
      const p = players[h.player];
      if (!clock) return;
      if (h.beat < p.lockUntilBeat) { mark(h.player, '🔒', 300); return; }
      // 다음 카드가 박자 판정 범위 안에서 곧 넘어간다면, 넘어간 뒤의 테이블로 판정한다 (박자에 맞춰 친 사람 우대)
      // (AI는 이미 보이는 기회에만 반응하므로 해당 없음)
      const next = schedule[slotIdx];
      if (h.version === undefined && next && next.beat > h.beat && (next.beat - h.beat) * clock.beatMs <= CONFIG.onBeatWindowMs) applySlot();
      const st = h.beat >= lastState.beat - 1e-6 ? lastState : null; // 친 시각이 지금 테이블보다 앞이면 이전 테이블 (드묾)
      const c = st?.chance ?? null;
      if (c && !c.firstHits.has(h.player)) c.firstHits.set(h.player, (h.beat - c.beat) * clock.beatMs);
      if (c && !c.claimed) {
        const sub = song.doubleFlip && CONFIG.halfBeatSections.some(([a, z]) => h.beat >= a && h.beat < z) ? 2 : 1;
        const sc = scoreCorrect(clock.offsetToGrid(clock.timeOf(h.beat), sub), h.velocity, CONFIG);
        p.score += sc.points; p.correct++;
        if (sc.onBeat) p.onBeat++;
        if (sc.hard) p.hard++;
        c.claimed = true; c.claimBeat = h.beat;
        lastClaimBeat = h.beat;
        recordChance(h.player);
        chance = null;
        // 카드 회수: 테이블을 비우고 다음 카드를 다시 준비
        table = new Array(seats).fill(null);
        setState(h.beat);
        renderTable([]);
        prepare();
        ring(h.player, sc.points, sc.onBeat, sc.hard);
        return;
      }
      if ((h.beat - lastClaimBeat) * clock.beatMs <= CONFIG.lateGraceMs) { mark(h.player, '늦었어요', 600); return; }
      p.score += CONFIG.penaltyWrong; p.wrong++;
      p.lockUntilBeat = h.beat + CONFIG.lockBeats;
      log.wrongs.push({ song: songIdx + 1, beat: Math.round(h.beat * 100) / 100, player: p.name });
      sfx.wrong();
      mark(h.player, '❌', CONFIG.lockBeats * clock.beatMs);
      renderScores();
    }


    // ── 입력 ─────────────────────────────────
    const offHit = input.on('hit', (h: RoleHit) => {
      if (phase !== 'play' || paused || !clock) return;
      const idx = Number(h.role.slice(1)) - 1;
      if (!(idx >= 0 && idx < players.length) || players[idx].ai !== null) return;
      hits.push({ player: idx, beat: clock.beatAt(h.time), velocity: h.velocity });
    });
    const offDisconnect = input.on('disconnect', (name) => pause(`🔌 ${escapeHtml(name)} 연결이 끊겼어요`));

    function pause(msg: string): void {
      if (paused || phase !== 'play' || !clock) return;
      paused = true;
      clock.pause(performance.now());
      music?.mute(true);
      pauseEl.innerHTML = `<div class="ss-panel"><h2>⏸ 잠깐 멈췄어요</h2><p>${msg}<br>다시 연결하거나 키보드로 계속할 수 있어요.</p><button class="btn primary big" data-act="resume">계속하기</button></div>`;
      pauseEl.hidden = false;
    }
    pauseEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('[data-act="resume"]') || !clock) return;
      paused = false;
      clock.resume(performance.now());
      music?.mute(false);
      pauseEl.hidden = true;
    });

    // ── 매 프레임 ─────────────────────────────
    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      if (paused) return;
      if (phase === 'intro') { if (now >= introUntil) startSong(now); return; }
      if (phase !== 'play' || !clock) return;
      music?.update(now);
      const cur = clock.beatAt(now);
      // 들어온 입력과 AI 입력을 시각 순서대로 처리 (같은 프레임이면 이벤트 시각으로 비교)
      const due = [...hits.splice(0), ...aiHits.filter((a) => a.beat <= cur)].sort((a, b) => a.beat - b.beat);
      aiHits = aiHits.filter((a) => a.beat > cur);
      for (const h of due) {
        while (schedule[slotIdx] && schedule[slotIdx].beat <= h.beat) applySlot();
        if (h.version !== undefined && (!chance || chance.version !== h.version)) continue; // AI: 기회가 사라졌으면 안 침
        evaluate(h);
      }
      while (schedule[slotIdx] && schedule[slotIdx].beat <= cur) applySlot();
      drawBeat(cur);
      bell.classList.toggle('glow', !!song.hint && !!chance && !chance.claimed);
      if (cur >= CONFIG.beatsPerSong + 1) {
        if (chance && !chance.claimed) recordChance(null);
        chance = null;
        music?.stop(); music = null;
        nextSong(now);
      }
    }

    // ── 화면 ─────────────────────────────────
    function renderTable(flipped: number[]): void {
      table.forEach((c, i) => {
        const el = container.querySelector<HTMLElement>(`[data-card="${i}"]`)!;
        el.innerHTML = c ? cardHtml(c) : '';
        el.classList.toggle('empty', !c);
        if (flipped.includes(i)) { el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }
      });
    }
    function cardHtml(c: Card): string {
      if (c.number) return `<span class="fb-num"><span>${FRUITS[c.fruit]}</span><b>${c.count}</b></span>`;
      return `<span class="fb-fruits n${c.count}">${FRUITS[c.fruit].repeat(c.count).match(/\p{Extended_Pictographic}/gu)!.map((f) => `<i>${f}</i>`).join('')}</span>`;
    }
    function renderScores(): void {
      players.forEach((p, i) => { container.querySelector(`[data-score="${i}"]`)!.textContent = String(p.score); });
    }
    function drawBeat(cur: number): void {
      const dots = $('[data-el="beat"]').children;
      const b = Math.floor(cur);
      for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', ((b % 4) + 4) % 4 === i && cur >= 0);
      $('[data-el="beat"]').style.setProperty('--phase', String(cur < 0 ? 0 : cur - b));
      $<HTMLElement>('[data-el="progress"]').style.width = `${Math.max(0, Math.min(1, cur / CONFIG.beatsPerSong)) * 100}%`;
      if (cur < 0) { banner.hidden = false; banner.innerHTML = `<b>${Math.ceil(-cur)}</b>`; } else if (!banner.hidden && phase === 'play') banner.hidden = true;
    }
    function ring(player: number, points: number, onBeat: boolean, hard: boolean): void {
      sfx.correct();
      bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring');
      stage.style.setProperty('--flash', COLORS[player]);
      stage.classList.remove('flash'); void stage.offsetWidth; stage.classList.add('flash');
      pop.innerHTML = `<b style="color:${COLORS[player]}">${hard ? '땡!! ' : '땡! '}+${points}</b>${onBeat ? '<span>ON BEAT!</span>' : ''}`;
      pop.hidden = false;
      clearTimeout(popTimer);
      popTimer = window.setTimeout(() => { pop.hidden = true; }, 900);
      renderScores();
    }
    function mark(player: number, text: string, ms: number): void {
      const el = container.querySelector<HTMLElement>(`[data-mark="${player}"]`)!;
      el.textContent = text;
      el.hidden = false;
      clearTimeout(markTimers[player]);
      markTimers[player] = window.setTimeout(() => { el.hidden = true; }, ms);
    }

    function finish(): void {
      phase = 'done';
      sfx.finish();
      onFinish({
        scores: players.map((p) => p.score),
        names: players.map((p) => (p.ai !== null ? `🤖 ${p.name}` : p.name)),
        details: players.map((p) => `정답 ${p.correct} · 오답 ${p.wrong} · 박자 보너스 ${p.onBeat} · 세게 ${p.hard}`),
        summary: [`곡 ${CONFIG.songs.length}개 · 정답 기회 ${log.chances.length}번 (아무도 못 친 기회 ${log.missedChances}번)`, `지연 보정값 ${input.offsetMs}ms`],
        log,
      });
    }

    const offDebug = mountDebugPanel(container, CONFIG, '땡! 과일벨');
    (window as unknown as { __fruitBell?: unknown }).__fruitBell = {
      get table() { return table; }, get chance() { return chance; }, get clock() { return clock; }, get phase() { return phase; },
      get slotIdx() { return slotIdx; }, get songIdx() { return songIdx; }, players, log, CONFIG,
    };
    nextSong(performance.now());
    raf = requestAnimationFrame(tick);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        clearTimeout(popTimer);
        markTimers.forEach(clearTimeout);
        music?.stop();
        offHit(); offDisconnect(); offDebug();
        delete (window as unknown as { __fruitBell?: unknown }).__fruitBell;
        container.innerHTML = '';
      },
    };
  },
};

function blank(name: string, ai: number | null): FbPlayer {
  return { name, ai, score: 0, correct: 0, wrong: 0, onBeat: 0, hard: 0, lockUntilBeat: -Infinity };
}

/** 원형 테이블 둘레의 자리 위치 (첫 자리 = 아래쪽, 시계 방향) */
function seatPos(i: number, n: number): string {
  const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
  return `left:${50 + Math.cos(a) * 36}%;top:${50 + Math.sin(a) * 34}%`;
}

export default game;
