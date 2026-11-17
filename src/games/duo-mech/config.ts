// 합체 로봇 조종석 밸런스 수치 (docs/games/duo-mech.md 10장)
// 게임 화면에서 ` 키를 누르면 디버그 패널에서 실시간으로 바꿔 볼 수 있다.
// 거리 단위는 "칸"(로봇 키 ≈ 2칸), 시간은 ms 또는 초.

export const CONFIG = {
  robotHp: 100,
  energyMax: 100,
  energyRegenPerSec: 12,
  shieldCostPerSec: 30,
  dashCost: 25,
  missileCost: 35,
  missileChargeSec: 3,
  laserDamage: 2,
  missileDamage: 12,
  /** 점프 최고점·대시·착지 전후 합동 공격 인정 범위 */
  comboWindowMs: 200,
  comboMultiplier: 2,
  /** 합동 기술 버튼 시간차 */
  syncWindowMs: 300,
  /** 합동 공격 몇 번이면 합동 기술 사용 가능 */
  specialGaugeHits: 8,
  /** 보스 공격 예고 시간 */
  telegraphMs: 600,
  /** 1인 모드 AI 반응 시간 */
  aiReactionMs: 350,

  // ── 기획서에 없어서 추가 ──
  /** 로봇 이동 (칸/초), 점프 속도·중력, 대시 */
  moveSpeed: 4.5,
  jumpSpeed: 9,
  gravity: 24,
  dashSpeed: 13,
  dashMs: 240,
  /** 팔 회전 속도 (라디안/초) */
  armTurnSpeed: 9,
  /** 레이저 연사 간격 — 스테이지당 약 1분이 되도록 (기획서: 한 판 약 5분) */
  laserIntervalMs: 400,
  laserSpeed: 20,
  missileSpeed: 9,
  /** 합동 기술 피해와 부활 체력 비율, 부활 대기 시간 */
  specialDamage: 30,
  reviveHpRatio: 0.5,
  reviveTimeoutMs: 8000,
  /** 집게: 잡을 수 있는 거리, 되던지기 피해 */
  grabRange: 2.4,
  throwBackDamage: 14,
  /** 보스 공격 피해 */
  lowShotDamage: 10,
  highShotDamage: 10,
  beamDamagePerTick: 5,
  beamTickMs: 300,
  beamMs: 1100,
  slamDamage: 20,
  /** 내려찍기 범위 (가운데에서 좌우) — 대시 한 번(13 × 0.24 ≈ 3.1칸)이면 빠져나갈 수 있게 */
  slamHalfWidth: 2.2,
  throwDamage: 12,
  pullMs: 1600,
  /** 끌어당기는 속도 — 막지 않으면 pullMs 안에 보스까지 끌려가 피해 */
  pullSpeed: 7,
  pullDamage: 15,
  bossShotSpeed: 8,
  /** 다음 공격까지 기본 간격 — 보스 체력이 줄수록 최대 이만큼 빨라짐 */
  attackIntervalMs: 2300,
  attackSpeedUp: 0.45,
  /** 스테이지 점수: 남은 체력 1당, 합동 공격 1번당, 기준 시간보다 빠른 1초당 */
  scorePerHp: 10,
  scorePerCombo: 50,
  scorePerSecSaved: 5,
  parTimeSec: 90,
  /** 부품 포인트: 클리어 기본 + 합동 공격 1번당 + 남은 체력 10당 */
  partsPerClear: 4,
  partsPerCombo: 1,
  partsPer10Hp: 1,
};

/** 스테이지별 보스 체력 (기획서 bossHp) */
export const BOSS_HP = [60, 150, 200, 260, 400];

/** 부품 강화 상점 (사용자 결정으로 추가). 각 부품은 최대 3단계 */
export const SHOP_ITEMS = [
  { id: 'armor', icon: '🛡️', name: '강화 장갑', desc: '최대 체력 +20', cost: 6 },
  { id: 'battery', icon: '🔋', name: '큰 배터리', desc: '최대 에너지 +25', cost: 6 },
  { id: 'generator', icon: '⚡', name: '발전기', desc: '에너지 회복 초당 +4', cost: 5 },
  { id: 'lens', icon: '🔫', name: '레이저 렌즈', desc: '레이저 피해 +1', cost: 7 },
  { id: 'warhead', icon: '🚀', name: '미사일 탄두', desc: '미사일 피해 +6', cost: 7 },
] as const;
export type UpgradeId = (typeof SHOP_ITEMS)[number]['id'];
export const SHOP_MAX_LEVEL = 3;

export type MechConfig = typeof CONFIG;
