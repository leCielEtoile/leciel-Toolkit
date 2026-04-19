<script lang="ts">
  import FileDropZone from './FileDropZone.svelte'
  import Toast from './Toast.svelte'
  import { toast } from '@/lib/toast.svelte'
  import { triggerDownload } from '@/lib/utils'
  import {
    detectFileFormat, PARSERS, getFormatDisplayName, type Chapter
  } from '@/lib/chapter/parsers'
  import {
    chaptersToString, stringToChapters, shiftChapterTimes,
    formatChapters, sortChaptersByTime, isValidTimeFormat
  } from '@/lib/chapter/chapter-operations'

  // ---- state ----
  let editorText = $state('')
  let pasteText  = $state('')
  let isShifted  = $state(false)
  let lastFormat = $state<string | null>(null)

  // モーダル
  let addModal  = $state(false)
  let editModal = $state(false)
  let editIndex = $state(-1)
  let formTime  = $state('')
  let formName  = $state('')

  // チャプター一覧（editorText から導出）
  let chapters = $derived(stringToChapters(editorText))

  // ---- helpers ----
  function parseContent(content: string, filename = '') {
    if (!content.trim()) throw new Error('コンテンツが空です')
    const format = detectFileFormat(content, filename)
    if (!format) throw new Error('ファイル形式を認識できませんでした')
    const parsed = PARSERS[format](content)
    if (parsed.length === 0) throw new Error('チャプター情報が見つかりませんでした')
    lastFormat = format
    return sortChaptersByTime(parsed)
  }

  // ---- file drop ----
  function handleFiles(files: File[]) {
    const file = files[0]
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const result = parseContent(e.target!.result as string, file.name)
        editorText = chaptersToString(result)
        toast.notify(`ファイルを変換しました（形式: ${getFormatDisplayName(lastFormat as any)}）`)
      } catch (err) {
        editorText = ''
        toast.notify((err as Error).message, 'error')
      }
    }
    reader.onerror = () => toast.notify('ファイルの読み込みに失敗しました', 'error')
    reader.readAsText(file)
  }

  // ---- paste convert ----
  function convertPasted() {
    try {
      const result = parseContent(pasteText)
      editorText = chaptersToString(result)
      toast.notify(`コピペ入力を変換しました（形式: ${getFormatDisplayName(lastFormat as any)}）`)
    } catch (err) {
      editorText = ''
      toast.notify((err as Error).message, 'error')
    }
  }

  // ---- toolbar actions ----
  function handleShift() {
    if (chapters.length === 0) { toast.notify('補正するチャプターがありません', 'error'); return }
    editorText = chaptersToString(shiftChapterTimes(chapters, !isShifted))
    isShifted = !isShifted
    toast.notify(isShifted ? 'チャプター時間を1時間戻しました' : 'チャプター時間を元に戻しました')
  }

  function handleFormat() {
    if (chapters.length === 0) { toast.notify('整形するチャプターがありません', 'error'); return }
    editorText = chaptersToString(formatChapters(chapters))
    toast.notify('チャプターを整形しました')
  }

  function handleDownload() {
    if (!editorText.trim()) { toast.notify('ダウンロードする内容が空です', 'error'); return }
    triggerDownload(new Blob([editorText], { type: 'text/plain' }), 'youtube-chapters.txt')
    toast.notify('チャプターファイルをダウンロードしました')
  }

  async function handleCopy() {
    if (!editorText.trim()) { toast.notify('コピーする内容が空です', 'error'); return }
    try {
      await navigator.clipboard.writeText(editorText)
      toast.notify('クリップボードにコピーしました')
    } catch {
      toast.notify('コピーに失敗しました', 'error')
    }
  }

  // ---- chapter add ----
  function openAdd() { formTime = ''; formName = ''; addModal = true }

  function saveAdd() {
    if (!formTime || !formName) { toast.notify('時間とタイトルを入力してください', 'error'); return }
    if (!isValidTimeFormat(formTime)) { toast.notify('時間は00:00:00の形式で入力してください', 'error'); return }
    editorText = chaptersToString(sortChaptersByTime([...chapters, { time: formTime, name: formName }]))
    addModal = false
    toast.notify('チャプターを追加しました')
  }

  // ---- chapter edit ----
  function openEdit(idx: number) {
    editIndex = idx
    formTime  = chapters[idx].time
    formName  = chapters[idx].name
    editModal = true
  }

  function saveEdit() {
    if (!formTime || !formName) { toast.notify('時間とタイトルを入力してください', 'error'); return }
    if (!isValidTimeFormat(formTime)) { toast.notify('時間は00:00:00の形式で入力してください', 'error'); return }
    const updated = [...chapters]
    updated[editIndex] = { time: formTime, name: formName }
    editorText = chaptersToString(sortChaptersByTime(updated))
    editModal = false
    toast.notify('チャプターを更新しました')
  }

  // ---- chapter delete ----
  function deleteChapter(idx: number) {
    const c = chapters[idx]
    if (!confirm(`チャプター「${c.time} ${c.name}」を削除しますか？`)) return
    const updated = [...chapters]
    updated.splice(idx, 1)
    editorText = chaptersToString(updated)
    toast.notify('チャプターを削除しました')
  }

  // ---- keyboard shortcuts ----
  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (addModal || editModal) return

    if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleDownload() }
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); handleFormat() }
    if (e.ctrlKey && e.key === 't') { e.preventDefault(); handleShift() }
    if (e.altKey  && e.key === 'a') { e.preventDefault(); openAdd() }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex flex-col gap-6">

  <Toast />

  <!-- ファイルアップロード -->
  <section>
    <h2 class="section-heading mb-4">ファイルアップロード</h2>
    <FileDropZone
      accept=".edl,.txt,.csv"
      onFiles={handleFiles}
      label="マーカーファイルをドロップ"
      sublabel="対応形式: DaVinci EDL, Premiere EDL, マーカーテキスト, マーカーCSV"
    />
  </section>

  <!-- コピペ変換 -->
  <section>
    <h2 class="section-heading mb-4">またはマーカーテキストをコピペ</h2>
    <div class="relative">
      <textarea
        bind:value={pasteText}
        placeholder="ここにマーカーリストの内容を貼り付けてください…"
        rows={6}
        class="w-full rounded-xl border border-(--outline-variant) bg-(--card-bg) text-(--text) p-3 text-sm resize-y focus:outline-none focus:border-(--border-focus) transition-colors"
      ></textarea>
      {#if pasteText}
        <button
          onclick={() => { pasteText = '' }}
          class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] bg-transparent border-0 cursor-pointer"
          aria-label="クリア"
        ><i class="fas fa-times text-xs"></i></button>
      {/if}
    </div>
    <button
      onclick={convertPasted}
      class="btn-filled mt-3"
    >
      <i class="fas fa-exchange-alt"></i> コピペテキストから変換
    </button>
  </section>

  <!-- チャプター編集エリア -->
  <section>
    <div class="flex items-center justify-between mb-4">
      <h2 class="section-heading">YouTubeチャプター編集</h2>
      <button
        onclick={openAdd}
        class="btn-tonal"
      >
        <i class="fas fa-plus"></i> 追加
      </button>
    </div>

    <!-- チャプターリスト -->
    <div class="mb-4 rounded-2xl border border-(--outline-variant) bg-(--card-bg) divide-y divide-(--outline-variant) min-h-15">
      {#if chapters.length === 0}
        <p class="p-4 text-sm text-[var(--text-muted)] text-center">
          チャプターがありません。ファイルをアップロードするか、新しいチャプターを追加してください。
        </p>
      {:else}
        {#each chapters as chapter, i}
          <div
            role="button"
            tabindex="0"
            class="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-primary-light)] transition-colors cursor-pointer group"
            onclick={() => openEdit(i)}
            onkeydown={(e) => e.key === 'Enter' && openEdit(i)}
          >
            <span class="font-mono text-sm text-[var(--color-primary)] w-20 flex-shrink-0">{chapter.time}</span>
            <span class="flex-1 text-sm text-[var(--text)] truncate">{chapter.name}</span>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onclick={(e) => { e.stopPropagation(); openEdit(i) }}
                class="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-primary)] bg-transparent border-0 cursor-pointer"
                aria-label="編集"
              ><i class="fas fa-edit text-xs"></i></button>
              <button
                onclick={(e) => { e.stopPropagation(); deleteChapter(i) }}
                class="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] bg-transparent border-0 cursor-pointer"
                aria-label="削除"
              ><i class="fas fa-trash text-xs"></i></button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- テキストエディタ -->
    <div class="relative">
      <textarea
        bind:value={editorText}
        placeholder="ここに変換されたチャプターが表示されます…"
        rows={12}
        class="w-full rounded-xl border border-(--outline-variant) bg-(--card-bg) text-(--text) p-3 text-sm font-mono resize-y focus:outline-none focus:border-(--border-focus) transition-colors"
      ></textarea>
      {#if editorText}
        <button
          onclick={() => { editorText = '' }}
          class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] bg-transparent border-0 cursor-pointer"
          aria-label="エディタをクリア"
        ><i class="fas fa-times text-xs"></i></button>
      {/if}
    </div>

    <!-- ツールバー -->
    <div class="mt-3 flex flex-wrap gap-2">
      <button
        onclick={handleShift}
        title="最初のチャプターを00:00:00にします（Ctrl+T）"
        class="btn-outlined px-3 py-2"
      >
        <i class="fas fa-clock"></i>
        {isShifted ? '補正を元に戻す' : '00:00:00開始に補正'}
      </button>
      <button
        onclick={handleFormat}
        title="時間順に並べ替え、重複を削除します（Ctrl+F）"
        class="btn-outlined px-3 py-2"
      >
        <i class="fas fa-sort"></i> フォーマット整形
      </button>
      <button
        onclick={handleDownload}
        title="テキストファイルでダウンロード（Ctrl+S）"
        class="btn-outlined px-3 py-2"
      >
        <i class="fas fa-download"></i> ダウンロード
      </button>
      <button
        onclick={handleCopy}
        title="クリップボードにコピー"
        class="btn-outlined px-3 py-2"
      >
        <i class="fas fa-copy"></i> クリップボードにコピー
      </button>
    </div>
  </section>

  <!-- ショートカット一覧 -->
  <section>
    <details class="m3-card">
      <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text)] select-none">
        使い方ガイド・キーボードショートカット
      </summary>
      <div class="px-4 pb-4 text-sm text-[var(--text-muted)] space-y-3">
        <p>1. マーカーファイルをアップロードするか、マーカーテキストを貼り付けて変換してください。</p>
        <p>2. <strong class="text-[var(--text)]">00:00:00開始に補正</strong>で時間を調整できます。</p>
        <p>3. 編集後、<strong class="text-[var(--text)]">ダウンロード</strong>またはクリップボードにコピーして YouTube の説明欄に貼り付けます。</p>
        <div class="pt-2 space-y-1.5">
          {#each [
            ['Ctrl+S', 'ダウンロード'],
            ['Ctrl+F', 'フォーマット整形'],
            ['Ctrl+T', '00:00:00開始に補正'],
            ['Alt+A',  '新しいチャプターを追加'],
          ] as [key, desc]}
            <div class="flex items-center gap-3">
              <kbd class="px-1.5 py-0.5 rounded border border-(--outline-variant) text-xs font-mono bg-(--surface-variant)">{key}</kbd>
              <span>{desc}</span>
            </div>
          {/each}
        </div>
      </div>
    </details>
  </section>
