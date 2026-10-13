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

for (const [name, url] of Object.entries(MODELS)) {
  const dst = join(outDir, name);
  if (existsSync(dst)) continue;
  console.log(`[mediapipe] 모델 내려받는 중: ${name}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} 내려받기 실패 (${res.status})`);
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
}
console.log('[mediapipe] 준비 완료');
