// 몸이 말을 안 들어! — 문제 만들기와 정답 계산 (화면·카메라와 무관한 순수 로직)
// 규칙 4종 (기획서 4장)
//   정직: 지시대로 / 반대: 반대로 / 거짓말쟁이 색: 글자 색의 버튼 / 가만히: 빨간 글씨면 아무것도 안 함

import type { PoseAction } from '../../input/pose-actions';
import type { BaseRule, BodyRebelConfig } from './config';

export type ButtonColor = 'red' | 'blue' | 'yellow';

export const COLORS: Record<ButtonColor, { word: string; css: string; action: PoseAction }> = {
  red: { word: '빨강', css: '#fa5252', action: 'touch-red' },
  blue: { word: '파랑', css: '#339af0', action: 'touch-blue' },
  yellow: { word: '노랑', css: '#fcc419', action: 'touch-yellow' },
};

/** 지시로 쓸 수 있는 동작 (가만히는 유지형 미션으로만 나온다) */
const INSTRUCTIONS: PoseAction[] = [
  'raise-left', 'raise-right', 'raise-both', 'touch-red', 'touch-blue', 'touch-yellow',
  'squat', 'jump', 'lean-left', 'lean-right',
];

const SAY: Partial<Record<PoseAction, string>> = {
  'raise-left': '왼손 들어!',
  'raise-right': '오른손 들어!',
  'raise-both': '두 손 머리 위로!',
  'touch-red': '빨강 버튼 쳐!',
  'touch-blue': '파랑 버튼 쳐!',
  'touch-yellow': '노랑 버튼 쳐!',
  squat: '앉아!',
  jump: '점프!',
  'lean-left': '왼쪽으로 기울여!',
  'lean-right': '오른쪽으로 기울여!',
};

/** "반대" 규칙의 짝. 짝이 분명한 동작만 반대 규칙 문제로 낸다 */
export const OPPOSITE: Partial<Record<PoseAction, PoseAction>> = {
  'raise-left': 'raise-right', 'raise-right': 'raise-left',
  'lean-left': 'lean-right', 'lean-right': 'lean-left',
  'touch-red': 'touch-yellow', 'touch-yellow': 'touch-red',
  squat: 'jump', jump: 'squat',
};

/** "거울" 아이템: 좌우 판정 반전 */
export const MIRROR: Partial<Record<PoseAction, PoseAction>> = {
  'raise-left': 'raise-right', 'raise-right': 'raise-left',
  'lean-left': 'lean-right', 'lean-right': 'lean-left',
  'touch-red': 'touch-yellow', 'touch-yellow': 'touch-red',
};

export interface RuleState {
  base: BaseRule;
  still: boolean;
  colorLiar: boolean;
}

export interface Question {
  index: number;
  kind: 'action' | 'hold';
  /** 지시 글자가 말하는 동작 */
  said: PoseAction;
  text: string;
  /** 지시 글자 색 (없으면 기본색) */
  ink: string | null;
  /** 거짓말쟁이 색 문제일 때 글자 색 */
  inkColor: ButtonColor | null;
  /** 가만히 규칙의 빨간 글씨 */
  red: boolean;
  liar: boolean;
  /** 이 문제를 낼 때의 규칙 */
  rule: RuleState;
  /** 이 문제 직전에 "규칙 변경!" 이벤트가 있음 */
  ruleChangeBefore: boolean;
  holdSec: number;
}

export interface RoundPlan {
  rule: RuleState;
  questions: Question[];
}

export type Rng = () => number;
const pick = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

