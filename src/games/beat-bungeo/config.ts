// 박자 붕어빵 밸런스 수치 (docs/games/beat-bungeo.md 10장 초기값)
// 개발 중에는 게임 화면에서 ` 키로 디버그 패널을 열어 숫자 값을 실시간으로 바꿀 수 있다.

export type Filling = 'red' | 'cream' | 'pizza';
export type Quality = 'golden' | 'normal' | 'ugly' | 'burnt';

export interface DayConfig {
  bpm: number;
  molds: number;
  fillings: Filling[];
  /** 단체 손님 (주문 4개) */
  groupOrders?: boolean;
  /** 비 오는 날: 손님 인내심 짧음 */
  rainy?: boolean;
}

export const CONFIG = {
  judge: { perfectMs: 50, goodMs: 120 },
  pourTargetBeats: 1.0,
  /** 박 단위 */
  pourTolerance: { perfect: 0.15, good: 0.35 },
  /** 붓고 뒤집기 노트까지 박 수 */
  cookBeats: 4,
  /** 뒤집기 노트 이후 이만큼 지나면 탐 */
  burnAfterBeats: 2,
  qualityPrice: { golden: 1.5, normal: 1.0, ugly: 0.7, burnt: 0 } as Record<Quality, number>,
  basePrice: 1000,
  patienceSec: { normal: 20, rainy: 12 },
  comboForTip: 5,
  days: [
    { bpm: 85, molds: 2, fillings: ['red'] },
    { bpm: 95, molds: 3, fillings: ['red', 'cream'] },
    { bpm: 105, molds: 4, fillings: ['red', 'cream'], groupOrders: true },
    { bpm: 115, molds: 4, fillings: ['red', 'cream', 'pizza'] },
    { bpm: 125, molds: 4, fillings: ['red', 'cream', 'pizza'], rainy: true },
  ] as DayConfig[],

  // ↓ 기획서에 없어서 구현하며 추가한 값 (조정 필요 시 여기서)
  /** 하루(곡 하나)의 박자 수 */
  beatsPerDay: 64,
  countInBeats: 4,
  dayIntroMs: 2600,
  dayResultMs: 3000,
  /** 하루 목표 매출 (날마다) */
  targetSales: [3000, 5000, 7000, 8000, 9000],
  /** 손님이 새로 오는 간격 (박) */
  customerEveryBeats: 8,
  maxQueue: 4,
  /** 팥·슈 패드를 이 시간 안에 같이 치면 화음 = 피자 붕어빵 */
  chordWindowMs: 90,
  /** 포장 패드를 친 뒤 이 박 수 안에 틀 패드를 쳐야 포장 */
  wrapArmBeats: 1.5,
  /** 탄 붕어빵이 연기 내다 치워지는 시간 (박) */
  burntClearBeats: 2,
  /** 뒤집기 노트가 레인 위에서 내려오는 시간 (박) */
  noteFallBeats: 2,
  /** 콤보 보상: 손님 인내심 회복 비율, 팁 (기본 가격 대비) */
  comboPatienceRestore: 0.3,
  tipRate: 0.2,
  /** 판정 점수 → 품질: 공정 3개 합 (PERFECT 2, GOOD 1, MISS 0) */
  goldenMinPoints: 6,
  normalMinPoints: 4,
};

export type BeatBungeoConfig = typeof CONFIG;
