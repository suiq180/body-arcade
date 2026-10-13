// 「눈으로 공을 굴려라」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/gaze-ball.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'gaze-ball',
  order: 7,
  title: '눈으로 공을 굴려라',
  tagline: '보는 곳으로 굴러가는 공',
  howTo: [
    '바라보는 쪽으로 공이 굴러가요',
    '화면 위쪽을 보면 가속, 공 근처를 보면 감속',
    '점프대에서는 눈을 두 번 깜빡여 점프',
    '노면 진동과 충돌을 햅틱 조끼로 느껴요 (체험판은 패드 진동)',
  ],
  description: '바라보는 쪽으로 공을 몰고, 노면 진동과 충돌을 조끼로 느끼며 결승선까지 달려요.',
  devices: ['gaze'],
  status: 'wip',
  thumbnail: { emoji: '⚽', from: '#a5d8ff', to: '#1971c2' },
  playTime: '1~2분',
  players: '1명',
  // 게임을 만들면: status를 'ready'로 바꾸고 아래 줄의 주석을 푼다 (docs/게임추가가이드.md)
  // load: () => import('./index'),
};
