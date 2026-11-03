// 박자 붕어빵 — 장터 음악에 맞춰 패드로 반죽 붓기·속 넣기·뒤집기·포장·서빙 (docs/games/beat-bungeo.md)
// 입력: 리듬 어댑터 { role, time(지연 보정), velocity } — 틀 1~4, 팥, 슈크림, 포장, 서빙
// 흐름: 하루(곡 1개) × 5일. 목표 매출을 채우면 다음 날, 못 채우면 장사 끝 → 결과

import type { RoleHit } from '../../input/midi';
import { BeatClock, judge, toAudioTime, type Judgement } from '../../rhythm/clock';
import { MusicScheduler, STYLES, click } from '../../rhythm/music';
import { mountDebugPanel } from '../../shared/debug-panel';
import { escapeHtml } from '../../shared/html';
import { audioCtx, sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { CONFIG, type DayConfig, type Filling, type Quality } from './config';
import {
  FILLING_INFO, QUALITY_LABEL, fillingFromPads, judgeFlip, judgePour, makeOrder, orderCount, pickForOrder, priceOf, qualityOf,
  type Order, type Packed,
} from './rules';

const MOLD_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'];

type MoldState = 'empty' | 'pouring' | 'cooking' | 'cooked' | 'burnt';
interface Mold {
  state: MoldState;
  pressBeat: number;
  pourEndBeat: number;
  flipBeat: number;
  filling: Filling | null;
  judges: Judgement[];
  burntAt: number;
}
interface Customer { id: number; order: Order; patience: number; max: number }

type Proc = 'pour' | 'fill' | 'flip';

const game: GameModule<'rhythm'> = {
  setup: 'rhythm',
  modes: [{ players: 1, label: '▶ 장사 시작' }],
  rhythmRoles: () => [
    ...MOLD_KEYS.map((key, i) => ({ id: `mold${i + 1}`, label: `${i + 1}번 틀`, key })),
    { id: 'red', label: '팥 (낮은 건반)', key: 'KeyJ' },
    { id: 'cream', label: '슈크림 (높은 건반)', key: 'KeyK' },
    { id: 'wrap', label: '포장', key: 'KeyL' },
    { id: 'serve', label: '서빙', key: 'Space' },
  ],

  start(container, input, { onFinish }) {
    const keyOf = (role: string) => input.bindingsOf(role)[0] ?? role;
    container.innerHTML = `
      <div class="br-hud"><span class="br-progress" data-el="dayInfo"></span><span class="br-scores" data-el="sales"></span></div>
      <div class="bb-stage" data-el="stage">
        <div class="fb-progress"><i data-el="progress"></i></div>
        <aside class="bb-side">
          <div class="bb-stat"><small>오늘 매출</small><b data-el="today">0원</b><span data-el="target"></span></div>
          <div class="bb-stat"><small>콤보</small><b data-el="combo">0</b></div>
          <div class="bb-stat"><small>포장대</small><div class="bb-tray" data-el="tray"></div></div>
        </aside>
        <div class="bb-lanes">
          ${MOLD_KEYS.map((_, i) => `<div class="bb-lane" data-lane="${i}">
            <div class="bb-note" data-note="${i}" hidden>뒤집기</div>
            <div class="bb-line"></div>
            <div class="bb-mold" data-mold="${i}"><div class="bb-batter" data-batter="${i}"></div><span class="bb-fish" data-fish="${i}"></span><small class="bb-hint" data-hint="${i}"></small></div>
            <div class="bb-judge" data-judge="${i}" hidden></div>
            <div class="bb-key">${escapeHtml(keyOf(`mold${i + 1}`))}</div>
          </div>`).join('')}
        </div>
        <aside class="bb-queue" data-el="queue"></aside>
        <div class="bb-keys">🫘 팥 <b>${escapeHtml(keyOf('red'))}</b> · 🍮 슈크림 <b>${escapeHtml(keyOf('cream'))}</b> · 🍕 피자 = 둘 같이 · 📦 포장 <b>${escapeHtml(keyOf('wrap'))}</b>→틀 · 🛎️ 서빙 <b>${escapeHtml(keyOf('serve'))}</b></div>
        <div class="bb-toast" data-el="toast" hidden></div>
        <div class="ss-banner" data-el="banner" hidden></div>
        <div class="ss-overlay" data-el="pause" hidden></div>
      </div>
      <p class="br-help muted">틀 패드 <b>꾹 1박</b> 붓기 → 박자에 맞춰 속 넣기 → 노트가 선에 닿을 때 틀 패드로 뒤집기 → 포장 → 틀 → 서빙</p>`;

    const $ = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
    const q = <T extends HTMLElement>(attr: string, i: number) => container.querySelector<T>(`[data-${attr}="${i}"]`)!;
    const banner = $('[data-el="banner"]');
    const pauseEl = $('[data-el="pause"]');
    const toastEl = $('[data-el="toast"]');

    const rng = Math.random;
    const ctx = audioCtx();
    let dayIdx = -1;
    let day: DayConfig = CONFIG.days[0];
    let clock: BeatClock | null = null;
    let music: MusicScheduler | null = null;
    let phase: 'intro' | 'play' | 'result' | 'done' = 'intro';
    let phaseUntil = 0;
    let paused = false;
    let molds: Mold[] = [];
    let tray: Packed[] = [];
    let customers: Customer[] = [];
    let nextCustomerBeat = 0;
    let customerId = 0;
    let wrapArmedUntil = -Infinity;
    let combo = 0;
    let tipBank = 0;
    let todaySales = 0;
    let totalSales = 0;
    let pendingFill: { red: boolean; cream: boolean; beat: number; at: number } | null = null;
    let lastFrame = performance.now();
    let raf = 0;
    let toastTimer = 0;
    const judgeTimers: number[] = [];
    const log = {
      offsetMs: input.offsetMs,
      judges: { pour: { perfect: 0, good: 0, miss: 0 }, fill: { perfect: 0, good: 0, miss: 0 }, flip: { perfect: 0, good: 0, miss: 0 } } as Record<Proc, Record<Judgement, number>>,
      quality: { golden: 0, normal: 0, ugly: 0, burnt: 0 } as Record<Quality, number>,
      burnt: 0,
      customersLeft: 0,
      customersServed: 0,
      daySales: [] as number[],
    };

    // ── 하루 진행 ─────────────────────────────
    function nextDay(now: number): void {
      dayIdx++;
      if (dayIdx >= CONFIG.days.length) { finish(); return; }
      day = CONFIG.days[dayIdx];
      molds = MOLD_KEYS.map(() => emptyMold());
      tray = []; customers = []; combo = 0; tipBank = 0; todaySales = 0;
      wrapArmedUntil = -Infinity; pendingFill = null;
      nextCustomerBeat = 0;
      phase = 'intro';
      phaseUntil = now + CONFIG.dayIntroMs;
      container.querySelectorAll<HTMLElement>('.bb-lane').forEach((el, i) => el.classList.toggle('off', i >= day.molds));
      banner.innerHTML = `<small>${dayIdx + 1}일차 · ♪ ${day.bpm} BPM</small><b>${day.rainy ? '🌧️ 비 오는 날' : '☀️ 오늘도 장사 시작!'}</b>
        <p>틀 ${day.molds}개 · 오늘 메뉴: ${day.fillings.map((f) => `${FILLING_INFO[f].icon} ${FILLING_INFO[f].name}`).join(', ')}
        ${day.groupOrders ? '<br>👨‍👩‍👧‍👦 단체 손님이 와요' : ''}${day.fillings.includes('pizza') ? '<br>🍕 신메뉴: 팥+슈 패드를 같이 치면 피자 붕어빵' : ''}
        <br>목표 매출 ${won(CONFIG.targetSales[dayIdx])}</p>`;
      banner.hidden = false;
      $('[data-el="dayInfo"]').textContent = `${dayIdx + 1}일차 · ${day.bpm} BPM`;
      $('[data-el="target"]').textContent = `목표 ${won(CONFIG.targetSales[dayIdx])}`;
      renderAll();
    }

    function startDay(now: number): void {
      banner.hidden = true;
      const beatMs = 60000 / day.bpm;
      clock = new BeatClock(day.bpm, now + 300 + CONFIG.countInBeats * beatMs);
      for (let i = 0; i < CONFIG.countInBeats; i++) click(ctx, toAudioTime(ctx, clock.timeOf(i - CONFIG.countInBeats)), i === 0);
      music = new MusicScheduler(ctx, clock, STYLES.market, CONFIG.beatsPerDay);
      phase = 'play';
    }

    function endDay(now: number): void {
      music?.stop(); music = null;
      log.daySales.push(todaySales);
      log.customersLeft += customers.length;
      const ok = todaySales >= CONFIG.targetSales[dayIdx];
      phase = 'result';
      phaseUntil = now + CONFIG.dayResultMs;
      sfx.finish();
      banner.innerHTML = `<small>${dayIdx + 1}일차 정산</small><b>${won(todaySales)}</b><p>${ok
        ? (dayIdx + 1 < CONFIG.days.length ? '🎉 목표 달성! 내일도 장사해요' : '🎉 5일 장사 끝! 대박 났어요')
        : `😢 목표 ${won(CONFIG.targetSales[dayIdx])}에 못 미쳤어요. 오늘로 장사 끝!`}</p>`;
      banner.hidden = false;
      if (!ok) dayIdx = CONFIG.days.length; // 다음 단계에서 결과로
    }

    // ── 입력 ─────────────────────────────────
    const offHit = input.on('hit', (h: RoleHit) => {
      if (phase !== 'play' || paused || !clock) return;
      const beat = clock.beatAt(h.time);
      if (h.role.startsWith('mold')) moldDown(Number(h.role.slice(4)) - 1, beat);
      else if (h.role === 'red' || h.role === 'cream') {
        // 화음(피자) 판별을 위해 잠깐 모았다가 처리
        if (pendingFill && performance.now() - pendingFill.at <= CONFIG.chordWindowMs) pendingFill[h.role] = true;
        else { commitFill(); pendingFill = { red: h.role === 'red', cream: h.role === 'cream', beat, at: performance.now() }; }
      } else if (h.role === 'wrap') { wrapArmedUntil = beat + CONFIG.wrapArmBeats; sfx.tick(); toast('📦 포장할 틀을 치세요'); }
      else if (h.role === 'serve') serve();
    });
    const offRelease = input.on('release', (h: RoleHit) => {
      if (phase !== 'play' || paused || !clock || !h.role.startsWith('mold')) return;
      moldUp(Number(h.role.slice(4)) - 1, clock.beatAt(h.time));
    });
    const offDisconnect = input.on('disconnect', (name) => pause(`🔌 ${escapeHtml(name)} 연결이 끊겼어요`));

    function moldDown(i: number, beat: number): void {
      if (i >= day.molds) return;
      const m = molds[i];
      if (m.state === 'empty') { m.state = 'pouring'; m.pressBeat = beat; sfx.tick(); }
      else if (m.state === 'cooking') {
        if (beat < m.flipBeat - 1) return; // 노트가 나오기 전 입력은 무시 (연타로 단계 넘김 방지)
        const r = judgeFlip((beat - m.flipBeat) * clock!.beatMs, CONFIG);
        const j: Judgement = r === 'early' ? 'miss' : r;
        if (!m.filling) { m.filling = day.fillings[0]; addJudge(m, 'fill', 'miss', i, false); }
        addJudge(m, 'flip', j, i, true, r === 'early' ? '덜 익음' : undefined);
        m.state = 'cooked';
        if (j === 'perfect') sfx.correct();
      } else if (m.state === 'cooked' && beat <= wrapArmedUntil) {
        const quality = qualityOf(m.judges, CONFIG);
        tray.push({ filling: m.filling ?? day.fillings[0], quality });
        log.quality[quality]++;
        wrapArmedUntil = -Infinity;
        molds[i] = emptyMold();
        sfx.item();
        toast(`📦 ${QUALITY_LABEL[quality]} ${FILLING_INFO[tray[tray.length - 1].filling].name} 붕어빵 포장!`);
      }
      renderAll();
    }

    function moldUp(i: number, beat: number): void {
      const m = molds[i];
      if (!m || m.state !== 'pouring') return;
      const hold = beat - m.pressBeat;
      addJudge(m, 'pour', judgePour(hold, CONFIG), i, true, hold > CONFIG.pourTargetBeats + CONFIG.pourTolerance.good ? '넘침!' : hold < CONFIG.pourTargetBeats - CONFIG.pourTolerance.good ? '부족!' : undefined);
      m.state = 'cooking';
      m.pourEndBeat = beat;
      m.flipBeat = Math.round(beat + CONFIG.cookBeats);
      renderAll();
    }

    function commitFill(): void {
      if (!pendingFill || !clock) return;
      const p = pendingFill;
      pendingFill = null;
      const f = fillingFromPads(p.red, p.cream, day);
      // 속을 기다리는 틀 중 가장 먼저 부은 틀
      const target = molds.map((m, i) => ({ m, i })).filter(({ m, i }) => i < day.molds && m.state === 'cooking' && !m.filling)
        .sort((a, b) => a.m.pourEndBeat - b.m.pourEndBeat)[0];
      if (!target || !f) return; // 빈 틀 입력은 무시 (벌점 없음)
      target.m.filling = f;
      const j = judge(clock.offsetToGrid(clock.timeOf(p.beat)), CONFIG.judge.perfectMs, CONFIG.judge.goodMs);
      addJudge(target.m, 'fill', j, target.i, true, `${FILLING_INFO[f].icon}`);
      renderAll();
    }

    function serve(): void {
      const c = customers[0];
      if (!c) { toast('손님이 없어요'); return; }
      const picks = pickForOrder(tray, c.order);
      if (!picks) { toast(`주문한 붕어빵이 아직 없어요 (${orderText(c.order)})`); sfx.wrong(); return; }
      const got = picks.reduce((s, i) => s + priceOf(tray[i].quality, CONFIG), 0) + tipBank;
      tray = tray.filter((_, i) => !picks.includes(i));
      tipBank = 0;
      todaySales += got; totalSales += got;
      customers.shift();
      log.customersServed++;
      sfx.correct(); sfx.item();
      toast(`😊 감사합니다! +${won(got)}`);
      renderAll();
    }

    function addJudge(m: Mold, proc: Proc, j: Judgement, lane: number, show: boolean, note?: string): void {
      m.judges.push(j);
      log.judges[proc][j]++;
      if (j === 'perfect') {
        combo++;
        if (combo % CONFIG.comboForTip === 0) {
          tipBank += CONFIG.basePrice * CONFIG.tipRate;
          customers.forEach((c) => { c.patience = Math.min(c.max, c.patience + c.max * CONFIG.comboPatienceRestore); });
          toast(`🔥 ${combo} 콤보! 손님들이 기다려 줘요 + 팁`);
        }
      } else combo = 0;
      if (j === 'miss') sfx.wrong();
      if (show) showJudge(lane, j, note);
    }

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
      lastFrame = performance.now();
    });

    // ── 매 프레임 ─────────────────────────────
    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(100, now - lastFrame);
      lastFrame = now;
      if (paused) return;
      if (phase === 'intro') { if (now >= phaseUntil) startDay(now); return; }
      if (phase === 'result') { if (now >= phaseUntil) nextDay(now); return; }
      if (phase !== 'play' || !clock) return;
      music?.update(now);
      const cur = clock.beatAt(now);
      if (pendingFill && now - pendingFill.at > CONFIG.chordWindowMs) commitFill();

      // 틀: 탐, 연기 치우기
      molds.forEach((m, i) => {
        if (m.state === 'cooking' && cur > m.flipBeat + CONFIG.burnAfterBeats) {
          m.state = 'burnt'; m.burntAt = cur; log.burnt++; log.quality.burnt++; combo = 0;
          showJudge(i, 'miss', '탔어요!'); sfx.wrong(); renderAll();
        } else if (m.state === 'burnt' && cur > m.burntAt + CONFIG.burntClearBeats) { molds[i] = emptyMold(); renderAll(); }
      });

      // 손님: 오기, 기다리다 떠나기
      if (cur >= nextCustomerBeat && cur < CONFIG.beatsPerDay - 4) {
        nextCustomerBeat += CONFIG.customerEveryBeats;
        if (customers.length < CONFIG.maxQueue) {
          const order = makeOrder(day, rng);
          // 단체 주문은 만들 게 많으니 인내심을 조금 더 준다
          const max = (day.rainy ? CONFIG.patienceSec.rainy : CONFIG.patienceSec.normal) * 1000 * (orderCount(order) > 2 ? 1.5 : 1);
          customers.push({ id: ++customerId, order, patience: max, max });
          renderQueue();
        }
      }
      let left = false;
      customers = customers.filter((c) => {
        c.patience -= dt;
        if (c.patience > 0) return true;
        log.customersLeft++; left = true; return false;
      });
      if (left) { toast('😠 손님이 기다리다 떠났어요'); sfx.wrong(); renderQueue(); }
      updateFrame(cur);
      if (cur >= CONFIG.beatsPerDay) endDay(now);
    }

    // ── 화면 ─────────────────────────────────
    function updateFrame(cur: number): void {
      $<HTMLElement>('[data-el="progress"]').style.width = `${Math.max(0, Math.min(1, cur / CONFIG.beatsPerDay)) * 100}%`;
      if (cur < 0) { banner.hidden = false; banner.innerHTML = `<b>${Math.ceil(-cur)}</b>`; } else if (!banner.hidden && phase === 'play') banner.hidden = true;
      molds.forEach((m, i) => {
        const note = q('note', i);
        const batter = q('batter', i);
        if (m.state === 'cooking') {
          const k = 1 - (m.flipBeat - cur) / CONFIG.noteFallBeats; // 0 = 위, 1 = 판정선
          note.hidden = k < 0 || k > 1.6;
          note.style.top = `${Math.min(1.6, Math.max(0, k)) * 62}%`;
        } else note.hidden = true;
        if (m.state === 'pouring') {
          const hold = cur - m.pressBeat;
          batter.style.height = `${Math.min(1.3, hold / CONFIG.pourTargetBeats) * 70}%`;
          batter.classList.toggle('over', hold > CONFIG.pourTargetBeats + CONFIG.pourTolerance.good);
        } else batter.style.height = '0';
      });
      container.querySelectorAll<HTMLElement>('.bb-cust').forEach((el) => {
        const c = customers.find((x) => x.id === Number(el.dataset.id));
        if (!c) return;
        const r = c.patience / c.max;
        el.style.setProperty('--p', String(r));
        el.querySelector('.bb-face')!.textContent = r > 0.5 ? '🙂' : r > 0.25 ? '😐' : '😠';
      });
    }

    function renderAll(): void {
      molds.forEach((m, i) => {
        const el = q('mold', i);
        el.className = `bb-mold ${m.state}`;
        q('fish', i).textContent = m.state === 'empty' ? '' : m.state === 'pouring' ? '' : `🐟${m.filling ? FILLING_INFO[m.filling].icon : ''}`;
        const hint = dayIdx === 0; // 1일차: 공정 안내 표시
        q('hint', i).textContent = !hint ? '' : m.state === 'empty' ? '꾹 1박 붓기' : m.state === 'pouring' ? '떼기!' : m.state === 'cooking' ? (m.filling ? '노트 맞춰 뒤집기' : '속 넣기') : m.state === 'cooked' ? '포장→틀' : '';
      });
      $('[data-el="tray"]').innerHTML = tray.length
        ? tray.map((p) => `<span class="q-${p.quality}" title="${QUALITY_LABEL[p.quality]}">🐟${FILLING_INFO[p.filling].icon}</span>`).join('')
        : '<small class="muted">비어 있어요</small>';
      $('[data-el="today"]').textContent = won(todaySales);
      $('[data-el="combo"]').textContent = String(combo);
      $('[data-el="sales"]').textContent = `총 매출 ${won(totalSales)}`;
      renderQueue();
    }

    function renderQueue(): void {
      $('[data-el="queue"]').innerHTML = `<small>손님 줄</small>${customers.map((c, i) => `
        <div class="bb-cust${i === 0 ? ' first' : ''}" data-id="${c.id}" style="--p:${c.patience / c.max}">
          <span class="bb-face">🙂</span><span class="bb-order">${orderText(c.order)}</span><i></i>
        </div>`).join('') || '<p class="muted small">아직 손님이 없어요</p>'}`;
    }

    function orderText(o: Order): string {
      return (Object.entries(o) as [Filling, number][]).map(([f, n]) => `${FILLING_INFO[f].icon}×${n}`).join(' ');
    }

    function showJudge(lane: number, j: Judgement, note?: string): void {
      const el = q('judge', lane);
      el.textContent = `${j === 'perfect' ? 'PERFECT' : j === 'good' ? 'GOOD' : 'MISS'}${note ? ` ${note}` : ''}`;
      el.className = `bb-judge ${j}`;
      el.hidden = false;
      clearTimeout(judgeTimers[lane]);
      judgeTimers[lane] = window.setTimeout(() => { el.hidden = true; }, 700);
    }
    function toast(msg: string): void {
      toastEl.textContent = msg;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 1800);
    }

    function finish(): void {
      phase = 'done';
      const cleared = log.daySales.filter((s, i) => s >= CONFIG.targetSales[i]).length;
      onFinish({
        scores: [totalSales],
        details: [`${cleared}일 목표 달성 · 손님 ${log.customersServed}명`],
        summary: [
          `날별 매출: ${log.daySales.map(won).join(' / ')}`,
          `황금 ${log.quality.golden} · 보통 ${log.quality.normal} · 못생김 ${log.quality.ugly} · 탐 ${log.burnt} · 떠난 손님 ${log.customersLeft}`,
        ],
        log,
      });
    }

    const offDebug = mountDebugPanel(container, CONFIG, '박자 붕어빵');
    (window as unknown as { __beatBungeo?: unknown }).__beatBungeo = {
      get molds() { return molds; }, get tray() { return tray; }, get customers() { return customers; }, get clock() { return clock; },
      get phase() { return phase; }, get dayIdx() { return dayIdx; }, get sales() { return todaySales; }, log, CONFIG,
    };
    nextDay(performance.now());
    raf = requestAnimationFrame(tick);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        clearTimeout(toastTimer);
        judgeTimers.forEach(clearTimeout);
        music?.stop();
        offHit(); offRelease(); offDisconnect(); offDebug();
        delete (window as unknown as { __beatBungeo?: unknown }).__beatBungeo;
        container.innerHTML = '';
      },
    };
  },
};

function emptyMold(): Mold {
  return { state: 'empty', pressBeat: 0, pourEndBeat: 0, flipBeat: 0, filling: null, judges: [], burntAt: 0 };
}

function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export default game;
