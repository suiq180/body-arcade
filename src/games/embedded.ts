import type { GameModule } from './types';

/** 독립 게임의 스타일·입력·오디오를 별도 문서에 격리한다. */
export function embeddedGame(path: string, title: string): GameModule<'embedded'> {
  return {
    setup: 'embedded',
    modes: [{ players: 1, label: '웹 체험판 플레이' }],
    start(container) {
      const frame = document.createElement('iframe');
      frame.title = title;
      frame.src = `${import.meta.env.BASE_URL}${path}`;
      frame.allow = 'camera; gamepad; autoplay; fullscreen';
      frame.style.cssText = 'display:block;width:100%;height:calc(100dvh - 110px);min-height:600px;border:0;background:#101827;border-radius:16px';
      container.append(frame);
      frame.addEventListener('load', () => frame.focus(), { once: true });
      return {
        destroy() {
          // 문서를 종료하면 게임 루프와 오디오, 장치 연결도 함께 해제된다.
          frame.src = 'about:blank';
          frame.remove();
        },
      };
    },
  };
}
