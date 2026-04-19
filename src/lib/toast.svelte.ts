/** Svelte 5 rune ベースのグローバル通知ストア */

let _message = $state<{ text: string; type: 'success' | 'error' } | null>(null)
let _timer: ReturnType<typeof setTimeout> | null = null

export const toast = {
  get message() { return _message },

  notify(text: string, type: 'success' | 'error' = 'success', durationMs = 5000) {
    if (_timer) clearTimeout(_timer)
    _message = { text, type }
    _timer = setTimeout(() => { _message = null }, durationMs)
  },
}
