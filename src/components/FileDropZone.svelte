<script lang="ts">
  interface Props {
    accept?: string
    multiple?: boolean
    onFiles: (files: File[]) => void
    label?: string
    sublabel?: string
  }

  const {
    accept = '*',
    multiple = false,
    onFiles,
    label = 'ここにファイルをドロップ',
    sublabel = 'またはクリックして選択',
  }: Props = $props()

  let dragging = $state(false)
  let inputEl: HTMLInputElement

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) onFiles(files)
  }

  function handleChange(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? [])
    if (files.length) onFiles(files)
    inputEl.value = ''
  }
</script>

<div
  role="button"
  tabindex="0"
  aria-label="ファイルをドロップまたはクリックして選択"
  class="relative w-full rounded-2xl border-2 border-dashed transition-colors duration-300 cursor-pointer p-8 text-center
    {dragging
      ? 'border-primary bg-primary-light'
      : 'border-(--outline-variant) hover:border-primary hover:bg-primary-light'}"
  ondragover={(e) => { e.preventDefault(); dragging = true }}
  ondragleave={() => { dragging = false }}
  ondrop={handleDrop}
  onclick={() => inputEl.click()}
  onkeydown={(e) => e.key === 'Enter' && inputEl.click()}
>
  <input
    bind:this={inputEl}
    type="file"
    {accept}
    {multiple}
    class="sr-only"
    onchange={handleChange}
  />

  <div class="flex flex-col items-center gap-3 pointer-events-none">
    <i class="fas fa-cloud-upload-alt text-3xl text-[var(--color-primary)] opacity-70"></i>
    <p class="text-sm font-medium text-(--on-surface)">{label}</p>
    <p class="text-sm text-(--on-surface-variant)">{sublabel}</p>
  </div>
</div>
