<script lang="ts">
  // html5-qrcode はブラウザグローバル経由で使用
  declare const Html5Qrcode: any

  let message      = $state<{ text: string; type: 'success' | 'error' } | null>(null)
  let messageTimer = $state<ReturnType<typeof setTimeout> | null>(null)
  let result       = $state<string | null>(null)
  let scanning     = $state(false)
  let cameraOpen   = $state(false)

  let qrInstance: any = null
  let fileInputEl: HTMLInputElement

  function notify(text: string, type: 'success' | 'error' = 'success') {
    if (messageTimer) clearTimeout(messageTimer)
    message = { text, type }
    messageTimer = setTimeout(() => { message = null }, 5000)
  }

  async function ensureLib() {
    if (typeof Html5Qrcode !== 'undefined') return
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'
      s.integrity = 'sha256-ZgsSQ3sddH4+aLi+BoXAjLcoFAEQrSE/FnsUtm+LHY4='
      s.crossOrigin = 'anonymous'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('ライブラリの読み込みに失敗しました'))
      document.head.appendChild(s)
    })
  }

  async function startCamera() {
    try {
      await ensureLib()
      cameraOpen = true
      scanning = true
      // DOM が更新された後に Html5Qrcode を初期化する必要があるため tick を待つ
      await Promise.resolve()
      qrInstance = new Html5Qrcode('qr-reader-el')
      await qrInstance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text: string) => { result = text; notify('QRコードを読み取りました！'); stopCamera() },
        () => {}
      )
    } catch (e: any) {
      cameraOpen = false
      scanning = false
      if (e?.name === 'NotAllowedError') notify('カメラへのアクセスが拒否されました。ブラウザの設定を確認してください。', 'error')
      else if (e?.name === 'NotFoundError') notify('カメラが見つかりませんでした。', 'error')
      else notify(`カメラの起動に失敗しました: ${e?.message ?? e}`, 'error')
    }
  }

  async function stopCamera() {
    if (qrInstance && scanning) {
      try { await qrInstance.stop() } catch {}
    }
    scanning = false
    cameraOpen = false
    qrInstance = null
  }

  async function scanFromFile(file: File) {
    if (!file.type.startsWith('image/')) { notify('画像ファイルを選択してください', 'error'); return }
    try {
      await ensureLib()
      if (!qrInstance) qrInstance = new Html5Qrcode('qr-reader-el')
      const text = await qrInstance.scanFile(file, true)
      result = text
      notify('QRコードを読み取りました！')
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ?? ''
      if (msg.includes('QR code parse error') || msg.includes('No QR code found')) {
        notify('QRコードが見つかりませんでした。別の画像をお試しください。', 'error')
      } else {
        notify(`ファイルの読み取りに失敗しました: ${msg}`, 'error')
      }
    }
  }

  async function copyResult() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      notify('クリップボードにコピーしました！')
    } catch {
      notify('コピーに失敗しました', 'error')
    }
  }

  function clearResult() { result = null }

  $effect(() => {
    return () => { stopCamera() }
  })
</script>

<!-- hidden div: html5-qrcode のマウント先 -->
<div id="qr-reader-el" class={cameraOpen ? '' : 'hidden'}></div>

<div class="flex flex-col gap-6">
  {#if message}
    <div class="msg-animate px-4 py-3 rounded-2xl text-sm font-medium border
      {message.type === 'success'
        ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
        : 'bg-[var(--error-bg)] text-[var(--error-text)] border-[var(--error-border)]'}">
      {message.text}
    </div>
  {/if}

  <!-- スキャン方法選択 -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <button
      onclick={cameraOpen ? stopCamera : startCamera}
      class="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer
        {cameraOpen
          ? 'border-[var(--color-danger)] bg-[var(--error-bg)] text-[var(--error-text)]'
          : 'border-(--outline-variant) bg-(--surface-container) text-(--on-surface) hover:border-primary hover:bg-primary-light'}"
    >
      <i class="fas {cameraOpen ? 'fa-stop-circle' : 'fa-camera'} text-3xl"></i>
      <span class="text-sm font-medium">{cameraOpen ? 'カメラを停止' : 'カメラで読み取り'}</span>
    </button>

    <button
      onclick={() => fileInputEl.click()}
      class="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-(--outline-variant) bg-(--surface-container) text-(--on-surface) hover:border-primary hover:bg-primary-light transition-all duration-200 cursor-pointer"
    >
      <i class="fas fa-image text-3xl text-[var(--color-primary)]"></i>
      <span class="text-sm font-medium">画像ファイルから読み取り</span>
    </button>

    <input
      bind:this={fileInputEl}
      type="file"
      accept="image/*"
      class="sr-only"
      onchange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0]
        if (f) scanFromFile(f)
        ;(e.target as HTMLInputElement).value = ''
      }}
    />
  </div>

  <!-- カメラプレビュー -->
  {#if cameraOpen}
    <div class="rounded-2xl overflow-hidden border border-(--outline-variant) bg-black">
      <!-- html5-qrcode が #qr-reader-el にカメラ映像をマウントする -->
    </div>
  {/if}

  <!-- 読み取り結果 -->
  {#if result !== null}
    <div class="m3-card p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-(--on-surface) flex items-center gap-2">
          <i class="fas fa-check-circle text-primary"></i> 読み取り結果
        </h2>
        <button
          onclick={clearResult}
          class="btn-icon"
          aria-label="クリア"
        ><i class="fas fa-times text-xs"></i></button>
      </div>
      <p class="text-sm text-(--on-surface) break-all font-mono mb-4">{result}</p>
      <div class="flex gap-2">
        <button
          onclick={copyResult}
          class="btn-filled"
        >
          <i class="fas fa-copy"></i> コピー
        </button>
        {#if result.startsWith('http')}
          <a
            href={result}
            target="_blank"
            rel="noopener noreferrer"
            class="btn-outlined no-underline"
          >
            <i class="fas fa-external-link-alt"></i> 開く
          </a>
        {/if}
      </div>
    </div>
  {/if}

</div>
