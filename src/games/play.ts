// 게임 한 판의 흐름 (기획서 5.1): 게임 소개(모드 선택) → 장치 준비 화면 → 게임 화면 → 결과 화면
// 어떤 게임이든 같은 흐름. 게임은 meta.load()로 불러온 GameModule(src/games/types.ts)을 따른다.
// 장치(카메라 등)는 준비 화면에서 켜서 게임·결과·다시 하기까지 이어서 쓰고, 이 화면을 떠날 때 끈다.

import { mountCameraSetup } from '../setup/camera-setup';
import { escapeHtml } from '../shared/html';
import { renderResults } from '../shared/results';
import { unlockAudio } from '../shared/sfx';
import { PLAYER_COLORS } from '../shared/pose-draw';
import type { GameMeta, GameModule, SetupInputs, SetupKind } from './types';

interface SetupArgs<K extends SetupKind> {
  gameTitle: string;
  players: number;
  backHref: string;
  onReady: (input: SetupInputs[K]) => void;
}
interface SetupEntry<K extends SetupKind> {
  /** 준비 화면을 띄우고 정리 함수를 돌려준다 */
  mount: (root: HTMLElement, a: SetupArgs<K>) => () => void;
  /** 장치 끄기 */
  stop: (input: SetupInputs[K]) => void;
}

/** 장치 준비 화면 목록. 새 장치를 쓰는 게임을 만들면 여기에 연결한다 */
const SETUPS: { [K in SetupKind]: SetupEntry<K> } = {
  'camera-pose': {
    mount: (root, a) => mountCameraSetup(root, {
      gameTitle: a.gameTitle,
      players: a.players === 2 ? 2 : 1,
      backHref: a.backHref,
      onStart: a.onReady,
    }),
    stop: (input) => input.stop(),
  },
};

export function mountPlay(root: HTMLElement, game: GameMeta): () => void {
  const hubHref = `#/device/${game.devices[0]}`;
  let module: GameModule | null = null;
  let input: SetupInputs[SetupKind] | null = null;
  let cleanupSetup: (() => void) | null = null;
  let running: { destroy: () => void } | null = null;
  let players = 1;
  let left = false;

  const header = (crumb: string, back = '← 허브로') => `
    <header class="setup-top"><div class="container setup-top-inner">
      <a class="back" href="${hubHref}">${back}</a><span class="setup-crumb">${crumb}</span>
    </div></header>`;

  function showIntro(): void {
    root.innerHTML = `
      <div class="setup">
        ${header(escapeHtml(game.title))}
        <div class="container game-intro">
          <div class="thumb big" style="background:linear-gradient(135deg, ${game.thumbnail.from}, ${game.thumbnail.to})"><span class="thumb-emoji">${game.thumbnail.emoji}</span></div>
          <div class="game-intro-body">
            <p class="eyebrow">${escapeHtml(game.tagline)}</p>
            <h1>${escapeHtml(game.title)}</h1>
            <p class="muted">${escapeHtml(game.description)}</p>
            <ul class="how-to">${game.howTo.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
            <div class="mode-pick" data-el="modes"><span class="muted">게임 불러오는 중…</span></div>
            <p class="small muted">👥 ${escapeHtml(game.players)} · ⏱ ${escapeHtml(game.playTime)}</p>
          </div>
        </div>
      </div>`;
    const modesEl = root.querySelector<HTMLElement>('[data-el="modes"]')!;
    game.load!().then((m) => {
      if (left) return;
      module = m.default;
      modesEl.innerHTML = module.modes.map((mode, i) =>
        `<button type="button" class="btn ${i === 0 ? 'primary' : 'ghost'}" data-players="${mode.players}">${escapeHtml(mode.label)}</button>`).join('');
      modesEl.querySelectorAll<HTMLButtonElement>('[data-players]').forEach((b) => b.addEventListener('click', () => {
        unlockAudio();
        players = Number(b.dataset.players);
        showSetup();
      }));
    }).catch((err) => {
      console.error(err);
      modesEl.innerHTML = '<span class="notice">게임을 불러오지 못했어요. 새로고침해 보세요.</span>';
    });
  }

  function showSetup(): void {
    if (!module) return;
    const entry = SETUPS[module.setup] as SetupEntry<SetupKind>;
    cleanupSetup = entry.mount(root, {
      gameTitle: game.title,
      players,
      backHref: hubHref,
      onReady: (i) => {
        input = i;
        cleanupSetup?.(); // 준비 화면의 리스너만 떼고 장치는 유지
        cleanupSetup = null;
        unlockAudio();
        startGame();
      },
    });
  }

  function startGame(): void {
    if (!module || !input) return;
    root.innerHTML = `<div class="setup">${header(`${escapeHtml(game.title)}${players > 1 ? ` · ${players}인` : ''}`, '← 나가기')}
      <div class="container game-wrap" data-el="game"></div></div>`;
    const host = root.querySelector<HTMLElement>('[data-el="game"]')!;
    running = module.start(host, input, {
      players,
      onFinish: (r) => {
        running?.destroy(); running = null;
        const multi = r.scores.length > 1;
        renderResults(host, {
          title: game.title,
          bestKey: `${game.id}:${players}p`,
          players: r.scores.map((s, i) => ({
            name: multi ? `P${i + 1}` : '내 점수',
            score: s,
            color: multi ? PLAYER_COLORS[i] : undefined,
            detail: r.details?.[i],
          })),
          summary: r.summary,
          log: r.log === undefined ? undefined : { game: game.id, players, finishedAt: new Date().toISOString(), result: r.log },
          logFileName: `${game.id}-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
          hubHref,
          onRetry: () => startGame(),
        });
      },
    });
  }

  showIntro();

  return () => {
    left = true;
    running?.destroy();
    cleanupSetup?.();
    if (module && input) (SETUPS[module.setup] as SetupEntry<SetupKind>).stop(input);
  };
}
