import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 상대 경로 빌드: GitHub Pages 하위 경로, 내부망 정적 서버 어디에 올려도 동작
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
