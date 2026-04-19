<script lang="ts">
  import type { PageDescriptor } from '@/lib/pdf/pdf-engine'

  interface Props {
    pages:      PageDescriptor[]
    pageCount:  number
    splitAt:    number
    splitLabel: string
    onclose:    () => void
    onconfirm:  () => void
  }

  let {
    pages, pageCount,
    splitAt = $bindable(),
    splitLabel,
    onclose, onconfirm,
  }: Props = $props()
</script>

<div
  class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
  onclick={(e) => { if (e.target === e.currentTarget) onclose() }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose() }}
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
      <button class="btn-icon" onclick={onclose} aria-label="閉じる">
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
      <button class="btn-outlined" onclick={onclose}>キャンセル</button>
      <button
        class="btn-filled"
        onclick={onconfirm}
        disabled={splitAt <= 0 || splitAt >= pageCount}
      >
        <i class="fas fa-scissors"></i>分割してDL
      </button>
    </div>

  </div>
</div>
