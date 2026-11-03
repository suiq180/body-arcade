// 리듬 게임 배경 음악 — 외부 음원 없이 Web Audio로 직접 합성한다 (기획서 8.5)
// 드럼(킥·스네어·하이햇) + 베이스 + 멜로디 루프. 곡마다 스타일(코드 진행·멜로디)과 BPM만 바꿔 쓴다.
// BeatClock의 박자에 맞춰 조금씩 미리 예약한다 (lookahead).

import { BeatClock, toAudioTime } from './clock';

export interface SongStyle {
  /** 으뜸음 (MIDI 노트 번호) */
  root: number;
  /** 마디(4박)마다 코드의 으뜸음 이동 (반음) */
  progression: number[];
  /** 8분음표마다 멜로디 (코드 으뜸음 기준 반음, null = 쉼) — 한 마디 8칸 */
  melody: (number | null)[];
  /** 멜로디 음색 */
  lead: OscillatorType;
  /** 하이햇을 16분음표로 */
  busyHats?: boolean;
}

export const STYLES: Record<string, SongStyle> = {
  fruitA: { root: 60, progression: [0, 5, 7, 5], melody: [12, null, 7, null, 9, 7, null, 4], lead: 'square' },
  fruitB: { root: 62, progression: [0, -3, 5, 7], melody: [7, 9, 12, null, 9, null, 7, 5], lead: 'triangle' },
  fruitC: { root: 57, progression: [0, 3, 5, 7], melody: [12, 10, 7, null, 12, 15, null, 10], lead: 'square', busyHats: true },
  fruitD: { root: 64, progression: [0, 5, -2, 7], melody: [7, 12, 7, 14, 12, null, 10, 7], lead: 'sawtooth', busyHats: true },
  market: { root: 65, progression: [0, 7, 9, 5], melody: [12, null, 12, 14, 16, null, 14, 12], lead: 'square' },
};

const mtof = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class MusicScheduler {
  private master: GainNode;
  private noise: AudioBuffer;
  private nextBeat = 0;
  private stopped = false;
  /** 음악 소리 크기 (0~1) */
  volume = 0.22;

  constructor(private ctx: AudioContext, private clock: BeatClock, private style: SongStyle, private totalBeats: number, firstBeat = 0) {
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextBeat = firstBeat;
  }

  /** 매 프레임 불러서 앞으로 lookaheadMs 안의 박자를 예약한다 */
  update(now: number, lookaheadMs = 180): void {
    if (this.stopped || this.clock.paused) return;
    // 늦게 불려 이미 지나간 박자는 건너뛴다 (멈췄다 다시 시작한 경우 등)
    const cur = Math.ceil(this.clock.beatAt(now));
    if (this.nextBeat < cur) this.nextBeat = cur;
    while (this.nextBeat < this.totalBeats && this.clock.timeOf(this.nextBeat) < now + lookaheadMs) {
      this.scheduleBeat(this.nextBeat);
      this.nextBeat++;
    }
  }

  private scheduleBeat(beat: number): void {
    if (beat < 0) return;
    const s = this.style;
    const bar = Math.floor(beat / 4), inBar = ((beat % 4) + 4) % 4;
    const chord = s.root + s.progression[bar % s.progression.length];
    const t = toAudioTime(this.ctx, this.clock.timeOf(beat));
    const half = this.clock.beatMs / 2000;
    if (inBar === 0 || inBar === 2) this.kick(t);
    if (inBar === 1 || inBar === 3) this.snare(t);
    const hats = s.busyHats ? 4 : 2;
    for (let i = 0; i < hats; i++) this.hat(t + (i * this.clock.beatMs) / hats / 1000, i === 0 ? 0.5 : 0.3);
    this.tone(mtof(chord - 24), t, half * 1.8, 'triangle', 0.5);
    for (let i = 0; i < 2; i++) {
      const m = s.melody[inBar * 2 + i];
      if (m !== null && m !== undefined) this.tone(mtof(chord + m), t + i * half, half * 0.9, s.lead, 0.16);
    }
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.26);
  }

  private snare(t: number): void {
    const n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    n.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(f).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.16);
  }

  private hat(t: number, vol: number): void {
    const n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    n.buffer = this.noise;
    f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol * 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.06);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number): void {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** 일시정지: 이미 예약된 소리를 잠깐 꺼서 끊는다 */
  mute(on: boolean): void {
    this.master.gain.setTargetAtTime(on ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  stop(): void {
    this.stopped = true;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => this.master.disconnect(), 400);
  }
}

/** 메트로놈 딸깍 (지연 보정·카운트인용) */
export function click(ctx: AudioContext, t: number, accent = false): void {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1600 : 1000;
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.07);
}
