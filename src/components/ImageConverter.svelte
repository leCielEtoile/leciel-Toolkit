<script lang="ts">
  import FileDropZone from './FileDropZone.svelte'
  import {
    initVips, convertImage,
    DEFAULT_OPTIONS,
    type OutputFormat, type JpegSubsample, type TiffCompression, type ResizeMode,
    type ConvertOptions, type ConvertResult,
  } from '@/lib/image-converter/converter'

  // ─── プリセット型 ────────────────────────────────────────────
  interface Preset {
    id: string
    name: string
    opts: ConvertOptions
  }

  const STORAGE_KEY = 'imageConverter_presets'

  function loadPresets(): Preset[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    } catch { return [] }
  }

  function savePresetsToStorage(list: Preset[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  }

  // ─── ファイル型 ──────────────────────────────────────────────
  type FileStatus = 'pending' | 'converting' | 'done' | 'error'

  interface FileEntry {
    file: File
    status: FileStatus
    error?: string
    result?: ConvertResult
  }

  // ─── 状態 ────────────────────────────────────────────────────
  let opts       = $state<ConvertOptions>({ ...DEFAULT_OPTIONS })
  let presets    = $state<Preset[]>(loadPresets())
  let entries    = $state<FileEntry[]>([])
  let vipsLoading = $state(false)
  let vipsReady   = $state(false)
  let message     = $state<{ text: string; type: 'success' | 'error' } | null>(null)
  let msgTimer    = $state<ReturnType<typeof setTimeout> | null>(null)

  // プリセット保存UI
  let showPresetInput = $state(false)
  let presetName      = $state('')
  let presetInputEl   = $state<HTMLInputElement | null>(null)

  // 詳細設定パネル開閉
  let settingsOpen = $state(true)

  // ─── 定数 ────────────────────────────────────────────────────
  const FORMAT_OPTIONS: { value: OutputFormat; label: string; desc: string }[] = [
    { value: 'jpeg', label: 'JPEG', desc: '写真・幅広い互換性' },
    { value: 'png',  label: 'PNG',  desc: '可逆圧縮・透過対応' },
    { value: 'webp', label: 'WebP', desc: '高効率・モダンブラウザ' },
    { value: 'avif', label: 'AVIF', desc: '最高圧縮・次世代' },
    { value: 'tiff', label: 'TIFF', desc: '印刷・業務向け' },
  ]

  const BUILT_IN_PRESETS: { name: string; opts: Partial<ConvertOptions> }[] = [
    {
      name: '高品質',
      opts: { format: 'webp', quality: 95, webpLossless: false, webpMethod: 6, stripMetadata: false },
    },
    {
      name: '効率重視',
      opts: { format: 'webp', quality: 65, webpLossless: false, webpMethod: 2, stripMetadata: true },
    },
    {
      name: 'ロスレス',
      opts: { format: 'webp', quality: 100, webpLossless: true, webpMethod: 6, stripMetadata: false },
    },
    {
      name: 'Web 最適化',
      opts: { format: 'avif', quality: 60, avifLossless: false, avifSpeed: 4, stripMetadata: true },
    },
    {
      name: 'PNG 高圧縮',
      opts: { format: 'png', pngCompression: 9, stripMetadata: true },
    },
  ]

  // ─── ユーティリティ ──────────────────────────────────────────
  function notify(text: string, type: 'success' | 'error' = 'success') {
    if (msgTimer) clearTimeout(msgTimer)
    message = { text, type }
    msgTimer = setTimeout(() => { message = null }, 5000)
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function sizeRatio(original: number, converted: number): string {
    const ratio = converted / original
    if (ratio < 1) return `▼ ${((1 - ratio) * 100).toFixed(0)}%`
    return `▲ ${((ratio - 1) * 100).toFixed(0)}%`
  }

  function sizeRatioClass(original: number, converted: number): string {
    return converted < original ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
  }

  // ─── vips 初期化 ─────────────────────────────────────────────
  async function ensureVips() {
    if (vipsReady) return
    vipsLoading = true
    try {
      await initVips()
      vipsReady = true
    } catch (e) {
      notify(`wasm-vips の初期化に失敗しました: ${(e as Error).message}`, 'error')
      throw e
    } finally {
      vipsLoading = false
    }
  }

  // ─── ファイル操作 ────────────────────────────────────────────
  function handleFiles(files: File[]) {
    entries = [...entries, ...files.map((file) => ({ file, status: 'pending' as FileStatus }))]
  }

  async function convertAll() {
    const pending = entries.filter((e) => e.status === 'pending' || e.status === 'error')
    if (pending.length === 0) { notify('変換するファイルがありません', 'error'); return }

    try { await ensureVips() } catch { return }

    for (const entry of pending) {
      const idx = entries.indexOf(entry)
      entries[idx] = { ...entries[idx], status: 'converting' }
      try {
        const result = await convertImage(entry.file, opts)
        entries[idx] = { ...entries[idx], status: 'done', result }
      } catch (e) {
        entries[idx] = { ...entries[idx], status: 'error', error: (e as Error).message }
      }
    }

    const doneCount = entries.filter((e) => e.status === 'done').length
    notify(`${doneCount} 件の変換が完了しました`)
  }

  function downloadOne(entry: FileEntry) {
    if (!entry.result) return
    const url = URL.createObjectURL(entry.result.blob)
    const a = document.createElement('a')
    a.href = url; a.download = entry.result.filename; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadAll() {
    entries.filter((e) => e.status === 'done').forEach(downloadOne)
  }

  function removeEntry(idx: number) {
    entries = entries.filter((_, i) => i !== idx)
  }

  function clearAll() { entries = [] }

  // ─── プリセット操作 ──────────────────────────────────────────
  function applyBuiltIn(partial: Partial<ConvertOptions>) {
    opts = { ...DEFAULT_OPTIONS, ...partial }
  }

  function applyPreset(preset: Preset) {
    opts = { ...preset.opts }
  }

  function openPresetInput() {
    showPresetInput = true
    presetName = ''
    // 次フレームでフォーカス
    setTimeout(() => presetInputEl?.focus(), 50)
  }

  function savePreset() {
    const name = presetName.trim()
    if (!name) return
    const newPreset: Preset = {
      id: crypto.randomUUID(),
      name,
      opts: { ...opts },
    }
    presets = [...presets, newPreset]
    savePresetsToStorage(presets)
    showPresetInput = false
    presetName = ''
    notify(`プリセット「${name}」を保存しました`)
  }

  function deletePreset(id: string) {
    presets = presets.filter((p) => p.id !== id)
    savePresetsToStorage(presets)
  }

  function handlePresetKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') savePreset()
    if (e.key === 'Escape') { showPresetInput = false }
  }

  // ─── 派生状態 ────────────────────────────────────────────────
  let isLossless    = $derived(
    (opts.format === 'webp' && opts.webpLossless) ||
    (opts.format === 'avif' && opts.avifLossless)
  )
  let showQuality   = $derived(opts.format !== 'tiff' && !isLossless)
  let hasPending = $derived(entries.some((e) => e.status === 'pending' || e.status === 'error'))
  let hasDone    = $derived(entries.some((e) => e.status === 'done'))
</script>

<div class="flex flex-col gap-5">

  <!-- メッセージ -->
  {#if message}
    <div class="msg-animate px-4 py-3 rounded-2xl text-sm font-medium border
      {message.type === 'success'
        ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
        : 'bg-[var(--error-bg)] text-[var(--error-text)] border-[var(--error-border)]'}">
      {message.text}
    </div>
  {/if}

  <!-- ファイル選択 -->
  <FileDropZone
    accept=".jpg,.jpeg,.png,.webp,.avif,.tiff,.tif,.gif,.svg,.bmp"
    multiple
    onFiles={handleFiles}
    label="変換する画像をドロップ"
    sublabel="JPEG・PNG・WebP・AVIF・TIFF・GIF・SVG・BMP に対応"
  />

  <!-- ═══ 変換設定 ══════════════════════════════════════════════ -->
  <section class="m3-card overflow-hidden">

    <!-- ヘッダー（開閉） -->
    <button
      onclick={() => settingsOpen = !settingsOpen}
      class="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer bg-transparent border-0"
    >
      <span class="section-heading">変換設定</span>
      <i class="fas fa-chevron-{settingsOpen ? 'up' : 'down'} text-xs text-[var(--text-muted)] transition-transform duration-200"></i>
    </button>

    {#if settingsOpen}
      <div class="px-5 pb-5 flex flex-col gap-5">

        <!-- ── ビルトインプリセット ────────────────────────────── -->
        <div>
          <p class="text-xs font-medium text-[var(--text-muted)] mb-2">クイックプリセット</p>
          <div class="flex flex-wrap gap-2">
            {#each BUILT_IN_PRESETS as bp}
              <button
                onclick={() => applyBuiltIn(bp.opts)}
                class="px-3 py-1 rounded-full text-xs font-medium border border-[var(--outline-variant)] text-[var(--text-muted)] bg-transparent hover:bg-[var(--color-primary-light)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              >{bp.name}</button>
            {/each}
          </div>
        </div>

        <!-- ── ユーザープリセット ─────────────────────────────── -->
        {#if presets.length > 0 || showPresetInput}
          <div>
            <p class="text-xs font-medium text-[var(--text-muted)] mb-2">保存済みプリセット</p>
            <div class="flex flex-wrap gap-2">
              {#each presets as preset}
                <div class="group flex items-center gap-0.5 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-light)] overflow-hidden">
                  <button
                    onclick={() => applyPreset(preset)}
                    class="px-3 py-1 text-xs font-medium text-[var(--color-primary)] bg-transparent border-0 cursor-pointer hover:brightness-90"
                  >{preset.name}</button>
                  <button
                    onclick={() => deletePreset(preset.id)}
                    aria-label="削除"
                    class="pr-2 text-[var(--color-primary)] opacity-50 hover:opacity-100 bg-transparent border-0 cursor-pointer text-xs"
                  ><i class="fas fa-times"></i></button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- プリセット保存入力 -->
        {#if showPresetInput}
          <div class="flex items-center gap-2">
            <input
              bind:this={presetInputEl}
              bind:value={presetName}
              onkeydown={handlePresetKeydown}
              placeholder="プリセット名を入力…"
              class="flex-1 rounded-xl border border-[var(--border-focus)] bg-[var(--background)] text-[var(--text)] px-3 py-1.5 text-sm focus:outline-none"
            />
            <button onclick={savePreset} class="btn-filled text-sm px-4 py-1.5">保存</button>
            <button onclick={() => showPresetInput = false} class="btn-outlined text-sm px-3 py-1.5">キャンセル</button>
          </div>
        {:else}
          <button onclick={openPresetInput} class="btn-text text-xs self-start px-2 py-1">
            <i class="fas fa-bookmark"></i> 現在の設定をプリセット保存
          </button>
        {/if}

        <!-- ── 出力フォーマット ────────────────────────────────── -->
        <div>
          <p class="text-xs font-medium text-[var(--text-muted)] mb-2">出力フォーマット</p>
          <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {#each FORMAT_OPTIONS as fmt}
              <button
                onclick={() => { opts.format = fmt.value }}
                title={fmt.desc}
                class="flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-xs font-medium border transition-colors cursor-pointer
                  {opts.format === fmt.value
                    ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                    : 'border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--color-primary-light)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'}"
              >
                <span class="font-bold">{fmt.label}</span>
                <span class="text-[10px] opacity-70 leading-tight text-center hidden sm:block">{fmt.desc}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- ── 品質（共通） ───────────────────────────────────── -->
        {#if showQuality}
          <div>
            <label class="flex items-center justify-between text-xs font-medium text-[var(--text-muted)] mb-2">
              <span>品質</span>
              <span class="font-mono text-[var(--color-primary)] text-sm">{opts.quality}</span>
            </label>
            <input type="range" min="1" max="100" step="1"
              bind:value={opts.quality}
              class="w-full accent-[var(--color-primary)]"
            />
            <div class="flex justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
              <span>小ファイル (1)</span>
              <span>高品質 (100)</span>
            </div>
          </div>
        {/if}

        <!-- ── JPEG 設定 ──────────────────────────────────────── -->
        {#if opts.format === 'jpeg'}
          <div class="flex flex-col gap-3 rounded-xl bg-[var(--surface-variant)] p-3">
            <p class="text-xs font-semibold text-[var(--text-muted)]">JPEG 詳細設定</p>

            <label class="flex items-center justify-between text-sm cursor-pointer select-none">
              <span>プログレッシブ JPEG</span>
              <input type="checkbox" bind:checked={opts.jpegProgressive} class="accent-[var(--color-primary)]" />
            </label>

            <div>
              <p class="text-xs text-[var(--text-muted)] mb-1.5">色差サブサンプリング</p>
              <div class="flex gap-2 flex-wrap">
                {#each (['auto', '4:4:4', '4:2:2', '4:2:0'] as JpegSubsample[]) as sub}
                  <button
                    onclick={() => { opts.jpegSubsample = sub }}
                    class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer
                      {opts.jpegSubsample === sub
                        ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                        : 'border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--color-primary-light)]'}"
                  >{sub === 'auto' ? '自動' : sub}</button>
                {/each}
              </div>
              <p class="text-[10px] text-[var(--text-muted)] mt-1">4:4:4 = 最高品質 / 4:2:0 = 小サイズ</p>
            </div>
          </div>
        {/if}

        <!-- ── PNG 設定 ───────────────────────────────────────── -->
        {#if opts.format === 'png'}
          <div class="flex flex-col gap-3 rounded-xl bg-[var(--surface-variant)] p-3">
            <p class="text-xs font-semibold text-[var(--text-muted)]">PNG 詳細設定</p>

            <div>
              <label class="flex items-center justify-between text-xs font-medium text-[var(--text-muted)] mb-2">
                <span>圧縮レベル</span>
                <span class="font-mono text-[var(--color-primary)] text-sm">{opts.pngCompression}</span>
              </label>
              <input type="range" min="0" max="9" step="1"
                bind:value={opts.pngCompression}
                class="w-full accent-[var(--color-primary)]"
              />
              <div class="flex justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
                <span>速い (0)</span>
                <span>最大圧縮 (9)</span>
              </div>
            </div>

            <label class="flex items-center justify-between text-sm cursor-pointer select-none">
              <span>インターレース (Adam7)</span>
              <input type="checkbox" bind:checked={opts.pngInterlace} class="accent-[var(--color-primary)]" />
            </label>
          </div>
        {/if}

        <!-- ── WebP 設定 ──────────────────────────────────────── -->
        {#if opts.format === 'webp'}
          <div class="flex flex-col gap-3 rounded-xl bg-[var(--surface-variant)] p-3">
            <p class="text-xs font-semibold text-[var(--text-muted)]">WebP 詳細設定</p>

            <label class="flex items-center justify-between text-sm cursor-pointer select-none">
              <span>ロスレスモード</span>
              <input type="checkbox" bind:checked={opts.webpLossless} class="accent-[var(--color-primary)]" />
            </label>

            <div>
              <label class="flex items-center justify-between text-xs font-medium text-[var(--text-muted)] mb-2">
                <span>エンコード品質 (Method)</span>
                <span class="font-mono text-[var(--color-primary)] text-sm">{opts.webpMethod}</span>
              </label>
              <input type="range" min="0" max="6" step="1"
                bind:value={opts.webpMethod}
                class="w-full accent-[var(--color-primary)]"
              />
              <div class="flex justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
                <span>速い (0)</span>
                <span>高品質 (6)</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- ── AVIF 設定 ──────────────────────────────────────── -->
        {#if opts.format === 'avif'}
          <div class="flex flex-col gap-3 rounded-xl bg-[var(--surface-variant)] p-3">
            <p class="text-xs font-semibold text-[var(--text-muted)]">AVIF 詳細設定</p>

            <label class="flex items-center justify-between text-sm cursor-pointer select-none">
              <span>ロスレスモード</span>
              <input type="checkbox" bind:checked={opts.avifLossless} class="accent-[var(--color-primary)]" />
            </label>

            <div>
              <label class="flex items-center justify-between text-xs font-medium text-[var(--text-muted)] mb-2">
                <span>エンコード速度</span>
                <span class="font-mono text-[var(--color-primary)] text-sm">{opts.avifSpeed}</span>
              </label>
              <input type="range" min="0" max="8" step="1"
                bind:value={opts.avifSpeed}
                class="w-full accent-[var(--color-primary)]"
              />
              <div class="flex justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
                <span>最高品質/遅い (0)</span>
                <span>速い/低品質 (8)</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- ── TIFF 設定 ──────────────────────────────────────── -->
        {#if opts.format === 'tiff'}
          <div class="flex flex-col gap-3 rounded-xl bg-[var(--surface-variant)] p-3">
            <p class="text-xs font-semibold text-[var(--text-muted)]">TIFF 詳細設定</p>

            <div>
              <p class="text-xs text-[var(--text-muted)] mb-1.5">圧縮方式</p>
              <div class="flex gap-2 flex-wrap">
                {#each (['none', 'lzw', 'deflate', 'jpeg'] as TiffCompression[]) as comp}
                  <button
                    onclick={() => { opts.tiffCompression = comp }}
                    class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer
                      {opts.tiffCompression === comp
                        ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                        : 'border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--color-primary-light)]'}"
                  >{comp === 'none' ? 'なし' : comp.toUpperCase()}</button>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- ── リサイズ ────────────────────────────────────────── -->
        <div class="flex flex-col gap-3">
          <label class="flex items-center justify-between text-sm cursor-pointer select-none">
            <span class="font-medium">リサイズ</span>
            <input type="checkbox" bind:checked={opts.resizeEnabled} class="accent-[var(--color-primary)]" />
          </label>

          {#if opts.resizeEnabled}
            <div class="rounded-xl bg-[var(--surface-variant)] p-3 flex flex-col gap-3">
              <div>
                <p class="text-xs text-[var(--text-muted)] mb-1.5">モード</p>
                <div class="flex gap-2 flex-wrap">
                  {#each ([
                    { value: 'width',  label: '幅指定',    hint: '高さ自動' },
                    { value: 'height', label: '高さ指定',  hint: '幅自動' },
                    { value: 'fit',    label: '収める',    hint: '両辺以内' },
                    { value: 'cover',  label: 'カバー',    hint: '中央クロップ' },
                  ] as { value: ResizeMode; label: string; hint: string }[]) as m}
                    <button
                      onclick={() => { opts.resizeMode = m.value }}
                      title={m.hint}
                      class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer
                        {opts.resizeMode === m.value
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                          : 'border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--color-primary-light)]'}"
                    >{m.label}</button>
                  {/each}
                </div>
              </div>

              <div class="flex gap-3 flex-wrap">
                {#if opts.resizeMode !== 'height'}
                  <label class="flex flex-col gap-1">
                    <span class="text-xs text-[var(--text-muted)]">幅 (px)</span>
                    <input type="number" min="1" max="10000"
                      bind:value={opts.resizeWidth}
                      class="w-full sm:w-28 rounded-xl border border-(--outline-variant) bg-(--background) text-(--text) px-3 py-1.5 text-sm focus:outline-none focus:border-(--border-focus) font-mono"
                    />
                  </label>
                {/if}
                {#if opts.resizeMode === 'height' || opts.resizeMode === 'fit' || opts.resizeMode === 'cover'}
                  <label class="flex flex-col gap-1">
                    <span class="text-xs text-[var(--text-muted)]">高さ (px)</span>
                    <input type="number" min="1" max="10000"
                      bind:value={opts.resizeHeight}
                      class="w-full sm:w-28 rounded-xl border border-(--outline-variant) bg-(--background) text-(--text) px-3 py-1.5 text-sm focus:outline-none focus:border-(--border-focus) font-mono"
                    />
                  </label>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- ── メタデータ ─────────────────────────────────────── -->
        <label class="flex items-center justify-between text-sm cursor-pointer select-none">
          <div>
            <span class="font-medium">メタデータを削除</span>
            <p class="text-xs text-[var(--text-muted)] mt-0.5">EXIF・GPS・カメラ情報などを除去</p>
          </div>
          <input type="checkbox" bind:checked={opts.stripMetadata} class="accent-[var(--color-primary)]" />
        </label>

      </div>
    {/if}
  </section>

  <!-- ═══ ファイル一覧 ════════════════════════════════════════ -->
  {#if entries.length > 0}
    <section>
      <div class="flex items-center justify-between mb-3">
        <h2 class="section-heading">ファイル一覧 <span class="text-[var(--text-muted)] font-normal text-xs ml-1">{entries.length} 件</span></h2>
        <div class="flex gap-2">
          {#if hasDone}
            <button onclick={downloadAll} class="btn-filled text-sm px-3 py-1.5">
              <i class="fas fa-download"></i> 全 DL
            </button>
          {/if}
          <button
            onclick={clearAll}
            class="btn-outlined text-sm px-3 py-1.5 text-[var(--color-danger)] border-[var(--color-danger)] hover:bg-red-50 dark:hover:bg-red-950"
          ><i class="fas fa-trash"></i> クリア</button>
        </div>
      </div>

      <ul class="flex flex-col gap-2">
        {#each entries as entry, i}
          <li class="flex items-center gap-3 p-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)]">
            <i class="fas fa-image text-[var(--color-primary)] shrink-0 text-sm"></i>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{entry.file.name}</p>
              <p class="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                <span>{formatSize(entry.file.size)}</span>
                {#if entry.result}
                  <span>→</span>
                  <span>{formatSize(entry.result.sizeBytes)}</span>
                  <span class={sizeRatioClass(entry.file.size, entry.result.sizeBytes)}>
                    {sizeRatio(entry.file.size, entry.result.sizeBytes)}
                  </span>
                {/if}
              </p>
            </div>

            {#if entry.status === 'pending'}
              <span class="text-xs text-[var(--text-muted)]">待機中</span>
            {:else if entry.status === 'converting'}
              <i class="fas fa-spinner animate-spin text-[var(--color-primary)]"></i>
            {:else if entry.status === 'done'}
              <button
                onclick={() => downloadOne(entry)}
                class="btn-tonal text-xs px-3 py-1.5 bg-[var(--success-bg)] text-[var(--success-text)]"
              ><i class="fas fa-check"></i> DL</button>
            {:else}
              <span class="text-xs text-[var(--color-danger)] flex items-center gap-1 min-w-0 truncate" title={entry.error}>
                <i class="fas fa-exclamation-circle shrink-0"></i>
                <span class="truncate">{entry.error}</span>
              </span>
            {/if}

            <button
              onclick={() => removeEntry(i)}
              class="w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] bg-transparent border-0 cursor-pointer shrink-0"
              aria-label="削除"
            ><i class="fas fa-times text-xs"></i></button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- ═══ 変換ボタン ══════════════════════════════════════════ -->
  {#if hasPending}
    <button
      onclick={convertAll}
      disabled={vipsLoading}
      class="btn-filled w-full justify-center py-3 rounded-2xl text-base"
    >
      {#if vipsLoading}
        <i class="fas fa-spinner animate-spin"></i> ライブラリ初期化中…
      {:else}
        <i class="fas fa-exchange-alt"></i> 一括変換
      {/if}
    </button>
  {/if}


</div>
