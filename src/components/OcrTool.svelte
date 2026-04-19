<script lang="ts">
  import { onDestroy } from 'svelte'
  import FileDropZone from './FileDropZone.svelte'
  import Toast from './Toast.svelte'
  import { toast } from '@/lib/toast.svelte'
  import { triggerDownload } from '@/lib/utils'
  import { recognize, disposeWorker } from '@/lib/ocr/ocr-engine'

  // ─── 言語定義 ────────────────────────────────────────────────
  const LANGUAGES = [
    { code: 'jpn', label: '日本語' },
    { code: 'eng', label: '英語' },
    { code: 'chi_sim', label: '中国語（簡体）' },
    { code: 'chi_tra', label: '中国語（繁体）' },
    { code: 'kor', label: '韓国語' },
    { code: 'fra', label: 'フランス語' },
    { code: 'deu', label: 'ドイツ語' },
    { code: 'spa', label: 'スペイン語' },
  ]

  // ─── 状態 ────────────────────────────────────────────────────
  let selectedLangs = $state<string[]>(['jpn', 'eng'])
  let file          = $state<File | null>(null)
  let previewUrl    = $state<string | null>(null)
  let status        = $state<'idle' | 'recognizing' | 'done' | 'error'>('idle')
  let progress      = $state(0)
  let progressLabel = $state('')
  let resultText    = $state('')
  let confidence    = $state(0)
  let errorMsg      = $state('')

  // ─── 言語トグル ──────────────────────────────────────────────
  function toggleLang(code: string) {
    if (selectedLangs.includes(code)) {
      if (selectedLangs.length === 1) return  // 最低1言語
      selectedLangs = selectedLangs.filter((l) => l !== code)
    } else {
      selectedLangs = [...selectedLangs, code]
    }
  }

  // ─── ファイル選択 ────────────────────────────────────────────
  function handleFiles(files: File[]) {
    const f = files[0]
    if (!f) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    file = f
    previewUrl = URL.createObjectURL(f)
    status = 'idle'
    resultText = ''
    errorMsg = ''
    progress = 0
  }

  // ─── OCR 実行 ─────────────────────────────────────────────────
  async function runRecognize() {
    if (!file) { toast.notify('画像を選択してください', 'error'); return }

    status = 'recognizing'
    progress = 0
    progressLabel = '準備中…'
    resultText = ''
    errorMsg = ''

    try {
      const result = await recognize(file, selectedLangs, (info) => {
        progressLabel = info.status
        progress = info.progress
      })

      if (!result.text) {
        toast.notify('テキストが見つかりませんでした', 'error')
        status = 'error'
        errorMsg = 'テキストを検出できませんでした。別の画像を試してください。'
        return
      }

      resultText = result.text
      confidence = result.confidence
      status = 'done'
      toast.notify('テキストの抽出が完了しました')
    } catch (e) {
      status = 'error'
      errorMsg = (e as Error).message ?? '不明なエラーが発生しました'
      toast.notify(`エラー: ${errorMsg}`, 'error')
    }
  }

  // ─── コピー ──────────────────────────────────────────────────
  async function copyText() {
    await navigator.clipboard.writeText(resultText)
    toast.notify('クリップボードにコピーしました')
  }

  // ─── ダウンロード ────────────────────────────────────────────
  function downloadText() {
    const baseName = file?.name.replace(/\.[^.]+$/, '') ?? 'ocr-result'
    const blob = new Blob([resultText], { type: 'text/plain;charset=utf-8' })
    triggerDownload(blob, `${baseName}.txt`)
  }

  // ─── リセット ────────────────────────────────────────────────
  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    file = null
    previewUrl = null
    status = 'idle'
    progress = 0
    progressLabel = ''
    resultText = ''
    confidence = 0
    errorMsg = ''
  }

  // ─── クリーンアップ ──────────────────────────────────────────
  onDestroy(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    disposeWorker()
  })
</script>

