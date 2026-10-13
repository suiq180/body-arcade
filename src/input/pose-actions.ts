// 전신 관절 좌표 → 동작 ID 판별 (body-rebel 동작 11종)
// 카메라나 MediaPipe에 의존하지 않는 순수 로직이라 가짜 좌표로도 시험할 수 있다.
//
// 좌표는 "거울 모드 화면 기준": x 0(왼쪽)~1(오른쪽), y 0(위)~1(아래).
// 왼쪽·오른쪽은 플레이어 기준 (기획서: 좌우는 플레이어 기준, 화면은 거울 모드).

export type PoseAction =
  | 'raise-left' | 'raise-right' | 'raise-both'
  | 'touch-red' | 'touch-blue' | 'touch-yellow'
  | 'squat' | 'jump'
  | 'lean-left' | 'lean-right'
  | 'freeze'
  /** 두 팔 X자 교차 — 게임 동작이 아니라 아이템 사용 신호 (11종 목록에는 없음) */
  | 'cross-arms';

export const POSE_ACTIONS: { id: PoseAction; label: string }[] = [
  { id: 'raise-left', label: '왼손 들기' },
  { id: 'raise-right', label: '오른손 들기' },
  { id: 'raise-both', label: '두 손 머리 위로' },
  { id: 'touch-red', label: '빨강 버튼 치기' },
  { id: 'touch-blue', label: '파랑 버튼 치기' },
  { id: 'touch-yellow', label: '노랑 버튼 치기' },
  { id: 'squat', label: '앉기' },
  { id: 'jump', label: '점프' },
  { id: 'lean-left', label: '왼쪽으로 기울이기' },
  { id: 'lean-right', label: '오른쪽으로 기울이기' },
  { id: 'freeze', label: '가만히 있기' },
];

export function actionLabel(a: PoseAction | null): string {
  if (a === 'cross-arms') return '팔 X자 교차';
  return a ? POSE_ACTIONS.find((p) => p.id === a)!.label : '';
}

export interface Point { x: number; y: number; visibility: number }

/** MediaPipe Pose 관절 번호 (사람 기준 왼쪽/오른쪽) */
export const LM = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
} as const;

/** 시작 조건 "어깨~무릎이 보여야 시작" 에 쓰는 관절 */
export const REQUIRED_FOR_START = [
  LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee,
];

export interface ActionThresholds {
  poseConfirmMs: number;
  jumpConfirmMs: number;
  raiseHandAboveShoulder: number;
  squatHipDrop: number;
  jumpAnkleRise: number;
  buttonHitRadius: number;
  freezeMaxMove: number;
  freezeHoldMs: number;
  leanAngleDeg: number;
}

/** 화면 위 색 버튼 위치 (거울 화면 기준, 기획서: 위쪽 좌·중·우) */
export const TOUCH_BUTTONS: { id: PoseAction; x: number; y: number; color: string }[] = [
  { id: 'touch-red', x: 0.2, y: 0.14, color: '#fa5252' },
  { id: 'touch-blue', x: 0.5, y: 0.14, color: '#339af0' },
  { id: 'touch-yellow', x: 0.8, y: 0.14, color: '#fcc419' },
];

const VISIBLE = 0.5;
const visible = (p: Point | undefined): p is Point => !!p && p.visibility >= VISIBLE;

export function bodyVisible(lm: Point[] | null): boolean {
  if (!lm) return false;
  return REQUIRED_FOR_START.every((i) => {
    const p = lm[i];
    return visible(p) && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;
  });
}

/**
 * 매 프레임 관절 좌표를 넣으면, 0.3초 유지된 "확정 동작"을 돌려준다.
 * 서 있는 자세의 엉덩이·발목 높이를 스스로 학습해서 앉기·점프를 판단한다.
 */
export class ActionRecognizer {
  /** 지금 프레임에서 보이는 동작 (확정 전) */
  candidate: PoseAction | null = null;
  /** 유지 시간을 채워 확정된 동작 */
  confirmed: PoseAction | null = null;

  private pending: PoseAction | null = null;
  private pendingSince = 0;
  private baseHipY: number | null = null;
  private baseAnkleY: number | null = null;
  private stillRef: { x: number; y: number }[] | null = null;
  private stillSince = 0;
  private lastTime = 0;

  constructor(private cfg: ActionThresholds, private aspect = 4 / 3) {}

  setAspect(aspect: number): void { this.aspect = aspect; }

  reset(): void {
    this.candidate = this.confirmed = this.pending = null;
    this.baseHipY = this.baseAnkleY = null;
    this.stillRef = null;
  }

  /** 주요 관절이 거의 움직이지 않은 시간 (ms) */
  stillFor(now: number): number {
    return this.stillRef ? now - this.stillSince : 0;
  }

  /** @returns 확정 동작이 바뀌었으면 true */
  update(lm: Point[] | null, now: number): boolean {
    const dt = this.lastTime ? Math.min(0.2, (now - this.lastTime) / 1000) : 0;
    this.lastTime = now;
    this.candidate = lm && bodyVisible(lm) ? this.classify(lm, now, dt) : null;
    if (!lm) this.stillRef = null;

    if (this.candidate !== this.pending) { this.pending = this.candidate; this.pendingSince = now; }
    const need = this.pending === 'jump' ? this.cfg.jumpConfirmMs
      : this.pending === 'freeze' ? 0 // 가만히는 이미 freezeHoldMs 동안 지켜봤다
      : this.cfg.poseConfirmMs;
    if (now - this.pendingSince >= need && this.confirmed !== this.pending) {
      this.confirmed = this.pending;
      return true;
    }
    return false;
  }