</div>

<!-- チャプター追加モーダル -->
{#if addModal}
  <div
    role="dialog"
    aria-modal="true"
    aria-label="チャプターを追加"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={(e) => { if (e.target === e.currentTarget) addModal = false }}
  >
    <div class="w-full max-w-md mx-4 p-6 rounded-3xl bg-(--surface-container) border border-(--outline-variant) shadow-2xl">
      <h3 class="text-base font-semibold mb-4 text-[var(--text)]">チャプターを追加</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-[var(--text-muted)] mb-1">時間 (HH:MM:SS)</label>
          <input
            bind:value={formTime}
            type="text"
            placeholder="00:00:00"
            class="w-full rounded-xl border border-(--outline-variant) bg-(--background) text-(--text) px-3 py-2 text-sm focus:outline-none focus:border-(--border-focus) font-mono"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-muted)] mb-1">チャプター名</label>
          <input
            bind:value={formName}
            type="text"
            placeholder="チャプター名を入力"
            class="w-full rounded-xl border border-(--outline-variant) bg-(--background) text-(--text) px-3 py-2 text-sm focus:outline-none focus:border-(--border-focus)"
          />
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button
          onclick={() => { addModal = false }}
          class="btn-text"
        >キャンセル</button>
        <button
          onclick={saveAdd}
          class="btn-filled"
        >追加</button>
      </div>
    </div>
  </div>
{/if}