export function planRound(cfg: BodyRebelConfig, roundIndex: number, rng: Rng = Math.random): RoundPlan {
  const rc = cfg.rounds[roundIndex];
  const n = cfg.questionsPerRound;
  let base: BaseRule = rc.base === 'random' ? pick(['honest', 'opposite'] as const, rng) : rc.base;
  let still = rc.still === true, colorLiar = rc.colorLiar === true;
  if (rc.still === 'random' || rc.colorLiar === 'random') {
    // 가만히(빨간 글씨)와 거짓말쟁이 색(글자 색)은 둘 다 글자 색을 쓰므로 한 라운드에 섞지 않는다
    const extra = pick(['none', 'still', 'liar'] as const, rng);
    still = extra === 'still'; colorLiar = extra === 'liar';
  }
  const startRule: RuleState = { base, still, colorLiar };

  // 규칙 변경은 라운드 안에 고르게 (6문제·1회 → 3번째 문제 뒤, 2회 → 2·4번째 뒤)
  const changeAt = new Set(Array.from({ length: rc.ruleChanges }, (_, k) => Math.round(((k + 1) * n) / (rc.ruleChanges + 1))));
  const holdCandidates = Array.from({ length: n - 1 }, (_, i) => i + 1).filter((i) => !changeAt.has(i));
  const holdAt = new Set<number>();
  for (let k = 0; k < cfg.holdMissionsPerRound && holdCandidates.length; k++) {
    holdAt.add(holdCandidates.splice(Math.floor(rng() * holdCandidates.length), 1)[0]);
  }

  const questions: Question[] = [];
  let prev: PoseAction | null = null;
  for (let i = 0; i < n; i++) {
    const ruleChangeBefore = changeAt.has(i);
    if (ruleChangeBefore) base = base === 'honest' ? 'opposite' : 'honest';
    const rule: RuleState = { base, still, colorLiar };
    const common = { index: i, rule, ruleChangeBefore, holdSec: cfg.holdMissionSec };

    if (holdAt.has(i)) {
      const said: PoseAction = rng() < 0.5 ? 'raise-both' : 'freeze';
      questions.push({
        ...common, kind: 'hold', said,
        text: said === 'raise-both' ? `두 손 머리 위로 ${cfg.holdMissionSec}초 유지!` : `${cfg.holdMissionSec}초 동안 가만히!`,
        ink: null, inkColor: null, red: false, liar: false,
      });
      prev = said;
      continue;
    }

    if (colorLiar && rng() < cfg.colorLiarChance) {
      const word = pick(['red', 'blue', 'yellow'] as const, rng);
      // 반대 규칙이면 파랑은 반대가 없으므로 글자 색에서 뺀다
      const inks = (['red', 'blue', 'yellow'] as const).filter((c) => c !== word && !(base === 'opposite' && c === 'blue'));
      const ink = pick(inks, rng);
      questions.push({
        ...common, kind: 'action', said: COLORS[word].action, text: `${COLORS[word].word} 버튼 쳐!`,
        ink: COLORS[ink].css, inkColor: ink, red: false, liar: true,
      });
      prev = COLORS[word].action;
      continue;
    }

    const pool = (base === 'opposite' ? Object.keys(OPPOSITE) as PoseAction[] : INSTRUCTIONS).filter((a) => a !== prev);
    const said = pick(pool, rng);
    const red = still && rng() < cfg.stillRedChance;
    questions.push({
      ...common, kind: 'action', said, text: SAY[said]!,
      ink: red ? '#e03131' : null, inkColor: null, red, liar: false,
    });
    prev = said;
  }
  return { rule: startRule, questions };
}

/**
 * 이 문제의 정답 동작. null = 아무것도 하지 않아야 정답.
 * @param mirrored "거울" 아이템에 걸린 플레이어면 true (좌우 반전)
 */
export function expectedAction(q: Question, mirrored = false): PoseAction | null {
  if (q.kind === 'hold') return q.said;
  if (q.red) return null;
  let target = q.liar && q.inkColor ? COLORS[q.inkColor].action : q.said;
  if (q.rule.base === 'opposite') target = OPPOSITE[target] ?? target;
  if (mirrored) target = MIRROR[target] ?? target;
  return target;
}

export function ruleName(rule: RuleState): string {
  const parts = [rule.base === 'honest' ? '정직' : '반대'];
  if (rule.still) parts.push('가만히');
  if (rule.colorLiar) parts.push('거짓말쟁이 색');
  return parts.join(' + ');
}

export function ruleHelp(rule: RuleState): string {
  const parts = [rule.base === 'honest' ? '지시대로 하세요' : '지시와 <b>반대로</b> 하세요'];
  if (rule.still) parts.push('<b style="color:#e03131">빨간 글씨</b>면 아무것도 하지 마세요');
  if (rule.colorLiar) parts.push('색 버튼은 글자가 아니라 <b>글자 색</b>을 보세요');
  return parts.join('<br>');
}
