// 말하지 말랬잖아! 밸런스 수치 (docs/games/dont-say.md 10장 초기값)
// 개발 중에는 게임 화면에서 ` 키로 디버그 패널을 열어 숫자 값을 실시간으로 바꿀 수 있다.

export type DeviceId = 'engine' | 'oxygen' | 'power' | 'nav' | 'comm' | 'shield';
export type EventId = 'liar' | 'pitchFlip' | 'micLock' | 'noise';

export const CONFIG = {
  noiseCalibMs: 2000,
  loudOffsetDb: 20,
  quietMaxOffsetDb: 4,
  /** 유지 중 이 시간 이내 끊김은 허용 */
  holdToleranceMs: 300,
  pitchTargetBandSemitone: 2,
  pitchHoldMs: 2000,
  rhythmToleranceMs: 150,
  /** 이보다 길면 '길게' */
  shortLongSplitMs: 400,
  gaugeDecayPerSec: [1.5, 2.0, 2.5, 3.0],
  repairAmount: 35,
  safeThreshold: 70,
  explodeBrokenCount: 3,
  roundTimeSec: [45, 32, 28, 20],
  eventDurationsMs: { liar: 10000, pitchFlip: 10000, micLock: 3000, noise: 8000 } as Record<EventId, number>,

  // ↓ 기획서에 없어서 구현하며 추가한 값 (조정 필요 시 여기서)
  /** 소음보다 이만큼 크면 "소리 나는 중" */
  activeOffsetDb: 8,
  /** 크게 소리를 이만큼 유지하면 방어 성공 */
  loudSustainMs: 250,
  engineHoldMs: 3000,
  oxygenQuietMs: 5000,
  /** "하지 마세요" 지시: 이 시간 동안 아무 소리도 안 내면 성공 */
  dontWaitMs: 4000,
  /** "하지 마세요" 지시에서 이보다 길게 소리를 내면 실패 */
  dontFailSoundMs: 400,
  missionTimeMs: 12000,
  /** 미션 실패 시 장치 피해, 산소 누출 피해 */
  failDamage: 10,
  leakDamage: 5,
  /** 라운드별 동시 고장 장치 수 (기획서 6장) */
  brokenCount: [1, 2, 2, 3],
  brokenStartMin: 40,
  brokenStartMax: 55,
  healthyStart: 85,
  /** 라운드별로 나올 수 있는 특수 이벤트 (기획서 6장) */
  roundEvents: [[], ['liar'], ['liar', 'micLock'], ['liar', 'pitchFlip', 'micLock', 'noise']] as EventId[][],
  eventGapMinMs: 7000,
  eventGapMaxMs: 12000,
  noiseStormExtraDb: 10,
  /** 정직 로봇이 "~하지 마세요"(진짜로 하지 말기) 지시를 낼 확률 */
  honestDontChance: 0.2,
  missionGapMs: 900,
  roundIntroMs: 2400,
  roundResultMs: 2600,
  /** 점수: 라운드를 깰 때 남은 1초당, 장치 평균 게이지 1당 */
  scorePerSecLeft: 10,
  scorePerGauge: 2,
  /** 음성 인식이 없을 때 단어 미션 대신: 이 길이(±허용)로 소리 내기 */
  lengthTargetMs: 1500,
  lengthToleranceMs: 400,
  morsePatterns: ['SSL', 'LSS', 'SLS', 'LLS'],
  /** 모스 신호에서 소리 사이가 이보다 길면 처음부터 다시 */
  morseResetGapMs: 1500,
  /** 마이크 잠금 중 소리를 내면 이 간격마다 산소 감소 */
  micLockLeakEveryMs: 500,
};

export type DontSayConfig = typeof CONFIG;
