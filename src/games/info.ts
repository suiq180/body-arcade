// 아직 플레이 화면이 없는 게임의 소개 페이지 (전시 모드용)
// 게임 방법·필요한 장치를 보여 주고, 시작 버튼을 누르면 "점검 중" 안내를 띄운다.

import { findDevice } from '../shared/devices';
import { escapeHtml } from '../shared/html';
import type { GameMeta } from './registry';

export function mountGameInfo(root: HTMLElement, game: GameMeta): () => void {
  const hubHref = `#/device/${game.devices[0]}`;
  const devices = game.devices.map((id) => findDevice(id)!);
  const gaze = game.devices.includes('gaze');

  root.innerHTML = `
    <div class="setup">
      <header class="setup-top"><div class="container setup-top-inner">
        <a class="back" href="${hubHref}">← 허브로</a><span class="setup-crumb">${escapeHtml(game.title)}</span>
      </div></header>
      <div class="container game-intro">
        <div class="thumb big" style="background:linear-gradient(135deg, ${game.thumbnail.from}, ${game.thumbnail.to})"><span class="thumb-emoji">${game.thumbnail.emoji}</span></div>
        <div class="game-intro-body">
          <p class="eyebrow">${escapeHtml(game.tagline)}</p>
          <h1>${escapeHtml(game.title)}</h1>
          <p class="muted">${escapeHtml(game.description)}</p>
          <ul class="how-to">${game.howTo.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
          <div class="info-facts">
            ${devices.map((d) => `<span><b>필요한 장치</b>${d.icon} ${d.name} — ${d.usage}</span>`).join('')}
            <span><b>인원</b>👥 ${escapeHtml(game.players)}</span>
            <span><b>플레이 시간</b>⏱ ${escapeHtml(game.playTime)}</span>
          </div>
          <div class="mode-pick">
            <button type="button" class="btn primary" data-act="start">▶ ${gaze ? '체험판 플레이' : '게임 시작'}</button>
            ${gaze ? '<button type="button" class="btn ghost" data-act="start">정식판 받기</button>' : ''}
          </div>
        </div>
      </div>
      <div class="modal" data-el="modal" hidden>
        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="maint-title">
          <div class="modal-icon">🛠️</div>
          <h2 id="maint-title">지금은 점검 중이에요</h2>
          <p>더 재미있게 다듬는 중이에요. 잠시 후 다시 찾아 주세요!</p>
          <button type="button" class="btn primary" data-act="close">확인</button>
        </div>
      </div>
    </div>`;

  const modal = root.querySelector<HTMLElement>('[data-el="modal"]')!;
  const onClick = (e: Event) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'start') { modal.hidden = false; root.querySelector<HTMLElement>('[data-act="close"]')!.focus(); }
    if (act === 'close' || e.target === modal) modal.hidden = true;
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') modal.hidden = true; };
  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  return () => { root.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey); };
}
