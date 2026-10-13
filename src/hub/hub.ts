// 메인(허브) 화면 (기획서 5.2) — 게임 포털 스타일
// 상단 안내줄 → 로고·검색 → 장치 탭 바 → 공지 → [배너 + 게임 목록 + 장치 안내 | 인기 순위·장치 테스트·이용 안내] → 푸터
// 화면에는 실제 데이터만 쓴다 (지어낸 플레이 수·인기 순위 없음).
// 전시 모드(SHOWCASE_MODE)에서는 모든 게임을 완성된 것처럼 보여 준다.

import { GAMES, POPULAR_RANKING, findGame, gamesForDevice, isOpen, type GameMeta } from '../games/registry';
import { DEVICES, checkSupport, findDevice, type DeviceId } from '../shared/devices';
import { escapeHtml } from '../shared/html';

/** 장치 준비 화면이 만들어진 장치 (단계별로 늘어남) */
const SETUP_READY: DeviceId[] = ['camera'];
/** 장치 탭 색 */
const DEVICE_COLORS: Record<DeviceId, string> = {
  mic: '#ff4d6d', camera: '#ff8a00', xr: '#7c4dff', gaze: '#12b886', rhythm: '#228be6',
};
const SLIDE_MS = 4500;

/** 배너 위치는 탭을 바꿔도 이어지게 */
let slideIndex = 0;

