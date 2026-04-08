import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri CLI sets TAURI_ENV_* env vars
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // Tauri expects a fixed port for dev, don't clear terminal
      clearScreen: false,
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Tauri uses strictPort to guarantee the devUrl port
        strictPort: true,
        // Browser dev only — Tauri uses Rust proxy instead
        ...(!isTauriBuild && {
          proxy: {
            '/api/claude': {
              target: 'https://api.anthropic.com',
              changeOrigin: true,
              rewrite: (path: string) => path.replace(/^\/api\/claude/, ''),
              configure: (proxy: any) => {
                proxy.on('proxyReq', (proxyReq: any) => {
                  proxyReq.setHeader('x-api-key', env.CLAUDE_API_KEY || '');
                  proxyReq.setHeader('anthropic-version', '2023-06-01');
                });
              },
            },
          },
        }),
      },
      plugins: [react()],
      // Tauri env vars are accessible in frontend
      envPrefix: ['VITE_', 'TAURI_ENV_'],
      define: {
        // Browser dev fallback — Tauri 환경에서는 Rust 백엔드가 키 관리
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.SUPERTONE_API_KEY': JSON.stringify(env.SUPERTONE_API_KEY || ''),
        'process.env.CLAUDE_API_KEY': JSON.stringify(env.CLAUDE_API_KEY || ''),
      },
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
