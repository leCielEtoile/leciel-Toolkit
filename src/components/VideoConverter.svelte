<script lang="ts">
  import FileDropZone from './FileDropZone.svelte'
  import Toast from './Toast.svelte'
  import { toast } from '@/lib/toast.svelte'
  import { formatSize, triggerDownload } from '@/lib/utils'
  import {
    initFFmpeg, convertFile, buildOutputFilename,
    type ConvertOptions, type VideoFormat, type AudioFormat,
    type VideoCodec, type AudioCodec, type H264Preset, type H264Tune,
    type H264Profile, type Vp9Quality, type RateControlMode,
    type PixelFormat, type SampleRate, type AudioChannels, type RotateFilter,
  } from '@/lib/video-converter/ffmpeg-engine'

  // ─── 型 ──────────────────────────────────────────────────────
  type Mode = 'video' | 'audio'

  // ─── 定数 ────────────────────────────────────────────────────
  const VIDEO_FORMATS: { value: VideoFormat; label: string }[] = [
    { value: 'mp4',  label: 'MP4'  },
    { value: 'webm', label: 'WebM' },
    { value: 'mov',  label: 'MOV'  },
    { value: 'avi',  label: 'AVI'  },
    { value: 'mkv',  label: 'MKV'  },
  ]

  const AUDIO_FORMATS: { value: AudioFormat; label: string }[] = [
    { value: 'mp3',  label: 'MP3'  },
    { value: 'wav',  label: 'WAV'  },
    { value: 'aac',  label: 'AAC'  },
    { value: 'ogg',  label: 'OGG'  },
    { value: 'flac', label: 'FLAC' },
    { value: 'm4a',  label: 'M4A'  },
  ]

  // フォーマット別の対応映像コーデック
  const VIDEO_CODECS_BY_FORMAT: Record<VideoFormat, { value: VideoCodec; label: string }[]> = {
    mp4:  [{ value: 'libx264',    label: 'H.264 (libx264)'   },
           { value: 'libx265',    label: 'H.265/HEVC (libx265)' },
           { value: 'copy',       label: 'コピー (無変換)'    }],
    webm: [{ value: 'libvpx-vp9', label: 'VP9 (libvpx-vp9)'  },
           { value: 'libvpx',     label: 'VP8 (libvpx)'      },
           { value: 'copy',       label: 'コピー (無変換)'    }],
    mov:  [{ value: 'libx264',    label: 'H.264 (libx264)'   },
           { value: 'libx265',    label: 'H.265/HEVC (libx265)' },
           { value: 'copy',       label: 'コピー (無変換)'    }],
    avi:  [{ value: 'libx264',    label: 'H.264 (libx264)'   },
           { value: 'copy',       label: 'コピー (無変換)'    }],
    mkv:  [{ value: 'libx264',    label: 'H.264 (libx264)'   },
           { value: 'libx265',    label: 'H.265/HEVC (libx265)' },
           { value: 'libvpx-vp9', label: 'VP9 (libvpx-vp9)'  },
           { value: 'copy',       label: 'コピー (無変換)'    }],
  }

  const AUDIO_CODECS: { value: AudioCodec; label: string; desc: string }[] = [
    { value: 'aac',        label: 'AAC',         desc: 'MP4/M4A 標準。高品質・広互換' },
    { value: 'libmp3lame', label: 'MP3',          desc: '汎用。最も広い互換性' },
    { value: 'libopus',    label: 'Opus',         desc: '最高効率。WebM/OGG 向け' },
    { value: 'libvorbis',  label: 'Vorbis',       desc: 'OGG コンテナ向けオープンコーデック' },
    { value: 'flac',       label: 'FLAC',         desc: '可逆圧縮。音質劣化なし' },
    { value: 'pcm_s16le',  label: 'PCM 16-bit',  desc: '無圧縮。WAV 向け' },
    { value: 'copy',       label: 'コピー',        desc: '音声を再エンコードしない' },
    { value: 'none',       label: '除去',          desc: '音声トラックをすべて削除' },
  ]

  const H264_PRESETS: { value: H264Preset; label: string }[] = [
    { value: 'ultrafast', label: 'ultrafast — 最速/最低品質' },
    { value: 'superfast', label: 'superfast'                  },
    { value: 'veryfast',  label: 'veryfast'                   },
    { value: 'faster',    label: 'faster'                     },
    { value: 'fast',      label: 'fast'                       },
    { value: 'medium',    label: 'medium — 標準'              },
    { value: 'slow',      label: 'slow'                       },
    { value: 'slower',    label: 'slower'                     },
    { value: 'veryslow',  label: 'veryslow — 最遅/最高品質'   },
  ]

  const H264_TUNES: { value: H264Tune; label: string; desc: string }[] = [
    { value: 'none',        label: 'なし',            desc: 'デフォルト' },
    { value: 'film',        label: 'フィルム',         desc: '実写映像向け' },
    { value: 'animation',   label: 'アニメ',           desc: 'アニメ・CG 向け (デブロッキング強め)' },
    { value: 'grain',       label: 'グレイン',         desc: 'フィルムグレインを保持' },
    { value: 'stillimage',  label: '静止画',            desc: 'スライドショー等' },
    { value: 'fastdecode',  label: '高速デコード',     desc: '低スペックデバイスでの再生向け' },
    { value: 'zerolatency', label: 'ゼロレイテンシ',   desc: 'ライブストリーミング向け' },
  ]

  const H264_PROFILES: { value: H264Profile; label: string; desc: string }[] = [
    { value: 'baseline', label: 'Baseline', desc: '最高互換性。古いデバイス・低スペック向け' },
    { value: 'main',     label: 'Main',     desc: '標準。ほとんどの環境で動作' },
    { value: 'high',     label: 'High',     desc: '高品質。最新デバイス向け' },
  ]

  const PIXEL_FORMATS: { value: PixelFormat; label: string; desc: string }[] = [
    { value: 'yuv420p',     label: 'YUV 4:2:0',         desc: '標準・最高互換性' },
    { value: 'yuv422p',     label: 'YUV 4:2:2',         desc: '放送・映像編集向け' },
    { value: 'yuv444p',     label: 'YUV 4:4:4',         desc: '最高色精度' },
    { value: 'yuv420p10le', label: 'YUV 4:2:0 10-bit',  desc: 'HDR・高ビット深度' },
  ]

  const FPS_OPTIONS: { value: number | null; label: string }[] = [
    { value: null,   label: '元のまま' },
    { value: 23.976, label: '23.976 fps' },
    { value: 24,     label: '24 fps' },
    { value: 25,     label: '25 fps' },
    { value: 29.97,  label: '29.97 fps' },
    { value: 30,     label: '30 fps' },
    { value: 50,     label: '50 fps' },
    { value: 59.94,  label: '59.94 fps' },
    { value: 60,     label: '60 fps' },
  ]

  const AUDIO_BITRATES = ['64k', '96k', '128k', '192k', '256k', '320k']

  const SAMPLE_RATES: { value: SampleRate | null; label: string }[] = [
    { value: null,  label: '元のまま'   },
    { value: 22050, label: '22,050 Hz' },
    { value: 44100, label: '44,100 Hz' },
    { value: 48000, label: '48,000 Hz' },
    { value: 96000, label: '96,000 Hz' },
  ]

  // ─── プリセット型・定数 ──────────────────────────────────────
  interface Preset {
    id:   string
    name: string
    mode: Mode
    opts: ConvertOptions
  }

  const PRESET_STORAGE_KEY = 'videoConverter_presets'

  const BUILT_IN_PRESETS: { name: string; mode: Mode; opts: Partial<ConvertOptions> }[] = [
    {
      name: '高品質 MP4',
      mode: 'video',
      opts: { outputFormat: 'mp4', videoCodec: 'libx264', rateControlMode: 'crf', crf: 18,
              preset: 'slow', profile: 'high', pixelFormat: 'yuv420p',
              audioCodec: 'aac', audioBitrate: '192k' },
    },
    {
      name: '標準 MP4',
      mode: 'video',
      opts: { outputFormat: 'mp4', videoCodec: 'libx264', rateControlMode: 'crf', crf: 23,
              preset: 'medium', profile: 'high', pixelFormat: 'yuv420p',
              audioCodec: 'aac', audioBitrate: '128k' },
    },
    {
      name: '小ファイル',
      mode: 'video',
      opts: { outputFormat: 'mp4', videoCodec: 'libx264', rateControlMode: 'crf', crf: 28,
              preset: 'fast', profile: 'main', pixelFormat: 'yuv420p',
              audioCodec: 'aac', audioBitrate: '96k' },
    },
    {
      name: 'アニメ向け',
      mode: 'video',
      opts: { outputFormat: 'mp4', videoCodec: 'libx264', rateControlMode: 'crf', crf: 20,
              preset: 'slow', tune: 'animation', profile: 'high', pixelFormat: 'yuv420p',
              audioCodec: 'aac', audioBitrate: '128k' },
    },
    {
      name: 'Web 最適化 (VP9)',
      mode: 'video',
      opts: { outputFormat: 'webm', videoCodec: 'libvpx-vp9', rateControlMode: 'crf', crf: 33,
              vp9Quality: 'good', vp9CpuUsed: 4,
              audioCodec: 'libopus', audioBitrate: '128k' },
    },
    {
      name: 'MP3 高品質',
      mode: 'audio',
      opts: { outputFormat: 'mp3', audioCodec: 'libmp3lame', audioBitrate: '320k',
              sampleRate: 48000, audioChannels: '2', audioOnly: true },
    },
    {
      name: 'AAC 標準',
      mode: 'audio',
      opts: { outputFormat: 'aac', audioCodec: 'aac', audioBitrate: '192k',
              sampleRate: 48000, audioChannels: '2', audioOnly: true },
    },
    {
      name: 'FLAC ロスレス',
      mode: 'audio',
      opts: { outputFormat: 'flac', audioCodec: 'flac',
              sampleRate: null, audioChannels: 'original', audioOnly: true },
    },
  ]

  function loadPresets(): Preset[] {
    try { return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? '[]') }
    catch { return [] }
  }

  function savePresetsToStorage(list: Preset[]) {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(list))
  }

  // ─── 状態 ────────────────────────────────────────────────────
  let presets        = $state<Preset[]>(loadPresets())
  let showPresetInput = $state(false)
  let presetName      = $state('')
  let presetInputEl   = $state<HTMLInputElement | null>(null)

  let file         = $state<File | null>(null)
  let mode         = $state<Mode>('video')  // 'video' | 'audio'
  let status       = $state<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle')
  let progress     = $state(0)
  let elapsedSec   = $state(0)
  let resultBlob   = $state<Blob | null>(null)
  let resultName   = $state('')
  let advancedOpen = $state(false)

  let opts = $state<ConvertOptions>({
    outputFormat:       'mp4',
    // 映像
    videoCodec:         'libx264',
    rateControlMode:    'crf',
    crf:                23,
    videoBitrate:       '2000k',
    preset:             'medium',
    tune:               'none',
    profile:            'high',
    vp9Quality:         'good',
    vp9CpuUsed:         4,
    pixelFormat:        'yuv420p',
    // 解像度
    fps:                null,
    scaleWidth:         null,
    scaleHeight:        null,
    maintainAspectRatio: true,
    // 音声
    audioCodec:         'aac',
    audioBitrate:       '128k',
    sampleRate:         null,
    audioChannels:      'original',
    volumeDb:           0,
    // トリム
    startTime:          0,
    endTime:            null,
    // フィルター
    deinterlace:        false,
    rotate:             'none',
    flipHorizontal:     false,
    flipVertical:       false,
    stripMetadata:      false,
  })

  let startTs      = 0
  let timerHandle  = 0

  // ─── 派生状態 ────────────────────────────────────────────────
  let currentFormats     = $derived(mode === 'video' ? VIDEO_FORMATS : AUDIO_FORMATS)
  let availableVCodecs   = $derived(mode === 'video' ? (VIDEO_CODECS_BY_FORMAT[opts.outputFormat as VideoFormat] ?? []) : [])
  let isX264orX265       = $derived(opts.videoCodec === 'libx264' || opts.videoCodec === 'libx265')
  let isVP9              = $derived(opts.videoCodec === 'libvpx-vp9')
  let isVideoCopy        = $derived(opts.videoCodec === 'copy')
  let showCRFSlider      = $derived(!isVideoCopy && opts.rateControlMode === 'crf')
  let showVideoBitrate   = $derived(!isVideoCopy && (opts.rateControlMode === 'cbr' || opts.rateControlMode === '2pass'))
  let crfMax             = $derived(isVP9 ? 63 : 51)

  // ─── モード切り替え ──────────────────────────────────────────
  function setMode(m: Mode) {
    mode = m
    opts = {
      ...opts,
      outputFormat: m === 'video' ? 'mp4' : 'mp3',
      audioOnly:    m === 'audio',
      videoCodec:   m === 'video' ? 'libx264' : undefined,
    }
  }

  // ─── フォーマット変更（コーデック互換チェック付き）────────────
  function setFormat(fmt: VideoFormat | AudioFormat) {
    const newOpts: ConvertOptions = { ...opts, outputFormat: fmt }
    if (mode === 'video') {
      const avail = VIDEO_CODECS_BY_FORMAT[fmt as VideoFormat]
      if (avail && !avail.find(c => c.value === opts.videoCodec)) {
        newOpts.videoCodec = avail[0].value
      }
    }
    opts = newOpts
  }

  // ─── ファイル選択 ────────────────────────────────────────────
  function handleFiles(files: File[]) {
    const f = files[0]
    if (!f) return
    file = f
    status = 'idle'
    resultBlob = null
    resultName = ''
    progress = 0
  }

  // ─── 変換実行 ────────────────────────────────────────────────
  async function handleConvert() {
    if (!file) return

    // SharedArrayBuffer が利用できない場合は処理不可（FFmpeg WASM に必須）
    if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
      toast.notify(
        'SharedArrayBuffer が利用できません。ページを再読み込みするか、別のブラウザをお試しください。',
        'error',
      )
      return
    }

    status = 'loading'
    progress = 0
    elapsedSec = 0
    startTs = Date.now()
    timerHandle = window.setInterval(() => {
      elapsedSec = Math.floor((Date.now() - startTs) / 1000)
    }, 1000)
    try {
      await initFFmpeg()
      status = 'converting'
      const blob = await convertFile(file, opts, (ratio) => { progress = ratio })
      resultBlob = blob
      resultName = buildOutputFilename(file.name, opts.outputFormat)
      status = 'done'
      toast.notify('変換が完了しました')
    } catch (e) {
      status = 'error'
      const err = e as Error
      const msg = (err?.message ?? '').toLowerCase()
      if (
        err instanceof RangeError ||
        msg.includes('out of memory') ||
        msg.includes('memory access out of bounds') ||
        msg.includes('allocation failed') ||
        msg.includes('cannot allocate')
      ) {
        toast.notify(
          'メモリ不足で変換に失敗しました。より小さいファイル、または解像度・品質を下げた設定をお試しください。',
          'error',
        )
      } else if (
        msg.includes('shared') ||
        msg.includes('crossorigin') ||
        msg.includes('arraybuffer') ||
        msg.includes('sharedarraybuffer')
      ) {
        toast.notify(
          'クロスオリジン隔離エラーが発生しました。ページを再読み込みしてください。',
          'error',
        )
      } else {
        toast.notify(`変換に失敗しました: ${err?.message ?? '不明なエラー'}`, 'error')
      }
    } finally {
      clearInterval(timerHandle)
    }
  }

  function handleDownload() {
    if (!resultBlob) return
    triggerDownload(resultBlob, resultName)
  }

  function handleReset() {
    file = null; status = 'idle'; resultBlob = null
    resultName = ''; progress = 0; elapsedSec = 0
  }

  // ─── プリセット操作 ──────────────────────────────────────────
  function applyBuiltIn(bp: { mode: Mode; opts: Partial<ConvertOptions> }) {
    mode = bp.mode
    opts = { ...opts, ...bp.opts }
  }

  function applyPreset(p: Preset) {
    mode = p.mode
    opts = { ...p.opts }
  }

  function openPresetInput() {
    showPresetInput = true
    presetName = ''
    setTimeout(() => presetInputEl?.focus(), 50)
  }

  function savePreset() {
    const name = presetName.trim()
    if (!name) return
    const newPreset: Preset = { id: crypto.randomUUID(), name, mode, opts: { ...opts } }
    presets = [...presets, newPreset]
    savePresetsToStorage(presets)
    showPresetInput = false
    presetName = ''
    toast.notify(`プリセット「${name}」を保存しました`)
  }

  function deletePreset(id: string) {
    presets = presets.filter(p => p.id !== id)
    savePresetsToStorage(presets)
  }

  function handlePresetKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') savePreset()
    if (e.key === 'Escape') showPresetInput = false
  }

  // ─── ユーティリティ ──────────────────────────────────────────
  // ボタングループ用クラス生成
  function btnCls(active: boolean) {
    return active
      ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
      : 'border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--color-primary-light)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
  }

  // 詳細設定のセクション見出しクラス
  const advHeading = 'text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)] mb-3'

  // 詳細設定 セレクトボックス共通クラス
  const selectCls = 'w-full rounded-xl border border-[var(--outline-variant)] bg-[var(--background)] text-[var(--text)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--border-focus)] cursor-pointer'

  // 数値入力共通クラス
  const numInputCls = 'w-full rounded-xl border border-[var(--outline-variant)] bg-[var(--background)] text-[var(--text)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--border-focus)] font-mono'
