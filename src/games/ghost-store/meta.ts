// 「귀신도 편의점에 옵니다」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/ghost-store.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'ghost-store',
  order: 6,
  title: '귀신도 편의점에 옵니다',
  tagline: '오늘 밤, 손님은 사람일까… 귀신일까?',
  howTo: [
    '심야 편의점 계산대에 서서 다가오는 손님을 관찰해요',
    '스캐너로 찍으면 계산, 부적을 내밀면 퇴치, 손전등으로 단서 찾기',
    '그림자 · CCTV · 유통기한 · 반복되는 말로 귀신을 가려내요',
    '귀신을 계산해 주면 멘탈 -2, 사람을 퇴치하면 매출이 줄어요',
  ],
  description: '심야 편의점 계산대에 서서 손님을 직접 들여다보고 사람인지 귀신인지 가려내요.',
  devices: ['xr'],
  status: 'wip',
  thumbnail: { emoji: '👻', from: '#495057', to: '#1a1b1e' },
  playTime: '8분',
  players: '1명',
  // 게임을 만들면: status를 'ready'로 바꾸고 아래 줄의 주석을 푼다 (docs/게임추가가이드.md)
  // load: () => import('./index'),
};
