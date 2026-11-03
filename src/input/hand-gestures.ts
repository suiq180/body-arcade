// 손 관절 21개 → 손 상태(open / pinch / fist), 손 위치, 손목 회전각 판별
// 카메라나 MediaPipe에 의존하지 않는 순수 로직이라 가짜 좌표로도 시험할 수 있다.
//
// 좌표는 "거울 모드 화면 기준": x 0(왼쪽)~1(오른쪽), y 0(위)~1(아래).
// 가로·세로 길이 비율이 다르므로 거리 계산 때는 x에 화면 비율(aspect)을 곱한다.

export type HandState = 'open' | 'pinch' | 'fist';

export const HAND_STATE_LABEL: Record<HandState, string> = {
  open: '손 펴기',
  pinch: '집기(핀치)',
  fist: '주먹',
};

export interface HandPoint { x: number; y: number }

/** MediaPipe Hand 관절 번호 */
export const HL = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5, indexTip: 8,
  middleMcp: 9, middleTip: 12,
  ringMcp: 13, ringTip: 16,
  pinkyMcp: 17, pinkyTip: 20,
} as const;

export const HAND_BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export interface HandThresholds {
  /** 엄지·검지 끝 거리 / 손 크기가 이보다 작으면 핀치 시작 */
  pinchOn: number;
  /** 핀치 중에는 이보다 커져야 핀치가 풀린다 (떨림 방지) */
  pinchOff: number;
  /** 손가락 끝~손목 거리가 손가락 뿌리~손목 거리의 이 배수보다 작으면 굽힌 손가락 */
  curlRatio: number;
}

export const DEFAULT_HAND_THRESHOLDS: HandThresholds = { pinchOn: 0.32, pinchOff: 0.48, curlRatio: 1.15 };

const FINGERS: [number, number][] = [
  [HL.indexTip, HL.indexMcp], [HL.middleTip, HL.middleMcp], [HL.ringTip, HL.ringMcp], [HL.pinkyTip, HL.pinkyMcp],
];

function dist(a: HandPoint, b: HandPoint, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** 손 크기 = 손목~가운뎃손가락 뿌리 거리 (화면 높이 기준) */
export function handSize(lm: HandPoint[], aspect: number): number {
  return dist(lm[HL.wrist], lm[HL.middleMcp], aspect);
}

/** 이전 상태를 알아야 핀치 풀림에 여유(히스테리시스)를 줄 수 있다 */
export function classifyHand(lm: HandPoint[], aspect: number, prev: HandState | null, t: HandThresholds): HandState {
  const size = handSize(lm, aspect) || 1e-6;
  const wrist = lm[HL.wrist];
  const curled = FINGERS.filter(([tip, mcp]) => dist(lm[tip], wrist, aspect) < dist(lm[mcp], wrist, aspect) * t.curlRatio).length;
  const pinchDist = dist(lm[HL.thumbTip], lm[HL.indexTip], aspect) / size;
  const pinching = pinchDist < (prev === 'pinch' ? t.pinchOff : t.pinchOn);
  // 주먹은 검지까지 네 손가락이 모두 굽은 상태. 핀치는 검지가 엄지 쪽으로 뻗어 있어서 굽은 손가락이 3개 이하
  if (curled === 4) return 'fist';
  if (pinching) return 'pinch';
  return 'open';
}

/** 조작 기준점: 엄지·검지 끝의 가운데 (집는 위치와 같아서 직관적) */
export function handAnchor(lm: HandPoint[]): HandPoint {
  return { x: (lm[HL.thumbTip].x + lm[HL.indexTip].x) / 2, y: (lm[HL.thumbTip].y + lm[HL.indexTip].y) / 2 };
}

/** 손목 회전각(라디안): 손목→가운뎃손가락 뿌리 방향. 손가락이 위를 향하면 0, 시계 방향이 + */
export function wristAngle(lm: HandPoint[], aspect: number): number {
  const w = lm[HL.wrist], m = lm[HL.middleMcp];
  return Math.atan2((m.x - w.x) * aspect, -(m.y - w.y));
}

/** 각도 차이를 -π~π로 맞춘다 */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 여러 손이 잡히면 가장 큰(카메라에 가까운) 손만 쓴다 (stack-sense 기획서 8장) */
export function pickLargestHand(hands: HandPoint[][], aspect: number): HandPoint[] | null {
  let best: HandPoint[] | null = null, bestSize = 0;
  for (const h of hands) {
    const s = handSize(h, aspect);
    if (s > bestSize) { best = h; bestSize = s; }
  }
  return best;
}
