<script lang="ts">
  import type { PDFDocumentProxy } from 'pdfjs-dist'
  import { initRenderer, openDocument, renderPageToDataUrl } from '@/lib/pdf/pdf-renderer'
  import {
    type SourcePdf, type PageDescriptor,
    getPageCount, buildPdf, splitPdf, downloadBytes,
  } from '@/lib/pdf/pdf-engine'

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
  let rendererReady = $state(false)
  $effect(() => {
    initRenderer().then(() => { rendererReady = true })
  })

  // ─── Load PDF ────────────────────────────────────────────────────────────
  async function loadFile(file: File | undefined | null) {
    if (!file) return
    loading    = true
    loadingMsg = 'PDFを読み込み中…'
    try {
      const bytes   = new Uint8Array(await file.arrayBuffer())
      const srcId   = 'src-0'
      sources       = new Map([[srcId, { id: srcId, bytes }]])

      const count   = await getPageCount(bytes)
      pages         = Array.from({ length: count }, (_, i) => ({
        id: nextId(), sourceId: srcId, srcIndex: i, rotation: 0,
      }))
      splitAt       = Math.max(1, Math.floor(count / 2))
      fileName      = file.name
      fileLoaded    = true
      mode          = 'viewer'
      showMerge     = false
      showSplit     = false
      thumbnails    = new Map()

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
      const url  = await renderPageToDataUrl(doc, i, 200)
      // rotation 0 のキャッシュを格納（回転は各 rotation ごとにキャッシュ）
      thumbnails = new Map(thumbnails).set(`${srcId}:${i}:0`, url)
    }
    loadingMsg = ''
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

      const count  = await getPageCount(bytes)
      const newPages: PageDescriptor[] = Array.from({ length: count }, (_, i) => ({
        id: nextId(), sourceId: srcId, srcIndex: i, rotation: 0,
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
  let previewIndex  = $state<number | null>(null)
  let zoom          = $state(1.0)
  let overlayEl     = $state<HTMLDivElement | null>(null)
  let isDragging    = $state(false)
  let showControls  = $state(false)
  let hasDragged    = false
  let dragStart     = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 }

  const ZOOM_MIN  = 0.5
  const ZOOM_MAX  = 3.0
  const ZOOM_STEP = 0.25

  function resetView() {
    zoom = 1.0
    if (overlayEl) { overlayEl.scrollLeft = 0; overlayEl.scrollTop = 0 }
  }
  function openPreview(i: number) {
    previewIndex = i; resetView(); showControls = true
    // プレビュー表示時に回転済みサムネイルを確保
    const p = pages[i]
    if (p) ensureRotatedThumb(p)
  }
  function closePreview()  { previewIndex = null }
  function prevPage() { if (previewIndex !== null && previewIndex > 0) { previewIndex--; resetView(); const p = pages[previewIndex]; if (p) ensureRotatedThumb(p) } }
  function nextPage() { if (previewIndex !== null && previewIndex < pageCount - 1) { previewIndex++; resetView(); const p = pages[previewIndex]; if (p) ensureRotatedThumb(p) } }

  function zoomIn()  { zoom = Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2)) }
  function zoomOut() { zoom = Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2)) }

  function onOverlayMousedown(e: MouseEvent) {
    if ((e.target as Element).closest('button')) return
    isDragging = true; hasDragged = false
    dragStart  = { x: e.clientX, y: e.clientY, scrollLeft: overlayEl!.scrollLeft, scrollTop: overlayEl!.scrollTop }
    e.preventDefault()
  }
  function onOverlayMousemove(e: MouseEvent) {
    if (!isDragging || !overlayEl) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true
    overlayEl.scrollLeft = dragStart.scrollLeft - dx
    overlayEl.scrollTop  = dragStart.scrollTop  - dy
  }
  function onOverlayMouseup(e: MouseEvent) {
    isDragging = false
    if (!hasDragged && e.target === overlayEl) closePreview()
  }
  function onOverlayMouseleave() { isDragging = false; showControls = false }
  function onOverlayTouchstart()  { showControls = true }

  function onPreviewKeydown(e: KeyboardEvent) {
    if      (e.key === 'Escape')             closePreview()
    else if (e.key === '+' || e.key === '=') zoomIn()
    else if (e.key === '-')                  zoomOut()
    else if (e.key === '0')                  resetView()
    else if (e.key === 'ArrowLeft')          prevPage()
    else if (e.key === 'ArrowRight')         nextPage()
  }
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
        <div class="aspect-[210/297] bg-[var(--surface-container)] relative overflow-hidden">
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

