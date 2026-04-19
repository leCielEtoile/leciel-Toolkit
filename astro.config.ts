import { defineConfig } from 'astro/config'
import svelte from '@astrojs/svelte'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'
import fs from 'node:fs'
import path from 'node:path'

// wasm-vips dynamically loads these companion WASM files at runtime from the
// same URL prefix as the main JS bundle (/_astro/).  Vite doesn't copy them
// automatically, so we emit them as un-hashed assets during the build.
const copyVipsLibsPlugin = () => ({
  name: 'copy-wasm-vips-libs',
  generateBundle() {
    const libs = ['vips-jxl.wasm', 'vips-heif.wasm']
    for (const lib of libs) {
      const src = path.resolve('node_modules/wasm-vips/lib', lib)
      if (fs.existsSync(src)) {
        (this as any).emitFile({
          type: 'asset',
          fileName: `_astro/${lib}`,
          source: new Uint8Array(fs.readFileSync(src)),
        })
      }
    }
  },
})

// pdfjs-dist requires CMap files for CJK font support.
// Copy all .bcmap files from pdfjs-dist/cmaps/ to /_astro/cmaps/ in the build output.
const copyPdfjsCmapsPlugin = () => ({
  name: 'copy-pdfjs-cmaps',
  generateBundle() {
    const cmapsDir = path.resolve('node_modules/pdfjs-dist/cmaps')
    if (!fs.existsSync(cmapsDir)) return
    for (const file of fs.readdirSync(cmapsDir)) {
      if (!file.endsWith('.bcmap')) continue
      const src = path.join(cmapsDir, file)
      ;(this as any).emitFile({
        type: 'asset',
        fileName: `_astro/cmaps/${file}`,
        source: new Uint8Array(fs.readFileSync(src)),
      })
    }
  },
})

// wasm-vips requires SharedArrayBuffer, which needs cross-origin isolation.
// In production, _headers handles this scoped to /tools/image-converter/*.
// For local dev/preview servers, inject the headers via middleware.
const coepCoopPlugin = () => ({
  name: 'coep-coop-image-converter',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (req.url?.startsWith('/tools/image-converter')) {
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      }
      next()
    })
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (req.url?.startsWith('/tools/image-converter')) {
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      }
      next()
    })
  },
})

export default defineConfig({
  output: 'static',
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss(), wasm(), copyVipsLibsPlugin(), copyPdfjsCmapsPlugin(), coepCoopPlugin()],
    optimizeDeps: {
      exclude: ['wasm-vips'],
      include: ['pdfjs-dist'],
    },
    worker: {
      format: 'es',
    },
  },
})
