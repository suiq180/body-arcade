// 눈치껏 쌓아라 밸런스 수치 (docs/games/stack-sense.md 9장 초기값)
// 좌표 단위: 게임 화면을 가로 1600 × 세로 900 으로 본 값 (world px)
// 개발 중에는 게임 화면에서 ` 키로 디버그 패널을 열어 숫자 값을 실시간으로 바꿀 수 있다.

export type ShapeId = 'box' | 'bar' | 'longbar' | 'tri' | 'ball';
export type ItemId = 'glue' | 'wind' | 'ice' | 'remove';

export const CONFIG = {
  turnTimeSec: 30,
  settleCheckSec: 3,
  collapseFallenBlocks: 3,
  /** 손 속도(화면 높이/초)가 블록에 전달되는 비율 */
  releaseVelocityScale: 0.6,
  /** 블록에 전달되는 속도 상한 (화면 높이/초) — 추적 튐 방지 */
  releaseVelocityMax: 2.0,
  rotateSnapDeg: 15,
  handSmoothing: 0.35,
  coinPerFloor: 1,
  itemPrice: { glue: 3, wind: 4, ice: 4, remove: 5 } as Record<ItemId, number>,
  /** 옆바람 세기 (중력 대비 비율에 windToGravity를 곱해 쓴다) */
  windForce: 0.8,
  quakeFromRound: 3,
  /** 지진 흔들림 폭 (화면 너비 대비) */
  quakeAmplitude: 0.004,
  roundsPerGame: 5,

  // ↓ 기획서에 없어서 구현하며 추가한 값 (조정 필요 시 여기서)
  worldW: 1600,
  worldH: 900,
  /** 탑 받침대 너비·윗면 높이 */
  baseWidth: 460,
  baseTopY: 720,
  /** 바닥(떨어진 블록이 닿는 곳) 높이 */
  floorY: 860,
  /** 블록 선반 위치 (화면 왼쪽) */
  shelfX: 190,
  shelfY: 420,
  /** 선반 블록을 집을 수 있는 손과의 거리 */
  grabRadius: 130,
  /** 손 위치를 화면 가장자리까지 쓰기 위한 여백 (카메라 영상의 이만큼 안쪽 = 게임 화면 끝) */
  handMargin: 0.12,
  /** 놓을 때 속도를 계산하는 손 움직임 구간 */
  velocityWindowMs: 120,
  /** 주먹을 이만큼 유지하면 아이템 사용 */
  itemFistHoldMs: 1000,
  windToGravity: 0.2,
  windDurationMs: 3000,
  blockFriction: 0.9,
  iceFriction: 0.03,
  /** 탑 꼭대기가 화면 위에서 이만큼 아래에 오도록 화면을 내린다 */
  viewTopMargin: 260,
  /** 블록 중심이 받침대 윗면보다 이만큼 아래로 내려가면 떨어진 블록 */
  fallenMargin: 30,
  /** 탑 기울기가 이 각도 이상이면 위험 표시 */
  dangerTiltDeg: 16,
  slowMoScale: 0.3,
  slowMoMs: 1800,
  quakePeriodSec: 2.6,
  turnIntroMs: 1600,
  roundIntroMs: 2200,
  roundResultMs: 2600,
  /** 점수: 라운드 승리, 성공한 층 하나 */
  scoreRoundWin: 100,
  scorePerFloor: 10,
  scoreTraitorWin: 300,
  traitorFloorMin: 4,
  traitorFloorMax: 8,
  specialMissionFloor: 5,
  specialMissionCoins: 3,
  /** 스페셜 모드에서 특수 블록(공·삼각형·긴 막대)이 나올 확률 */
  specialBlockChance: 0.45,
  maxPlayers: 6,
  /** AI: 생각하는 시간, 손 옮기는 시간, 실력별 조준 오차(px)·놓는 속도(화면 높이/초) */
  aiThinkMinMs: 900,
  aiThinkMaxMs: 2000,
  aiMoveMs: 1300,
  aiErrorPx: [16, 28, 42],
  aiDropSpeed: [0.05, 0.12, 0.22],
  aiItemChance: 0.5,

  /** 층수에 따른 블록 모양 (기획서 5장: 네모 → 긴 막대 → 삼각형·원) */
  shapeStages: [
    { fromFloor: 0, shapes: ['box'] },
    { fromFloor: 3, shapes: ['box', 'bar'] },
    { fromFloor: 6, shapes: ['box', 'bar', 'tri'] },
  ] as { fromFloor: number; shapes: ShapeId[] }[],
  specialShapes: ['ball', 'tri', 'longbar'] as ShapeId[],
};

export type StackSenseConfig = typeof CONFIG;
