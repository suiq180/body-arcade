// 말하지 말랬잖아! — 고장 난 우주선을 목소리로만 고친다 (docs/games/dont-say.md)
// 입력: 마이크 어댑터 (음량 dB, 음높이, 인식된 단어)
// 흐름: 라운드 4개 [고장 장치 수리 미션 반복 → 모두 70% 이상이면 성공] → 결과. 거짓말 로봇의 지시는 반대로!

import type { MicFrame, WordEvent } from '../../input/mic';
import { mountDebugPanel } from '../../shared/debug-panel';
import { escapeHtml } from '../../shared/html';
import { MicGraph } from '../../shared/mic-graph';
import { sfx } from '../../shared/sfx';
import type { GameModule } from '../types';
import { CONFIG, type DeviceId, type EventId } from './config';
import {
  DEVICES, DEVICE_INFO, DontDetector, HoldDetector, LengthDetector, LoudDetector, MorseDetector, OP_OWNER, PitchDetector, QuietDetector,
  allSafe, containsWord, explodedCount, makeMission, pickDevice, pitchBand, shouldDo, spokenDigits,
  type Detector, type Mission, type Robot, type VoiceInput, type VoiceOp,
} from './rules';

const OWNER_COLORS = ['#ff6b6b', '#4dabf7'];
const EVENT_INFO: Record<EventId, { icon: string; name: string }> = {
  liar: { icon: '😈', name: '거짓말 로봇' },
  pitchFlip: { icon: '🔃', name: '음높이 반전' },
  micLock: { icon: '🔇', name: '마이크 잠금' },
  noise: { icon: '🌪️', name: '소음 폭풍' },
};

interface MissionLog { round: number; device: DeviceId; ops: VoiceOp[]; robot: Robot; phrase: string; result: 'ok' | 'fail' | 'timeout'; ms: number }

