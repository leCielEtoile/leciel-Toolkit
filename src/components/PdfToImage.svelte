<script lang="ts">
  import FileDropZone from './FileDropZone.svelte'
  import Toast from './Toast.svelte'
  import { toast } from '@/lib/toast.svelte'
  import { openDocument, renderPageToDataUrl } from '@/lib/pdf/pdf-renderer'
  import { convertPdfToImages, type ConvertOptions, type OutputMode, type MergeDirection, type ImageFormat } from '@/lib/pdf/pdf-to-image'

  // ─── 定数 ────────────────────────────────────────────────────
  const RESOLUTION_PRESETS = [
    { label: '低 (72dpi相当)', value: 595 },
    { label: '中 (150dpi相当)', value: 1240 },
    { label: '高 (300dpi相当)', value: 2480 },
    { label: 'カスタム', value: 0 },
  ]

  // ─── 状態 ────────────────────────────────────────────────────
  let file        = $state<File | null>(null)
  let pdfBytes    = $state<Uint8Array | null>(null)
  let totalPages  = $state(0)
  let thumbnails  = $state<string[]>([])
  let loadingPdf  = $state(false)
  let converting  = $state(false)
  let progressCur = $state(0)
  let progressTot = $state(0)

  // 設定
  let mode: OutputMode           = $state('split')
  let direction: MergeDirection  = $state('vertical')
  let format: ImageFormat        = $state('png')
  let quality                    = $state(85)
  let resolutionPreset           = $state(1)   // index in RESOLUTION_PRESETS (default: 中)
  let customWidth                = $state(1240)
  let bgMode                     = $state<'white' | 'transparent' | 'custom'>('white')
  let customColor                = $state('#ffffff')
  let gap                        = $state(20)
  let padding                    = $state(0)
  let usePageRange               = $state(false)
  let rangeStart                 = $state(1)
  let rangeEnd                   = $state(1)

  // 導出
  const targetWidth = $derived(
    RESOLUTION_PRESETS[resolutionPreset].value === 0
      ? customWidth
      : RESOLUTION_PRESETS[resolutionPreset].value
  )
  const bgValue = $derived(
    bgMode === 'transparent' ? 'transparent'
    : bgMode === 'white' ? '#ffffff'
    : customColor
  )
  const canTransparent = $derived(format === 'png')

  // ─── PDF 読み込み ─────────────────────────────────────────────
  async function handleFiles(files: File[]) {
    const f = files[0]
    if (!f || f.type !== 'application/pdf') {
      toast.notify('PDFファイルを選択してください', 'error')
      return
    }
    file = f
    loadingPdf = true
    thumbnails = []
    pdfBytes = null
    totalPages = 0

    try {
      const buf = await f.arrayBuffer()
      pdfBytes = new Uint8Array(buf)
      const doc = await openDocument(pdfBytes)
      totalPages = doc.numPages
      rangeStart = 1
      rangeEnd = totalPages

      // サムネイル生成（最大20枚）
      const previewCount = Math.min(totalPages, 20)
      const thumbs: string[] = []
      for (let i = 0; i < previewCount; i++) {
        const url = await renderPageToDataUrl(doc, i, 180)
        thumbs.push(url)
      }
      thumbnails = thumbs
    } catch (e) {
      toast.notify('PDFの読み込みに失敗しました', 'error')
      console.error(e)
    } finally {
      loadingPdf = false
    }
  }

  // ─── 変換実行 ─────────────────────────────────────────────────
  async function handleConvert() {
    if (!pdfBytes || !file) {
      toast.notify('PDFを選択してください', 'error')
      return
    }

    const opts: ConvertOptions = {
      mode,
      direction,
      pageRange: usePageRange ? { start: rangeStart, end: rangeEnd } : null,
      format,
      quality: quality / 100,
      targetWidth,
      background: bgValue,
      gap,
      padding,
    }

    converting = true
    progressCur = 0
    progressTot = 0

    try {
      const baseName = file.name.replace(/\.pdf$/i, '')
      await convertPdfToImages(pdfBytes, baseName, opts, (p) => {
        progressCur = p.current
        progressTot = p.total
      })
      toast.notify('変換が完了しました', 'success')
    } catch (e) {
      console.error(e)
      toast.notify('変換中にエラーが発生しました', 'error')
    } finally {
      converting = false
    }
  }

  // ─── ページ範囲バリデーション ──────────────────────────────────
  function clampRange() {
    if (rangeStart < 1) rangeStart = 1
    if (rangeStart > totalPages) rangeStart = totalPages
    if (rangeEnd < rangeStart) rangeEnd = rangeStart
    if (rangeEnd > totalPages) rangeEnd = totalPages
  }
