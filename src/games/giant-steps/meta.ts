// 「두 다리 거인」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/giant-steps.md

import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'giant-steps',
  order: 9,
  title: '두 다리 거인',
  tagline: '둘이 한 몸, 발 맞추면 걷는다',
  howTo: [
    'P1 레버는 거인의 왼다리, P2 레버는 오른다리예요',
    '레버 ↑로 다리를 들고, 놓으면 앞으로 디뎌요 — 오래 들수록 멀리',
    '들고 있을 때 레버 ↗는 큰 보폭, ↖는 작은 보폭 (돌다리 맞추기)',
    '같은 다리로 두 번 디디면 기울어요! 번갈아 걸으세요',
    '버튼 1 팔 흔들기로 균형 잡기, 버튼 2 둘이 같이 웅크리기, 버튼 3 둘이 동시에 점프',
    '넘어지면 둘이 버튼을 연타해서 일으켜요 · 코스 5개, 장애물 위치는 매번 바뀌어요',
  ],
  description: '거인 한 명의 왼다리는 P1, 오른다리는 P2가 맡아요. 번갈아 레버를 밀어야 걷고, 박자가 어긋나면 기우뚱하다 쿵! 둘이 호흡을 맞춰 결승선까지 가는 협동 게임이에요.',
  devices: ['arcade'],
  status: 'ready',
  thumbnail: { emoji: '🦵', from: '#ffc078', to: '#3bc9db' },
  playTime: '코스당 1~3분',
  players: '2명 협동 (1명 연습)',
  load: () => import('./index'),
};
