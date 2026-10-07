import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  build: {
    // CodeMirror 语言包（全语言模式）与 markdown-render 天然较大，已拆成独立、可缓存的
    // chunk；此处仅把警告阈值调到与最大 chunk 匹配，避免每次构建都报无意义的 >500kB。
    // 若未来改为按需加载 CodeMirror 语言，可把阈值降回去。
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        // 把体积大、改动少的第三方库拆成独立 chunk：
        // 避免主 chunk 超过 500kB 触发警告，且浏览器可独立缓存这些稳定库。
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@milkdown') || id.includes('prosemirror')) {
              // 编辑器专用语法高亮（@milkdown/plugin-highlight、prosemirror-highlight）与
              // lowlight/highlight.js 只会被懒加载的编辑器/语言选择器使用。强制放进独立的
              // 'highlight' chunk（仅异步可达，不入启动预加载链），避免 rolldown 自动合并回
              // 'milkdown' 或经 markdown-render 把 katex 拖进预加载。
              if (
                id.includes('plugin-highlight') ||
                id.includes('prosemirror-highlight') ||
                id.includes('lowlight') ||
                id.includes('highlight.js')
              ) {
                return 'highlight'
              }
              return 'milkdown'
            }
            // katex 库（数学渲染）只在懒加载的编辑器里 import，独立成 chunk、随编辑器按需加载。
            // 注意 katex 的 CSS/字体是 PDF 导出（export → exportFonts）在用的，不能混进来，
            // 否则主包经 exportFonts 静态依赖 markdown-render 整块。
            if (id.includes('katex')) {
              if (/(katex\.min\.css|dist[\\/]fonts[\\/])/.test(id)) return 'exportFonts'
              return 'markdown-render'
            }
            if (id.includes('docx')) return 'docx'
            if (id.includes('react') || id.includes('zustand')) return 'react-vendor'
          }
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));