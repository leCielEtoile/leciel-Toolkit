<script lang="ts">
  import FileDropZone from './FileDropZone.svelte'
  import Toast from './Toast.svelte'
  import { toast } from '@/lib/toast.svelte'
  import { triggerDownload, formatSize } from '@/lib/utils'
  import { runOptimize, defaultConfig, type SvgoConfig } from '@/lib/svg-optimizer/optimizer'

  // ─── 型 ──────────────────────────────────────────────────────
  interface SvgFile {
    id: string
    file: File
    originalSize: number
    optimizedSize: number | null
    optimizedContent: string | null
    status: 'idle' | 'optimizing' | 'done' | 'error'
    error: string | null
  }

  // ─── 状態 ────────────────────────────────────────────────────
  let files       = $state<SvgFile[]>([])
  let config      = $state<SvgoConfig>(structuredClone(defaultConfig))
  let showAdvanced = $state(false)

  let allStatus = $derived<'idle' | 'optimizing' | 'done'>(
    files.length === 0
      ? 'idle'
      : files.some((f) => f.status === 'optimizing')
        ? 'optimizing'
        : files.every((f) => f.status === 'done' || f.status === 'error')
          ? 'done'
          : 'idle'
  )

  // ─── ヘルパー ─────────────────────────────────────────────────
  function reductionRate(original: number, optimized: number): string {
    if (original === 0) return '0'
    return ((1 - optimized / original) * 100).toFixed(1)
  }

  // ─── ファイル追加 ─────────────────────────────────────────────
  function handleFiles(incoming: File[]) {
    const svgs = incoming.filter((f) => f.type === 'image/svg+xml' || f.name.endsWith('.svg'))
    if (svgs.length === 0) { toast.notify('SVGファイルを選択してください', 'error'); return }
    files = [
      ...files,
      ...svgs.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        originalSize: f.size,
        optimizedSize: null,
        optimizedContent: null,
        status: 'idle' as const,
        error: null,
      })),
    ]
  }

  function openFilePicker() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg,image/svg+xml'
    input.multiple = true
    input.onchange = (e) => {
      const added = Array.from((e.target as HTMLInputElement).files ?? [])
      if (added.length) handleFiles(added)
    }
    input.click()
  }

  // ─── 最適化実行 ───────────────────────────────────────────────
  async function optimize() {
    if (files.length === 0) { toast.notify('ファイルを選択してください', 'error'); return }
    files = files.map((f) => ({ ...f, status: 'optimizing', optimizedSize: null, optimizedContent: null, error: null }))

    for (const entry of files.filter((f) => f.status === 'optimizing')) {
      try {
        const text = await entry.file.text()
        const optimized = runOptimize(text, config)
        files = files.map((f) =>
          f.id === entry.id
            ? { ...f, status: 'done', optimizedContent: optimized, optimizedSize: new Blob([optimized]).size }
            : f
        )
      } catch (e) {
        const msg = (e as Error).message ?? '最適化に失敗しました'
        files = files.map((f) =>
          f.id === entry.id ? { ...f, status: 'error', error: msg } : f
        )
      }
    }

    toast.notify('最適化が完了しました')
  }

  // ─── ダウンロード ─────────────────────────────────────────────
  function downloadOne(entry: SvgFile) {
    if (!entry.optimizedContent) return
    const blob = new Blob([entry.optimizedContent], { type: 'image/svg+xml' })
    triggerDownload(blob, entry.file.name.replace(/\.svg$/i, '.min.svg'))
  }

  function remove(id: string) { files = files.filter((f) => f.id !== id) }
  function reset() { files = [] }
  function resetConfig() { config = structuredClone(defaultConfig) }
</script>