const game: GameModule<'mic'> = {
  setup: 'mic',
  modes: [{ players: 1, label: '혼자 하기' }, { players: 2, label: '둘이 협동 (마이크 1개)' }],

  start(container, mic, { players, onFinish }) {
    const duo = players === 2;
    container.innerHTML = `
      <div class="br-hud"><span class="br-progress" data-el="roundInfo"></span><span class="br-scores" data-el="score">0점</span></div>
      <div class="ds-stage" data-el="stage">
        <div class="ds-top"><span class="ds-timer" data-el="timer"></span><span class="ds-events" data-el="events"></span></div>
        <div class="ds-robot" data-el="robot">
          <span class="ds-robot-face" data-el="face">🤖</span>
          <div class="ds-bubble"><b data-el="say">준비 중…</b><small data-el="step"></small><div class="ds-bar"><i data-el="prog"></i></div><div class="ds-bar time"><i data-el="mtime"></i></div></div>
        </div>
        <div class="ds-ship">${DEVICES.map((d) => `
          <div class="ds-dev" data-dev="${d}"><span class="ds-icon">${DEVICE_INFO[d].icon}</span><b>${DEVICE_INFO[d].name}</b>
            <div class="ds-gauge"><i data-gauge="${d}"></i></div><small data-val="${d}"></small></div>`).join('')}
        </div>
        <div class="ds-graph-wrap"><canvas class="ds-graph" data-el="graph"></canvas><span class="ds-lock" data-el="lock" hidden>🔇 마이크 잠금</span></div>
        <div class="ss-banner" data-el="banner" hidden></div>
        <div class="ss-overlay" data-el="pause" hidden></div>
      </div>
      <p class="br-help muted">🤖 파란 로봇 = 지시대로 · 😈 빨간 로봇 = 반대로 ("하지 마세요" = 하기, "하세요" = 조용히 기다리기)${duo ? ' · <b style="color:#ff6b6b">P1</b> 크기·길이 담당 / <b style="color:#4dabf7">P2</b> 높이·단어 담당' : ''}</p>`;

    const $ = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
    const stage = $('[data-el="stage"]');
    const banner = $('[data-el="banner"]');
    const pauseEl = $('[data-el="pause"]');
    const graph = new MicGraph($<HTMLCanvasElement>('[data-el="graph"]'), 6000);
    const rng = Math.random;
    const speech = mic.supportsSpeech && !mic.speechError;
    if (speech) mic.startSpeech();

    let round = -1;
    let phase: 'intro' | 'play' | 'result' | 'done' = 'intro';
    let phaseUntil = 0;
    let roundLeftMs = 0;
    let gauges = {} as Record<DeviceId, number>;
    let mission: Mission | null = null;
    let stepIdx = 0;
    let detector: Detector | null = null;
    let doIt = true;
    let missionLeftMs = 0;
    let missionStart = 0;
    let nextMissionAt = 0;
    let lastDevice: DeviceId | undefined;
    const active: Partial<Record<EventId, number>> = {}; // 이벤트 → 끝나는 시각
    let nextEventAt = 0;
    let lockLeakMs = 0;
    let score = 0;
    /** 라운드 실패(시간 초과·폭발) → 결과로 */
    let failed = false;
    let eventMsgUntil = 0;
    let paused = false;
    let lastFrame = performance.now();
    let words: string[] = [];
    let raf = 0;
    const log: {
      speech: boolean;
      missions: MissionLog[];
      rounds: { round: number; result: 'clear' | 'timeout' | 'explode'; leftSec: number }[];
      opStats: Record<string, { ok: number; fail: number }>;
    } = { speech, missions: [], rounds: [], opStats: {} };

    // ── 라운드 ─────────────────────────────
    function nextRound(now: number): void {
      round++;
      if (round >= CONFIG.roundTimeSec.length) { finish(true); return; }
      gauges = Object.fromEntries(DEVICES.map((d) => [d, CONFIG.healthyStart])) as Record<DeviceId, number>;
      const shuffled = [...DEVICES].sort(() => rng() - 0.5);
      shuffled.slice(0, CONFIG.brokenCount[round]).forEach((d) => { gauges[d] = CONFIG.brokenStartMin + rng() * (CONFIG.brokenStartMax - CONFIG.brokenStartMin); });
      mission = null; detector = null; lastDevice = undefined;
      (Object.keys(active) as EventId[]).forEach((k) => delete active[k]);
      roundLeftMs = CONFIG.roundTimeSec[round] * 1000;
      phase = 'intro';
      phaseUntil = now + CONFIG.roundIntroMs;
      nextEventAt = now + CONFIG.roundIntroMs + randRange(CONFIG.eventGapMinMs, CONFIG.eventGapMaxMs);
      const evs = CONFIG.roundEvents[round];
      showBanner(`<small>라운드 ${round + 1} / ${CONFIG.roundTimeSec.length}</small><b>🛠️ 고장 ${CONFIG.brokenCount[round]}곳 · ${CONFIG.roundTimeSec[round]}초</b>
        <p>모든 장치를 ${CONFIG.safeThreshold}% 이상으로!${evs.length ? `<br>특수 이벤트: ${evs.map((e) => `${EVENT_INFO[e].icon} ${EVENT_INFO[e].name}`).join(', ')}` : ''}</p>`);
      sfx.roundStart();
      $('[data-el="roundInfo"]').textContent = `라운드 ${round + 1}/${CONFIG.roundTimeSec.length}`;
      renderDevices();
    }

    function endRound(now: number, result: 'clear' | 'timeout' | 'explode'): void {
      log.rounds.push({ round: round + 1, result, leftSec: Math.round(roundLeftMs / 100) / 10 });
      mission = null; detector = null;
      if (result === 'clear') {
        const avg = DEVICES.reduce((s, d) => s + gauges[d], 0) / DEVICES.length;
        const gain = Math.round(roundLeftMs / 1000 * CONFIG.scorePerSecLeft + avg * CONFIG.scorePerGauge);
        score += gain;
        sfx.finish();
        showBanner(`<small>라운드 ${round + 1}</small><b>✅ 수리 완료!</b><p>+${gain}점 (남은 시간 ${Math.ceil(roundLeftMs / 1000)}초)</p>`);
        phase = 'result';
        phaseUntil = now + CONFIG.roundResultMs;
      } else {
        sfx.wrong(); sfx.warn();
        stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
        showBanner(result === 'explode' ? '<b>💥 콰광!</b><p>장치 3개가 멈춰서 우주선이 폭발했어요</p>' : '<b>⏰ 시간 초과!</b><p>제시간에 수리하지 못했어요</p>', true);
        phase = 'result';
        phaseUntil = now + CONFIG.roundResultMs;
        round = CONFIG.roundTimeSec.length; // 다음 단계에서 결과로
        failed = true;
      }
      renderScore();
    }
    // ── 미션 ─────────────────────────────────
    function newMission(now: number): void {
      const dev = pickDevice(gauges, CONFIG, rng, lastDevice);
      if (!dev) return;
      lastDevice = dev;
      const robot: Robot = active.liar ? 'liar' : 'honest';
      mission = makeMission(dev, robot, CONFIG, rng, speech);
      doIt = shouldDo(robot, mission.phrase);
      stepIdx = 0;
      missionStart = now;
      missionLeftMs = CONFIG.missionTimeMs + (mission.steps.length > 1 ? 3000 : 0);
      words = [];
      setDetector();
      sfx.question();
      renderMission();
    }

    function setDetector(): void {
      if (!mission) return;
      if (!doIt) { detector = new DontDetector(CONFIG.dontWaitMs, CONFIG.dontFailSoundMs); return; }
      const st = mission.steps[stepIdx];
      switch (st.op) {
        case 'hold': detector = new HoldDetector(CONFIG.engineHoldMs, CONFIG.holdToleranceMs); break;
        case 'quiet': detector = new QuietDetector(CONFIG.oxygenQuietMs); break;
        case 'loud': detector = new LoudDetector(CONFIG.loudSustainMs); break;
        case 'pitch': {
          const b = pitchBand(st.zone!, mic.range, CONFIG, !!active.pitchFlip);
          detector = new PitchDetector(b.low, b.high, CONFIG.pitchHoldMs, CONFIG.holdToleranceMs);
          break;
        }
        case 'rhythm': detector = new MorseDetector(st.pattern!, CONFIG.shortLongSplitMs, CONFIG.rhythmToleranceMs, CONFIG.morseResetGapMs); break;
        case 'length': detector = new LengthDetector(CONFIG.lengthTargetMs, CONFIG.lengthToleranceMs, CONFIG.rhythmToleranceMs); break;
        case 'word': detector = null; break; // 단어는 음성 인식 이벤트로 판정
      }
    }

    function missionResult(now: number, result: 'ok' | 'fail' | 'timeout'): void {
      if (!mission) return;
      const m = mission;
      log.missions.push({ round: round + 1, device: m.device, ops: m.steps.map((s) => s.op), robot: m.robot, phrase: m.phrase, result, ms: Math.round(now - missionStart) });
      for (const s of doIt ? m.steps : [{ op: 'dont' as const }]) {
        const k = s.op;
        log.opStats[k] ??= { ok: 0, fail: 0 };
        log.opStats[k][result === 'ok' ? 'ok' : 'fail']++;
      }
      const card = container.querySelector<HTMLElement>(`[data-dev="${m.device}"]`)!;
      if (result === 'ok') {
        gauges[m.device] = Math.min(100, gauges[m.device] + CONFIG.repairAmount);
        sfx.correct();
        flash(card, 'ok');
        setSay(doIt ? '✅ 수리 성공!' : '✅ 잘 참았어요!', '');
      } else {
        gauges[m.device] = Math.max(0, gauges[m.device] - CONFIG.failDamage);
        sfx.wrong();
        flash(card, 'bad');
        setSay(result === 'timeout' ? '⏰ 시간 초과!' : doIt ? '❌ 실패!' : '❌ 하지 말랬잖아!', '');
      }
      mission = null; detector = null;
      nextMissionAt = now + CONFIG.missionGapMs;
      renderDevices();
    }

    // ── 입력 ─────────────────────────────────
    const offWord = mic.on('word', (w: WordEvent) => {
      if (phase !== 'play' || paused || active.micLock || !mission) return;
      words.push(w.text);
      const st = mission.steps[stepIdx];
      const heard = words.join(' ');
      if (!doIt) {
        // "하지 마세요"인데 그 단어를 말해 버림
        if (st.op === 'word' && (st.digits ? spokenDigits(heard).includes(st.word!) : containsWord(heard, st.word!))) missionResult(performance.now(), 'fail');
        return;
      }
      if (st.op !== 'word') return;
      const ok = st.digits ? spokenDigits(heard).includes(st.word!) : containsWord(heard, st.word!);
      if (ok) advanceStep(performance.now());
    });

    function advanceStep(now: number): void {
      if (!mission) return;
      stepIdx++;
      words = [];
      if (stepIdx >= mission.steps.length) { missionResult(now, 'ok'); return; }
      sfx.tick();
      setDetector();
      renderMission();
    }

    const offStatus = mic.on('status', (s) => { if (s.state === 'error') pause(escapeHtml(s.message)); });

    function pause(msg: string): void {
      if (paused || phase === 'done') return;
      paused = true;
      pauseEl.innerHTML = `<div class="ss-panel"><h2>⏸ 잠깐 멈췄어요</h2><p>${msg}</p><button class="btn primary big" data-act="resume">계속하기</button></div>`;
      pauseEl.hidden = false;
    }
    pauseEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('[data-act="resume"]')) return;
      paused = false; pauseEl.hidden = true; lastFrame = performance.now();
    });

    // ── 매 프레임 ─────────────────────────────
    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(100, now - lastFrame);
      lastFrame = now;
      const f: MicFrame = mic.last;
      graph.push({ ...f, time: now });
      drawGraph();
      if (paused) return;
      if (phase === 'intro') { if (now >= phaseUntil) { phase = 'play'; banner.hidden = true; nextMissionAt = now; } return; }
      if (phase === 'result') { if (now >= phaseUntil) { banner.hidden = true; if (failed) finish(false); else nextRound(now); } return; }
      if (phase !== 'play') return;

      // 이벤트
      for (const k of Object.keys(active) as EventId[]) {
        if (now >= active[k]!) { delete active[k]; if (k === 'pitchFlip' && mission?.steps[stepIdx]?.op === 'pitch') setDetector(); }
      }
      const evs = CONFIG.roundEvents[round];
      if (evs.length && now >= nextEventAt) {
        const e = evs[Math.floor(rng() * evs.length)];
        active[e] = now + CONFIG.eventDurationsMs[e];
        nextEventAt = now + CONFIG.eventDurationsMs[e] + randRange(CONFIG.eventGapMinMs, CONFIG.eventGapMaxMs);
        sfx.warn();
        showToastEvent(e);
        if (e === 'pitchFlip' && mission?.steps[stepIdx]?.op === 'pitch') setDetector();
      }
      // 이벤트 안내를 잠깐 보여 준 뒤 하던 미션 지시로 돌아간다
      if (eventMsgUntil && now >= eventMsgUntil) { eventMsgUntil = 0; renderMission(); }

      // 목소리 판정 입력 (소음 폭풍이면 기준이 높아진다)
      const extra = active.noise ? CONFIG.noiseStormExtraDb : 0;
      const v: VoiceInput = {
        dt,
        active: f.db > mic.noiseDb + CONFIG.activeOffsetDb + extra,
        loud: f.db > mic.noiseDb + CONFIG.loudOffsetDb + extra,
        quiet: f.db < mic.noiseDb + CONFIG.quietMaxOffsetDb + extra,
        pitch: f.pitch,
      };

      // 게이지: 고장 난(70% 미만) 장치는 계속 나빠진다
      for (const d of DEVICES) if (gauges[d] < CONFIG.safeThreshold) gauges[d] = Math.max(0, gauges[d] - (CONFIG.gaugeDecayPerSec[round] * dt) / 1000);

      if (active.micLock) {
        // 잠금 중 소리를 내면 산소가 샌다 (판정은 멈춤)
        lockLeakMs = v.active ? lockLeakMs + dt : 0;
        if (lockLeakMs >= CONFIG.micLockLeakEveryMs) { lockLeakMs = 0; gauges.oxygen = Math.max(0, gauges.oxygen - CONFIG.leakDamage); flash(container.querySelector<HTMLElement>('[data-dev="oxygen"]')!, 'leak'); }
      } else if (mission) {
        missionLeftMs -= dt;
        const r = detector?.update(v) ?? null;
        if (r === 'done') { if (doIt) advanceStep(now); else missionResult(now, 'ok'); }
        else if (r === 'fail') missionResult(now, 'fail');
        else if (r === 'leak') { gauges.oxygen = Math.max(0, gauges.oxygen - CONFIG.leakDamage); flash(container.querySelector<HTMLElement>('[data-dev="oxygen"]')!, 'leak'); }
        else if (r === 'wrong') setSay(mission.say, '다시! 처음부터');
        if (mission && missionLeftMs <= 0) missionResult(now, doIt ? 'timeout' : 'ok');
      } else if (now >= nextMissionAt) newMission(now);

      roundLeftMs -= dt;
      if (explodedCount(gauges) >= CONFIG.explodeBrokenCount) endRound(now, 'explode');
      else if (allSafe(gauges, CONFIG)) endRound(now, 'clear');
      else if (roundLeftMs <= 0) endRound(now, 'timeout');
      renderFrame();
    }

    // ── 화면 ─────────────────────────────────
    function renderMission(): void {
      if (!mission) return;
      const st = mission.steps[stepIdx];
      $('[data-el="robot"]').className = `ds-robot ${mission.robot}`;
      $('[data-el="face"]').textContent = mission.robot === 'liar' ? '😈' : '🤖';
      const owner = duo && doIt ? OP_OWNER[st.op] : null;
      setSay(mission.say, `${mission.steps.length > 1 ? `${stepIdx + 1}/${mission.steps.length} ` : ''}${owner !== null ? `<b style="color:${OWNER_COLORS[owner]}">P${owner + 1} 담당</b> · ` : ''}${escapeHtml(st.text)}`);
      container.querySelectorAll<HTMLElement>('.ds-dev').forEach((el) => {
        el.classList.toggle('target', el.dataset.dev === mission!.device);
        el.style.setProperty('--owner', owner !== null ? OWNER_COLORS[owner] : '#ffd43b');
      });
    }
    function setSay(say: string, stepHtml: string): void {
      $('[data-el="say"]').textContent = say;
      $('[data-el="step"]').innerHTML = stepHtml;
    }
    function renderDevices(): void {
      for (const d of DEVICES) {
        const g = gauges[d] ?? 0;
        const bar = container.querySelector<HTMLElement>(`[data-gauge="${d}"]`)!;
        bar.style.width = `${g}%`;
        bar.className = g >= CONFIG.safeThreshold ? 'ok' : g > 25 ? 'warn' : 'bad';
        container.querySelector(`[data-val="${d}"]`)!.textContent = g <= 0 ? '⚠️ 멈춤' : `${Math.round(g)}%`;
        container.querySelector(`[data-dev="${d}"]`)!.classList.toggle('dead', g <= 0);
      }
    }
    function renderFrame(): void {
      renderDevices();
      $('[data-el="timer"]').textContent = `⏱ ${Math.max(0, Math.ceil(roundLeftMs / 1000))}초`;
      $('[data-el="events"]').innerHTML = (Object.keys(active) as EventId[]).map((e) => `<span class="ds-ev">${EVENT_INFO[e].icon} ${EVENT_INFO[e].name}</span>`).join('');
      $('[data-el="lock"]').hidden = !active.micLock;
      $<HTMLElement>('[data-el="prog"]').style.width = `${(mission ? (detector?.progress() ?? 0) : 0) * 100}%`;
      $<HTMLElement>('[data-el="mtime"]').style.width = `${mission ? Math.max(0, missionLeftMs / (CONFIG.missionTimeMs + (mission.steps.length > 1 ? 3000 : 0))) * 100 : 0}%`;
      if (!mission) { $('[data-el="robot"]').className = 'ds-robot idle'; container.querySelectorAll('.ds-dev.target').forEach((el) => el.classList.remove('target')); }
    }
    function renderScore(): void { $('[data-el="score"]').textContent = `${score}점`; }
    function drawGraph(): void {
      const extra = active.noise ? CONFIG.noiseStormExtraDb : 0;
      const st = mission?.steps[stepIdx];
      const band = mission && doIt && st?.op === 'pitch' && st.zone ? pitchBand(st.zone, mic.range, CONFIG, false) : null;
      graph.draw(mic.range, {
        lines: [
          { level: (CONFIG.activeOffsetDb + extra) / 40, color: '#69db7c', label: '소리' },
          { level: (CONFIG.loudOffsetDb + extra) / 40, color: '#ff8787', label: '크게' },
        ],
        // 지시한 구간을 보여 준다 (음높이 반전 중에는 실제 정답이 반대쪽)
        pitchBand: band ? { ...band, color: active.pitchFlip ? 'rgba(255,135,135,.25)' : 'rgba(105,219,124,.25)' } : null,
      });
    }
    function flash(el: HTMLElement, kind: 'ok' | 'bad' | 'leak'): void {
      el.classList.remove('ok', 'bad', 'leak'); void el.offsetWidth; el.classList.add(kind);
    }
    function showBanner(html: string, warn = false): void {
      banner.innerHTML = html; banner.className = `ss-banner${warn ? ' warn' : ''}`; banner.hidden = false;
    }
    function showToastEvent(e: EventId): void {
      eventMsgUntil = performance.now() + 2200;
      setSay(`${EVENT_INFO[e].icon} ${EVENT_INFO[e].name}!`, e === 'liar' ? '지금부터 10초간 모든 지시가 반대!' : e === 'pitchFlip' ? '높게 ↔ 낮게 반대로!' : e === 'micLock' ? '3초 동안 소리 내지 마세요 (산소가 새요)' : '배경 소음이 커졌어요 — 더 크게!');
    }
    function randRange(a: number, b: number): number { return a + (b - a) * rng(); }

    function finish(clear: boolean): void {
      phase = 'done';
      mic.stopSpeech();
      const okCount = log.missions.filter((m) => m.result === 'ok').length;
      onFinish({
        scores: [score],
        names: [duo ? '우리 팀' : '내 점수'],
        details: [`라운드 ${log.rounds.filter((r) => r.result === 'clear').length}/${CONFIG.roundTimeSec.length} 성공 · 미션 ${okCount}/${log.missions.length}`],
        summary: [
          clear ? '🚀 우주선 수리 완료! 게임 클리어' : '💫 다음엔 끝까지 고쳐 봐요',
          `조작별 성공/실패: ${Object.entries(log.opStats).map(([k, s]) => `${k} ${s.ok}/${s.fail}`).join(' · ') || '-'}`,
          speech ? '음성 인식 사용' : '음성 인식 없음 → 단어 미션을 소리 길이 미션으로 대체',
        ],
        log,
      });
    }

    const offDebug = mountDebugPanel(container, CONFIG, '말하지 말랬잖아!');
    (window as unknown as { __dontSay?: unknown }).__dontSay = {
      get phase() { return phase; }, get mission() { return mission; }, get stepIdx() { return stepIdx; }, get doIt() { return doIt; },
      get gauges() { return gauges; }, get round() { return round; }, get active() { return active; }, get score() { return score; }, log, CONFIG,
    };
    nextRound(performance.now());
    raf = requestAnimationFrame(tick);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        mic.stopSpeech();
        offWord(); offStatus(); offDebug();
        delete (window as unknown as { __dontSay?: unknown }).__dontSay;
        container.innerHTML = '';
      },
    };
  },
};

export default game;
