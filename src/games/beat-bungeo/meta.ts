// 「박자 붕어빵」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/beat-bungeo.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'beat-bungeo',
  order: 4,
  title: '박자 붕어빵',
  tagline: '연주하듯 굽는 붕어빵 장사',
  howTo: [
    '패드(건반) 1~4가 붕어빵 틀 1~4예요',
    '틀 패드를 1박 동안 꾹 눌러 반죽을 부어요',
    '팥·슈크림 패드를 박자에 맞춰 쳐서 속을 넣어요',
    '뒤집기 노트가 떨어지는 순간 틀 패드를 쳐서 뒤집어요',
    '포장 → 서빙 패드로 줄 선 손님에게 건네요',
  ],
  description: '장터 음악에 맞춰 패드를 쳐서 반죽 붓고, 속 넣고, 뒤집고, 포장해서 팔아요.',
  devices: ['rhythm'],
  status: 'wip',
  thumbnail: { emoji: '🐟', from: '#ffd8a8', to: '#d9480f' },
  playTime: '3분',
  players: '1~2명',
  // 게임을 만들면: status를 'ready'로 바꾸고 아래 줄의 주석을 푼다 (docs/게임추가가이드.md)
  // load: () => import('./index'),
};