<div class="flex flex-col gap-5">
  <Toast />

  <!-- ═══ ファイルドロップ ══════════════════════════════════════ -->
  {#if files.length === 0}
    <FileDropZone
      accept=".svg,image/svg+xml"
      multiple={true}
      onFiles={handleFiles}
      label="SVGファイルをドロップして最適化"
      sublabel="複数ファイルの同時選択に対応"
    />
  {:else}
    <button
      onclick={openFilePicker}
      class="w-full rounded-2xl border-2 border-dashed border-[var(--outline-variant)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors py-3 text-xs text-[var(--text-muted)] hover:text-[var(--color-primary)] cursor-pointer bg-transparent"
    >
      <i class="fas fa-plus mr-1"></i> さらにファイルを追加
    </button>
  {/if}

  <!-- ═══ ファイルリスト ════════════════════════════════════════ -->
  {#if files.length > 0}
    <section class="m3-card overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 border-b border-[var(--outline-variant)]">
        <span class="section-heading">{files.length} 件のファイル</span>
        <button onclick={reset} disabled={allStatus === 'optimizing'}
          class="text-xs text-[var(--text-muted)] hover:text-[var(--color-danger)] bg-transparent border-0 cursor-pointer disabled:opacity-40">
          <i class="fas fa-trash-alt mr-1"></i> すべて削除
        </button>
      </div>
      <ul class="divide-y divide-[var(--outline-variant)]">
        {#each files as entry (entry.id)}
          <li class="flex items-center gap-3 px-5 py-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--color-primary-light)]">
              {#if entry.status === 'optimizing'}
                <i class="fas fa-spinner fa-spin text-[var(--color-primary)] text-sm"></i>
              {:else if entry.status === 'done'}
                <i class="fas fa-check text-emerald-500 text-sm"></i>
              {:else if entry.status === 'error'}
                <i class="fas fa-exclamation-circle text-[var(--color-danger)] text-sm"></i>
              {:else}
                <i class="fas fa-file-code text-[var(--color-primary)] text-sm"></i>
              {/if}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{entry.file.name}</p>
              <p class="text-xs text-[var(--text-muted)] mt-0.5">
                {#if entry.status === 'done' && entry.optimizedSize !== null}
                  <span>{formatSize(entry.originalSize)}</span>
                  <i class="fas fa-arrow-right mx-1 text-[10px]"></i>
                  <span class="text-emerald-500 font-medium">{formatSize(entry.optimizedSize)}</span>
                  <span class="ml-1 bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    -{reductionRate(entry.originalSize, entry.optimizedSize)}%
                  </span>
                {:else if entry.status === 'error'}
                  <span class="text-[var(--color-danger)]">{entry.error}</span>
                {:else}
                  {formatSize(entry.originalSize)}
                {/if}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              {#if entry.status === 'done'}
                <button onclick={() => downloadOne(entry)} class="btn-outlined text-xs px-2.5 py-1">
                  <i class="fas fa-download"></i>
                </button>
              {/if}
              {#if entry.status !== 'optimizing'}
                <button onclick={() => remove(entry.id)}
                  class="text-[var(--text-muted)] hover:text-[var(--color-danger)] bg-transparent border-0 cursor-pointer text-sm">
                  <i class="fas fa-times"></i>
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- ═══ 設定パネル ════════════════════════════════════════════ -->
  <section class="m3-card overflow-hidden">

    <!-- ─ ヘッダー ─ -->
    <div class="flex items-center justify-between px-5 py-3 border-b border-[var(--outline-variant)]">
      <span class="section-heading">最適化設定</span>
      <button onclick={resetConfig} class="text-xs text-[var(--text-muted)] hover:text-[var(--color-primary)] bg-transparent border-0 cursor-pointer">
        <i class="fas fa-undo mr-1"></i> リセット
      </button>
    </div>

    <div class="px-5 py-4 flex flex-col gap-5">

      <!-- ─ グローバル設定 ─ -->
      <div>
        <p class="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">グローバル</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">

          <!-- multipass -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p class="text-sm font-medium">multipass</p>
              <p class="text-[10px] text-[var(--text-muted)]">複数回最適化してさらに圧縮</p>
            </div>
            <input type="checkbox" bind:checked={config.global.multipass} class="toggle-checkbox" />
          </label>

          <!-- pretty -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p class="text-sm font-medium">整形出力 (pretty)</p>
              <p class="text-[10px] text-[var(--text-muted)]">インデントを付けて出力</p>
            </div>
            <input type="checkbox" bind:checked={config.global.pretty} class="toggle-checkbox" />
          </label>

          <!-- floatPrecision -->
          <label class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium">数値精度 (floatPrecision)</p>
              <span class="text-xs font-mono text-[var(--color-primary)]">{config.global.floatPrecision}</span>
            </div>
            <input type="range" min="1" max="8" step="1" bind:value={config.global.floatPrecision} class="range-input" />
            <p class="text-[10px] text-[var(--text-muted)]">小数点以下の桁数 (1〜8)</p>
          </label>

          <!-- indent -->
          {#if config.global.pretty}
            <label class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium">インデント幅</p>
                <span class="text-xs font-mono text-[var(--color-primary)]">{config.global.indent}</span>
              </div>
              <input type="range" min="1" max="8" step="1" bind:value={config.global.indent} class="range-input" />
            </label>
          {/if}

        </div>
      </div>

      <!-- ─ よく使うプラグイン（シンプルモード） ─ -->
      <div>
        <p class="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">主要プラグイン</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">

          {#each [
            { key: 'removeComments',    label: 'removeComments',    desc: 'コメントを削除' },
            { key: 'removeMetadata',    label: 'removeMetadata',    desc: '<metadata> タグを削除' },
            { key: 'removeDoctype',     label: 'removeDoctype',     desc: 'DOCTYPE を削除' },
            { key: 'removeXMLProcInst', label: 'removeXMLProcInst', desc: 'XML 宣言を削除' },
            { key: 'collapseGroups',    label: 'collapseGroups',    desc: '不要な <g> グループを除去' },
            { key: 'minifyStyles',      label: 'minifyStyles',      desc: 'CSS スタイルを短縮' },
            { key: 'removeUnusedNS',    label: 'removeUnusedNS',    desc: '未使用 namespace を削除' },
            { key: 'removeEmptyAttrs',  label: 'removeEmptyAttrs',  desc: '空属性を削除' },
            { key: 'removeEmptyContainers', label: 'removeEmptyContainers', desc: '空コンテナを削除' },
            { key: 'removeHiddenElems', label: 'removeHiddenElems', desc: '非表示要素を削除' },
            { key: 'removeEmptyText',   label: 'removeEmptyText',   desc: '空テキスト要素を削除' },
            { key: 'removeEditorsNSData', label: 'removeEditorsNSData', desc: 'エディタ用データを削除' },
            { key: 'removeNonInheritableGroupAttrs', label: 'removeNonInheritableGroupAttrs', desc: '継承不可グループ属性を削除' },
            { key: 'removeUselessStrokeAndFill', label: 'removeUselessStrokeAndFill', desc: '無効な stroke/fill を削除' },
            { key: 'removeUselessDefs', label: 'removeUselessDefs', desc: '未使用 <defs> を削除' },
            { key: 'cleanupAttrs',      label: 'cleanupAttrs',      desc: '属性の空白を正規化' },
            { key: 'mergeStyles',       label: 'mergeStyles',       desc: '複数 <style> を結合' },
            { key: 'sortDefsChildren',  label: 'sortDefsChildren',  desc: '<defs> 内要素をソート' },
            { key: 'convertEllipseToCircle', label: 'convertEllipseToCircle', desc: '楕円を真円に変換' },
            { key: 'moveElemsAttrsToGroup', label: 'moveElemsAttrsToGroup', desc: '共通属性をグループに移動' },
            { key: 'moveGroupAttrsToElems', label: 'moveGroupAttrsToElems', desc: 'グループ属性を要素に移動' },
          ] as item}
            <label class="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p class="text-xs font-mono font-medium">{item.label}</p>
                <p class="text-[10px] text-[var(--text-muted)]">{item.desc}</p>
              </div>
              <input type="checkbox"
                checked={(config.plugins as Record<string, unknown>)[item.key] as boolean}
                onchange={(e) => { (config.plugins as Record<string, unknown>)[item.key] = (e.target as HTMLInputElement).checked }}
                class="toggle-checkbox" />
            </label>
          {/each}

          <!-- removeTitle (アクセシビリティ警告付き) -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p class="text-xs font-mono font-medium">removeTitle</p>
              <p class="text-[10px] text-[var(--text-muted)]"><i class="fas fa-exclamation-triangle text-amber-500 text-[9px]"></i> アクセシビリティに影響</p>
            </div>
            <input type="checkbox" bind:checked={config.plugins.removeTitle} class="toggle-checkbox" />
          </label>

          <!-- removeDesc -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p class="text-xs font-mono font-medium">removeDesc</p>
              <p class="text-[10px] text-[var(--text-muted)]"><i class="fas fa-exclamation-triangle text-amber-500 text-[9px]"></i> アクセシビリティに影響</p>
            </div>
            <input type="checkbox" bind:checked={config.plugins.removeDesc} class="toggle-checkbox" />
          </label>

        </div>
      </div>

      <!-- ─ 詳細設定トグル ─ -->
      <button
        onclick={() => { showAdvanced = !showAdvanced }}
        class="flex items-center gap-2 text-xs text-[var(--color-primary)] bg-transparent border-0 cursor-pointer self-start"
      >
        <i class="fas fa-chevron-{showAdvanced ? 'up' : 'down'} text-[10px]"></i>
        {showAdvanced ? '詳細設定を閉じる' : '詳細設定を開く（全パラメーター）'}
      </button>

      <!-- ─ 詳細設定 ─ -->
      {#if showAdvanced}
        <div class="flex flex-col gap-6 border-t border-[var(--outline-variant)] pt-5">

          <!-- cleanupIds -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">cleanupIds</p>
                <p class="text-[10px] text-[var(--text-muted)]">未参照 ID の削除・ID の短縮</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.cleanupIds.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.cleanupIds.enabled}
              <div class="ml-4 flex flex-col gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">remove — 未参照 ID を削除</p>
                  <input type="checkbox" bind:checked={config.plugins.cleanupIds.remove} class="toggle-checkbox" />
                </label>
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">minify — 参照 ID を短縮</p>
                  <input type="checkbox" bind:checked={config.plugins.cleanupIds.minify} class="toggle-checkbox" />
                </label>
              </div>
            {/if}
          </div>

          <!-- cleanupNumericValues -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">cleanupNumericValues</p>
                <p class="text-[10px] text-[var(--text-muted)]">数値の丸め・単位の最適化</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.cleanupNumericValues.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.cleanupNumericValues.enabled}
              <div class="ml-4 flex flex-col gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                <label class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-[var(--text-muted)]">floatPrecision</p>
                    <span class="text-xs font-mono text-[var(--color-primary)]">{config.plugins.cleanupNumericValues.floatPrecision}</span>
                  </div>
                  <input type="range" min="1" max="8" step="1" bind:value={config.plugins.cleanupNumericValues.floatPrecision} class="range-input" />
                </label>
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">leadingZero — 先頭ゼロを省略</p>
                  <input type="checkbox" bind:checked={config.plugins.cleanupNumericValues.leadingZero} class="toggle-checkbox" />
                </label>
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">defaultPx — px 単位を省略</p>
                  <input type="checkbox" bind:checked={config.plugins.cleanupNumericValues.defaultPx} class="toggle-checkbox" />
                </label>
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">convertToPx — 絶対単位を px に変換</p>
                  <input type="checkbox" bind:checked={config.plugins.cleanupNumericValues.convertToPx} class="toggle-checkbox" />
                </label>
              </div>
            {/if}
          </div>

          <!-- convertColors -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">convertColors</p>
                <p class="text-[10px] text-[var(--text-muted)]">カラー値を短縮形に変換</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.convertColors.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.convertColors.enabled}
              <div class="ml-4 grid grid-cols-2 gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                {#each [
                  { key: 'currentColor', label: 'currentColor — currentColor に置換' },
                  { key: 'names2hex',    label: 'names2hex — 色名を HEX に' },
                  { key: 'rgb2hex',      label: 'rgb2hex — RGB を HEX に' },
                  { key: 'shorthex',     label: 'shorthex — HEX を短縮形に' },
                  { key: 'shortname',    label: 'shortname — HEX を色名に' },
                ] as item}
                  <label class="flex items-center justify-between gap-2 cursor-pointer col-span-2 sm:col-span-1">
                    <p class="text-xs text-[var(--text-muted)]">{item.label}</p>
                    <input type="checkbox"
                      checked={(config.plugins.convertColors as Record<string, unknown>)[item.key] as boolean}
                      onchange={(e) => { (config.plugins.convertColors as Record<string, unknown>)[item.key] = (e.target as HTMLInputElement).checked }}
                      class="toggle-checkbox" />
                  </label>
                {/each}
              </div>
            {/if}
          </div>

          <!-- convertPathData -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">convertPathData</p>
                <p class="text-[10px] text-[var(--text-muted)]">パスデータの最適化</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.convertPathData.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.convertPathData.enabled}
              <div class="ml-4 flex flex-col gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                <label class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-[var(--text-muted)]">floatPrecision</p>
                    <span class="text-xs font-mono text-[var(--color-primary)]">{config.plugins.convertPathData.floatPrecision}</span>
                  </div>
                  <input type="range" min="1" max="8" step="1" bind:value={config.plugins.convertPathData.floatPrecision} class="range-input" />
                </label>
                <label class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-[var(--text-muted)]">transformPrecision</p>
                    <span class="text-xs font-mono text-[var(--color-primary)]">{config.plugins.convertPathData.transformPrecision}</span>
                  </div>
                  <input type="range" min="1" max="8" step="1" bind:value={config.plugins.convertPathData.transformPrecision} class="range-input" />
                </label>
                {#each [
                  { key: 'applyTransforms',       label: 'applyTransforms — transform を適用' },
                  { key: 'straightCurves',         label: 'straightCurves — 直線カーブを変換' },
                  { key: 'convertToZ',             label: 'convertToZ — 始点への直線を Z に変換' },
                  { key: 'lineShorthands',         label: 'lineShorthands — 水平・垂直線を短縮' },
                  { key: 'curveSmoothShorthands',  label: 'curveSmoothShorthands — 滑らかカーブを短縮' },
                  { key: 'removeUseless',          label: 'removeUseless — 不要なコマンドを削除' },
                  { key: 'collapseRepeated',       label: 'collapseRepeated — 連続コマンドを結合' },
                  { key: 'utilizeAbsolute',        label: 'utilizeAbsolute — 短い方の座標系を使用' },
                  { key: 'negativeExtraSpace',     label: 'negativeExtraSpace — 負値の空白を省略' },
                ] as item}
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">{item.label}</p>
                    <input type="checkbox"
                      checked={(config.plugins.convertPathData as Record<string, unknown>)[item.key] as boolean}
                      onchange={(e) => { (config.plugins.convertPathData as Record<string, unknown>)[item.key] = (e.target as HTMLInputElement).checked }}
                      class="toggle-checkbox" />
                  </label>
                {/each}
              </div>
            {/if}
          </div>

          <!-- convertTransform -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">convertTransform</p>
                <p class="text-[10px] text-[var(--text-muted)]">transform 属性の最適化</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.convertTransform.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.convertTransform.enabled}
              <div class="ml-4 flex flex-col gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                <label class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-[var(--text-muted)]">floatPrecision</p>
                    <span class="text-xs font-mono text-[var(--color-primary)]">{config.plugins.convertTransform.floatPrecision}</span>
                  </div>
                  <input type="range" min="1" max="8" step="1" bind:value={config.plugins.convertTransform.floatPrecision} class="range-input" />
                </label>
                <label class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-[var(--text-muted)]">transformPrecision</p>
                    <span class="text-xs font-mono text-[var(--color-primary)]">{config.plugins.convertTransform.transformPrecision}</span>
                  </div>
                  <input type="range" min="1" max="8" step="1" bind:value={config.plugins.convertTransform.transformPrecision} class="range-input" />
                </label>
                {#each [
                  { key: 'convertToShorts',    label: 'convertToShorts — 短縮 transform を使用' },
                  { key: 'matrixToTransform',  label: 'matrixToTransform — matrix を個別関数に変換' },
                  { key: 'shortTranslate',     label: 'shortTranslate — translate を短縮' },
                  { key: 'shortScale',         label: 'shortScale — scale を短縮' },
                  { key: 'shortRotate',        label: 'shortRotate — rotate を短縮' },
                  { key: 'removeUseless',      label: 'removeUseless — 不要な transform を削除' },
                  { key: 'collapseIntoOne',    label: 'collapseIntoOne — transform を結合' },
                  { key: 'leadingZero',        label: 'leadingZero — 先頭ゼロを省略' },
                  { key: 'negativeExtraSpace', label: 'negativeExtraSpace — 負値の空白を省略' },
                ] as item}
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">{item.label}</p>
                    <input type="checkbox"
                      checked={(config.plugins.convertTransform as Record<string, unknown>)[item.key] as boolean}
                      onchange={(e) => { (config.plugins.convertTransform as Record<string, unknown>)[item.key] = (e.target as HTMLInputElement).checked }}
                      class="toggle-checkbox" />
                  </label>
                {/each}
              </div>
            {/if}
          </div>

          <!-- convertShapeToPath -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">convertShapeToPath</p>
                <p class="text-[10px] text-[var(--text-muted)]">図形要素を path に変換</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.convertShapeToPath.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.convertShapeToPath.enabled}
              <div class="ml-4 border-l-2 border-[var(--outline-variant)] pl-4">
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">convertArcs — arc も変換対象に含める</p>
                  <input type="checkbox" bind:checked={config.plugins.convertShapeToPath.convertArcs} class="toggle-checkbox" />
                </label>
              </div>
            {/if}
          </div>

          <!-- inlineStyles -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">inlineStyles</p>
                <p class="text-[10px] text-[var(--text-muted)]">&lt;style&gt; のスタイルを属性にインライン化</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.inlineStyles.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.inlineStyles.enabled}
              <div class="ml-4 flex flex-col gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">onlyMatchedOnce — 1要素にしか当たらないルールのみ</p>
                  <input type="checkbox" bind:checked={config.plugins.inlineStyles.onlyMatchedOnce} class="toggle-checkbox" />
                </label>
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">removeMatchedSelectors — インライン化後のルールを削除</p>
                  <input type="checkbox" bind:checked={config.plugins.inlineStyles.removeMatchedSelectors} class="toggle-checkbox" />
                </label>
              </div>
            {/if}
          </div>

          <!-- removeUnknownsAndDefaults -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">removeUnknownsAndDefaults</p>
                <p class="text-[10px] text-[var(--text-muted)]">不明属性・デフォルト値属性を削除</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.removeUnknownsAndDefaults.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.removeUnknownsAndDefaults.enabled}
              <div class="ml-4 grid grid-cols-1 gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                {#each [
                  { key: 'unknownContent',  label: 'unknownContent — 不明な子要素を削除' },
                  { key: 'unknownAttrs',    label: 'unknownAttrs — 不明な属性を削除' },
                  { key: 'defaultAttrs',    label: 'defaultAttrs — デフォルト値の属性を削除' },
                  { key: 'uselessOverrides',label: 'uselessOverrides — 親から継承される属性を削除' },
                  { key: 'keepDataAttrs',   label: 'keepDataAttrs — data-* 属性を保持' },
                  { key: 'keepAriaAttrs',   label: 'keepAriaAttrs — ARIA 属性を保持' },
                ] as item}
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">{item.label}</p>
                    <input type="checkbox"
                      checked={(config.plugins.removeUnknownsAndDefaults as Record<string, unknown>)[item.key] as boolean}
                      onchange={(e) => { (config.plugins.removeUnknownsAndDefaults as Record<string, unknown>)[item.key] = (e.target as HTMLInputElement).checked }}
                      class="toggle-checkbox" />
                  </label>
                {/each}
              </div>
            {/if}
          </div>

          <!-- mergePaths -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-mono font-medium">mergePaths</p>
                <p class="text-[10px] text-[var(--text-muted)]">パスを結合して最適化</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.mergePaths.enabled} class="toggle-checkbox" />
            </div>
            {#if config.plugins.mergePaths.enabled}
              <div class="ml-4 border-l-2 border-[var(--outline-variant)] pl-4">
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <p class="text-xs text-[var(--text-muted)]">force — 異なる属性を持つパスも強制的に結合</p>
                  <input type="checkbox" bind:checked={config.plugins.mergePaths.force} class="toggle-checkbox" />
                </label>
              </div>
            {/if}
          </div>

          <!-- ─ オプショナルプラグイン ─ -->
          <div class="flex flex-col gap-3">
            <p class="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">オプショナルプラグイン（デフォルト無効）</p>

            <!-- removeViewBox -->
            <label class="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p class="text-xs font-mono font-medium">removeViewBox</p>
                <p class="text-[10px] text-[var(--text-muted)]"><i class="fas fa-exclamation-triangle text-amber-500 text-[9px]"></i> スケーラビリティに影響</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.removeViewBox} class="toggle-checkbox" />
            </label>

            <!-- removeDimensions -->
            <label class="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p class="text-xs font-mono font-medium">removeDimensions</p>
                <p class="text-[10px] text-[var(--text-muted)]">width/height 属性を削除（viewBox があれば）</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.removeDimensions} class="toggle-checkbox" />
            </label>

            <!-- removeXMLNS -->
            <label class="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p class="text-xs font-mono font-medium">removeXMLNS</p>
                <p class="text-[10px] text-[var(--text-muted)]">xmlns 属性を削除（インライン SVG 向け）</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.removeXMLNS} class="toggle-checkbox" />
            </label>

            <!-- sortAttrs -->
            <label class="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p class="text-xs font-mono font-medium">sortAttrs</p>
                <p class="text-[10px] text-[var(--text-muted)]">属性をアルファベット順にソート</p>
              </div>
              <input type="checkbox" bind:checked={config.plugins.sortAttrs} class="toggle-checkbox" />
            </label>

            <!-- prefixIds -->
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-mono font-medium">prefixIds</p>
                  <p class="text-[10px] text-[var(--text-muted)]">ID・クラス名にプレフィックスを付与</p>
                </div>
                <input type="checkbox" bind:checked={config.plugins.prefixIds.enabled} class="toggle-checkbox" />
              </div>
              {#if config.plugins.prefixIds.enabled}
                <div class="ml-4 flex flex-col gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                  <label class="flex flex-col gap-1">
                    <p class="text-xs text-[var(--text-muted)]">prefix（プレフィックス文字列）</p>
                    <input type="text" bind:value={config.plugins.prefixIds.prefix}
                      class="text-xs px-2 py-1 rounded-lg border border-[var(--outline-variant)] bg-[var(--background)] text-[var(--text)] outline-none focus:border-[var(--color-primary)]" />
                  </label>
                  <label class="flex flex-col gap-1">
                    <p class="text-xs text-[var(--text-muted)]">delim（区切り文字）</p>
                    <input type="text" bind:value={config.plugins.prefixIds.delim}
                      class="text-xs px-2 py-1 rounded-lg border border-[var(--outline-variant)] bg-[var(--background)] text-[var(--text)] outline-none focus:border-[var(--color-primary)]" />
                  </label>
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">prefixIds — ID 属性にプレフィックス</p>
                    <input type="checkbox" bind:checked={config.plugins.prefixIds.prefixIds} class="toggle-checkbox" />
                  </label>
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">prefixClassNames — クラス名にプレフィックス</p>
                    <input type="checkbox" bind:checked={config.plugins.prefixIds.prefixClassNames} class="toggle-checkbox" />
                  </label>
                </div>
              {/if}
            </div>

            <!-- convertStyleToAttrs -->
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-mono font-medium">convertStyleToAttrs</p>
                  <p class="text-[10px] text-[var(--text-muted)]">style 属性をプレゼンテーション属性に変換</p>
                </div>
                <input type="checkbox" bind:checked={config.plugins.convertStyleToAttrs.enabled} class="toggle-checkbox" />
              </div>
              {#if config.plugins.convertStyleToAttrs.enabled}
                <div class="ml-4 border-l-2 border-[var(--outline-variant)] pl-4">
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">keepImportant — !important スタイルを保持</p>
                    <input type="checkbox" bind:checked={config.plugins.convertStyleToAttrs.keepImportant} class="toggle-checkbox" />
                  </label>
                </div>
              {/if}
            </div>

            <!-- cleanupListOfValues -->
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-mono font-medium">cleanupListOfValues</p>
                  <p class="text-[10px] text-[var(--text-muted)]">リスト値の精度丸め・単位変換</p>
                </div>
                <input type="checkbox" bind:checked={config.plugins.cleanupListOfValues.enabled} class="toggle-checkbox" />
              </div>
              {#if config.plugins.cleanupListOfValues.enabled}
                <div class="ml-4 flex flex-col gap-2 border-l-2 border-[var(--outline-variant)] pl-4">
                  <label class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                      <p class="text-xs text-[var(--text-muted)]">floatPrecision</p>
                      <span class="text-xs font-mono text-[var(--color-primary)]">{config.plugins.cleanupListOfValues.floatPrecision}</span>
                    </div>
                    <input type="range" min="1" max="8" step="1" bind:value={config.plugins.cleanupListOfValues.floatPrecision} class="range-input" />
                  </label>
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">leadingZero — 先頭ゼロを省略</p>
                    <input type="checkbox" bind:checked={config.plugins.cleanupListOfValues.leadingZero} class="toggle-checkbox" />
                  </label>
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">defaultPx — px 単位を省略</p>
                    <input type="checkbox" bind:checked={config.plugins.cleanupListOfValues.defaultPx} class="toggle-checkbox" />
                  </label>
                  <label class="flex items-center justify-between gap-3 cursor-pointer">
                    <p class="text-xs text-[var(--text-muted)]">convertToPx — 絶対単位を px に変換</p>
                    <input type="checkbox" bind:checked={config.plugins.cleanupListOfValues.convertToPx} class="toggle-checkbox" />
                  </label>
                </div>
              {/if}
            </div>

          </div>
        </div>
      {/if}

    </div>
  </section>

  <!-- ═══ 最適化ボタン ══════════════════════════════════════════ -->
  {#if files.length > 0 && allStatus !== 'optimizing'}
    <button
      onclick={optimize}
      class="btn-filled w-full justify-center py-3 rounded-2xl text-base"
    >
      <i class="fas fa-compress-alt"></i>
      {allStatus === 'done' ? '再度最適化' : 'SVGを最適化'}
    </button>
  {:else if allStatus === 'optimizing'}
    <div class="m3-card px-5 py-4 flex items-center gap-3">
      <i class="fas fa-spinner fa-spin text-[var(--color-primary)]"></i>
      <span class="text-sm text-[var(--text-muted)]">最適化中…</span>
    </div>
  {/if}

  <!-- ═══ 合計サマリー ══════════════════════════════════════════ -->
  {#if allStatus === 'done'}
    {@const doneFiles = files.filter((f) => f.status === 'done' && f.optimizedSize !== null)}
    {@const totalOriginal = doneFiles.reduce((s, f) => s + f.originalSize, 0)}
    {@const totalOptimized = doneFiles.reduce((s, f) => s + (f.optimizedSize ?? 0), 0)}
    <div class="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container)] px-5 py-4 flex items-center justify-between">
      <div class="text-sm">
        <span class="text-[var(--text-muted)]">合計削減量</span>
        <span class="ml-2 font-semibold">{formatSize(totalOriginal - totalOptimized)}</span>
        <span class="text-[var(--text-muted)] ml-1">({reductionRate(totalOriginal, totalOptimized)}% 削減)</span>
      </div>
    </div>
  {/if}

</div>

<style>
  .toggle-checkbox {
    appearance: none;
    width: 2.25rem;
    height: 1.25rem;
    border-radius: 9999px;
    background: var(--outline-variant);
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.2s;
  }
  .toggle-checkbox::after {
    content: '';
    position: absolute;
    width: 1rem;
    height: 1rem;
    border-radius: 9999px;
    background: white;
    top: 0.125rem;
    left: 0.125rem;
    transition: transform 0.2s;
  }
  .toggle-checkbox:checked {
    background: var(--color-primary);
  }
  .toggle-checkbox:checked::after {
    transform: translateX(1rem);
  }
  .range-input {
    width: 100%;
    accent-color: var(--color-primary);
  }
</style>
