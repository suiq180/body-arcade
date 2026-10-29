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
    'Z로 계산, X로 퇴치, C로 CCTV, V로 손전등을 사용해요',
    '그림자 · CCTV · 유통기한 · 반복되는 말로 귀신을 가려내요',
    '귀신을 계산해 주면 멘탈 -2, 사람을 퇴치하면 매출이 줄어요',
  ],
  description: '심야 편의점에서 손님이 사람인지 귀신인지 가려내요. 현재 웹 체험판은 키보드·조이스틱으로 플레이해요 (VR 미지원).',
  devices: ['xr'],
  status: 'ready',
  thumbnail: { emoji: '👻', from: '#495057', to: '#1a1b1e' },
  playTime: '8분',
  players: '1명',
  load: () => import('./index'),
};
