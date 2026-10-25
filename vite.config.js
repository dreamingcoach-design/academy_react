import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : 빌드 결과(dist/)를 발송 서버(server/)나 정적 호스팅 어디에 두어도 열리게 한다
export default defineConfig({
  base: './',
  plugins: [react()],
  // 화면 스모크 테스트만. 발송 서버 테스트는 server/ 에서 node --test 로 돌린다
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
