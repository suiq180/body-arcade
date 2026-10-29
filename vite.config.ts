import { defineConfig } from 'vite';
import path from 'node:path';

const root = path.resolve(__dirname);
// 사이트 코드가 들어 있는 곳만 감시한다.
// 기획 문서·이미지 같은 큰 파일을 복사하는 중에 파일이 잠겨 개발 서버가 꺼지는 문제 방지
const WATCHED = ['src', 'public', 'games', 'index.html'].map((p) => path.join(root, p));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: path.join(root, 'index.html'),
        'ghost-store': path.join(root, 'games/ghost-store/index.html'),
      },
    },
  },
  server: {
    watch: {
      ignored: (file: string) => {
        const abs = path.resolve(file);
        if (abs === root) return false;
        return !WATCHED.some((w) => abs === w || abs.startsWith(w + path.sep));
      },
    },
  },
});
