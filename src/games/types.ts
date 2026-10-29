// 모든 게임이 따르는 공통 형식
// 게임 하나 = src/games/<게임ID>/ 폴더
//   meta.ts  : 카드·소개 페이지에 보이는 정보 (사이트가 자동으로 찾아 등록)
//   index.ts : 실제 게임 (GameModule을 default로 내보냄)
// 자세한 방법: docs/게임추가가이드.md

import type { CameraPoseAdapter } from '../input/camera-pose';
import type { DeviceId } from '../shared/devices';

export type GameStatus = 'ready' | 'wip';

/** 직접 만든 썸네일: 이모지 + 배경 그라데이션 두 색 */
export interface Thumbnail {
  emoji: string;
  from: string;
  to: string;
}

export interface GameMeta {
  /** 폴더 이름과 같아야 한다 (예: 'body-rebel') */
  id: string;
  /** 허브에 보이는 순서 (작을수록 앞). 기획서의 제작 순서를 따른다 */
  order: number;
  title: string;
  /** 카드 위쪽의 짧은 홍보 문구 */
  tagline: string;
  /** 게임 소개 페이지의 "게임 방법" (docs/games/<id>.md 요약) */
  howTo: string[];
  description: string;
  /** 기획서 규칙상 한 가지 장치만 넣는다 */
  devices: DeviceId[];
  /** 'ready' + load 가 있어야 실제로 플레이된다 */
  status: GameStatus;
  thumbnail: Thumbnail;
  /** 예상 플레이 시간 (화면에 그대로 표시) */
  playTime: string;
  /** 플레이 인원 (화면에 그대로 표시) */
  players: string;
  /** 게임 코드 불러오기: () => import('./index'). 아직 게임이 없으면 생략 */
  load?: () => Promise<{ default: GameModule }>;
}

// ── 게임 모듈 ─────────────────────────────

/**
 * 장치 준비 화면 종류 → 게임이 넘겨받는 입력 어댑터.
 * 새 장치를 쓰는 게임을 만들 때 여기에 한 줄 추가하고, src/games/play.ts의 SETUPS에 준비 화면을 연결한다.
 */
export interface SetupInputs {
  /** 전달받은 독립 웹게임은 자체 준비 화면을 사용한다. */
  embedded: { stop(): void };
  /** 📷 웹캠 전신 포즈 (src/input/camera-pose.ts, src/setup/camera-setup.ts) */
  'camera-pose': CameraPoseAdapter;
}
export type SetupKind = keyof SetupInputs;

/** 소개 페이지의 시작 버튼 하나 = 모드 하나 */
export interface PlayMode {
  players: number;
  label: string;
}

/** 게임이 끝나면 넘기는 결과 → 공통 결과 화면에 표시 */
export interface GameResult {
  /** 플레이어별 점수 (1인이면 길이 1) */
  scores: number[];
  /** 플레이어별 한 줄 설명 (예: "30문제 중 24개 성공") */
  details?: string[];
  /** 결과 아래 요약 줄 */
  summary?: string[];
  /** "플레이 기록 내보내기"로 저장할 데이터 (밸런스 조정용, 기획서 9장) */
  log?: unknown;
}

export interface StartOptions {
  players: number;
  onFinish: (result: GameResult) => void;
}

/** 기획서 8.3: 각 게임은 start(container, input) / destroy()를 제공한다 */
export interface GameModule<K extends SetupKind = SetupKind> {
  /** 어떤 장치 준비 화면을 거칠지 */
  setup: K;
  /** 시작 버튼들 (예: 혼자 하기 / 둘이 대결) */
  modes: PlayMode[];
  start(container: HTMLElement, input: SetupInputs[K], opts: StartOptions): { destroy(): void };
}
