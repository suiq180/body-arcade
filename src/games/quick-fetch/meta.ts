// 「번개 심부름」 카드·소개 페이지 정보 — 사이트가 이 파일을 자동으로 찾아 등록한다
// 상세 기획: docs/games/quick-fetch.md

import type { GameMeta } from '../types';
import { CONFIG, ITEMS } from './config';

export const meta: GameMeta = {
  id: 'quick-fetch',
  order: 8,
  title: '번개 심부름',
  tagline: '먼저 찾아오는 사람이 이긴다!',
  howTo: [
    '웹캠 화면이 인원수만큼 세로 칸으로 나뉘어요 (왼쪽부터 P1, P2 …)',
    '시작 전에 모두 비켜선 상태로 빈 화면을 기록해요 (장소마다 보정)',
    '3초 준비 동안 손에 든 물건을 내려놓고 자기 칸에 서요',
    `물건(${ITEMS.map((i) => `${i.emoji} ${i.label}`).join(', ')})이 뜨면 찾으러 달려가요`,
    '내 칸 상자에 물건을 가까이 보여 주고 잠깐 멈추면 인정! 빠를수록 보너스',
    `${CONFIG.rounds}라운드 점수 합계로 승부`,
  ],
  description: '화면에 뜬 물건을 방 안에서 찾아 내 칸의 상자에 먼저 보여 주세요. 웹캠이 물건을 알아보고 누가 먼저였는지 자동으로 판정해요.',
  devices: ['camera'],
  status: 'ready',
  thumbnail: { emoji: '🏃', from: '#ffd43b', to: '#f76707' },
  playTime: '약 3분',
  players: '2~4명',
  load: () => import('./index'),
};
