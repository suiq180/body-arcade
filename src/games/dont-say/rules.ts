// 말하지 말랬잖아! 규칙 계산 (화면·마이크와 분리된 순수 로직)
// 목소리 조작 판별기들은 매 프레임 { 소리 남, 큼, 조용함, 음높이 } 를 받아 진행도를 계산한다 → 가짜 값으로 시험 가능.

import type { DeviceId, DontSayConfig } from './config';

export type Rng = () => number;
export type VoiceOp = 'loud' | 'hold' | 'pitch' | 'quiet' | 'word' | 'rhythm' | 'length';
export type Robot = 'honest' | 'liar';
export type Phrase = 'do' | 'dont';

export const DEVICE_INFO: Record<DeviceId, { icon: string; name: string }> = {
  engine: { icon: '🚀', name: '엔진' },
  oxygen: { icon: '🫧', name: '산소' },
  power: { icon: '⚡', name: '전력' },
  nav: { icon: '🧭', name: '항법' },
  comm: { icon: '📡', name: '통신' },
  shield: { icon: '🛡️', name: '방어' },
};
export const DEVICES = Object.keys(DEVICE_INFO) as DeviceId[];

/** 2인 협동 담당: P1 = 크기·길이, P2 = 높이·단어 */
export const OP_OWNER: Record<VoiceOp, 0 | 1> = { loud: 0, hold: 0, quiet: 0, rhythm: 0, length: 0, pitch: 1, word: 1 };

/** 지시대로 해야 하는지: 정직 로봇은 말 그대로, 거짓말 로봇은 반대로 */
export function shouldDo(robot: Robot, phrase: Phrase): boolean {
  return (robot === 'honest') === (phrase === 'do');
}

export interface VoiceInput {
  /** 이번 프레임 길이 (ms) */
  dt: number;
  /** 소리 나는 중 (소음 + activeOffsetDb 이상) */
  active: boolean;
  /** 크게 (소음 + loudOffsetDb 이상) */
  loud: boolean;
  /** 조용함 (소음 + quietMaxOffsetDb 이하) */
  quiet: boolean;
  pitch: number | null;
}

export type StepResult = 'done' | 'fail' | 'leak' | 'wrong' | null;

/** 목소리 판별기: 매 프레임 update, 진행도 0~1 */
export interface Detector {
  update(v: VoiceInput): StepResult;
  progress(): number;
}

/** 소리 유지 (짧은 끊김은 허용) */
export class HoldDetector implements Detector {
  private ms = 0; private gap = 0;
  constructor(private needMs: number, private tolMs: number) {}
  update(v: VoiceInput): StepResult {
    if (v.active) { this.ms += v.dt; this.gap = 0; }
    else { this.gap += v.dt; if (this.gap > this.tolMs) this.ms = 0; }
    return this.ms >= this.needMs ? 'done' : null;
  }
  progress(): number { return Math.min(1, this.ms / this.needMs); }
}

/** 완전히 조용히. 소리가 나면 처음부터 + 누출 */
export class QuietDetector implements Detector {
  private ms = 0;
  constructor(private needMs: number) {}
  update(v: VoiceInput): StepResult {
    if (v.active) { const leaked = this.ms > 0; this.ms = 0; return leaked ? 'leak' : null; }
    if (v.quiet || !v.active) this.ms += v.dt;
    return this.ms >= this.needMs ? 'done' : null;
  }
  progress(): number { return Math.min(1, this.ms / this.needMs); }
}

/** 목표 음높이 구간 안에서 유지 */
export class PitchDetector implements Detector {
  private ms = 0; private gap = 0;
  constructor(public low: number, public high: number, private needMs: number, private tolMs: number) {}
  update(v: VoiceInput): StepResult {
    const inBand = v.active && v.pitch !== null && v.pitch >= this.low && v.pitch <= this.high;
    if (inBand) { this.ms += v.dt; this.gap = 0; }
    else { this.gap += v.dt; if (this.gap > this.tolMs) this.ms = Math.max(0, this.ms - v.dt * 2); }
    return this.ms >= this.needMs ? 'done' : null;
  }
  progress(): number { return Math.min(1, this.ms / this.needMs); }
}

/** 크게 소리 지르기 */
export class LoudDetector implements Detector {
  private ms = 0;
  constructor(private needMs: number) {}
  update(v: VoiceInput): StepResult {
    this.ms = v.loud ? this.ms + v.dt : 0;
    return this.ms >= this.needMs ? 'done' : null;
  }
  progress(): number { return Math.min(1, this.ms / this.needMs); }
}

/**
 * 소리 덩어리(시작~끝)의 길이를 잰다. 짧은 끊김(tolMs)은 한 덩어리로 본다.
 * 덩어리가 끝날 때마다 길이(ms)를 돌려준다.
 */
