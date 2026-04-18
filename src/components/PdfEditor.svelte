<script lang="ts">
  // ─── State ──────────────────────────────────────────────────────────────
  let fileLoaded = $state(false)
  let fileName   = $state('')
  let mode       = $state<'viewer' | 'edit'>('viewer')
  let showMerge  = $state(false)
  let showSplit  = $state(false)
  let splitAt    = $state(3)
  let isDragOver = $state(false)
  let dragging   = $state<number | null>(null)
  let dragOver   = $state<number | null>(null)

  interface Page { id: number; rotation: number }

  let pages = $state<Page[]>([
    { id: 1, rotation: 0 },
    { id: 2, rotation: 0 },
    { id: 3, rotation: 0 },
    { id: 4, rotation: 0 },
    { id: 5, rotation: 0 },
    { id: 6, rotation: 0 },
  ])

  let pageCount  = $derived(pages.length)
  let splitLabel = $derived(
    splitAt > 0 && splitAt < pageCount
      ? `ページ 1–${splitAt} と ページ ${splitAt + 1}–${pageCount} の 2 ファイルに分割`
      : '分割位置を選択してください'
  )

  // ─── Handlers ───────────────────────────────────────────────────────────
  function loadFile(file: File | undefined | null) {
    if (!file) return
    fileName  = file.name
    fileLoaded = true
    mode      = 'viewer'
    showMerge = false
  }

  function mergeFile(file: File | undefined | null) {
    if (!file) return
    const maxId = Math.max(...pages.map(p => p.id))
    pages = [
      ...pages,
      ...Array.from({ length: 4 }, (_, i) => ({ id: maxId + i + 1, rotation: 0 })),
    ]
    showMerge = false
  }

  function deletePage(id: number) {
    pages = pages.filter(p => p.id !== id)
    if (splitAt >= pageCount - 1) splitAt = Math.max(1, pageCount - 2)
  }

  function rotatePage(id: number, dir: 1 | -1) {
    pages = pages.map(p =>
      p.id === id ? { ...p, rotation: (p.rotation + dir * 90 + 360) % 360 } : p
    )
  }

  function onDragStart(e: DragEvent, i: number) {
    dragging = i
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOverPage(e: DragEvent, i: number) {
    e.preventDefault()
    dragOver = i
  }

  function onDropPage(e: DragEvent, i: number) {
    e.preventDefault()
    if (dragging !== null && dragging !== i) {
      const arr = [...pages]
      const [item] = arr.splice(dragging, 1)
      arr.splice(i, 0, item)
      pages = arr
    }
    dragging = null
    dragOver = null
  }

  function onDragEnd() {
    dragging = null
    dragOver = null
  }

  // ─── Preview ────────────────────────────────────────────────────────────
  let previewIndex = $state<number | null>(null)
  let zoom         = $state(1.0)
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

  function openPreview(i: number) { previewIndex = i; resetView() }
  function closePreview()         { previewIndex = null }

  function prevPage() {
    if (previewIndex !== null && previewIndex > 0) { previewIndex--; resetView() }
  }

  function nextPage() {
    if (previewIndex !== null && previewIndex < pageCount - 1) { previewIndex++; resetView() }
  }

  function zoomIn()  { zoom = Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2)) }
  function zoomOut() { zoom = Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2)) }

  function onOverlayMousedown(e: MouseEvent) {
    if ((e.target as Element).closest('button')) return
    isDragging = true
    hasDragged = false
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

  function onOverlayMouseleave() {
    isDragging    = false
    showControls  = false
  }

  function onPreviewKeydown(e: KeyboardEvent) {
    if      (e.key === 'Escape')              closePreview()
    else if (e.key === '+' || e.key === '=')  zoomIn()
    else if (e.key === '-')                   zoomOut()
    else if (e.key === '0')                   resetView()
    else if (e.key === 'ArrowLeft')           prevPage()
    else if (e.key === 'ArrowRight')          nextPage()
  }
</script>

<!-- ──────────────────────────────────────────────────────────────────────── -->
<!-- Thumbnail snippet                                                         -->
<!-- ──────────────────────────────────────────────────────────────────────── -->
{#snippet thumb(pageId: number, rotation: number)}
  {@const pat = (pageId - 1) % 4}
  <svg
    viewBox="0 0 210 297"
    xmlns="http://www.w3.org/2000/svg"
    class="w-full h-full block"
    style="transform: rotate({rotation}deg); transition: transform 0.3s ease; transform-origin: center;"
  >
    <rect width="210" height="297" fill="white" rx="2"/>

    {#if pat === 0}
      <!-- ▸ Title page -->
      <rect x="40"  y="88"  width="130" height="14" rx="4"   fill="#c5b8f8"/>
      <rect x="60"  y="110" width="90"  height="9"  rx="3"   fill="#ddd5fb"/>
      <rect x="75"  y="126" width="60"  height="6"  rx="2"   fill="#ebe7ff"/>
      <rect x="20"  y="205" width="170" height="1"           fill="#ebebeb"/>
      <rect x="65"  y="212" width="80"  height="5"  rx="2"   fill="#e0e0e0"/>
      <rect x="75"  y="223" width="60"  height="4"  rx="2"   fill="#e0e0e0"/>

    {:else if pat === 1}
      <!-- ▸ Text page -->
      <rect x="20" y="22"  width="115" height="9"  rx="3"   fill="#bbb"/>
      <rect x="20" y="44"  width="165" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="57"  width="155" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="70"  width="165" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="83"  width="140" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="96"  width="160" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="109" width="165" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="122" width="150" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="135" width="162" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="157" width="85"  height="8"  rx="2"   fill="#d5d5d5"/>
      <rect x="20" y="177" width="165" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="190" width="148" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="203" width="162" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="216" width="155" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="229" width="165" height="5"  rx="1.5" fill="#e0e0e0"/>

    {:else if pat === 2}
      <!-- ▸ Chart page -->
      <rect x="20" y="22"  width="105" height="8"  rx="3"   fill="#bbb"/>
      <rect x="20" y="40"  width="165" height="5"  rx="1.5" fill="#ebebeb"/>
      <rect x="20" y="51"  width="145" height="5"  rx="1.5" fill="#ebebeb"/>
      <!-- chart area -->
      <rect x="20" y="68"  width="170" height="105" rx="5"  fill="#f0eeff"/>
      <!-- bars -->
      <rect x="28"  y="118" width="18" height="55" rx="3"   fill="#9575cd"/>
      <rect x="52"  y="133" width="18" height="40" rx="3"   fill="#9575cd"/>
      <rect x="76"  y="103" width="18" height="70" rx="3"   fill="#9575cd"/>
      <rect x="100" y="143" width="18" height="30" rx="3"   fill="#9575cd"/>
      <rect x="124" y="120" width="18" height="53" rx="3"   fill="#9575cd"/>
      <rect x="148" y="128" width="18" height="45" rx="3"   fill="#9575cd"/>
      <!-- legend -->
      <rect x="20" y="185" width="165" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="198" width="148" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="211" width="158" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="224" width="140" height="5"  rx="1.5" fill="#e0e0e0"/>

    {:else}
      <!-- ▸ Mixed (text + image) -->
      <rect x="20" y="22"  width="110" height="8"  rx="3"   fill="#bbb"/>
      <rect x="20" y="40"  width="165" height="5"  rx="1.5" fill="#ebebeb"/>
      <rect x="20" y="53"  width="165" height="5"  rx="1.5" fill="#ebebeb"/>
      <rect x="20" y="66"  width="150" height="5"  rx="1.5" fill="#ebebeb"/>
      <rect x="20" y="79"  width="165" height="5"  rx="1.5" fill="#ebebeb"/>
      <!-- image box -->
      <rect x="112" y="102" width="78"  height="72" rx="4"  fill="#e8f0fe"/>
      <rect x="122" y="116" width="58"  height="6"  rx="2"  fill="#c5d8fb"/>
      <rect x="127" y="130" width="48"  height="26" rx="3"  fill="#a8c5f8"/>
      <!-- text beside image -->
      <rect x="20" y="102" width="84"  height="5"  rx="1.5" fill="#ebebeb"/>
      <rect x="20" y="115" width="84"  height="5"  rx="1.5" fill="#ebebeb"/>
      <rect x="20" y="128" width="80"  height="5"  rx="1.5" fill="#ebebeb"/>
      <rect x="20" y="141" width="84"  height="5"  rx="1.5" fill="#ebebeb"/>
      <rect x="20" y="154" width="72"  height="5"  rx="1.5" fill="#ebebeb"/>
      <!-- bottom text -->
      <rect x="20" y="190" width="165" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="203" width="152" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="216" width="160" height="5"  rx="1.5" fill="#e0e0e0"/>
      <rect x="20" y="229" width="145" height="5"  rx="1.5" fill="#e0e0e0"/>
    {/if}

    <!-- footer rule + page number -->
    <rect x="20"  y="278" width="170" height="1"  fill="#ebebeb"/>
    <rect x="92"  y="284" width="26"  height="5"  rx="2"   fill="#e0e0e0"/>
  </svg>
{/snippet}

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
        <button class="btn-filled text-sm">
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

  <!-- Page Grid -->
  <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
    {#each pages as page, i (page.id)}
      <div
        class="relative rounded-xl border overflow-hidden select-none transition-all duration-150
               {dragging !== null && dragOver === i
                 ? 'border-[var(--color-primary)] shadow-[var(--elev-3)] scale-[1.04]'
                 : dragging === i
                 ? 'opacity-30 border-[var(--outline-variant)]'
                 : mode === 'viewer'
                 ? 'border-[var(--outline-variant)] bg-[var(--surface-container)] hover:shadow-[var(--elev-2)] hover:border-primary cursor-pointer'
                 : 'border-[var(--outline-variant)] bg-[var(--surface-container)] hover:shadow-[var(--elev-2)]'}"
        role="button"
        tabindex={mode === 'viewer' ? 0 : -1}
        draggable={mode === 'edit'}
        onclick={() => { if (mode === 'viewer') openPreview(i) }}
        onkeydown={(e) => { if (mode === 'viewer' && (e.key === 'Enter' || e.key === ' ')) openPreview(i) }}
        ondragstart={(e) => onDragStart(e, i)}
        ondragover={(e) => onDragOverPage(e, i)}
        ondrop={(e) => onDropPage(e, i)}
        ondragend={onDragEnd}
      >
        <!-- Edit mode toolbar -->
        {#if mode === 'edit'}
          <div class="flex items-center justify-between px-1.5 py-1 bg-[var(--surface-variant)]">
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
                class="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:bg-red-100 hover:text-red-500 transition-colors dark:hover:bg-red-950"
                onclick={() => deletePage(page.id)}
                title="このページを削除"
              >
                <i class="fas fa-trash" style="font-size:10px"></i>
              </button>
            </div>
          </div>
        {/if}

        <!-- Thumbnail -->
        <div class="aspect-[210/297] p-1.5 bg-[var(--surface-container)]">
          {@render thumb(page.id, page.rotation)}
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
    onkeydown={onPreviewKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="ページ拡大表示"
    tabindex={-1}
  >
    <!-- Prev button -->
    <button
      class="btn-icon fixed left-4 top-1/2 -translate-y-1/2 bg-(--surface-container) shadow-(--elev-2) z-10 disabled:opacity-30"
      onclick={prevPage}
      disabled={previewIndex === 0}
      aria-label="前のページ"
    >
      <i class="fas fa-chevron-left"></i>
    </button>

    <!-- Page display -->
    <div class="min-h-full flex flex-col items-center justify-center gap-2 py-4 px-20">
      <!-- Header -->
      <div class="flex items-center gap-4 text-white">
        <span class="text-sm font-mono opacity-80">{previewIndex + 1} / {pageCount}</span>
        <button
          class="btn-icon text-white hover:bg-white/20"
          onclick={closePreview}
          aria-label="閉じる"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Page (zoom expands container) -->
      <div
        class="rounded-xl shadow-(--elev-3) select-none"
        style="height: calc(90svh * {zoom}); aspect-ratio: 210/297;"
      >
        <div class="w-full h-full">
          {@render thumb(page.id, page.rotation)}
        </div>
      </div>

    </div>

    <!-- Zoom controls (fixed at bottom, shown on hover) -->
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
      class="btn-icon absolute right-4 top-1/2 -translate-y-1/2 bg-(--surface-container) shadow-(--elev-2) z-10 disabled:opacity-30"
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
    role="dialog"
    aria-modal="true"
    aria-label="PDFを分割"
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
          onclick={() => showSplit = false}
          disabled={splitAt <= 0 || splitAt >= pageCount}
        >
          <i class="fas fa-scissors"></i>分割してDL
        </button>
      </div>

    </div>
  </div>
{/if}
