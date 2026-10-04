import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri CLI sets TAURI_ENV_* env vars
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig(() => {
    return {
      // Tauri expects a fixed port for dev, don't clear terminal
      clearScreen: false,
      server: {
        port: 3000,
        // 개발 서버는 이 Mac 내부에서만 접근 가능하다.
        host: '127.0.0.1',
        // Tauri uses strictPort to guarantee the devUrl port
        strictPort: true,
      },
      plugins: [react()],
      // 앱 키가 실수로 renderer 번들에 들어가지 않도록 Tauri 자체 변수만 허용한다.
      envPrefix: ['TAURI_ENV_'],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Tauri production: bundle output
        outDir: 'dist',
        // Don't inline assets for better Tauri caching
        assetsInlineLimit: 0,
        target: isTauriBuild ? 'safari15' : 'esnext',
      },
    };
});
