// MediaPipe 실행 파일(WASM)과 전신 포즈 모델을 public/mediapipe/ 에 준비한다.
// 사이트가 외부 CDN 없이 자기 서버에서 인식 파일을 내려주도록 하기 위함 (전시장 오프라인 대비).
// npm run dev / npm run build 전에 자동 실행된다. 이미 있으면 건너뛴다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'public', 'mediapipe');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const MODELS = {
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

mkdirSync(join(outDir, 'wasm'), { recursive: true });
for (const f of readdirSync(wasmSrc)) {
  const dst = join(outDir, 'wasm', f);
  if (!existsSync(dst)) copyFileSync(join(wasmSrc, f), dst);
}

const RETRIES = 3;
const TIMEOUT_MS = 60_000;

/** 네트워크가 잠깐 끊겨도 몇 번 다시 시도한다 */
async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
      if (attempt < RETRIES) {
        console.log(`[mediapipe] 실패 (${e.message}) → 다시 시도 ${attempt + 1}/${RETRIES}`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

for (const [name, url] of Object.entries(MODELS)) {
  const dst = join(outDir, name);
  if (existsSync(dst)) continue;
  console.log(`[mediapipe] 모델 내려받는 중: ${name}`);
  try {
    writeFileSync(dst, await download(url));
  } catch (e) {
    console.error(
      `\n[mediapipe] ${name} 을(를) 내려받지 못했어요 (${e.message}).\n` +
      '  - 인터넷 연결을 확인하세요. 학교·회사 와이파이에서 막힐 수 있으니 휴대폰 핫스팟으로 시도해 보세요.\n' +
      `  - 또는 아래 주소에서 직접 받아 public/mediapipe/${name} 로 넣은 뒤 다시 실행하세요.\n    ${url}\n`,
    );
    process.exit(1);
  }
}
console.log('[mediapipe] 준비 완료');