<!-- チャプター編集モーダル -->
{#if editModal}
  <div
    role="dialog"
    aria-modal="true"
    aria-label="チャプターを編集"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={(e) => { if (e.target === e.currentTarget) editModal = false }}
  >
    <div class="w-full max-w-md mx-4 p-6 rounded-3xl bg-(--surface-container) border border-(--outline-variant) shadow-2xl">
      <h3 class="text-base font-semibold mb-4 text-[var(--text)]">チャプターを編集</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-[var(--text-muted)] mb-1">時間 (HH:MM:SS)</label>
          <input
            bind:value={formTime}
            type="text"
            placeholder="00:00:00"
            class="w-full rounded-xl border border-(--outline-variant) bg-(--background) text-(--text) px-3 py-2 text-sm focus:outline-none focus:border-(--border-focus) font-mono"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-muted)] mb-1">チャプター名</label>
          <input
            bind:value={formName}
            type="text"
            placeholder="チャプター名を入力"
            class="w-full rounded-xl border border-(--outline-variant) bg-(--background) text-(--text) px-3 py-2 text-sm focus:outline-none focus:border-(--border-focus)"
          />
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button
          onclick={() => { editModal = false }}
          class="btn-text"
        >キャンセル</button>
        <button
          onclick={saveEdit}
          class="btn-filled"
        >更新</button>
      </div>
    </div>
  </div>
{/if}
