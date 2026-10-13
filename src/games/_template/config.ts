// 밸런스 수치는 전부 여기에 (기획서 9장: 코드 중간에 숫자를 직접 쓰지 않는다)
// 게임 화면에서 ` 키를 누르면 디버그 패널에서 실시간으로 바꿔 볼 수 있다.

export const CONFIG = {
  /** 제한 시간 (초) */
  timeLimitSec: 20,
  /** 한 번 성공할 때 점수 */
  scorePerRep: 100,
  // 아래는 카메라 동작 인식 기준값 (src/input/pose-actions.ts의 ActionThresholds) — 보통 그대로 쓴다
  poseConfirmMs: 300,
  jumpConfirmMs: 120,
  raiseHandAboveShoulder: 0.1,
  squatHipDrop: 0.15,
  jumpAnkleRise: 0.06,
  buttonHitRadius: 0.1,
  freezeMaxMove: 0.02,
  freezeHoldMs: 3000,
  leanAngleDeg: 15,
};
