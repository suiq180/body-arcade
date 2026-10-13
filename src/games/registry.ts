// 전체 게임 목록. 허브는 이 목록만 보고 화면을 그린다.
// 각 게임 폴더의 meta.ts를 자동으로 모은다 → 새 게임은 src/games/<게임ID>/meta.ts만 만들면 카드가 생긴다.
// (밑줄로 시작하는 폴더, 예: _template 은 모으지 않는다)
// 순서 = meta.order. 게임별 상세: docs/games/<id>.md

import type { GameMeta } from './types';

export type { GameMeta, GameStatus, Thumbnail } from './types';

const found = import.meta.glob<{ meta: GameMeta }>(['./*/meta.ts', '!./_*/meta.ts'], { eager: true });

export const GAMES: GameMeta[] = Object.entries(found)
  .map(([path, mod]) => {
    const folder = path.split('/')[1];
    if (mod.meta.id !== folder) console.warn(`[게임 등록] ${path}: meta.id "${mod.meta.id}"가 폴더 이름 "${folder}"와 달라요`);
    return mod.meta;
  })
  .sort((a, b) => a.order - b.order);

/**
 * 전시 모드: 모든 게임을 완성된 것처럼 보여 준다 (준비 중 표시 없음, 모든 카드 클릭 가능).
 * 아직 안 만든 게임은 소개 페이지까지 열리고, 시작하면 "점검 중" 안내가 뜬다.
 * false로 바꾸면 기획서 5.2 원래 규칙(wip = 준비 중, 클릭 불가)으로 돌아간다.
 */
export const SHOWCASE_MODE = true;

/** 허브에서 클릭 가능한 카드로 보여 줄지 */
export const isOpen = (g: GameMeta): boolean => SHOWCASE_MODE || g.status === 'ready';

/** 실제 게임 화면이 연결돼 있는지 (아니면 소개 페이지만) */
export const isPlayable = (g: GameMeta): boolean => g.status === 'ready' && !!g.load;

/**
 * 허브 오른쪽 "인기 게임 순위"에 보여 줄 순서 (게임ID).
 * ⚠️ 실제 플레이 집계가 아니라 전시·시연용으로 정한 예시 순서다. 화면에 숫자(플레이 수)는 표시하지 않는다.
 * 여기에 없는 새 게임은 순위 맨 뒤에 자동으로 붙는다. 실제 집계가 생기면 이 목록 대신 그 데이터를 쓴다.
 */
export const POPULAR_RANKING: string[] = [
  'body-rebel', 'fruit-bell', 'stack-sense', 'dont-say', 'beat-bungeo', 'ghost-store', 'gaze-ball',
];

export function gamesForDevice(device: GameMeta['devices'][number]): GameMeta[] {
  return GAMES.filter((g) => g.devices.includes(device));
}

export function findGame(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}
