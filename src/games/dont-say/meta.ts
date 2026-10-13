// 「말하지 말랬잖아!」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/dont-say.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'dont-say',
  order: 5,
  title: '말하지 말랬잖아!',
  tagline: '목소리로만 고치는 우주선',
  howTo: [
    '고장 난 우주선 장치를 목소리로만 고쳐요',
    '크게 외치기 · 소리 유지 · 음높이 맞추기 · 조용히 · 단어 말하기 · 박자 맞추기',
    '파란 화면(정직 로봇)은 지시대로, 빨간 화면(거짓말 로봇)은 반대로!',
    '둘이서: 크기·길이 담당과 높이·단어 담당으로 역할 나누기',
    '장치 3개가 멈추면 우주선 폭발!',
  ],
  description: '소리 지르고, 높게 노래하고, 숨죽이며 우주선을 고쳐요. 거짓말 로봇의 지시는 반대로!',
  devices: ['mic'],
  status: 'wip',
  thumbnail: { emoji: '🚀', from: '#91a7ff', to: '#364fc7' },
  playTime: '4분',
  players: '1~2명 협동',
  // 게임을 만들면: status를 'ready'로 바꾸고 아래 줄의 주석을 푼다 (docs/게임추가가이드.md)
  // load: () => import('./index'),
};
