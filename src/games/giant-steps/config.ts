// 두 다리 거인 밸런스 수치 (docs/games/giant-steps.md 10장)
// 게임 화면에서 ` 키를 누르면 디버그 패널에서 실시간으로 바꿔 볼 수 있다.

export const CONFIG = {
  /** 이만큼 이상 들고 있으면 최대 높이 */
  liftMaxMs: 600,
  /** 기본 보폭 (px) */
  stepBase: 60,
  /** ↗ 큰 보폭 배율 */
  stepBigScale: 1.5,
  /** ↖ 작은 보폭 배율 */
  stepSmallScale: 0.6,
  /** 같은 다리 연속 사용 시 기울기 */
  sameLegLean: 0.5,
  /** 한발로 서 있는 동안 초당 흔들림 */
  oneLegWobble: 0.15,
  /** 팔 흔들기 1회 균형 회복량 */
  armRecover: 0.35,
  /** 균형 게이지 끝 */
  fallThreshold: 1.0,
  /** 일으키기 연타 횟수 (둘 합산) */
  getUpPresses: 12,
  /** 동시 동작(웅크리기·점프) 허용 시간차 */
  syncWindowMs: 300,
  /** 빙판에서 보폭에 더해지는 미끄러짐 */
  iceSlip: 0.25,
  /** 옆바람 초당 기울기 */
  windForce: 0.2,

  // ── 기획서에 없어서 추가 ──
  /** 이보다 짧게 들었다 디디면 "서두름" → 무작위로 기울어짐 */
  hurryLiftMs: 150,
  hurryLean: 0.2,
  /** 웅크린 채 걸을 때 보폭 배율 */
  crouchStepScale: 0.7,
  /** 웅크리면 옆바람을 이만큼만 받음 */
  crouchWindScale: 0.3,
  /** 동시 점프로 나아가는 거리 (px)와 공중 시간 */
  jumpDistance: 170,
  jumpMs: 650,
  /** 시소 다리 초당 기울기 (가운데를 넘으면 반대 방향) */
  seesawForce: 0.25,
  /** 다리를 들고 있을 때 최대 높이 (px, 화면 표시) */
  liftHeight: 46,
  /** 체크포인트로 돌아갈 때 화면 멈춤 */
  respawnMs: 900,
  /** 별 점수: 별 하나당 점수, 가장 느린 별 기준보다 빠른 1초당 점수 */
  scorePerStar: 1000,
  scorePerSecSaved: 10,
};

/** 코스별 별 3개 / 2개 / 1개 기준 시간 (초) — 기획서 10장 starTimesSec */
export const STAR_TIMES_SEC: [number, number, number][] = [[40, 60, 90], [60, 90, 120], [80, 110, 150], [100, 140, 180], [120, 160, 210]];

export type GiantConfig = typeof CONFIG;

/** true면 코스 5개를 처음부터 모두 고를 수 있다 (false면 별을 받아야 다음 코스가 열림) */
export const ALL_COURSES_OPEN = true;
