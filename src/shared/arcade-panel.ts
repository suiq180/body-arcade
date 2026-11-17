// 아케이드 스틱 조종석 표시 — 플레이어 한 명의 레버 방향·버튼 6개·START가 눌렸는지 보여 준다
// 준비 화면과 게임 화면(기획서: 아래 왼쪽 P1 / 오른쪽 P2 레버·버튼 상태)이 함께 쓴다.

import type { ArcadeAdapter, ArcadeControl, Player } from '../input/arcade';
import { escapeHtml } from './html';

/** 기획서 공통 색: P1 주황, P2 청록 */
export const ARCADE_COLORS: [string, string] = ['#ff922b', '#15aabf'];

const BUTTONS: ArcadeControl[] = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

export interface PanelOptions {
  /** 패널 제목 (예: "P1 · 왼다리") */
  title: string;
  color: string;
  /** 버튼별 짧은 이름 (예: { b1: '팔', b3: '점프' }) — 없으면 번호만 */
  buttonNames?: Partial<Record<ArcadeControl, string>>;
}

/** 패널 HTML을 그리고, 매 프레임 부를 갱신 함수를 돌려준다 */
export function mountArcadePanel(el: HTMLElement, adapter: ArcadeAdapter, player: Player, o: PanelOptions): () => void {
  el.classList.add('ac-panel');
  el.style.setProperty('--pc', o.color);
  el.innerHTML = `
    <div class="ac-panel-head"><b>${escapeHtml(o.title)}</b><span class="ac-conn" data-el="conn"></span></div>
    <div class="ac-panel-body">
      <div class="ac-lever"><i data-el="knob"></i></div>
      <div class="ac-buttons">${BUTTONS.map((b, i) =>
        `<span class="ac-btn" data-btn="${b}"><b>${i + 1}</b>${o.buttonNames?.[b] ? `<small>${escapeHtml(o.buttonNames[b]!)}</small>` : ''}</span>`).join('')}</div>
      <span class="ac-start" data-btn="start">START</span>
    </div>`;
  const knob = el.querySelector<HTMLElement>('[data-el="knob"]')!;
  const conn = el.querySelector<HTMLElement>('[data-el="conn"]')!;
  const btnEls = [...el.querySelectorAll<HTMLElement>('[data-btn]')];

  return () => {
    const { x, y } = adapter.lever(player);
    knob.style.transform = `translate(${x * 60}%, ${-y * 60}%)`;
    knob.classList.toggle('on', !!(x || y));
    btnEls.forEach((b) => b.classList.toggle('on', adapter.held(player, b.dataset.btn as ArcadeControl)));
    const ok = adapter.connected(player);
    conn.textContent = ok ? '연결됨' : '연결 끊김';
    conn.classList.toggle('bad', !ok);
  };
}
