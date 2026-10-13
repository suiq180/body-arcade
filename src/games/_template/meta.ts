// 새 게임 시작용 견본 — 이 폴더를 통째로 복사해서 이름을 게임ID로 바꿔 쓴다.
// (밑줄로 시작하는 폴더는 사이트에 등록되지 않으니, 복사 후 폴더 이름을 꼭 바꿀 것)
// 자세한 방법: docs/게임추가가이드.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: '_template',          // ← 폴더 이름과 같게 (예: 'stack-sense')
  order: 99,                // ← 허브에 보일 순서
  title: '견본 게임',
  tagline: '두 손을 번쩍!',
  howTo: [
    '카메라 앞에 서서 두 손을 머리 위로 들었다 내려요',
    '20초 동안 몇 번 했는지 세요',
  ],
  description: '게임 추가 방법을 보여 주는 아주 작은 견본 게임이에요.',
  devices: ['camera'],
  status: 'ready',
  thumbnail: { emoji: '🙌', from: '#ffe066', to: '#ff922b' },
  playTime: '20초',
  players: '1명',
  load: () => import('./index'),
};
