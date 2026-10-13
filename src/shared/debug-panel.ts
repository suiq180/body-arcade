// 개발용 디버그 패널 (기획서 9장): ` 키로 열고 닫으며 config의 숫자 값을 실시간으로 바꾼다.
// 바꾼 값은 새로고침하면 원래대로 돌아간다. 마음에 드는 값은 config.ts에 옮겨 적는다.

const TOGGLE_KEY = 'Backquote';

export function mountDebugPanel(host: HTMLElement, config: Record<string, unknown>, title: string): () => void {
  const panel = document.createElement('aside');
  panel.className = 'debug-panel';
  panel.hidden = true;
  const keys = Object.keys(config).filter((k) => typeof config[k] === 'number');
  panel.innerHTML = `
    <header><b>🛠 ${title} 디버그</b><span>\` 키로 닫기</span></header>
    <div class="debug-rows">
      ${keys.map((k) => `<label><span>${k}</span><input type="number" step="any" data-key="${k}" value="${config[k]}"></label>`).join('')}
    </div>
    <button type="button" data-act="dump">현재 값 콘솔에 출력</button>`;
  host.appendChild(panel);

  panel.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const v = Number(input.value);
    if (input.dataset.key && Number.isFinite(v)) config[input.dataset.key] = v;
  });
  panel.querySelector('[data-act="dump"]')!.addEventListener('click', () => {
    console.log(`[${title} 설정]`, Object.fromEntries(keys.map((k) => [k, config[k]])));
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== TOGGLE_KEY || (e.target as HTMLElement).tagName === 'INPUT') return;
    panel.hidden = !panel.hidden;
  };
  window.addEventListener('keydown', onKey);
  return () => { window.removeEventListener('keydown', onKey); panel.remove(); };
}