<!-- ──────────────────────────────────────────────────────────────────────── -->
<!-- Preview Modal                                                             -->
<!-- ──────────────────────────────────────────────────────────────────────── -->
{#if previewIndex !== null}
  {@const page = pages[previewIndex]}
  <div
    bind:this={overlayEl}
    class="fixed inset-0 bg-black/70 overflow-auto z-50
           {isDragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-default'}"
    onmouseenter={() => showControls = true}
    onmousedown={onOverlayMousedown}
    onmousemove={onOverlayMousemove}
    onmouseup={onOverlayMouseup}
    onmouseleave={onOverlayMouseleave}
    ontouchstart={onOverlayTouchstart}
    onkeydown={onPreviewKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="ページ拡大表示"
    tabindex={-1}
  >
    <!-- Prev button -->
    <button
      class="btn-icon fixed left-4 top-1/2 -translate-y-1/2 bg-(--surface-container) shadow-(--elev-2) z-60 disabled:opacity-30 transition-opacity duration-200
             {showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
      onclick={prevPage}
      disabled={previewIndex === 0}
      aria-label="前のページ"
    >
      <i class="fas fa-chevron-left"></i>
    </button>

    <!-- Page display -->
    <div class="min-h-full flex items-center justify-center py-4 px-20">
      <div
        class="rounded-xl shadow-(--elev-3) select-none overflow-hidden"
        style="height: calc(90svh * {zoom}); aspect-ratio: 210/297;"
      >
        {#if thumbnails.has(thumbKey(page))}
          <img
            src={thumbnails.get(thumbKey(page))}
            alt="ページ {previewIndex + 1}"
            class="w-full h-full object-contain bg-white"
          />
        {:else if thumbnails.has(`${page.sourceId}:${page.srcIndex}:0`)}
          <img
            src={thumbnails.get(`${page.sourceId}:${page.srcIndex}:0`)}
            alt="ページ {previewIndex + 1}"
            class="w-full h-full object-contain bg-white"
            style="transform: rotate({page.rotation}deg); transform-origin: center;"
          />
        {:else}
          <div class="w-full h-full flex items-center justify-center bg-white">
            <i class="fas fa-file-pdf text-4xl text-[var(--text-muted)] opacity-30 animate-pulse"></i>
          </div>
        {/if}
      </div>
    </div>

    <!-- Header: page counter + close (fixed top) -->
    <div
      class="fixed top-4 left-1/2 -translate-x-1/2 z-60 flex items-center gap-3 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 text-white transition-opacity duration-200
             {showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
    >
      <span class="text-sm font-mono">{previewIndex + 1} / {pageCount}</span>
      <button
        class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
        onclick={closePreview}
        aria-label="閉じる"
      >
        <i class="fas fa-times text-xs"></i>
      </button>
    </div>

    <!-- Zoom controls (fixed at bottom) -->
    <div
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-60 flex flex-col items-center gap-1.5 transition-opacity duration-200
             {showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
    >
      <div class="flex items-center gap-1 bg-black/60 rounded-full px-3 py-1.5 backdrop-blur-sm">
        <button
          class="w-7 h-7 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors disabled:opacity-30"
          onclick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          aria-label="縮小"
        >
          <i class="fas fa-minus text-xs"></i>
        </button>
        <button
          class="text-xs text-white font-mono w-12 text-center hover:text-white/70 transition-colors"
          onclick={resetView}
          title="クリックで 100% にリセット"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          class="w-7 h-7 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors disabled:opacity-30"
          onclick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          aria-label="拡大"
        >
          <i class="fas fa-plus text-xs"></i>
        </button>
      </div>
      <p class="text-white/40 text-xs">← → ページ移動　± ズーム　0 でリセット　ドラッグで移動　Esc で閉じる</p>
    </div>

    <!-- Next button -->
    <button
      class="btn-icon fixed right-4 top-1/2 -translate-y-1/2 bg-(--surface-container) shadow-(--elev-2) z-60 disabled:opacity-30 transition-opacity duration-200
             {showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
      onclick={nextPage}
      disabled={previewIndex === pageCount - 1}
      aria-label="次のページ"
    >
      <i class="fas fa-chevron-right"></i>
    </button>
  </div>
{/if}

<!-- ──────────────────────────────────────────────────────────────────────── -->
<!-- Split Modal                                                               -->
<!-- ──────────────────────────────────────────────────────────────────────── -->
{#if showSplit}
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showSplit = false }}
    onkeydown={(e) => { if (e.key === 'Escape') showSplit = false }}
    role="dialog"
    aria-modal="true"
    aria-label="PDFを分割"
    tabindex={-1}
  >
    <div class="bg-[var(--surface-container)] rounded-2xl shadow-[var(--elev-3)] w-full max-w-lg">

      <!-- Modal header -->
      <div class="flex items-center justify-between p-5 border-b border-[var(--outline-variant)]">
        <div>
          <h2 class="text-base font-semibold">PDFを分割</h2>
          <p class="text-xs text-[var(--text-muted)] mt-0.5">区切り線をクリックして分割位置を指定</p>
        </div>
        <button class="btn-icon" onclick={() => showSplit = false} aria-label="閉じる">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Page selector -->
      <div class="p-5">
        <div class="relative">
        <div class="flex items-stretch gap-0 overflow-x-auto pb-2">
          {#each pages as page, i (page.id)}
            <!-- Page box -->
            <div class="flex-shrink-0 flex flex-col items-center gap-1">
              <div
                class="w-9 h-12 rounded border-2 flex items-center justify-center font-mono text-[11px] font-bold transition-all duration-150
                       {i < splitAt
                         ? 'bg-[var(--color-primary-light)] border-[var(--color-primary)] text-[var(--color-primary)]'
                         : 'bg-white border-[var(--outline-variant)] text-[var(--text-muted)]'}"
              >
                {i + 1}
              </div>
            </div>

            <!-- Divider button (between pages) -->
            {#if i < pages.length - 1}
              <button
                class="flex-shrink-0 flex items-center justify-center w-5 h-12 group relative"
                onclick={() => splitAt = i + 1}
                title="ページ {i + 1} と {i + 2} の間で分割"
              >
                <div
                  class="rounded-full transition-all duration-150
                         {splitAt === i + 1
                           ? 'w-1 h-full bg-[var(--color-primary)]'
                           : 'w-px h-full bg-[var(--outline-variant)] group-hover:w-1 group-hover:bg-[var(--color-primary)]'}"
                ></div>
              </button>
            {/if}
          {/each}
        </div>
        <!-- Right fade: scroll hint -->
        <div class="absolute right-0 top-0 bottom-2 w-10 bg-gradient-to-l from-[var(--surface-container)] to-transparent pointer-events-none"></div>
        </div>

        <!-- Legend -->
        <div class="flex gap-4 text-xs mt-3">
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm border-2 border-[var(--color-primary)] bg-[var(--color-primary-light)] inline-block"></span>
            <span class="text-[var(--text-muted)]">ファイル 1（{splitAt} ページ）</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm border-2 border-[var(--outline-variant)] bg-white inline-block"></span>
            <span class="text-[var(--text-muted)]">ファイル 2（{pageCount - splitAt} ページ）</span>
          </span>
        </div>

        <p class="text-sm font-medium text-[var(--on-surface)] mt-3">{splitLabel}</p>
      </div>

      <!-- Modal footer -->
      <div class="flex justify-end gap-2 p-5 pt-0">
        <button class="btn-outlined" onclick={() => showSplit = false}>キャンセル</button>
        <button
          class="btn-filled"
          onclick={handleSplit}
          disabled={splitAt <= 0 || splitAt >= pageCount}
        >
          <i class="fas fa-scissors"></i>分割してDL
        </button>
      </div>

    </div>
  </div>
{/if}
