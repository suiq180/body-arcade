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
    '카메라 켜기 → 정면 시선 보정 → 게임 시작 순서로 진행해요',
    '방향키와 스페이스바로도 플레이할 수 있고, 충돌하면 게임패드 진동을 시도해요',
  ],
  description: '웹캠 시선으로 공을 몰아 장애물을 피하고 결승선까지 달려요. 키보드로도 플레이할 수 있어요. 시선 모델 로딩에는 인터넷이 필요해요.',
  devices: ['gaze'],
  status: 'ready',
  thumbnail: { emoji: '⚽', from: '#a5d8ff', to: '#1971c2' },
  playTime: '1~2분',
  players: '1명',
  load: () => import('./index'),
};
