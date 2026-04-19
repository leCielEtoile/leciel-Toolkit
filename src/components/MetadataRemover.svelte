<script lang="ts">
  import FileDropZone from './FileDropZone.svelte'
  import { processImage } from '@/lib/metadata/client-processor'
  import { formatSize, triggerDownload } from '@/lib/utils'

  interface FileResult {
    name: string
    size: number
    status: 'pending' | 'done' | 'error'
    error?: string
    blob?: Blob
    mimeType?: string
  }

  let files = $state<FileResult[]>([])
  let processing = $state(false)

  function handleFiles(newFiles: File[]) {
    const added = newFiles.map((f) => ({
      name: f.name,
      size: f.size,
      status: 'pending' as const,
      _file: f,
    }))
    files = [...files, ...added.map(({ _file: _, ...rest }) => rest)]
    processAll(newFiles, files.length - newFiles.length)
  }

  async function processAll(newFiles: File[], offset: number) {
    processing = true
    for (let i = 0; i < newFiles.length; i++) {
      const idx = offset + i
      try {
        const { blob, mimeType } = await processImage(newFiles[i])
        files[idx] = { ...files[idx], status: 'done', blob, mimeType }
      } catch (e) {
        files[idx] = { ...files[idx], status: 'error', error: (e as Error).message }
      }
    }
    processing = false
  }

  function downloadOne(file: FileResult) {
    if (!file.blob) return
    triggerDownload(file.blob, `cleaned_${file.name}`)
  }

  function downloadAll() {
    files.filter((f) => f.status === 'done').forEach(downloadOne)
  }

  function clearAll() {
    files = []
  }
</script>

<div class="flex flex-col gap-6">
  <FileDropZone
    accept=".png,.jpg,.jpeg"
    multiple
    onFiles={handleFiles}
    label="PNG・JPEG ファイルをドロップ"
    sublabel="またはクリックして選択（複数可）"
  />

  {#if files.length > 0}
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="section-heading">処理結果</h2>
        <div class="flex gap-2">
          {#if files.some((f) => f.status === 'done')}
            <button
              onclick={downloadAll}
              class="btn-filled"
            >
              <i class="fas fa-download"></i> 全てダウンロード
            </button>
          {/if}
          <button
            onclick={clearAll}
            class="btn-outlined text-[var(--color-danger)] border-[var(--color-danger)] hover:bg-red-50 dark:hover:bg-red-950"
          >
            <i class="fas fa-trash"></i> クリア
          </button>
        </div>
      </div>

      <ul class="flex flex-col gap-2 rounded-2xl border border-[var(--outline-variant)] overflow-hidden">
        {#each files as file}
          <li class="flex items-center gap-3 p-3 border-b border-[var(--outline-variant)] last:border-b-0 bg-[var(--surface-container)]">
            <i class="fas fa-image text-[var(--color-primary)] flex-shrink-0"></i>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{file.name}</p>
              <p class="text-xs text-[var(--text-muted)]">{formatSize(file.size)}</p>
            </div>

            {#if file.status === 'pending'}
              <i class="fas fa-spinner animate-spin text-[var(--text-muted)]"></i>
            {:else if file.status === 'done'}
              <button
                onclick={() => downloadOne(file)}
                class="btn-tonal text-xs px-3 py-1.5 bg-[var(--success-bg)] text-[var(--success-text)]"
              >
                <i class="fas fa-check"></i> ダウンロード
              </button>
            {:else}
              <span class="text-xs text-[var(--color-danger)] flex items-center gap-1">
                <i class="fas fa-exclamation-circle"></i> {file.error}
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

</div>