<div class="flex flex-col gap-5">

  <Toast />

  <!-- ═══ 言語選択 ════════════════════════════════════════════ -->
  <section class="m3-card px-5 py-4 flex flex-col gap-3">
    <p class="text-xs font-medium text-[var(--text-muted)]">認識言語（複数選択可）</p>
    <div class="flex flex-wrap gap-2">
      {#each LANGUAGES as lang}
        <button
          onclick={() => toggleLang(lang.code)}
          disabled={status === 'recognizing'}
          class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
            {selectedLangs.includes(lang.code)
              ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
              : 'border-[var(--outline-variant)] text-[var(--text-muted)] hover:bg-[var(--color-primary-light)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'}"
        >
          {lang.label}
        </button>
      {/each}
    </div>
    <p class="text-[10px] text-[var(--text-muted)]">
      <i class="fas fa-info-circle"></i>
      言語データは初回使用時に自動取得されます（日本語・英語 各 約 4MB）。以降はキャッシュされます。
    </p>
  </section>

  <!-- ═══ ファイル選択 ════════════════════════════════════════ -->
  {#if !file}
    <FileDropZone
      accept=".png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif"
      multiple={false}
      onFiles={handleFiles}
      label="画像をドロップしてテキスト抽出"
      sublabel="PNG・JPEG・WebP・BMP・TIFF に対応"
    />
  {:else}
    <!-- ─ ファイル情報 + プレビュー ─ -->
    <section class="m3-card overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 border-b border-[var(--outline-variant)]">
        <div class="flex items-center gap-2 min-w-0">
          <i class="fas fa-image text-[var(--color-primary)] shrink-0"></i>
          <span class="text-sm font-medium truncate">{file.name}</span>
        </div>
        {#if status !== 'recognizing'}
          <button
            onclick={reset}
            class="text-xs text-[var(--text-muted)] hover:text-[var(--color-danger)] flex items-center gap-1 shrink-0 bg-transparent border-0 cursor-pointer ml-3"
          >
            <i class="fas fa-times"></i> 変更
          </button>
        {/if}
      </div>
      {#if previewUrl}
        <div class="flex items-center justify-center bg-[var(--surface-variant)] p-4 max-h-72 overflow-hidden">
          <img
            src={previewUrl}
            alt="プレビュー"
            class="max-h-64 max-w-full object-contain rounded-lg shadow"
          />
        </div>
      {/if}
    </section>
  {/if}

  <!-- ═══ 認識ボタン ══════════════════════════════════════════ -->
  {#if file && status !== 'recognizing'}
    <button
      onclick={runRecognize}
      class="btn-filled w-full justify-center py-3 rounded-2xl text-base"
    >
      <i class="fas fa-font"></i>
      {status === 'done' ? '再度テキストを抽出' : 'テキストを抽出'}
    </button>
  {/if}

  <!-- ═══ 進捗 ════════════════════════════════════════════════ -->
  {#if status === 'recognizing'}
    <section class="m3-card px-5 py-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span class="text-xs text-[var(--text-muted)]">{progressLabel}</span>
        <span class="font-mono text-[var(--color-primary)] text-xs">{progress}%</span>
      </div>
      <div class="w-full h-2 rounded-full bg-[var(--outline-variant)] overflow-hidden">
        <div
          class="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
          style="width: {progress}%"
        ></div>
      </div>
    </section>
  {/if}

  <!-- ═══ エラー ══════════════════════════════════════════════ -->
  {#if status === 'error' && errorMsg}
    <div class="rounded-2xl border border-[var(--color-danger)] bg-red-50 dark:bg-red-950 px-5 py-4 text-sm text-[var(--color-danger)] flex items-start gap-2">
      <i class="fas fa-exclamation-circle shrink-0 mt-0.5"></i>
      <span>{errorMsg}</span>
    </div>
  {/if}

  <!-- ═══ 結果 ════════════════════════════════════════════════ -->
  {#if status === 'done' && resultText}
    <section class="m3-card overflow-hidden flex flex-col">

      <!-- ヘッダー -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-[var(--outline-variant)]">
        <div class="flex items-center gap-2">
          <span class="section-heading">抽出結果</span>
          <span class="text-xs text-[var(--text-muted)] bg-[var(--surface-variant)] px-2 py-0.5 rounded-full">
            信頼度 {confidence}%
          </span>
        </div>
        <div class="flex gap-2">
          <button onclick={copyText} class="btn-outlined text-xs px-3 py-1.5">
            <i class="fas fa-copy"></i> コピー
          </button>
          <button onclick={downloadText} class="btn-filled text-xs px-3 py-1.5">
            <i class="fas fa-download"></i> .txt
          </button>
        </div>
      </div>

      <!-- テキスト本文 -->
      <textarea
        readonly
        value={resultText}
        rows={10}
        class="w-full resize-y font-mono text-sm bg-[var(--background)] text-[var(--text)] px-5 py-4 border-0 outline-none leading-relaxed"
      ></textarea>

    </section>
  {/if}

</div>
