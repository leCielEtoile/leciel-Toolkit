<script lang="ts">
  import type { PDFDocumentProxy } from 'pdfjs-dist'
  import { initRenderer, openDocument, renderPageToDataUrl } from '@/lib/pdf/pdf-renderer'
  import {
    type SourcePdf, type PageDescriptor,
    getPageSizes, buildPdf, splitPdf, downloadBytes,
  } from '@/lib/pdf/pdf-engine'
  import PdfPreviewModal from './PdfPreviewModal.svelte'
  import PdfSplitModal   from './PdfSplitModal.svelte'

  // ─── Global state ────────────────────────────────────────────────────────
  let fileLoaded   = $state(false)
  let fileName     = $state('')
  let mode         = $state<'viewer' | 'edit'>('viewer')
  let showMerge    = $state(false)
  let showSplit    = $state(false)
  let splitAt      = $state(1)
  let isDragOver   = $state(false)
  let loading      = $state(false)
  let loadingMsg   = $state('')

  // ─── PDF data ────────────────────────────────────────────────────────────
  // sources: sourceId → { bytes, ... }
  let sources      = new Map<string, SourcePdf>()
  let pdfDocs      = new Map<string, PDFDocumentProxy>()   // pdfjs docs cache

  // pages: 現在の表示順・状態
  let pages        = $state<PageDescriptor[]>([])
  let pageCount    = $derived(pages.length)

  // サムネイル: "sourceId:srcIndex:rotation" → dataURL
  let thumbnails   = $state<Map<string, string>>(new Map())

  let idCounter    = 0
  function nextId() { return ++idCounter }

  function thumbKey(p: PageDescriptor) {
    return `${p.sourceId}:${p.srcIndex}:${p.rotation}`
  }

  // ─── Renderer init (ブラウザのみ) ─────────────────────────────────────
  $effect(() => { initRenderer() })

  // ─── Load PDF ────────────────────────────────────────────────────────────
  async function loadFile(file: File | undefined | null) {
    if (!file) return
    loading    = true
    loadingMsg = 'PDFを読み込み中…'
    try {
      const bytes   = new Uint8Array(await file.arrayBuffer())
      const srcId   = 'src-0'
      sources       = new Map([[srcId, { id: srcId, bytes }]])

      const sizes   = await getPageSizes(bytes)
      const count   = sizes.length
      pages         = sizes.map((s, i) => ({
        id: nextId(), sourceId: srcId, srcIndex: i, rotation: 0,
        width: s.width, height: s.height,
      }))
      splitAt       = Math.max(1, Math.floor(count / 2))
      fileName      = file.name
      fileLoaded    = true
      mode          = 'viewer'
      showMerge     = false
      showSplit     = false
      thumbnails    = new Map()
      previewThumbs = new Map()
      pdfDocs       = new Map()   // 前回の PDF ドキュメントキャッシュをクリア

      await renderAllThumbnails(srcId, bytes, count)
    } finally {
      loading = false
    }
  }

  async function renderAllThumbnails(srcId: string, bytes: Uint8Array, count: number) {
    loadingMsg = 'サムネイルを生成中…'
    if (!pdfDocs.has(srcId)) {
      pdfDocs.set(srcId, await openDocument(bytes))
    }
    const doc = pdfDocs.get(srcId)!
    for (let i = 0; i < count; i++) {
      loadingMsg = `サムネイルを生成中… ${i + 1} / ${count}`
      // デフォルト 400px（pdf-renderer.ts の default 値を使用）
      const url  = await renderPageToDataUrl(doc, i)
      thumbnails = new Map(thumbnails).set(`${srcId}:${i}:0`, url)
    }
    loadingMsg = ''
  }

  // ─── アスペクト比ヘルパー ────────────────────────────────────────────────
  function getAspectRatio(p: PageDescriptor): string {
    // p.rotation は追加回転。90/270 の場合は幅・高さが入れ替わる
    const swapped = p.rotation === 90 || p.rotation === 270
    const w = swapped ? p.height : p.width
    const h = swapped ? p.width  : p.height
    return `${w} / ${h}`
  }

  // ─── プレビュー高解像度サムネイル ───────────────────────────────────────
  let previewThumbs = $state<Map<string, string>>(new Map())

  function previewThumbKey(p: PageDescriptor) {
    return `${p.sourceId}:${p.srcIndex}:${p.rotation}:hd`
  }

  async function ensurePreviewThumb(p: PageDescriptor) {
    const key = previewThumbKey(p)
    if (previewThumbs.has(key)) return
    if (!pdfDocs.has(p.sourceId)) return

    const doc    = pdfDocs.get(p.sourceId)!
    const base   = await renderPageToDataUrl(doc, p.srcIndex, 1200)

    if (p.rotation === 0) {
      previewThumbs = new Map(previewThumbs).set(key, base)
      return
    }
    // 回転を canvas で適用
    const img  = await loadImage(base)
    const { width: w, height: h } = img
    const swap = p.rotation === 90 || p.rotation === 270
    const cw = swap ? h : w
    const ch = swap ? w : h
    const canvas = document.createElement('canvas')
    canvas.width = cw; canvas.height = ch
    const ctx = canvas.getContext('2d')!
    ctx.translate(cw / 2, ch / 2)
    ctx.rotate((p.rotation * Math.PI) / 180)
    ctx.drawImage(img, -w / 2, -h / 2)
    previewThumbs = new Map(previewThumbs).set(key, canvas.toDataURL('image/jpeg', 0.92))
  }

  /** 回転したサムネイルをキャッシュ（まだなければレンダリング） */
  async function ensureRotatedThumb(p: PageDescriptor) {
    const key = thumbKey(p)
    if (thumbnails.has(key)) return
    if (!pdfDocs.has(p.sourceId)) return

    // canvas で元画像を回転させて生成
    const base = thumbnails.get(`${p.sourceId}:${p.srcIndex}:0`)
    if (!base) return

    const img = await loadImage(base)
    const { width: w, height: h } = img
    const swap  = p.rotation === 90 || p.rotation === 270
    const cw    = swap ? h : w
    const ch    = swap ? w : h
    const canvas = document.createElement('canvas')
    canvas.width  = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')!
    ctx.translate(cw / 2, ch / 2)
    ctx.rotate((p.rotation * Math.PI) / 180)
    ctx.drawImage(img, -w / 2, -h / 2)
    thumbnails = new Map(thumbnails).set(key, canvas.toDataURL('image/jpeg', 0.85))
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload  = () => resolve(img)
      img.onerror = reject
      img.src     = src
    })
  }

  // ─── Page operations ─────────────────────────────────────────────────────
  function deletePage(id: number) {
    if (pageCount <= 1) return
    pages   = pages.filter(p => p.id !== id)
    splitAt = Math.min(splitAt, pages.length - 1)
  }

  async function rotatePage(id: number, dir: 1 | -1) {
    pages = pages.map(p => {
      if (p.id !== id) return p
      const r = ((p.rotation + dir * 90) % 360 + 360) % 360
      return { ...p, rotation: r }
    })
    // 回転後サムネイルを非同期で生成
    const p = pages.find(p => p.id === id)
    if (p) ensureRotatedThumb(p)
  }

  // ─── Drag reorder ────────────────────────────────────────────────────────
  let dragging   = $state<number | null>(null)
  let dragOver   = $state<number | null>(null)

  function onDragStart(e: DragEvent, i: number) {
    dragging = i
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOverPage(e: DragEvent, i: number) { e.preventDefault(); dragOver = i }
  function onDropPage(e: DragEvent, i: number) {
    e.preventDefault()
    if (dragging !== null && dragging !== i) {
      const arr = [...pages]
      const [item] = arr.splice(dragging, 1)
      arr.splice(i, 0, item)
      pages = arr
    }
    dragging = null; dragOver = null
  }
  function onDragEnd() { dragging = null; dragOver = null }

  // ─── Touch drag (grid reorder) ──────────────────────────────────────────
  let touchDragIndex     = $state<number | null>(null)
  let touchDragOverIndex = $state<number | null>(null)

  function onPageTouchstart(e: TouchEvent, i: number) {
    if (mode !== 'edit') return
    touchDragIndex = i; touchDragOverIndex = null; dragging = i
  }
  function onPageTouchmove(e: TouchEvent) {
    if (touchDragIndex === null) return
    const touch = e.touches[0]
    const els   = document.elementsFromPoint(touch.clientX, touch.clientY)
    for (const el of els) {
      const card = (el as HTMLElement).closest('[data-page-idx]') as HTMLElement | null
      if (card) {
        const idx = parseInt(card.dataset.pageIdx ?? '-1')
        if (idx >= 0 && idx !== touchDragIndex) {
          touchDragOverIndex = idx; dragOver = idx; break
        }
      }
    }
  }
  function onPageTouchend() {
    if (touchDragIndex !== null && touchDragOverIndex !== null && touchDragIndex !== touchDragOverIndex) {
      const arr = [...pages]
      const [item] = arr.splice(touchDragIndex, 1)
      arr.splice(touchDragOverIndex, 0, item)
      pages = arr
    }
    touchDragIndex = null; touchDragOverIndex = null; dragging = null; dragOver = null
  }

  // ─── Merge ───────────────────────────────────────────────────────────────
  async function mergeFile(file: File | undefined | null) {
    if (!file) return
    loading    = true
    loadingMsg = '結合するPDFを読み込み中…'
    try {
      const bytes  = new Uint8Array(await file.arrayBuffer())
      const srcId  = `src-${sources.size}`
      sources      = new Map(sources).set(srcId, { id: srcId, bytes })

      const sizes  = await getPageSizes(bytes)
      const count  = sizes.length
      const newPages: PageDescriptor[] = sizes.map((s, i) => ({
        id: nextId(), sourceId: srcId, srcIndex: i, rotation: 0,
        width: s.width, height: s.height,
      }))
      pages     = [...pages, ...newPages]
      showMerge = false

      await renderAllThumbnails(srcId, bytes, count)
    } finally {
      loading = false
    }
  }

  // ─── Download (all pages) ────────────────────────────────────────────────
  async function handleDownload() {
    loading    = true
    loadingMsg = 'PDFを生成中…'
    try {
      const bytes = await buildPdf(sources, pages)
      const base  = fileName.replace(/\.pdf$/i, '')
      downloadBytes(bytes, `${base}_edited.pdf`)
    } finally {
      loading = false
    }
  }

  // ─── Split ───────────────────────────────────────────────────────────────
  async function handleSplit() {
    loading    = true
    loadingMsg = 'PDFを分割中…'
    try {
      const [first, second] = await splitPdf(sources, pages, splitAt)
      const base = fileName.replace(/\.pdf$/i, '')
      downloadBytes(first,  `${base}_1-${splitAt}.pdf`)
      downloadBytes(second, `${base}_${splitAt + 1}-${pageCount}.pdf`)
      showSplit = false
    } finally {
      loading = false
    }
  }

  let splitLabel = $derived(
    splitAt > 0 && splitAt < pageCount
      ? `ページ 1–${splitAt} と ページ ${splitAt + 1}–${pageCount} の 2 ファイルに分割`
      : '分割位置を選択してください'
  )

  // ─── Preview ─────────────────────────────────────────────────────────────
  let previewIndex = $state<number | null>(null)

  function openPreview(i: number) { previewIndex = i }
</script>

<!-- ──────────────────────────────────────────────────────────────────────── -->
<!-- Loading overlay                                                           -->
<!-- ──────────────────────────────────────────────────────────────────────── -->
{#if loading}
  <div class="fixed inset-0 bg-black/50 flex flex-col items-center justify-center gap-4 z-[100]">
    <div class="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
    <p class="text-white text-sm font-medium">{loadingMsg}</p>
  </div>
{/if}

<!-- ──────────────────────────────────────────────────────────────────────── -->
<!-- Upload Zone                                                               -->
<!-- ──────────────────────────────────────────────────────────────────────── -->
{#if !fileLoaded}
  <div
    class="border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4 text-center cursor-pointer transition-all duration-200
           {isDragOver
             ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
             : 'border-[var(--outline-variant)] bg-[var(--surface-container)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]'}"
    ondragover={(e) => { e.preventDefault(); isDragOver = true }}
    ondragleave={() => isDragOver = false}
    ondrop={(e) => { e.preventDefault(); isDragOver = false; loadFile(e.dataTransfer?.files[0]) }}
    onclick={() => (document.getElementById('pdf-file-input') as HTMLInputElement)?.click()}
    role="button"
    tabindex={0}
    onkeydown={(e) => e.key === 'Enter' && (document.getElementById('pdf-file-input') as HTMLInputElement)?.click()}
  >
    <input
      id="pdf-file-input"
      type="file"
      accept="application/pdf,.pdf"
      class="hidden"
      onchange={(e) => loadFile((e.target as HTMLInputElement).files?.[0])}
    />
    <i class="fas fa-file-pdf text-5xl text-[var(--color-primary)] opacity-80"></i>
    <div>
      <p class="font-semibold text-base">PDFをドロップまたはクリックして選択</p>
      <p class="text-xs text-[var(--text-muted)] mt-1">PDF ファイルに対応</p>
    </div>
  </div>

{:else}
<!-- ──────────────────────────────────────────────────────────────────────── -->
<!-- File loaded                                                               -->
<!-- ──────────────────────────────────────────────────────────────────────── -->

  <!-- File info bar -->
  <div class="flex items-center gap-3 p-4 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container)]">
    <i class="fas fa-file-pdf text-2xl text-[var(--color-primary)] flex-shrink-0"></i>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold truncate">{fileName}</p>
      <p class="text-xs text-[var(--text-muted)]">{pageCount} ページ</p>
    </div>
    <div class="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
      {#if mode === 'viewer'}
        <button class="btn-tonal text-sm" onclick={() => mode = 'edit'}>
          <i class="fas fa-pen"></i>編集
        </button>
        <button class="btn-outlined text-sm" onclick={() => { showMerge = !showMerge; showSplit = false }}>
          <i class="fas fa-layer-group"></i>結合
        </button>
        <button
          class="btn-outlined text-sm"
          onclick={() => { showSplit = true; showMerge = false }}
          disabled={pageCount < 2}
        >
          <i class="fas fa-scissors"></i>分割
        </button>
        <button class="btn-filled text-sm" onclick={handleDownload}>
          <i class="fas fa-download"></i>DL
        </button>
      {:else}
        <span class="text-xs text-[var(--text-muted)] hidden sm:inline-flex items-center gap-1">
          <i class="fas fa-grip-vertical"></i>ドラッグで並び替え
        </span>
        <button class="btn-filled text-sm" onclick={() => mode = 'viewer'}>
          <i class="fas fa-check"></i>完了
        </button>
      {/if}
    </div>
  </div>

  <!-- サムネイル生成中バナー -->
  {#if loadingMsg}
    <p class="text-xs text-center text-[var(--text-muted)] animate-pulse">{loadingMsg}</p>
  {/if}

  <!-- Page Grid -->
  <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
    {#each pages as page, i (page.id)}
      <div
        class="group relative rounded-xl border overflow-hidden select-none transition-all duration-150
               {(dragging !== null && dragOver === i) || (touchDragIndex !== null && touchDragOverIndex === i)
                 ? 'border-[var(--color-primary)] shadow-[var(--elev-3)] scale-[1.04]'
                 : dragging === i || touchDragIndex === i
                 ? 'opacity-30 border-[var(--outline-variant)]'
                 : mode === 'viewer'
                 ? 'border-[var(--outline-variant)] bg-[var(--surface-container)] hover:shadow-[var(--elev-2)] hover:border-primary cursor-pointer'
                 : 'border-[var(--outline-variant)] bg-[var(--surface-container)] hover:shadow-[var(--elev-2)]'}"
        data-page-idx={i}
        role="button"
        tabindex={mode === 'viewer' ? 0 : -1}
        draggable={mode === 'edit'}
        style={mode === 'edit' ? 'touch-action: none' : ''}
        onclick={() => { if (mode === 'viewer') openPreview(i) }}
        onkeydown={(e) => { if (mode === 'viewer' && (e.key === 'Enter' || e.key === ' ')) openPreview(i) }}
        ondragstart={(e) => onDragStart(e, i)}
        ondragover={(e) => onDragOverPage(e, i)}
        ondrop={(e) => onDropPage(e, i)}
        ondragend={onDragEnd}
        ontouchstart={(e) => onPageTouchstart(e, i)}
        ontouchmove={onPageTouchmove}
        ontouchend={onPageTouchend}
      >
        <!-- Edit mode toolbar -->
        {#if mode === 'edit'}
          <div class="flex items-center justify-between px-1.5 py-1 bg-[var(--surface-variant)]
                      {dragging !== null || touchDragIndex !== null ? 'pointer-events-none' : ''}">
            <i class="fas fa-grip-vertical text-xs text-[var(--text-muted)] cursor-grab px-0.5"></i>
            <div class="flex gap-0.5">
              <button
                class="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] transition-colors"
                onclick={() => rotatePage(page.id, -1)}
                title="左に90°回転"
              >
                <i class="fas fa-rotate-left" style="font-size:10px"></i>
              </button>
              <button
                class="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] transition-colors"
                onclick={() => rotatePage(page.id, 1)}
                title="右に90°回転"
              >
                <i class="fas fa-rotate-right" style="font-size:10px"></i>
              </button>
              <button
                class="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:bg-red-100 hover:text-red-500 transition-colors dark:hover:bg-red-950 disabled:opacity-30 disabled:cursor-not-allowed"
                onclick={() => deletePage(page.id)}
                disabled={pageCount <= 1}
                title="このページを削除"
              >
                <i class="fas fa-trash" style="font-size:10px"></i>
              </button>
            </div>
          </div>
        {/if}

        <!-- Thumbnail -->
        <div class="bg-(--surface-container) relative overflow-hidden" style="aspect-ratio: {getAspectRatio(page)};">
          {#if thumbnails.has(thumbKey(page))}
            <img
              src={thumbnails.get(thumbKey(page))}
              alt="ページ {i + 1}"
              class="w-full h-full object-contain"
            />
          {:else if thumbnails.has(`${page.sourceId}:${page.srcIndex}:0`)}
            <!-- 回転済みキャッシュが未生成の場合は CSS で代用 -->
            <img
              src={thumbnails.get(`${page.sourceId}:${page.srcIndex}:0`)}
              alt="ページ {i + 1}"
              class="w-full h-full object-contain"
              style="transform: rotate({page.rotation}deg); transform-origin: center;"
            />
          {:else}
            <!-- まだレンダリング中 -->
            <div class="w-full h-full flex items-center justify-center bg-[var(--surface-variant)]">
              <i class="fas fa-file-pdf text-2xl text-[var(--text-muted)] opacity-40 animate-pulse"></i>
            </div>
          {/if}

          {#if mode === 'viewer'}
            <div class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors duration-150 pointer-events-none">
              <i class="fas fa-magnifying-glass-plus text-2xl text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 drop-shadow"></i>
            </div>
          {/if}
        </div>

        <!-- Page number -->
        <p class="text-center pb-1.5 font-mono text-[var(--text-muted)]" style="font-size:10px">{i + 1}</p>
      </div>
    {/each}
  </div>

  <!-- Merge Zone -->
  {#if showMerge}
    <div
      class="border-2 border-dashed border-[var(--color-primary)] rounded-2xl p-6 flex flex-col items-center gap-3 text-center bg-[var(--color-primary-light)] transition-colors duration-200"
      ondragover={(e) => e.preventDefault()}
      ondrop={(e) => { e.preventDefault(); mergeFile(e.dataTransfer?.files[0]) }}
      role="region"
      aria-label="PDFを結合"
    >
      <i class="fas fa-layer-group text-3xl text-[var(--color-primary)]"></i>
      <div>
        <p class="text-sm font-semibold text-[var(--color-primary)]">結合するPDFを追加</p>
        <p class="text-xs text-[var(--text-muted)] mt-0.5">現在のページの末尾に追加されます</p>
      </div>
      <label class="btn-tonal cursor-pointer">
        <i class="fas fa-folder-open"></i>ファイルを選択
        <input
          type="file"
          accept="application/pdf,.pdf"
          class="hidden"
          onchange={(e) => mergeFile((e.target as HTMLInputElement).files?.[0])}
        />
      </label>
    </div>
  {/if}

{/if}

<PdfPreviewModal
  {pages}
  {pageCount}
  {thumbnails}
  {previewThumbs}
  bind:previewIndex
  {getAspectRatio}
  {thumbKey}
  {previewThumbKey}
  {ensurePreviewThumb}
  {ensureRotatedThumb}
/>

{#if showSplit}
  <PdfSplitModal
    {pages}
    {pageCount}
    bind:splitAt
    {splitLabel}
    onclose={() => showSplit = false}
    onconfirm={handleSplit}
  />
{/if}
