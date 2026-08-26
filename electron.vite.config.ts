import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// SonalTau : pas de Yjs → pas de dedupe particulier (contraste avec POC2).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: 'src/main/index.ts' } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: 'src/preload/index.ts' } },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: { input: { index: 'src/renderer/index.html' } },
    },
    plugins: [vue()],
  },
})