</script>

<Toast />

<div class="flex flex-col gap-6">

  <!-- ファイルドロップ -->
  <FileDropZone
    accept="application/pdf"
    onFiles={handleFiles}
    label="PDFファイルをドロップ"
    sublabel="またはクリックして選択（1ファイル）"
  />

  <!-- ファイル情報 -->
  {#if file}
    <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] text-sm">
      <i class="fas fa-file-pdf text-[var(--color-primary)] text-lg"></i>
      <span class="flex-1 truncate font-medium">{file.name}</span>
      {#if totalPages > 0}
        <span class="text-[var(--text-muted)] shrink-0">{totalPages} ページ</span>
      {/if}
    </div>
  {/if}

  <!-- ローディング -->
  {#if loadingPdf}
    <div class="flex items-center justify-center gap-3 py-8 text-[var(--text-muted)]">
      <i class="fas fa-spinner fa-spin"></i>
      <span class="text-sm">PDF を読み込んでいます...</span>
    </div>
  {/if}

  <!-- サムネイル一覧 -->
  {#if thumbnails.length > 0}
    <div>
      <p class="text-xs text-[var(--text-muted)] mb-2">
        プレビュー（最大20ページ）
        {#if totalPages > 20}<span>— 残り {totalPages - 20} ページは省略</span>{/if}
      </p>
      <div class="flex flex-wrap gap-2">
        {#each thumbnails as src, i}
          <div class="relative group">
            <img
              {src}
              alt="ページ {i + 1}"
              class="h-24 w-auto rounded-lg border border-[var(--outline-variant)] object-contain bg-white shadow-sm"
            />
            <span class="absolute bottom-1 right-1 text-[10px] bg-black/50 text-white rounded px-1">{i + 1}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 設定パネル -->
  {#if pdfBytes}
    <div class="flex flex-col gap-5 p-5 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container)]">
      <h3 class="text-sm font-semibold text-[var(--text)]">変換設定</h3>

      <!-- 出力モード -->
      <div class="flex flex-col gap-2">
        <p class="text-xs font-medium text-(--text-muted)">出力モード</p>
        <div class="flex gap-2">
          {#each [{ v: 'split', label: 'ページごとに保存', icon: 'fa-copy' }, { v: 'merge', label: '1枚にまとめる', icon: 'fa-layer-group' }] as opt}
            <button
              type="button"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all duration-150
                {mode === opt.v
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--outline-variant)] text-[var(--text-muted)] hover:border-[var(--color-primary)]'}"
              onclick={() => { mode = opt.v as OutputMode }}
            >
              <i class="fas {opt.icon} text-xs"></i>
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- 並べ方向（merge時のみ） -->
      {#if mode === 'merge'}
        <div class="flex flex-col gap-2">
          <p class="text-xs font-medium text-(--text-muted)">並べ方向</p>
          <div class="flex gap-2">
            {#each [{ v: 'vertical', label: '縦に並べる', icon: 'fa-arrows-alt-v' }, { v: 'horizontal', label: '横に並べる', icon: 'fa-arrows-alt-h' }] as opt}
              <button
                type="button"
                class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all duration-150
                  {direction === opt.v
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--outline-variant)] text-[var(--text-muted)] hover:border-[var(--color-primary)]'}"
                onclick={() => { direction = opt.v as MergeDirection }}
              >
                <i class="fas {opt.icon} text-xs"></i>
                {opt.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- フォーマット -->
      <div class="flex flex-col gap-2">
        <p class="text-xs font-medium text-(--text-muted)">出力フォーマット</p>
        <div class="flex gap-2">
          {#each [{ v: 'png', label: 'PNG' }, { v: 'jpeg', label: 'JPEG' }, { v: 'webp', label: 'WebP' }] as opt}
            <button
              type="button"
              class="flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-all duration-150
                {format === opt.v
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--outline-variant)] text-[var(--text-muted)] hover:border-[var(--color-primary)]'}"
              onclick={() => { format = opt.v as ImageFormat; if (opt.v !== 'png' && bgMode === 'transparent') bgMode = 'white' }}
            >
              {opt.label}
            </button>
          {/each}
        </div>
        <p class="text-[11px] text-[var(--text-muted)]">
          {format === 'png' ? 'PNG — 可逆圧縮・透明背景対応' : format === 'jpeg' ? 'JPEG — 高圧縮・非透明' : 'WebP — 高効率・モダンブラウザ向け'}
        </p>
      </div>

      <!-- 画質（JPEG/WebP） -->
      {#if format !== 'png'}
        <div class="flex flex-col gap-2">
          <div class="flex justify-between">
            <label for="quality-range" class="text-xs font-medium text-(--text-muted)">画質</label>
            <span class="text-xs font-mono text-[var(--color-primary)]">{quality}</span>
          </div>
          <input
            id="quality-range"
            type="range"
            min="1" max="100"
            bind:value={quality}
            class="w-full accent-[var(--color-primary)]"
          />
          <p class="text-[11px] text-[var(--text-muted)]">1（低品質・小サイズ）〜 100（高品質・大サイズ）</p>
        </div>
      {/if}

      <!-- 解像度 -->
      <div class="flex flex-col gap-2">
        <p class="text-xs font-medium text-(--text-muted)">解像度（出力幅）</p>
        <div class="grid grid-cols-2 gap-2">
          {#each RESOLUTION_PRESETS as preset, i}
            <button
              type="button"
              class="py-2 px-3 rounded-xl border text-sm font-medium transition-all duration-150 text-left
                {resolutionPreset === i
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--outline-variant)] text-[var(--text-muted)] hover:border-[var(--color-primary)]'}"
              onclick={() => { resolutionPreset = i }}
            >
              {preset.label}
              {#if preset.value > 0}
                <span class="block text-[10px] opacity-60">{preset.value}px幅</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if resolutionPreset === 3}
          <div class="flex items-center gap-3 mt-1">
            <input
              type="number"
              min="100" max="10000"
              bind:value={customWidth}
              class="w-28 px-3 py-1.5 rounded-lg border border-[var(--outline-variant)] bg-[var(--background)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <span class="text-xs text-[var(--text-muted)]">px幅（高さはアスペクト比に従う）</span>
          </div>
        {/if}
      </div>

      <!-- 背景色 -->
      <div class="flex flex-col gap-2">
        <p class="text-xs font-medium text-(--text-muted)">背景色</p>
        <div class="flex items-center gap-4 flex-wrap">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="bg"
              value="white"
              checked={bgMode === 'white'}
              onchange={() => { bgMode = 'white' }}
              class="accent-[var(--color-primary)]"
            />
            <span class="text-sm text-[var(--text)]">白</span>
            <span class="w-5 h-5 rounded border border-[var(--outline-variant)] bg-white inline-block"></span>
          </label>
          {#if canTransparent}
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bg"
                value="transparent"
                checked={bgMode === 'transparent'}
                onchange={() => { bgMode = 'transparent' }}
                class="accent-[var(--color-primary)]"
              />
              <span class="text-sm text-[var(--text)]">透明</span>
              <span class="w-5 h-5 rounded border border-[var(--outline-variant)] inline-block"
                style="background: repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 8px 8px"></span>
            </label>
          {/if}
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="bg"
              value="custom"
              checked={bgMode === 'custom'}
              onchange={() => { bgMode = 'custom' }}
              class="accent-[var(--color-primary)]"
            />
            <span class="text-sm text-[var(--text)]">カスタム</span>
            <input
              type="color"
              bind:value={customColor}
              onclick={() => { bgMode = 'custom' }}
              class="w-8 h-7 rounded border border-[var(--outline-variant)] cursor-pointer"
            />
          </label>
        </div>
      </div>

      <!-- ページ範囲 -->
      <div class="flex flex-col gap-2">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={usePageRange}
            class="accent-[var(--color-primary)]"
          />
          <span class="text-xs font-medium text-[var(--text-muted)]">ページ範囲を指定</span>
        </label>
        {#if usePageRange}
          <div class="flex items-center gap-3 mt-1">
            <input
              type="number"
              min="1"
              max={totalPages}
              bind:value={rangeStart}
              onchange={clampRange}
              class="w-20 px-3 py-1.5 rounded-lg border border-[var(--outline-variant)] bg-[var(--background)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <span class="text-sm text-[var(--text-muted)]">〜</span>
            <input
              type="number"
              min={rangeStart}
              max={totalPages}
              bind:value={rangeEnd}
              onchange={clampRange}
              class="w-20 px-3 py-1.5 rounded-lg border border-[var(--outline-variant)] bg-[var(--background)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <span class="text-xs text-[var(--text-muted)]">ページ（全{totalPages}ページ）</span>
          </div>
        {/if}
      </div>

      <!-- まとめる時の余白設定 -->
      {#if mode === 'merge'}
        <div class="flex flex-col gap-4 pt-1 border-t border-[var(--outline-variant)]">
          <p class="text-xs font-medium text-[var(--text-muted)] pt-1">まとめる際の余白</p>
          <div class="flex flex-col gap-2">
            <div class="flex justify-between">
              <label for="gap-range" class="text-xs text-(--text-muted)">ページ間余白</label>
              <span class="text-xs font-mono text-[var(--color-primary)]">{gap}px</span>
            </div>
            <input
              id="gap-range"
              type="range"
              min="0" max="200"
              bind:value={gap}
              class="w-full accent-[var(--color-primary)]"
            />
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex justify-between">
              <label for="padding-range" class="text-xs text-(--text-muted)">外側パディング</label>
              <span class="text-xs font-mono text-[var(--color-primary)]">{padding}px</span>
            </div>
            <input
              id="padding-range"
              type="range"
              min="0" max="200"
              bind:value={padding}
              class="w-full accent-[var(--color-primary)]"
            />
          </div>
        </div>
      {/if}
    </div>

    <!-- 変換ボタン / 進捗 -->
    <div class="flex flex-col gap-3">
      <button
        type="button"
        disabled={converting || loadingPdf}
        onclick={handleConvert}
        class="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-semibold text-sm text-white
          bg-[var(--color-primary)] transition-opacity duration-150
          disabled:opacity-40 disabled:cursor-not-allowed
          hover:not-disabled:opacity-90"
      >
        {#if converting}
          <i class="fas fa-spinner fa-spin"></i>
          変換中...
        {:else}
          <i class="fas fa-images"></i>
          変換してダウンロード
        {/if}
      </button>

      {#if converting && progressTot > 0}
        <div class="flex flex-col gap-1.5">
          <div class="flex justify-between text-xs text-[var(--text-muted)]">
            <span>処理中</span>
            <span>{progressCur} / {progressTot} ページ</span>
          </div>
          <div class="w-full h-2 rounded-full bg-[var(--outline-variant)] overflow-hidden">
            <div
              class="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
              style="width: {progressTot > 0 ? Math.round((progressCur / progressTot) * 100) : 0}%"
            ></div>
          </div>
        </div>
      {/if}

      <!-- 補足メモ -->
      <p class="text-[11px] text-[var(--text-muted)] text-center leading-relaxed">
        {mode === 'split' && totalPages > 1
          ? '複数ページは ZIP ファイルでダウンロードされます'
          : mode === 'merge'
          ? '全ページを1枚の画像として結合します'
          : '1ページのみは直接ダウンロードされます'}
      </p>
    </div>
  {/if}

</div>