  private classify(lm: Point[], now: number, dt: number): PoseAction | null {
    const c = this.cfg;
    const ls = lm[LM.leftShoulder], rs = lm[LM.rightShoulder];
    const lw = lm[LM.leftWrist], rw = lm[LM.rightWrist];
    const hipY = (lm[LM.leftHip].y + lm[LM.rightHip].y) / 2;
    const la = lm[LM.leftAnkle], ra = lm[LM.rightAnkle];
    const anklesVisible = visible(la) && visible(ra);
    const ankleY = anklesVisible ? Math.max(la.y, ra.y) : null; // 더 낮은(땅에 가까운) 발 기준
    const shoulderY = (ls.y + rs.y) / 2;

    // 0) 팔 X자 교차 — 가슴 높이에서 왼손목이 오른손목보다 오른쪽에 (거울 화면 기준)
    if (visible(lw) && visible(rw) && lw.x - rw.x > 0.02
      && lw.y > shoulderY - 0.05 && rw.y > shoulderY - 0.05 && lw.y < hipY && rw.y < hipY) {
      return this.track('cross-arms', lm, hipY, ankleY, now, dt);
    }

    // 1) 색 버튼 치기 — 손목이 버튼 원 안에 들어가면
    for (const b of TOUCH_BUTTONS) {
      for (const w of [lw, rw]) {
        if (!visible(w)) continue;
        const dx = (w.x - b.x) * this.aspect, dy = w.y - b.y;
        if (Math.hypot(dx, dy) < c.buttonHitRadius) return this.track(b.id, lm, hipY, ankleY, now, dt);
      }
    }

    // 2) 손 들기 — 손목이 어깨보다 일정 이상 위
    const leftUp = visible(lw) && lw.y < ls.y - c.raiseHandAboveShoulder;
    const rightUp = visible(rw) && rw.y < rs.y - c.raiseHandAboveShoulder;
    if (leftUp && rightUp) return this.track('raise-both', lm, hipY, ankleY, now, dt);

    // 3) 점프·앉기 — 서 있을 때 기준 높이와 비교
    if (this.baseAnkleY !== null && ankleY !== null && this.baseAnkleY - ankleY > c.jumpAnkleRise) {
      return this.track('jump', lm, hipY, ankleY, now, dt);
    }
    if (this.baseHipY !== null && hipY - this.baseHipY > c.squatHipDrop) {
      return this.track('squat', lm, hipY, ankleY, now, dt);
    }

    if (leftUp) return this.track('raise-left', lm, hipY, ankleY, now, dt);
    if (rightUp) return this.track('raise-right', lm, hipY, ankleY, now, dt);

    // 4) 기울이기 — 엉덩이 중심에서 어깨 중심으로 가는 선의 기울기
    const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
    const hx = (lm[LM.leftHip].x + lm[LM.rightHip].x) / 2;
    const angle = (Math.atan2((sx - hx) * this.aspect, hipY - sy) * 180) / Math.PI;
    // 거울 화면에서 플레이어의 왼쪽 = 화면 왼쪽(x 감소)
    if (angle < -c.leanAngleDeg) return this.track('lean-left', lm, hipY, ankleY, now, dt);
    if (angle > c.leanAngleDeg) return this.track('lean-right', lm, hipY, ankleY, now, dt);

    // 5) 가만히 — 주요 관절이 오래 거의 안 움직임
    return this.track(this.isStill(lm, now) ? 'freeze' : null, lm, hipY, ankleY, now, dt);
  }

  /** 서 있는 자세일 때만 기준 높이를 천천히 따라가게 하고, 결과를 그대로 돌려준다 */
  private track(a: PoseAction | null, lm: Point[], hipY: number, ankleY: number | null, now: number, dt: number): PoseAction | null {
    const upright = a !== 'squat' && a !== 'jump' && a !== 'lean-left' && a !== 'lean-right';
    if (upright) {
      const k = Math.min(1, dt * 1.5); // 약 0.7초 시간 상수
      this.baseHipY = this.baseHipY === null ? hipY : this.baseHipY + (hipY - this.baseHipY) * k;
      if (ankleY !== null) this.baseAnkleY = this.baseAnkleY === null ? ankleY : this.baseAnkleY + (ankleY - this.baseAnkleY) * k;
    }
    if (a !== 'freeze' && a !== null) this.isStill(lm, now); // 움직임 기준점은 계속 갱신
    return a;
  }

  private isStill(lm: Point[], now: number): boolean {
    const keys = [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftWrist, LM.rightWrist, LM.leftHip, LM.rightHip];
    const pts = keys.map((i) => ({ x: lm[i].x, y: lm[i].y }));
    const moved = !this.stillRef || pts.some((p, i) => {
      const r = this.stillRef![i];
      return Math.hypot((p.x - r.x) * this.aspect, p.y - r.y) > this.cfg.freezeMaxMove;
    });
    if (moved) { this.stillRef = pts; this.stillSince = now; return false; }
    return now - this.stillSince >= this.cfg.freezeHoldMs;
  }
}
