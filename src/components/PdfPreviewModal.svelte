<script lang="ts">
  import type { PageDescriptor } from '@/lib/pdf/pdf-engine'

  interface Props {
    pages:              PageDescriptor[]
    pageCount:          number
    thumbnails:         Map<string, string>
    previewThumbs:      Map<string, string>
    previewIndex:       number | null
    getAspectRatio:     (p: PageDescriptor) => string
    thumbKey:           (p: PageDescriptor) => string
    previewThumbKey:    (p: PageDescriptor) => string
    ensurePreviewThumb: (p: PageDescriptor) => Promise<void>
    ensureRotatedThumb: (p: PageDescriptor) => Promise<void>
  }

  let {
    pages, pageCount, thumbnails, previewThumbs,
    previewIndex = $bindable(),
    getAspectRatio, thumbKey, previewThumbKey,
    ensurePreviewThumb, ensureRotatedThumb,
  }: Props = $props()

  // ─── ズーム・ドラッグ内部状態 ─────────────────────────────────
  let zoom         = $state(1.0)
  let overlayEl    = $state<HTMLDivElement | null>(null)
  let isDragging   = $state(false)
  let showControls = $state(false)
  let hasDragged   = false
  let dragStart    = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 }

  const ZOOM_MIN  = 0.5
  const ZOOM_MAX  = 3.0
  const ZOOM_STEP = 0.25

  // ─── 開閉・ページ移動 ─────────────────────────────────────────
  function closePreview() { previewIndex = null }

  function resetView() {
    zoom = 1.0
    if (overlayEl) { overlayEl.scrollLeft = 0; overlayEl.scrollTop = 0 }
  }

  function prevPage() {
    if (previewIndex !== null && previewIndex > 0) {
      previewIndex--; resetView()
    }
  }

  function nextPage() {
    if (previewIndex !== null && previewIndex < pageCount - 1) {
      previewIndex++; resetView()
    }
  }

  // ─── ズーム ───────────────────────────────────────────────────
  function zoomIn()  { zoom = Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2)) }
  function zoomOut() { zoom = Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2)) }

  // ─── ドラッグパン ─────────────────────────────────────────────
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

  // ─── キーボード ───────────────────────────────────────────────
  function onPreviewKeydown(e: KeyboardEvent) {
    if      (e.key === 'Escape')             closePreview()
    else if (e.key === '+' || e.key === '=') zoomIn()
    else if (e.key === '-')                  zoomOut()
    else if (e.key === '0')                  resetView()
    else if (e.key === 'ArrowLeft')          prevPage()
    else if (e.key === 'ArrowRight')         nextPage()
  }

  // ─── previewIndex が変わったらサムネイルを準備してフォーカス ──
  $effect(() => {
    if (previewIndex !== null) {
      showControls = true
      const p = pages[previewIndex]
      if (p) {
        ensureRotatedThumb(p)
        ensurePreviewThumb(p)
      }
      overlayEl?.focus()
    }
  })
</script>

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
        style="height: calc(90svh * {zoom}); aspect-ratio: {getAspectRatio(page)};"
      >
        {#if previewThumbs.has(previewThumbKey(page))}
          <img
            src={previewThumbs.get(previewThumbKey(page))}
            alt="ページ {previewIndex + 1}"
            class="w-full h-full object-contain bg-white"
          />
        {:else if thumbnails.has(thumbKey(page))}
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

    <!-- Header: page counter + close -->
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

    <!-- Zoom controls -->
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
