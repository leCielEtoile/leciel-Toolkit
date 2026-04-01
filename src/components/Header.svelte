<script lang="ts">
  import DarkModeToggle from './DarkModeToggle.svelte'

  interface Props {
    title: string
    showHome?: boolean
  }

  const { title, showHome = true }: Props = $props()
</script>

<header class="w-full bg-[var(--surface-container)] border-b border-[var(--outline-variant)] h-14 flex items-center px-3 gap-2">
  <!-- 左: ホームボタン -->
  <div class="shrink-0 w-10">
    {#if showHome}
      <a
        href="/"
        aria-label="ホームに戻る"
        title="ホームに戻る"
        class="btn-icon"
      >
        <i class="fas fa-arrow-left text-sm"></i>
      </a>
    {/if}
  </div>

  <!-- 中央: タイトル（flex-1 で残りスペースを使い切る） -->
  <h1 class="flex-1 text-center text-base font-semibold text-(--on-surface) select-none truncate px-1">{title}</h1>

  <!-- 右: ダークモード -->
  <div class="shrink-0 w-10 flex justify-end">
    <DarkModeToggle />
  </div>
</header>
