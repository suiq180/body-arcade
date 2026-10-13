// 「눈치껏 쌓아라」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/stack-sense.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'stack-sense',
  order: 2,
  title: '눈치껏 쌓아라',
  tagline: '손이 떨리면 블록도 떨린다',
  howTo: [
    '차례가 오면 손을 오므려(핀치) 블록을 집어요',
    '핀치한 채 손목을 돌리면 블록이 회전해요',
    '손을 펴면 놓여요 — 놓는 순간의 손 속도가 그대로 전달돼요',
    '놓은 뒤 3초 동안 탑이 버티면 성공, 무너뜨리면 탈락!',
    '라운드 사이 상점에서 코인으로 아이템을 사요',
  ],
  description: '허공에서 블록을 손으로 집어 탑 위에 살며시 내려놓아요. 무너뜨린 사람이 탈락!',
  devices: ['camera'],
  status: 'wip',
  thumbnail: { emoji: '🧱', from: '#d0bfff', to: '#5f3dc4' },
  playTime: '5분',
  players: '2~6명',
  // 게임을 만들면: status를 'ready'로 바꾸고 아래 줄의 주석을 푼다 (docs/게임추가가이드.md)
  // load: () => import('./index'),
};
