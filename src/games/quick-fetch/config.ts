// 밸런스 수치는 전부 여기에 (기획서 9장, docs/games/quick-fetch.md 8장)
// 게임 화면에서 ` 키를 누르면 디버그 패널에서 실시간으로 바꿔 볼 수 있다.

export const CONFIG = {
  /** 라운드 수 */
  rounds: 5,
  /** 준비(기준값 수집) 시간 */
  prepMs: 3000,
  /** 라운드 제한 시간 */
  roundLimitMs: 20000,
  /** 라운드 결과 표시 시간 */
  revealMs: 2500,
  /** 확정에 필요한 목표 물건 확률 */
  confirmProb: 0.85,
  /** 준비 때 기준값보다 이만큼 높아야 확정 (배경 라벨이 없는 모델 보완) */
  minRise: 0.35,
  /** 확정 유지 시간 */
  confirmHoldMs: 600,
  /** 라운드 1등 점수 */
  winScore: 100,
  /** 속도 보너스 최대 */
  speedBonusMax: 50,
  /** 이 시간 안에 찾으면 보너스 최대 (이후 제한 시간까지 0으로 줄어듦) */
  speedBonusFullMs: 5000,

  // ── 기획서에 없어서 추가 ──
  /** 다른 물건을 이 확률 이상으로 보여 주면 "그건 ○○이에요!" 표시 */
  wrongHintProb: 0.85,
  /** 인식 주기 (ms) — 어댑터에 넘긴다 */
  recognizeIntervalMs: 120,
  /** 칸 너비 대비 인식 상자 크기 */
  boxScale: 0.9,
  /** 빈 화면 보정: 기록해 둔 빈 화면과 이만큼(코사인 유사도) 비슷하면 물건 없음으로 본다 */
  emptySim: 0.9,
  /** 빈 화면 기록 시간 */
  emptyRecordMs: 2000,
  /** 기록 버튼을 누른 뒤 화면 밖으로 비켜설 시간 */
  emptyCountdownMs: 3000,
  /** 빈 화면 자동 갱신: 준비 시간 동안 인식 1번마다 기록을 지금 모습 쪽으로 옮기는 비율 (0 = 끔) */
  emptyAdaptRate: 0.05,
  /** 이 유사도 이상인(확실히 빈) 칸만 자동 갱신 */
  emptyAdaptMinSim: 0.93,
};

/**
 * 모델 라벨(metadata.json) → 화면 표시. 사용자 지정 5종만 문제로 낸다.
 * 모델에 있지만 여기에 없는 라벨(예: '배경')은 '빈 상자'로 본다 → 문제로 안 나오고 "그건 ○○이에요" 안내도 없음.
 */
export const ITEMS: { label: string; emoji: string }[] = [
  { label: '스마트폰', emoji: '📱' },
  { label: '지갑', emoji: '👛' },
  { label: '라이터', emoji: '🔥' },
  { label: '에어팟', emoji: '🎧' },
  { label: '마우스', emoji: '🖱️' },
];

/** 플레이어 색 (왼쪽 칸부터) */
export const ZONE_COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419'];

export const MODEL_DIR = 'models/quick-fetch';

/** 물건이 아닌 라벨(배경)을 화면에 보여 줄 이름 */
export const EMPTY_TEXT = '⬜ 빈 상자';