/** @returns 화면을 떠날 때 부를 정리 함수 (배너 자동 넘김 끄기) */
export function renderHub(root: HTMLElement, current: DeviceId): () => void {
  const device = findDevice(current) ?? DEVICES[0];
  const support = checkSupport(device.id);
  const games = gamesForDevice(device.id);
  const slides = GAMES.filter(isOpen);
  // 순위 목록 (예시 순서, registry.ts 참고) + 목록에 빠진 게임은 뒤에 붙인다
  const popular = [
    ...POPULAR_RANKING.map((id) => findGame(id)).filter((g): g is GameMeta => !!g),
    ...GAMES.filter((g) => !POPULAR_RANKING.includes(g.id)),
  ];
  const maxTogether = Math.max(...GAMES.map(maxPlayers));

  root.innerHTML = `
    <div class="portal">
      <div class="topline"><div class="container topline-inner">
        <span>🎮 키보드·마우스 없이 <b>몸으로</b> 노는 미니게임 모음</span>
        <span class="topline-right">크롬·엣지 권장 · 카메라·마이크 영상은 저장되지 않아요</span>
      </div></div>

      <header class="masthead"><div class="container masthead-inner">
        <a class="logo" href="#/device/${device.id}">
          <span class="logo-icon">🕹️</span>
          <span class="logo-words"><span class="logo-main">몸으로<em>아케이드</em></span><span class="logo-sub">BODY ARCADE · 하드웨어 미니게임</span></span>
        </a>
        <form class="search" role="search" data-el="searchForm">
          <input type="search" placeholder="게임 이름으로 찾기" aria-label="게임 검색" data-el="search">
          <button type="submit">검색</button>
        </form>
        <div class="mast-stats">
          <span><b>${GAMES.length}</b>게임</span>
          <span><b>${DEVICES.length}</b>입력 장치</span>
          <span><b>${maxTogether}명</b>까지 함께</span>
        </div>
      </div></header>

      <nav class="catbar" aria-label="입력 장치"><div class="container catbar-inner" role="tablist">
        ${DEVICES.map((d) => {
          const active = d.id === device.id;
          return `<a class="cat${active ? ' active' : ''}" role="tab" aria-selected="${active}" href="#/device/${d.id}" style="--dc:${DEVICE_COLORS[d.id]}">
            <span class="cat-icon">${d.icon}</span>
            <span class="cat-name">${d.name}</span>
            <span class="cat-count">${gamesForDevice(d.id).length}</span>
          </a>`;
        }).join('')}
      </div></nav>

      <div class="ticker"><div class="container ticker-inner">
        <span class="ticker-label">📢 공지</span>
        <div class="ticker-window"><div class="ticker-track">
          ${tickerItems().concat(tickerItems()).map((t) => `<span>${t}</span>`).join('')}
        </div></div>
      </div></div>

      <main class="container portal-main">
        <div class="col-main">
          <section class="carousel" aria-roledescription="배너" data-el="carousel">
            ${slides.map((g, i) => slide(g, i)).join('')}
            <button type="button" class="car-arrow prev" data-car="-1" aria-label="이전 배너">‹</button>
            <button type="button" class="car-arrow next" data-car="1" aria-label="다음 배너">›</button>
            <div class="car-dots">${slides.map((_, i) => `<button type="button" data-dot="${i}" aria-label="${i + 1}번 배너"></button>`).join('')}</div>
          </section>

          <section class="panel" id="games" data-el="gamesPanel">
            ${gamesPanel(device.id, games, support.ok ? null : support.reason ?? '', support.ok ? support.reason ?? null : null)}
          </section>

          <section class="panel" id="devices">
            <div class="panel-head"><h2>🔌 장치 안내</h2><span class="panel-sub">지금 이 브라우저에서 쓸 수 있는 장치</span></div>
            <table class="dev-table">
              <thead><tr><th>장치</th><th>쓰는 방법</th><th>게임</th><th>이 브라우저</th></tr></thead>
              <tbody>${DEVICES.map((d) => {
                const s = checkSupport(d.id);
                return `<tr>
                  <td><a href="#/device/${d.id}" style="--dc:${DEVICE_COLORS[d.id]}" class="dev-link">${d.icon} ${d.name}</a></td>
                  <td>${d.usage}</td>
                  <td>${gamesForDevice(d.id).length}</td>
                  <td>${s.ok ? '<span class="tag ok">사용 가능</span>' : `<span class="tag no">${escapeHtml(s.reason ?? '')}</span>`}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </section>
        </div>

        <aside class="col-side">
          <section class="panel">
            <div class="panel-head"><h2>🔥 인기 게임 순위</h2></div>
            <ol class="rank">
              ${popular.map((g, i) => `<li class="${i === 0 ? 'rank-first' : ''}">
                <span class="rank-no r${i + 1}">${i + 1}</span>
                <span class="rank-emoji" style="background:linear-gradient(135deg, ${g.thumbnail.from}, ${g.thumbnail.to})">${g.thumbnail.emoji}</span>
                <span class="rank-body">
                  ${isOpen(g) ? `<a href="#/play/${g.id}">${escapeHtml(g.title)}</a>` : `<span>${escapeHtml(g.title)}</span>`}
                  <small>${i === 0 ? escapeHtml(g.tagline) : `${g.devices.map((id) => `${findDevice(id)!.icon} ${findDevice(id)!.name}`).join(', ')} · ${escapeHtml(g.players)}`}</small>
                </span>
                ${isOpen(g) ? `<a class="btn-hot small" href="#/play/${g.id}">플레이</a>` : ''}
              </li>`).join('')}
            </ol>
          </section>

          ${SETUP_READY.length ? `<section class="panel test-box">
            <div class="panel-head"><h2>🧪 장치 테스트</h2></div>
            <p>게임 전에 카메라가 내 몸을 잘 인식하는지 먼저 확인해 보세요.</p>
            ${SETUP_READY.map((id) => `<a class="btn-hot" href="#/setup/${id}">${findDevice(id)!.icon} ${findDevice(id)!.name} 테스트</a>`).join('')}
          </section>` : ''}

          <section class="panel">
            <div class="panel-head"><h2>📌 이용 안내</h2></div>
            <ul class="guide">
              <li>카메라·마이크는 게임을 시작할 때만 켜지고, 나가면 꺼져요.</li>
              <li>영상과 소리는 내 컴퓨터 안에서만 처리돼요.</li>
              <li>MIDI 장치는 크롬·엣지에서만 연결돼요.</li>
              <li>시선·햅틱 게임은 데스크톱 앱이 정식판이고, 사이트에서는 웹캠 체험판을 해요.</li>
            </ul>
          </section>
        </aside>
      </main>

      <footer class="portal-foot"><div class="container">
        <b>🕹️ 몸으로 아케이드</b>
        <span>입력 장치로 분류한 브라우저 미니게임 모음 · 모든 이름·그림·소리는 직접 만들었어요</span>
      </div></footer>
    </div>`;

  // ── 배너 ───────────────────────────────
  const carousel = root.querySelector<HTMLElement>('[data-el="carousel"]')!;
  const total = slides.length;
  const show = (i: number) => {
    slideIndex = (i + total) % total;
    carousel.querySelectorAll<HTMLElement>('.slide').forEach((s, k) => { s.classList.toggle('on', k === slideIndex); s.inert = k !== slideIndex; });
    carousel.querySelectorAll<HTMLElement>('[data-dot]').forEach((d, k) => d.classList.toggle('on', k === slideIndex));
  };
  show(slideIndex);
  let timer = window.setInterval(() => show(slideIndex + 1), SLIDE_MS);
  const restart = () => { clearInterval(timer); timer = window.setInterval(() => show(slideIndex + 1), SLIDE_MS); };
  carousel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const step = t.closest<HTMLElement>('[data-car]')?.dataset.car;
    const dot = t.closest<HTMLElement>('[data-dot]')?.dataset.dot;
    if (step) { show(slideIndex + Number(step)); restart(); }
    if (dot) { show(Number(dot)); restart(); }
  });
  carousel.addEventListener('mouseenter', () => clearInterval(timer));
  carousel.addEventListener('mouseleave', restart);

  // ── 검색 (모든 장치에서 제목·문구로 찾기) ───────────
  const panel = root.querySelector<HTMLElement>('[data-el="gamesPanel"]')!;
  const search = root.querySelector<HTMLInputElement>('[data-el="search"]')!;
  const runSearch = () => {
    const q = search.value.trim().toLowerCase();
    if (!q) {
      panel.innerHTML = gamesPanel(device.id, games, support.ok ? null : support.reason ?? '', support.ok ? support.reason ?? null : null);
      return;
    }
    const found = GAMES.filter((g) => `${g.title} ${g.tagline} ${g.description}`.toLowerCase().includes(q));
    panel.innerHTML = `
      <div class="panel-head"><h2>🔍 "${escapeHtml(search.value.trim())}" 검색 결과</h2><span class="panel-more">${found.length}개</span></div>
      <div class="ggrid">${found.length ? found.map(card).join('') : '<div class="empty">찾는 게임이 없어요.</div>'}</div>`;
  };
  search.addEventListener('input', runSearch);
  root.querySelector('[data-el="searchForm"]')!.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch();
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return () => clearInterval(timer);
}

function gamesPanel(id: DeviceId, games: GameMeta[], blocked: string | null, note: string | null): string {
  const d = findDevice(id)!;
  return `
    <div class="panel-head" style="--dc:${DEVICE_COLORS[id]}">
      <h2>${d.icon} ${d.name} 게임</h2>
      <span class="panel-sub">${d.hint}</span>
      <span class="panel-more">${games.length}개</span>
    </div>
    ${blocked !== null ? `<div class="notice">⚠️ ${escapeHtml(blocked)}</div>` : note ? `<div class="notice info">ℹ️ ${escapeHtml(note)}</div>` : ''}
    <div class="ggrid">
      ${games.length ? games.map(card).join('') : `<div class="empty">아직 ${d.name}(으)로 할 수 있는 게임이 없어요. 곧 추가될 예정이에요.</div>`}
    </div>`;
}

/** 인원 문구("1~2명 협동" 등)에서 최대 인원 */
function maxPlayers(g: GameMeta): number {
  return Math.max(...(g.players.match(/\d+/g) ?? ['1']).map(Number));
}

function card(g: GameMeta): string {
  const open = isOpen(g);
  const maxP = maxPlayers(g);
  const gaze = g.devices.includes('gaze');
  const inner = `
    <div class="gthumb" style="background:linear-gradient(135deg, ${g.thumbnail.from}, ${g.thumbnail.to})">
      <span class="gemoji">${g.thumbnail.emoji}</span>
      <span class="ribbon ${open ? 'new' : 'soon'}">${open ? 'NEW' : '준비 중'}</span>
      ${maxP > 1 ? `<span class="corner" title="한 화면 앞에서 최대 ${maxP}명이 함께">👥 최대 ${maxP}인</span>` : ''}
      ${open ? '<span class="gplay">▶ 지금 플레이</span>' : ''}
    </div>
    <div class="gbody">
      <h3>${escapeHtml(g.title)}</h3>
      <p class="gtag">${escapeHtml(g.tagline)}</p>
      <p class="gdesc">${escapeHtml(g.description)}</p>
      <div class="gmeta">
        ${g.devices.map((id) => `<span class="chip dev" style="--dc:${DEVICE_COLORS[id]}">${findDevice(id)!.icon} ${findDevice(id)!.name}</span>`).join('')}
        <span class="chip">👥 ${escapeHtml(g.players)}</span>
        <span class="chip">⏱ ${escapeHtml(g.playTime)}</span>
      </div>
      ${gaze ? `<div class="editions">
        ${open ? `<a class="btn-hot small" href="#/play/${g.id}">체험판 플레이</a><a class="btn-line small" href="#/play/${g.id}">정식판 받기</a>`
          : '<button type="button" class="btn-hot small" disabled>체험판 플레이</button><button type="button" class="btn-line small" disabled>정식판 받기</button>'}
      </div>` : ''}
    </div>`;
  // 닫힌 게임(전시 모드가 아닐 때의 wip)은 링크가 아닌 div로 그려 클릭·키보드 포커스 모두 막는다
  // 시선·햅틱 게임은 카드 안의 두 버튼으로 이동하므로 카드 자체는 링크가 아니다
  if (open && !gaze) return `<a class="gcard" href="#/play/${g.id}">${inner}</a>`;
  return `<div class="gcard${open ? '' : ' wip'}"${open ? '' : ' aria-disabled="true"'}>${inner}</div>`;
}

function slide(g: GameMeta, i: number): string {
  const d = findDevice(g.devices[0])!;
  return `<article class="slide" style="--from:${g.thumbnail.from};--to:${g.thumbnail.to}" aria-label="${i + 1}번 배너">
    <div class="slide-copy">
      <span class="slide-badge hot">${d.icon} ${d.name} 게임</span>
      <h2>${escapeHtml(g.title)}</h2>
      <p class="slide-tag">${escapeHtml(g.tagline)}</p>
      <p class="slide-desc">${escapeHtml(g.description)}</p>
      <div class="slide-meta"><span>👥 ${escapeHtml(g.players)}</span><span>⏱ ${escapeHtml(g.playTime)}</span></div>
      <a class="btn-hot big" href="#/play/${g.id}">▶ 지금 플레이</a>
    </div>
    <div class="slide-art"><span>${g.thumbnail.emoji}</span></div>
  </article>`;
}

function tickerItems(): string[] {
  const multi = GAMES.filter((g) => /[2-9]/.test(g.players)).map((g) => `「${escapeHtml(g.title)}」`);
  return [
    `🎉 키보드 없이 즐기는 하드웨어 미니게임 <b>${GAMES.length}종</b>`,
    '📷 게임 전에 <b>장치 테스트</b>로 카메라 인식을 먼저 확인해 보세요',
    `👥 친구와 함께: <b>${multi.slice(0, 3).join(' ')}</b>`,
    '💻 크롬·엣지 최신 버전을 추천해요',
    '🔒 카메라·마이크 영상은 내 컴퓨터 안에서만 처리돼요',
  ];
}
