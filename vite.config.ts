import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Previewウィンドウ（OBS BrowserSource 対象）
        renderer: resolve(__dirname, 'src/renderer/index.html'),
        // コントロールウィンドウ（設定UI）
        control: resolve(__dirname, 'src/control/index.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
})
