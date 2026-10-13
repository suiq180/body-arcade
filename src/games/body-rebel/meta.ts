// 「몸이 말을 안 들어!」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/body-rebel.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'body-rebel',
  order: 1,
  title: '몸이 말을 안 들어!',
  tagline: '말과 반대로 움직여라!',
  howTo: [
    '화면 지시가 뜨면 0.3초 안에 몸으로 대답해요',
    '정직 — 지시대로 · 반대 — 지시와 반대로 (왼손 ↔ 오른손, 앉기 ↔ 점프)',
    '빨간 글씨 지시는 아무것도 하지 않기',
    '색 버튼은 글자가 아니라 글자 색의 버튼 치기',
    '둘이서: 3문제 연속 성공하면 방해 아이템!',
  ],
  description: '화면 지시와 반대로 몸을 움직이는 청개구리 반응 게임. 규칙이 수시로 뒤집혀요.',
  devices: ['camera'],
  status: 'ready',
  thumbnail: { emoji: '🙃', from: '#ffc9de', to: '#7048e8' },
  playTime: '3분',
  players: '1~2명',
  // 게임 코드 (index.ts). 사이트는 게임을 열 때만 이 파일을 불러온다
  load: () => import('./index'),
};
