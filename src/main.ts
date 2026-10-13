// 허브 진입점: 주소의 # 부분으로 화면을 고른다
//   #/device/<장치ID>  → 허브 (해당 장치 탭)
//   #/setup/<장치ID>   → 장치 준비 화면 (테스트 모드)
//   #/play/<게임ID>    → 게임 소개 → 장치 준비 → 게임 → 결과 (아직 없는 게임은 소개 페이지만)

import './style.css';
import { renderHub } from './hub/hub';
import { findGame, isOpen, isPlayable } from './games/registry';
import { findDevice, type DeviceId } from './shared/devices';
import { mountCameraSetup } from './setup/camera-setup';
import { mountPlay } from './games/play';
import { mountGameInfo } from './games/info';

const root = document.getElementById('app')!;
const LAST_TAB_KEY = 'arcade:last-tab';

/** 지금 화면을 떠날 때 할 정리 (카메라 끄기 등) */
let cleanup: (() => void) | null = null;

function lastTab(): DeviceId {
  try {
    const saved = localStorage.getItem(LAST_TAB_KEY);
    if (saved && findDevice(saved)) return saved as DeviceId;
  } catch { /* 저장소를 못 써도 기본 탭으로 */ }
  return 'camera'; // 첫 구현 대상(body-rebel)의 장치
}

function route(): void {
  cleanup?.();
  cleanup = null;
  const [, kind, id] = location.hash.split('/');

  if (kind === 'setup' && id === 'camera') {
    cleanup = mountCameraSetup(root, { backHref: '#/device/camera' });
    window.scrollTo(0, 0);
    return;
  }

  if (kind === 'play' && id) {
    const game = findGame(id);
    if (!game || !isOpen(game)) { location.hash = '#/'; return; }
    // 플레이 화면이 있으면 실제 게임, 없으면 소개 페이지 (전시 모드)
    cleanup = isPlayable(game) ? mountPlay(root, game) : mountGameInfo(root, game);
    window.scrollTo(0, 0);
    return;
  }

  const device = kind === 'device' && id && findDevice(id) ? (id as DeviceId) : lastTab();
  try { localStorage.setItem(LAST_TAB_KEY, device); } catch { /* 무시 */ }
  cleanup = renderHub(root, device);
  if (pendingScroll) { scrollToSection(pendingScroll); pendingScroll = null; }
}

// 상단 메뉴·버튼의 data-scroll="섹션ID" → 해당 섹션으로 부드럽게 이동
// (주소의 #은 화면 전환에 쓰므로 섹션 이동에는 쓰지 않는다)
let pendingScroll: string | null = null;
function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-scroll]');
  if (!el) return;
  const target = el.dataset.scroll!;
  const href = el.getAttribute('href');
  if (href && href !== location.hash) { pendingScroll = target; return; } // 탭 전환 후 이동
  e.preventDefault();
  scrollToSection(target);
});

window.addEventListener('hashchange', route);
route();
