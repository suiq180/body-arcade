// 공통 결과 화면 (기획서 5.4): 점수, 최고 기록(localStorage), 다시 하기, 허브로
// + 플레이 기록 내보내기 (기획서 9장: 밸런스 조정용)

import { escapeHtml } from './html';

export interface ResultPlayer { name: string; score: number; color?: string; detail?: string }

export interface ResultOptions {
  title: string;
  /** 최고 기록 저장 키 (게임·모드별) */
  bestKey: string;
  players: ResultPlayer[];
  /** 결과 아래 요약 줄 */
  summary?: string[];
  /** 내보낼 플레이 기록 */
  log?: unknown;
  logFileName?: string;
  hubHref: string;
  onRetry: () => void;
}

export function renderResults(root: HTMLElement, o: ResultOptions): void {
  const top = Math.max(...o.players.map((p) => p.score));
  const prevBest = readBest(o.bestKey);
  const newBest = prevBest === null || top > prevBest;
  if (newBest) writeBest(o.bestKey, top);
  const winner = o.players.length > 1
    ? (o.players.filter((p) => p.score === top).length > 1 ? '무승부!' : `${escapeHtml(o.players.find((p) => p.score === top)!.name)} 승리!`)
    : '';

  root.innerHTML = `
    <div class="results">
      <p class="results-eyebrow">${escapeHtml(o.title)} · 결과</p>
      <h2>${winner || '게임 끝!'}</h2>
      <div class="results-scores">
        ${o.players.map((p) => `
          <div class="result-card${o.players.length > 1 && p.score === top ? ' win' : ''}" style="${p.color ? `--pc:${p.color}` : ''}">
            <span class="result-name">${escapeHtml(p.name)}</span>
            <strong>${p.score.toLocaleString()}<small>점</small></strong>
            ${p.detail ? `<span class="muted">${escapeHtml(p.detail)}</span>` : ''}
          </div>`).join('')}
      </div>
      <p class="results-best">${newBest ? '🏆 <b>최고 기록 달성!</b>' : `최고 기록 ${prevBest!.toLocaleString()}점`}</p>
      ${o.summary?.length ? `<ul class="results-summary">${o.summary.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
      <div class="results-actions">
        <button type="button" class="btn primary" data-act="retry">다시 하기</button>
        <a class="btn ghost" href="${o.hubHref}">허브로</a>
        ${o.log ? '<button type="button" class="btn ghost" data-act="export">플레이 기록 내보내기 (JSON)</button>' : ''}
      </div>
    </div>`;

  root.querySelector('[data-act="retry"]')!.addEventListener('click', o.onRetry);
  root.querySelector('[data-act="export"]')?.addEventListener('click', () => {
    downloadJson(o.logFileName ?? 'play-log.json', o.log);
  });
}

export function downloadJson(fileName: string, data: unknown): void {
  console.log('[플레이 기록]', data);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function readBest(key: string): number | null {
  try { const v = localStorage.getItem(`best:${key}`); return v === null ? null : Number(v); } catch { return null; }
}
function writeBest(key: string, v: number): void {
  try { localStorage.setItem(`best:${key}`, String(v)); } catch { /* 저장 못 해도 진행 */ }
}
