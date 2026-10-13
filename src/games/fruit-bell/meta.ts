// 「땡! 과일벨」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/fruit-bell.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'fruit-bell',
  order: 3,
  title: '땡! 과일벨',
  tagline: '같은 과일 5개면, 땡!',
  howTo: [
    '음악 박자마다 카드가 한 장씩 뒤집혀요',
    '보이는 카드에서 같은 과일이 정확히 5개면 내 드럼 패드를 쳐요',
    '가장 먼저 치면 +3점, 박자에 맞춰 치면 +1점',
    '틀리게 치면 -2점, 그 박자 동안 패드가 잠겨요',
    '세게 치면 "땡!" 특수 연출',
  ],
  description: '박자마다 카드가 뒤집히고, 같은 과일이 정확히 5개가 되면 드럼 패드를 쳐요.',
  devices: ['rhythm'],
  status: 'wip',
  thumbnail: { emoji: '🔔', from: '#ffe066', to: '#f76707' },
  playTime: '2분',
  players: '1~4명',
  // 게임을 만들면: status를 'ready'로 바꾸고 아래 줄의 주석을 푼다 (docs/게임추가가이드.md)
  // load: () => import('./index'),
};
