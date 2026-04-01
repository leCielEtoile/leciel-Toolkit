<script lang="ts">
  let isDark = $state(false)

  function init() {
    const stored = localStorage.getItem('darkMode')
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    isDark = stored === 'enabled' || (!stored && systemDark)
    applyDark(isDark)

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('darkMode')) {
        isDark = e.matches
        applyDark(isDark)
      }
    })
  }

  function applyDark(dark: boolean) {
    document.documentElement.classList.toggle('dark', dark)
  }

  function toggle() {
    isDark = !isDark
    applyDark(isDark)
    localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled')
  }

  $effect(() => {
    init()
  })
</script>

<button
  onclick={toggle}
  aria-label={isDark ? 'ライトモード切替' : 'ダークモード切替'}
  title={isDark ? 'ライトモード切替' : 'ダークモード切替'}
  class="btn-icon outlined"
>
  {#if isDark}
    <i class="fas fa-sun text-sm"></i>
  {:else}
    <i class="fas fa-moon text-sm"></i>
  {/if}
</button>