</script>

<div class="flex flex-col gap-5">

  <Toast />

  <!-- ファイル選択 -->
  <FileDropZone
    accept="video/*,audio/*,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.aac,.ogg,.flac,.m4a"
    multiple={false}
    onFiles={handleFiles}
    label="動画・音声ファイルをドロップ"
    sublabel="MP4・WebM・MOV・AVI・MKV・MP3・WAV・AAC など"
  />

  <!-- ファイル情報 -->
  {#if file}
    <div class="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)]">
      <i class="fas fa-file-video text-[var(--color-primary)] text-lg shrink-0"></i>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">{file.name}</p>
        <p class="text-xs text-[var(--text-muted)]">{formatSize(file.size)} · {file.type || '不明'}</p>
      </div>
      {#if status === 'idle' || status === 'error'}
        <button
          onclick={handleReset}
          class="w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] bg-transparent border-0 cursor-pointer shrink-0"
          aria-label="ファイルを削除"
        ><i class="fas fa-times text-xs"></i></button>
      {/if}
    </div>
  {/if}

  <!-- ═══ 変換設定 ══════════════════════════════════════════════ -->
  <section class="m3-card overflow-hidden">
    <div class="px-5 py-4 border-b border-[var(--outline-variant)]">
      <span class="section-heading">変換設定</span>
    </div>

    <div class="px-5 py-4 flex flex-col gap-5">

      <!-- 変換モード -->
      <div>
        <p class="text-xs font-medium text-[var(--text-muted)] mb-2">変換モード</p>
        <div class="grid grid-cols-2 gap-1.5">
          {#each ([
            { value: 'video', label: '動画変換', icon: 'fa-film',  desc: '動画フォーマット変換・圧縮' },
            { value: 'audio', label: '音声出力', icon: 'fa-music', desc: '動画から音声抽出 / 音声変換' },
          ] as { value: Mode; label: string; icon: string; desc: string }[]) as m}
            <button
              onclick={() => setMode(m.value)}
              class="flex flex-col items-center gap-1 py-3 px-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer {btnCls(mode === m.value)}"
            >
              <i class="fas {m.icon} text-base"></i>
              <span class="font-bold">{m.label}</span>
              <span class="text-[10px] opacity-70 leading-tight text-center hidden sm:block">{m.desc}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- 出力フォーマット -->
      <div>
        <p class="text-xs font-medium text-[var(--text-muted)] mb-2">出力フォーマット</p>
        <div class="flex flex-wrap gap-1.5">
          {#each currentFormats as fmt}
            <button
              onclick={() => setFormat(fmt.value)}
              class="px-4 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer {btnCls(opts.outputFormat === fmt.value)}"
            >{fmt.label}</button>
          {/each}
        </div>
      </div>

      <!-- ═══ プリセット ══════════════════════════════════════════ -->

      <!-- ビルトインプリセット -->
      <div>
        <p class="text-xs font-medium text-[var(--text-muted)] mb-2">クイックプリセット</p>
        <div class="flex flex-wrap gap-2">
          {#each BUILT_IN_PRESETS as bp}
            <button
              onclick={() => applyBuiltIn(bp)}
              class="px-3 py-1 rounded-full text-xs font-medium border border-(--outline-variant) text-(--text-muted) bg-transparent hover:bg-primary-light hover:border-primary hover:text-primary transition-colors cursor-pointer"
            >
              {bp.name}
              <span class="opacity-50 ml-1">{bp.mode === 'video' ? '🎬' : '🎵'}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- ユーザープリセット -->
      {#if presets.length > 0 || showPresetInput}
        <div>
          <p class="text-xs font-medium text-[var(--text-muted)] mb-2">保存済みプリセット</p>
          <div class="flex flex-wrap gap-2">
            {#each presets as preset}
              <div class="group flex items-center gap-0.5 rounded-full border border-primary bg-primary-light overflow-hidden">
                <button
                  onclick={() => applyPreset(preset)}
                  title="{preset.mode === 'video' ? '動画変換' : '音声出力'} モード"
                  class="px-3 py-1 text-xs font-medium text-primary bg-transparent border-0 cursor-pointer hover:brightness-90"
                >
                  {preset.name}
                  <span class="opacity-50 ml-0.5">{preset.mode === 'video' ? '🎬' : '🎵'}</span>
                </button>
                <button
                  onclick={() => deletePreset(preset.id)}
                  aria-label="削除"
                  class="pr-2 text-primary opacity-50 hover:opacity-100 bg-transparent border-0 cursor-pointer text-xs"
                ><i class="fas fa-times"></i></button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- プリセット保存入力 -->
      {#if showPresetInput}
        <div class="flex items-center gap-2">
          <input
            bind:this={presetInputEl}
            bind:value={presetName}
            onkeydown={handlePresetKeydown}
            placeholder="プリセット名を入力…"
            class="flex-1 rounded-xl border border-(--border-focus) bg-(--background) text-(--text) px-3 py-1.5 text-sm focus:outline-none"
          />
          <button onclick={savePreset} class="btn-filled text-sm px-4 py-1.5">保存</button>
          <button onclick={() => showPresetInput = false} class="btn-outlined text-sm px-3 py-1.5">キャンセル</button>
        </div>
      {:else}
        <button onclick={openPresetInput} class="btn-text text-xs self-start px-2 py-1">
          <i class="fas fa-bookmark"></i> 現在の設定をプリセット保存
        </button>
      {/if}

      <!-- ═══ 詳細設定 ══════════════════════════════════════════ -->
      <div>
        <button
          onclick={() => advancedOpen = !advancedOpen}
          class="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-0 cursor-pointer p-0"
        >
          <i class="fas fa-chevron-{advancedOpen ? 'up' : 'down'} text-[10px]"></i>
          詳細設定
        </button>

        {#if advancedOpen}
          <div class="mt-4 flex flex-col gap-6">

            <!-- ══ 映像設定 (動画変換モードのみ) ════════════════ -->
            {#if mode === 'video'}
              <div>
                <p class={advHeading}><i class="fas fa-film mr-1"></i>映像設定</p>
                <div class="flex flex-col gap-4">

                  <!-- 映像コーデック -->
                  <div>
                    <p class="text-xs text-[var(--text-muted)] mb-1.5">映像コーデック</p>
                    <div class="flex flex-wrap gap-1.5">
                      {#each availableVCodecs as c}
                        <button
                          onclick={() => { opts = { ...opts, videoCodec: c.value } }}
                          class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer {btnCls(opts.videoCodec === c.value)}"
                        >{c.label}</button>
                      {/each}
                    </div>
                  </div>

                  <!-- レート制御 (コピー以外) -->
                  {#if !isVideoCopy}
                    <div>
                      <p class="text-xs text-[var(--text-muted)] mb-1.5">レート制御</p>
                      <div class="flex gap-1.5 flex-wrap">
                        {#each ([
                          { value: 'crf',   label: 'CRF',    desc: 'サイズは可変、品質を一定に保つ (品質固定)' },
                          { value: 'cbr',   label: 'CBR',    desc: 'ビットレートを一定に保つ (固定ビットレート)' },
                          { value: '2pass', label: '2-pass', desc: '2回エンコードで精度向上' },
                        ] as { value: RateControlMode; label: string; desc: string }[]) as rc}
                          <button
                            onclick={() => { opts = { ...opts, rateControlMode: rc.value } }}
                            title={rc.desc}
                            class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer {btnCls(opts.rateControlMode === rc.value)}"
                          >{rc.label}</button>
                        {/each}
                      </div>
                    </div>

                    <!-- CRF スライダー -->
                    {#if showCRFSlider}
                      <div>
                        <div class="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
                          <label for="crf-slider">CRF 値 {isVP9 ? '(VP9: 0–63)' : '(x264/x265: 0–51)'}</label>
                          <span class="font-mono text-[var(--color-primary)] text-sm">{opts.crf ?? 23}</span>
                        </div>
                        <input
                          id="crf-slider"
                          type="range" min="0" max={crfMax} step="1"
                          value={opts.crf ?? 23}
                          oninput={(e) => { opts = { ...opts, crf: Number((e.target as HTMLInputElement).value) } }}
                          class="w-full accent-[var(--color-primary)]"
                        />
                        <div class="flex justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
                          <span>高品質 (0)</span>
                          <span>小ファイル ({crfMax})</span>
                        </div>
                      </div>
                    {/if}

                    <!-- 映像ビットレート -->
                    {#if showVideoBitrate}
                      <div>
                        <label for="video-bitrate" class="block text-xs text-[var(--text-muted)] mb-1.5">映像ビットレート</label>
                        <div class="flex items-center gap-2">
                          <input
                            id="video-bitrate"
                            type="text"
                            value={opts.videoBitrate ?? '2000k'}
                            oninput={(e) => { opts = { ...opts, videoBitrate: (e.target as HTMLInputElement).value } }}
                            placeholder="例: 2000k, 5M"
                            class="{numInputCls} max-w-40"
                          />
                          <span class="text-xs text-[var(--text-muted)]">k = kbps, M = Mbps</span>
                        </div>
                      </div>
                    {/if}
                  {/if}

                  <!-- x264/x265 専用オプション -->
                  {#if isX264orX265}
                    <!-- エンコードプリセット -->
                    <div>
                      <label for="preset-select" class="block text-xs text-[var(--text-muted)] mb-1.5">
                        エンコードプリセット <span class="text-[10px]">(速度 ↔ 圧縮効率)</span>
                      </label>
                      <select
                        id="preset-select"
                        value={opts.preset ?? 'medium'}
                        onchange={(e) => { opts = { ...opts, preset: (e.target as HTMLSelectElement).value as H264Preset } }}
                        class={selectCls}
                      >
                        {#each H264_PRESETS as p}
                          <option value={p.value}>{p.label}</option>
                        {/each}
                      </select>
                      <p class="text-[10px] text-[var(--text-muted)] mt-1">速いプリセットほどファイルサイズが大きくなる。遅いプリセットほど圧縮効率が上がる</p>
                    </div>

                    <!-- チューン -->
                    <div>
                      <label for="tune-select" class="block text-xs text-[var(--text-muted)] mb-1.5">チューン</label>
                      <select
                        id="tune-select"
                        value={opts.tune ?? 'none'}
                        onchange={(e) => { opts = { ...opts, tune: (e.target as HTMLSelectElement).value as H264Tune } }}
                        class={selectCls}
                      >
                        {#each H264_TUNES as t}
                          <option value={t.value}>{t.label}{t.desc ? ` — ${t.desc}` : ''}</option>
                        {/each}
                      </select>
                    </div>

                    <!-- プロファイル (x264のみ) -->
                    {#if opts.videoCodec === 'libx264'}
                      <div>
                        <p class="text-xs text-[var(--text-muted)] mb-1.5">プロファイル</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each H264_PROFILES as p}
                            <button
                              onclick={() => { opts = { ...opts, profile: p.value } }}
                              title={p.desc}
                              class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer {btnCls(opts.profile === p.value)}"
                            >{p.label}</button>
                          {/each}
                        </div>
                        <p class="text-[10px] text-[var(--text-muted)] mt-1">
                          {H264_PROFILES.find(p => p.value === opts.profile)?.desc ?? ''}
                        </p>
                      </div>
                    {/if}
                  {/if}

                  <!-- VP9 専用オプション -->
                  {#if isVP9}
                    <div>
                      <p class="text-xs text-[var(--text-muted)] mb-1.5">VP9 品質モード</p>
                      <div class="flex gap-1.5 flex-wrap">
                        {#each ([
                          { value: 'realtime', label: 'realtime', desc: '最速。リアルタイム用' },
                          { value: 'good',     label: 'good',     desc: '標準バランス' },
                          { value: 'best',     label: 'best',     desc: '最高品質。低速' },
                        ] as { value: Vp9Quality; label: string; desc: string }[]) as q}
                          <button
                            onclick={() => { opts = { ...opts, vp9Quality: q.value } }}
                            title={q.desc}
                            class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer {btnCls(opts.vp9Quality === q.value)}"
                          >{q.label}</button>
                        {/each}
                      </div>
                    </div>
                    <div>
                      <div class="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
                        <label for="vp9-cpu">CPU 使用率 (cpu-used)</label>
                        <span class="font-mono text-[var(--color-primary)] text-sm">{opts.vp9CpuUsed ?? 4}</span>
                      </div>
                      <input
                        id="vp9-cpu"
                        type="range" min="0" max="8" step="1"
                        value={opts.vp9CpuUsed ?? 4}
                        oninput={(e) => { opts = { ...opts, vp9CpuUsed: Number((e.target as HTMLInputElement).value) } }}
                        class="w-full accent-[var(--color-primary)]"
                      />
                      <div class="flex justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
                        <span>高品質/低速 (0)</span>
                        <span>高速/低品質 (8)</span>
                      </div>
                    </div>
                  {/if}

                  <!-- ピクセルフォーマット -->
                  {#if !isVideoCopy}
                    <div>
                      <p class="text-xs text-[var(--text-muted)] mb-1.5">ピクセルフォーマット</p>
                      <div class="flex flex-wrap gap-1.5">
                        {#each PIXEL_FORMATS as pf}
                          <button
                            onclick={() => { opts = { ...opts, pixelFormat: pf.value } }}
                            title={pf.desc}
                            class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer {btnCls(opts.pixelFormat === pf.value)}"
                          >{pf.label}</button>
                        {/each}
                      </div>
                      <p class="text-[10px] text-[var(--text-muted)] mt-1">
                        {PIXEL_FORMATS.find(p => p.value === opts.pixelFormat)?.desc ?? ''}
                      </p>
                    </div>
                  {/if}

                </div>
              </div>

              <!-- ══ 解像度・フレームレート ════════════════════════ -->
              <div>
                <p class={advHeading}><i class="fas fa-expand-arrows-alt mr-1"></i>解像度・フレームレート</p>
                <div class="flex flex-col gap-4">

                  <!-- フレームレート -->
                  <div>
                    <label for="fps-select" class="block text-xs text-[var(--text-muted)] mb-1.5">フレームレート (FPS)</label>
                    <select
                      id="fps-select"
                      value={String(opts.fps ?? 'null')}
                      onchange={(e) => {
                        const v = (e.target as HTMLSelectElement).value
                        opts = { ...opts, fps: v === 'null' ? null : Number(v) }
                      }}
                      class={selectCls}
                    >
                      {#each FPS_OPTIONS as f}
                        <option value={String(f.value ?? 'null')}>{f.label}</option>
                      {/each}
                    </select>
                  </div>

                  <!-- 解像度スケール -->
                  <div>
                    <p class="text-xs text-[var(--text-muted)] mb-1.5">解像度スケール <span class="text-[10px]">(空欄 = 元のまま)</span></p>
                    <div class="flex items-center gap-2 flex-wrap">
                      <div class="flex flex-col gap-1">
                        <label for="scale-w" class="text-[10px] text-[var(--text-muted)]">幅 (px)</label>
                        <input
                          id="scale-w"
                          type="number" min="2" max="7680" step="2"
                          value={opts.scaleWidth ?? ''}
                          oninput={(e) => {
                            const v = (e.target as HTMLInputElement).value
                            opts = { ...opts, scaleWidth: v ? Number(v) : null }
                          }}
                          placeholder="例: 1920"
                          class="{numInputCls} w-28"
                        />
                      </div>
                      <span class="text-[var(--text-muted)] mt-4">×</span>
                      <div class="flex flex-col gap-1">
                        <label for="scale-h" class="text-[10px] text-[var(--text-muted)]">高さ (px)</label>
                        <input
                          id="scale-h"
                          type="number" min="2" max="4320" step="2"
                          value={opts.scaleHeight ?? ''}
                          oninput={(e) => {
                            const v = (e.target as HTMLInputElement).value
                            opts = { ...opts, scaleHeight: v ? Number(v) : null }
                          }}
                          placeholder="例: 1080"
                          class="{numInputCls} w-28"
                        />
                      </div>
                    </div>
                    <label class="flex items-center gap-2 mt-2 cursor-pointer select-none text-xs text-[var(--text-muted)]">
                      <input
                        type="checkbox"
                        bind:checked={opts.maintainAspectRatio}
                        class="accent-[var(--color-primary)]"
                      />
                      アスペクト比を維持（片方のみ指定で自動計算）
                    </label>
                  </div>
                </div>
              </div>
            {/if}

            <!-- ══ 音声設定 ════════════════════════════════════════ -->
            <div>
              <p class={advHeading}><i class="fas fa-volume-up mr-1"></i>音声設定</p>
              <div class="flex flex-col gap-4">

                <!-- 音声コーデック -->
                <div>
                  <p class="text-xs text-[var(--text-muted)] mb-1.5">音声コーデック</p>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {#each AUDIO_CODECS as ac}
                      <button
                        onclick={() => { opts = { ...opts, audioCodec: ac.value } }}
                        title={ac.desc}
                        class="px-2 py-1.5 rounded-xl text-xs border transition-colors cursor-pointer text-center {btnCls(opts.audioCodec === ac.value)}"
                      >
                        <span class="font-bold block">{ac.label}</span>
                        <span class="text-[10px] opacity-70 leading-tight hidden sm:block">{ac.desc.split('。')[0]}</span>
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- 音声ビットレート (コピー・PCM・FLAC・除去 以外) -->
                {#if opts.audioCodec !== 'copy' && opts.audioCodec !== 'none' && opts.audioCodec !== 'pcm_s16le' && opts.audioCodec !== 'flac'}
                  <div>
                    <p class="text-xs text-[var(--text-muted)] mb-1.5">音声ビットレート</p>
                    <div class="flex flex-wrap gap-1.5">
                      {#each AUDIO_BITRATES as br}
                        <button
                          onclick={() => { opts = { ...opts, audioBitrate: br } }}
                          class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer {btnCls(opts.audioBitrate === br)}"
                        >{br}</button>
                      {/each}
                    </div>
                  </div>
                {/if}

                <!-- サンプルレート (除去・コピー以外) -->
                {#if opts.audioCodec !== 'copy' && opts.audioCodec !== 'none'}
                  <div>
                    <label for="sample-rate" class="block text-xs text-[var(--text-muted)] mb-1.5">サンプルレート</label>
                    <select
                      id="sample-rate"
                      value={String(opts.sampleRate ?? 'null')}
                      onchange={(e) => {
                        const v = (e.target as HTMLSelectElement).value
                        opts = { ...opts, sampleRate: v === 'null' ? null : Number(v) as SampleRate }
                      }}
                      class={selectCls}
                    >
                      {#each SAMPLE_RATES as sr}
                        <option value={String(sr.value ?? 'null')}>{sr.label}</option>
                      {/each}
                    </select>
                  </div>

                  <!-- チャンネル -->
                  <div>
                    <p class="text-xs text-[var(--text-muted)] mb-1.5">チャンネル</p>
                    <div class="flex gap-1.5">
                      {#each ([
                        { value: 'original', label: '元のまま' },
                        { value: '1',        label: 'モノラル' },
                        { value: '2',        label: 'ステレオ' },
                      ] as { value: AudioChannels; label: string }[]) as ch}
                        <button
                          onclick={() => { opts = { ...opts, audioChannels: ch.value } }}
                          class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer {btnCls(opts.audioChannels === ch.value)}"
                        >{ch.label}</button>
                      {/each}
                    </div>
                  </div>

                  <!-- 音量調整 -->
                  <div>
                    <div class="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
                      <label for="volume-db">音量調整</label>
                      <span class="font-mono text-[var(--color-primary)] text-sm">
                        {(opts.volumeDb ?? 0) >= 0 ? '+' : ''}{opts.volumeDb ?? 0} dB
                      </span>
                    </div>
                    <input
                      id="volume-db"
                      type="range" min="-20" max="20" step="1"
                      value={opts.volumeDb ?? 0}
                      oninput={(e) => { opts = { ...opts, volumeDb: Number((e.target as HTMLInputElement).value) } }}
                      class="w-full accent-[var(--color-primary)]"
                    />
                    <div class="flex justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
                      <span>小さく (-20 dB)</span>
                      <span>±0 dB</span>
                      <span>大きく (+20 dB)</span>
                    </div>
                  </div>
                {/if}

              </div>
            </div>

            <!-- ══ トリム ════════════════════════════════════════ -->
            <div>
              <p class={advHeading}><i class="fas fa-cut mr-1"></i>トリム</p>
              <div class="flex flex-col gap-3">
                <p class="text-[10px] text-[var(--text-muted)]">秒数または hh:mm:ss 形式で入力。空欄 = トリムなし</p>
                <div class="flex gap-3 flex-wrap">
                  <div class="flex flex-col gap-1">
                    <label for="start-time" class="text-[10px] text-[var(--text-muted)]">開始時間</label>
                    <input
                      id="start-time"
                      type="text"
                      value={opts.startTime ? String(opts.startTime) : ''}
                      oninput={(e) => {
                        const v = (e.target as HTMLInputElement).value
                        opts = { ...opts, startTime: v ? Number(v) : 0 }
                      }}
                      placeholder="0 または 0:00:00"
                      class="{numInputCls} w-36"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label for="end-time" class="text-[10px] text-[var(--text-muted)]">終了時間</label>
                    <input
                      id="end-time"
                      type="text"
                      value={opts.endTime ? String(opts.endTime) : ''}
                      oninput={(e) => {
                        const v = (e.target as HTMLInputElement).value
                        opts = { ...opts, endTime: v ? Number(v) : null }
                      }}
                      placeholder="空欄 = 最後まで"
                      class="{numInputCls} w-36"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- ══ フィルター ═══════════════════════════════════ -->
            <div>
              <p class={advHeading}><i class="fas fa-magic mr-1"></i>フィルター</p>
              <div class="flex flex-col gap-4">

                <!-- デインターレース -->
                <label class="flex items-center justify-between text-sm cursor-pointer select-none">
                  <div>
                    <span class="font-medium">デインターレース</span>
                    <p class="text-xs text-[var(--text-muted)] mt-0.5">インターレース映像のくし形ノイズを除去 (yadif)</p>
                  </div>
                  <input type="checkbox" bind:checked={opts.deinterlace} class="accent-[var(--color-primary)]" />
                </label>

                <!-- 回転 -->
                <div>
                  <p class="text-xs text-[var(--text-muted)] mb-1.5">回転</p>
                  <div class="flex gap-1.5 flex-wrap">
                    {#each ([
                      { value: 'none', label: 'なし' },
                      { value: '90',   label: '90° 時計回り' },
                      { value: '180',  label: '180°' },
                      { value: '270',  label: '270° (90° 反時計回り)' },
                    ] as { value: RotateFilter; label: string }[]) as r}
                      <button
                        onclick={() => { opts = { ...opts, rotate: r.value } }}
                        class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer {btnCls(opts.rotate === r.value)}"
                      >{r.label}</button>
                    {/each}
                  </div>
                </div>

                <!-- 反転 -->
                <div>
                  <p class="text-xs text-[var(--text-muted)] mb-1.5">反転</p>
                  <div class="flex gap-3">
                    <label class="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input type="checkbox" bind:checked={opts.flipHorizontal} class="accent-[var(--color-primary)]" />
                      水平反転（左右）
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input type="checkbox" bind:checked={opts.flipVertical} class="accent-[var(--color-primary)]" />
                      垂直反転（上下）
                    </label>
                  </div>
                </div>

                <!-- メタデータ削除 -->
                <label class="flex items-center justify-between text-sm cursor-pointer select-none">
                  <div>
                    <span class="font-medium">メタデータを削除</span>
                    <p class="text-xs text-[var(--text-muted)] mt-0.5">撮影日時・GPS・カメラ情報・サムネイルなどを除去</p>
                  </div>
                  <input type="checkbox" bind:checked={opts.stripMetadata} class="accent-[var(--color-primary)]" />
                </label>

              </div>
            </div>

          </div>
        {/if}
      </div>

    </div>
  </section>

  <!-- ═══ 変換ボタン ══════════════════════════════════════════════ -->
  {#if file && (status === 'idle' || status === 'error')}
    <button
      onclick={handleConvert}
      class="btn-filled w-full justify-center py-3 rounded-2xl text-base"
    >
      <i class="fas fa-exchange-alt"></i>
      {mode === 'audio' ? '音声出力' : '変換'}
    </button>
  {/if}

  <!-- ═══ 進捗表示 ══════════════════════════════════════════════ -->
  {#if status === 'loading' || status === 'converting'}
    <div class="m3-card px-5 py-4 flex flex-col gap-3">
      <div class="flex items-center justify-between text-sm">
        <span class="font-medium text-[var(--text-muted)]">
          {status === 'loading' ? 'FFmpeg を初期化中…' : '変換中…'}
        </span>
        <span class="font-mono text-xs text-[var(--text-muted)]">{elapsedSec}s</span>
      </div>
      <div class="h-2 w-full rounded-full bg-[var(--outline-variant)] overflow-hidden">
        <div
          class="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
          style="width: {Math.round(progress * 100)}%"
        ></div>
      </div>
      <div class="flex justify-between text-xs text-[var(--text-muted)]">
        <span>{Math.round(progress * 100)}%</span>
        <span class="text-[10px]">ブラウザ上での処理のため時間がかかる場合があります</span>
      </div>
    </div>
  {/if}

  <!-- ═══ 完了 ════════════════════════════════════════════════ -->
  {#if status === 'done' && resultBlob}
    <div class="m3-card px-5 py-4 flex flex-col gap-3">
      <div class="flex items-center gap-2 text-sm font-medium" style="color: var(--color-success, #16a34a)">
        <i class="fas fa-check-circle"></i>
        変換完了
      </div>
      <div class="flex items-center gap-3">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{resultName}</p>
          <p class="text-xs text-[var(--text-muted)]">{formatSize(resultBlob.size)}</p>
        </div>
        <button onclick={handleDownload} class="btn-filled text-sm px-4 py-2">
          <i class="fas fa-download"></i> ダウンロード
        </button>
      </div>
      <button onclick={handleReset} class="btn-text text-xs self-start px-0">
        <i class="fas fa-redo text-[10px]"></i> 別のファイルを変換
      </button>
    </div>
  {/if}

</div>