export class SegmentTracker {
  private on = false; private len = 0; private gap = 0;
  /** 마지막 소리가 끝난 뒤 지난 시간 */
  silence = 0;
  constructor(private tolMs: number) {}
  update(v: VoiceInput): number | null {
    if (v.active) {
      if (!this.on) { this.on = true; this.len = 0; }
      this.len += this.gap + v.dt; this.gap = 0; this.silence = 0;
      return null;
    }
    this.silence += v.dt;
    if (!this.on) return null;
    this.gap += v.dt;
    if (this.gap > this.tolMs) { this.on = false; this.gap = 0; return this.len; }
    return null;
  }
  get current(): number { return this.on ? this.len : 0; }
}

/** 모스 신호 따라 하기: 'S' 짧게, 'L' 길게 */
export class MorseDetector implements Detector {
  private seg: SegmentTracker;
  got = '';
  constructor(public pattern: string, private splitMs: number, tolMs: number, private resetGapMs: number) {
    this.seg = new SegmentTracker(tolMs);
  }
  update(v: VoiceInput): StepResult {
    const len = this.seg.update(v);
    if (len === null) {
      if (this.got && this.seg.silence > this.resetGapMs) { this.got = ''; return 'wrong'; }
      return null;
    }
    this.got += len >= this.splitMs ? 'L' : 'S';
    if (this.got === this.pattern) return 'done';
    if (!this.pattern.startsWith(this.got)) { this.got = ''; return 'wrong'; }
    return null;
  }
  progress(): number { return this.got.length / this.pattern.length; }
}

/** 정해진 길이로 소리 내기 (음성 인식이 없을 때 단어 미션 대체) */
export class LengthDetector implements Detector {
  private seg: SegmentTracker;
  constructor(private targetMs: number, private tolMs: number, gapTolMs: number) {
    this.seg = new SegmentTracker(gapTolMs);
  }
  update(v: VoiceInput): StepResult {
    const len = this.seg.update(v);
    if (len === null) return null;
    return Math.abs(len - this.targetMs) <= this.tolMs ? 'done' : 'wrong';
  }
  progress(): number { return Math.min(1, this.seg.current / this.targetMs); }
}

/** "하지 마세요" (진짜로 하지 말기): 일정 시간 소리를 길게 내지 않으면 성공 */
export class DontDetector implements Detector {
  private ms = 0; private sound = 0;
  constructor(private waitMs: number, private failSoundMs: number) {}
  update(v: VoiceInput): StepResult {
    this.ms += v.dt;
    this.sound = v.active ? this.sound + v.dt : 0;
    if (this.sound >= this.failSoundMs) return 'fail';
    return this.ms >= this.waitMs ? 'done' : null;
  }
  progress(): number { return Math.min(1, this.ms / this.waitMs); }
}

// ── 단어 ─────────────────────────────────
const KO_DIGITS: Record<string, string> = {
  영: '0', 공: '0', 일: '1', 하나: '1', 한: '1', 이: '2', 둘: '2', 두: '2', 삼: '3', 셋: '3', 세: '3', 사: '4', 넷: '4', 네: '4',
  오: '5', 다섯: '5', 육: '6', 륙: '6', 여섯: '6', 칠: '7', 일곱: '7', 팔: '8', 여덟: '8', 구: '9', 아홉: '9',
};

/** 음성 인식 결과 → 숫자열 ("삼 일 사" / "3 1 4" / "삼일사" → "314") */
export function spokenDigits(text: string): string {
  const keys = Object.keys(KO_DIGITS).sort((a, b) => b.length - a.length);
  let out = '';
  let s = text.replace(/[\s,.!?~-]/g, '');
  while (s.length) {
    if (/\d/.test(s[0])) { out += s[0]; s = s.slice(1); continue; }
    const k = keys.find((key) => s.startsWith(key));
    if (k) { out += KO_DIGITS[k]; s = s.slice(k.length); } else s = s.slice(1);
  }
  return out;
}

/** 단어가 들어 있는지 (띄어쓰기·문장부호 무시) */
export function containsWord(text: string, word: string): boolean {
  const norm = (t: string) => t.replace(/[\s,.!?~-]/g, '');
  return norm(text).includes(norm(word));
}

// ── 미션 ─────────────────────────────────
export interface MissionStep {
  op: VoiceOp;
  /** 화면 안내 */
  text: string;
  /** word 단계: 맞춰야 할 단어 또는 숫자열 */
  word?: string;
  digits?: boolean;
  /** pitch 단계: 지시한 구간 이름 */
  zone?: 'low' | 'mid' | 'high';
  pattern?: string;
}

export interface Mission {
  device: DeviceId;
  robot: Robot;
  phrase: Phrase;
  steps: MissionStep[];
  /** 지시 문장 */
  say: string;
}

const ZONE_LABEL = { low: '낮게', mid: '중간 높이로', high: '높게' } as const;
const morseText = (p: string) => p.split('').map((c) => (c === 'S' ? '짧게' : '길게')).join('-');

