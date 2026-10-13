// 효과음 — 외부 소리 파일 없이 Web Audio로 직접 합성한다 (기획서 8.5: 외부 에셋 금지)

let audio: AudioContext | null = null;

/** 사용자 동작(클릭 등) 뒤에 한 번 불러서 소리를 켤 수 있게 한다 */
export function unlockAudio(): void {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
}

function tone(freq: number, dur: number, type: OscillatorType = 'triangle', vol = 0.12, delay = 0, slide = 1): void {
  if (!audio) return;
  const t = audio.currentTime + delay;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + dur);
}

export const sfx = {
  correct: () => { tone(660, 0.1); tone(990, 0.16, 'triangle', 0.12, 0.08); },
  wrong: () => tone(220, 0.35, 'sawtooth', 0.08, 0, 0.6),
  tick: () => tone(1200, 0.04, 'square', 0.04),
  question: () => tone(520, 0.08, 'sine', 0.08),
  warn: () => [0, 0.18, 0.36].forEach((d) => tone(880, 0.14, 'square', 0.07, d)),
  item: () => tone(400, 0.3, 'triangle', 0.1, 0, 2.2),
  roundStart: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, i * 0.09)),
  finish: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.12, i * 0.12)),
};
