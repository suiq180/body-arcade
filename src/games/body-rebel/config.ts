// 몸이 말을 안 들어! 밸런스 수치 (docs/games/body-rebel.md 9장 초기값)
// 좌표 단위: 카메라 화면 높이·너비를 1로 본 비율
// 개발 중에는 게임 화면에서 ` 키로 디버그 패널을 열어 숫자 값을 실시간으로 바꿀 수 있다.

export type BaseRule = 'honest' | 'opposite';

export interface RoundConfig {
  /** 시작 규칙. 'random'이면 라운드 시작 때 무작위 */
  base: BaseRule | 'random';
  /** "가만히" 규칙: 빨간 글씨 지시는 아무것도 하지 않기 */
  still: boolean | 'random';
  /** "거짓말쟁이 색" 규칙: 글자가 아니라 글자 색의 버튼 치기 */
  colorLiar: boolean | 'random';
  /** 라운드 중 규칙 변경(정직↔반대) 횟수 */
  ruleChanges: number;
}

export const CONFIG = {
  roundCount: 5,
  questionsPerRound: 6,
  timeLimitsSec: [5, 4.5, 4, 3.5, 3],
  poseConfirmMs: 300,
  holdMissionSec: 3,
  scoreCorrect: 100,
  scoreFastest: 50,
  itemEveryStreak: 3,
  itemDurations: { fog: 3000, mirrorQuestions: 2, rush: 0.5 },
  raiseHandAboveShoulder: 0.1, // 손목이 어깨보다 이만큼 위
  squatHipDrop: 0.15,
  jumpAnkleRise: 0.06,
  buttonHitRadius: 0.1,
  freezeMaxMove: 0.02,

  // ↓ 기획서에 없어서 구현하며 추가한 값 (조정 필요 시 여기서)
  /** 점프는 공중에 있는 시간이 짧아서 300ms 유지 확정을 쓰면 놓친다 */
  jumpConfirmMs: 120,
  /** 상체가 이 각도(도) 이상 기울면 기울이기 */
  leanAngleDeg: 15,
  /** 이 시간 동안 freezeMaxMove 안에서만 움직이면 가만히(freeze) */
  freezeHoldMs: 3000,
  /** 유지형 미션은 유지 시간에 이만큼 여유를 더한 것이 제한 시간 */
  holdMissionSlackSec: 2.5,
  /** 라운드마다 유지형 미션 개수 */
  holdMissionsPerRound: 1,
  /** "가만히" 규칙일 때 빨간 글씨 지시가 나올 확률 */
  stillRedChance: 0.35,
  /** "거짓말쟁이 색" 규칙일 때 색 버튼 문제가 나올 확률 */
  colorLiarChance: 0.7,
  /** 결과·실패 표시 시간 (기획서 7장: 정답 0.8초 표시) */
  feedbackMs: 800,
  /** 규칙 변경 연출 멈춤 시간 (기획서 7장: 2초) */
  ruleChangePauseMs: 2000,
  /** 라운드 시작 안내 시간 */
  roundIntroMs: 2200,
  /** 라운드 결과 표시 시간 */
  roundResultMs: 2500,
  /** 사람이 안 보이면 이 시간 뒤 자동 일시정지 */
  pauseAfterLostMs: 600,

  /** 라운드별 규칙 (기획서 5장 표) */
  rounds: [
    { base: 'honest', still: false, colorLiar: false, ruleChanges: 1 },       // 1: 정직 → 반대 (연습)
    { base: 'opposite', still: false, colorLiar: false, ruleChanges: 0 },     // 2: 반대
    { base: 'opposite', still: true, colorLiar: false, ruleChanges: 0 },      // 3: 반대 + 가만히
    { base: 'honest', still: false, colorLiar: true, ruleChanges: 1 },        // 4: 거짓말쟁이 색 + 규칙 변경 1회
    { base: 'random', still: 'random', colorLiar: 'random', ruleChanges: 2 }, // 5: 무작위, 규칙 변경 2회
  ] as RoundConfig[],
};

export type BodyRebelConfig = typeof CONFIG;