/** 장치별 미션 만들기. speech = 음성 인식을 쓸 수 있는지 (없으면 단어 단계를 소리 길이 단계로 바꾼다) */
export function makeMission(device: DeviceId, robot: Robot, cfg: DontSayConfig, rng: Rng, speech: boolean): Mission {
  const steps: MissionStep[] = [];
  const lengthStep: MissionStep = { op: 'length', text: `"아—" ${cfg.lengthTargetMs / 1000}초 소리 내기` };
  let act = '';
  switch (device) {
    case 'engine':
      steps.push(speech ? { op: 'word', word: '점화', text: '"점화!" 외치기' } : lengthStep, { op: 'hold', text: `"부웅~" ${cfg.engineHoldMs / 1000}초 유지` });
      act = speech ? '"점화!"를 외치고 3초간 "부웅~"' : '"아—" 1.5초 소리 내고 3초간 "부웅~"';
      break;
    case 'oxygen':
      steps.push({ op: 'quiet', text: `${cfg.oxygenQuietMs / 1000}초 동안 완전히 조용히` });
      act = '산소 누출! 5초 동안 조용히';
      break;
    case 'power': {
      const zone = (['low', 'mid', 'high'] as const)[Math.floor(rng() * 3)];
      steps.push({ op: 'pitch', zone, text: `목소리를 ${ZONE_LABEL[zone]} ${cfg.pitchHoldMs / 1000}초` });
      act = `전압 맞추기: 목소리를 ${ZONE_LABEL[zone]} 2초 유지`;
      break;
    }
    case 'nav': {
      const d = Array.from({ length: 3 }, () => String(1 + Math.floor(rng() * 9))).join('');
      steps.push(speech ? { op: 'word', word: d, digits: true, text: `"${d.split('').join(', ')}" 말하기` } : { op: 'rhythm', pattern: 'SSS', text: '소리를 짧게 3번 끊어 내기' });
      act = speech ? `별자리 번호 "${d.split('').join(', ')}"를 말하기` : '소리를 짧게 3번 끊어 내기';
      break;
    }
    case 'comm': {
      const p = cfg.morsePatterns[Math.floor(rng() * cfg.morsePatterns.length)];
      steps.push({ op: 'rhythm', pattern: p, text: `모스 신호 ${morseText(p)}` });
      act = `모스 신호 "${morseText(p)}" 따라 하기`;
      break;
    }
    case 'shield':
      steps.push({ op: 'loud', text: '크게 소리 질러 방어막!' });
      act = '운석 접근! 크게 소리 질러 방어막';
      break;
  }
  // 문장: 정직 로봇은 대부분 "하세요", 가끔 "하지 마세요"(함정). 거짓말 로봇은 반반.
  // 산소(조용히)는 반대로 하기가 같은 행동이라, 늘 "해야 하는" 쪽 문장만 쓴다.
  let phrase: Phrase;
  if (device === 'oxygen') phrase = robot === 'honest' ? 'do' : 'dont';
  else phrase = robot === 'honest' ? (rng() < cfg.honestDontChance ? 'dont' : 'do') : (rng() < 0.5 ? 'dont' : 'do');
  const say = `${DEVICE_INFO[device].name}: ${act}${phrase === 'do' ? ' 하세요!' : ' 하지 마세요!'}`;
  return { device, robot, phrase, steps, say };
}

/** 음역 안의 목표 구간 (반음). 음높이 반전 이벤트 중에는 높게↔낮게 */
export function pitchBand(zone: 'low' | 'mid' | 'high', range: { low: number; high: number }, cfg: DontSayConfig, flip: boolean): { low: number; high: number } {
  const z = flip ? ({ low: 'high', mid: 'mid', high: 'low' } as const)[zone] : zone;
  const k = { low: 0.15, mid: 0.5, high: 0.85 }[z];
  const center = range.low + (range.high - range.low) * k;
  return { low: center - cfg.pitchTargetBandSemitone, high: center + cfg.pitchTargetBandSemitone };
}

/** 고칠 장치 고르기: 가장 낮은 고장 장치 (같으면 무작위), 고장이 없으면 null */
export function pickDevice(gauges: Record<DeviceId, number>, cfg: DontSayConfig, rng: Rng, avoid?: DeviceId): DeviceId | null {
  const broken = DEVICES.filter((d) => gauges[d] < cfg.safeThreshold);
  if (!broken.length) return null;
  const pool = broken.length > 1 && avoid ? broken.filter((d) => d !== avoid) : broken;
  const min = Math.min(...pool.map((d) => gauges[d]));
  const lowest = pool.filter((d) => gauges[d] - min < 5);
  return lowest[Math.floor(rng() * lowest.length)];
}

export const explodedCount = (g: Record<DeviceId, number>): number => DEVICES.filter((d) => g[d] <= 0).length;
export const allSafe = (g: Record<DeviceId, number>, cfg: DontSayConfig): boolean => DEVICES.every((d) => g[d] >= cfg.safeThreshold);
