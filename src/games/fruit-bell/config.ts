// 땡! 과일벨 밸런스 수치 (docs/games/fruit-bell.md 10장 초기값)
// 개발 중에는 게임 화면에서 ` 키로 디버그 패널을 열어 숫자 값을 실시간으로 바꿀 수 있다.

export interface SongConfig {
  bpm: number;
  kinds: number;
  /** 정답 기회일 때 종이 빛나는 힌트 */
  hint?: boolean;
  /** 과일 수를 그림 대신 숫자로만 보여 주는 카드 비율 */
  numberCards?: number;
  /** 카드 2장이 동시에 넘어감 + 반박자 연속 구간 */
  doubleFlip?: boolean;
  /** 배경 음악 스타일 (src/rhythm/music.ts) */
  style: string;
}

export const CONFIG = {
  targetCount: 5,
  fruitKinds: 4,
  countRange: [1, 5] as [number, number],
  onBeatWindowMs: 80,
  scoreCorrect: 3,
  scoreOnBeat: 1,
  scoreHardHit: 1,
  hardHitVelocity: 100,
  penaltyWrong: -2,
  lockBeats: 1,
  /** 박자 중 정답 기회 비율 [최소, 최대] */
  chanceRatePerSong: [0.15, 0.25] as [number, number],
  aiReactionMs: [450, 650, 900],
  songs: [
    { bpm: 80, kinds: 2, hint: true, style: 'fruitA' },
    { bpm: 100, kinds: 4, style: 'fruitB' },
    { bpm: 120, kinds: 4, numberCards: 0.3, style: 'fruitC' },
    { bpm: 140, kinds: 4, doubleFlip: true, style: 'fruitD' },
  ] as SongConfig[],

  // ↓ 기획서에 없어서 구현하며 추가한 값 (조정 필요 시 여기서)
  /** 곡 하나의 박자 수 (카운트인 제외) — 4곡 합쳐 약 2분 */
  beatsPerSong: 48,
  countInBeats: 4,
  /** 곡 시작 전 안내 시간 */
  songIntroMs: 2200,
  /** 다른 사람이 이미 정답을 친 뒤 이 시간 안의 입력은 벌점 없이 무시 ("늦었어요") */
  lateGraceMs: 350,
  /** AI 반응 시간 흔들림 (±비율) */
  aiReactionJitter: 0.2,
  /** 마지막 곡에서 반박자로 카드가 넘어가는 구간 (박자 범위, [시작, 끝)) */
  halfBeatSections: [[16, 24], [36, 44]] as [number, number][],
  /** 결과 표시 효과 시간 */
  flashMs: 450,
};

export type FruitBellConfig = typeof CONFIG;
