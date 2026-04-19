import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import ffmpegWorkerUrl from '@ffmpeg/ffmpeg/worker?worker&url'

// ─── 型定義 ──────────────────────────────────────────────────
export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'avi' | 'mkv'
export type AudioFormat = 'mp3' | 'wav' | 'aac' | 'ogg' | 'flac' | 'm4a'

export type VideoCodec    = 'libx264' | 'libx265' | 'libvpx-vp9' | 'libvpx' | 'copy'
export type AudioCodec    = 'aac' | 'libmp3lame' | 'libopus' | 'libvorbis' | 'flac' | 'pcm_s16le' | 'copy' | 'none'
export type RateControlMode = 'crf' | 'cbr' | '2pass'
export type H264Preset    = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow'
export type H264Tune      = 'none' | 'film' | 'animation' | 'grain' | 'stillimage' | 'fastdecode' | 'zerolatency'
export type H264Profile   = 'baseline' | 'main' | 'high'
export type Vp9Quality    = 'realtime' | 'good' | 'best'
export type PixelFormat   = 'yuv420p' | 'yuv422p' | 'yuv444p' | 'yuv420p10le'
export type SampleRate    = 22050 | 44100 | 48000 | 96000
export type AudioChannels = 'original' | '1' | '2'
export type RotateFilter  = 'none' | '90' | '180' | '270'

export interface ConvertOptions {
  outputFormat: VideoFormat | AudioFormat

  // ── 映像コーデック設定 ──────────────────────────────────────
  videoCodec?:       VideoCodec
  rateControlMode?:  RateControlMode
  crf?:              number        // x264/x265: 0–51, VP9: 0–63
  videoBitrate?:     string        // CBR/2-pass 時 (例: '2000k')
  preset?:           H264Preset
  tune?:             H264Tune
  profile?:          H264Profile
  vp9Quality?:       Vp9Quality
  vp9CpuUsed?:       number       // VP9 CPU使用率 0–8
  pixelFormat?:      PixelFormat

  // ── 解像度・フレームレート ──────────────────────────────────
  fps?:              number | null
  scaleWidth?:       number | null
  scaleHeight?:      number | null
  maintainAspectRatio?: boolean

  // ── 音声コーデック設定 ──────────────────────────────────────
  audioCodec?:       AudioCodec
  audioBitrate?:     string
  sampleRate?:       SampleRate | null
  audioChannels?:    AudioChannels
  volumeDb?:         number        // -20 to +20 dB

  // ── トリム ──────────────────────────────────────────────────
  startTime?:        number        // 開始時間 (秒)
  endTime?:          number | null // 終了時間 (秒), null = 最後まで

  // ── フィルター ──────────────────────────────────────────────
  deinterlace?:      boolean
  rotate?:           RotateFilter
  flipHorizontal?:   boolean
  flipVertical?:     boolean
  stripMetadata?:    boolean

  audioOnly?:        boolean
}

export type ProgressCallback = (ratio: number) => void

// ─── 定数 ────────────────────────────────────────────────────
const CORE_VERSION = '0.12.9'
const CDN_BASE = `https://unpkg.com/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`

const MIME_MAP: Record<string, string> = {
  mp4:  'video/mp4',
  webm: 'video/webm',
  mov:  'video/quicktime',
  avi:  'video/x-msvideo',
  mkv:  'video/x-matroska',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  aac:  'audio/aac',
  ogg:  'audio/ogg',
  flac: 'audio/flac',
  m4a:  'audio/mp4',
}

// ─── シングルトン管理 ─────────────────────────────────────────
let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<void> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance

  if (!loadPromise) {
    loadPromise = (async () => {
      ffmpegInstance = new FFmpeg()
      // classWorkerURL を blob URL にすることで Chrome の COEP モジュールワーカー制限を回避する。
      // ?worker&url により Vite が依存関係をすべてバンドルした自己完結型ファイルを生成するため、
      // blob URL 内での相対インポート失敗問題が発生しない。
      const [classWorkerURL, coreURL, wasmURL, workerURL] = await Promise.all([
        toBlobURL(ffmpegWorkerUrl,                      'text/javascript'),
        toBlobURL(`${CDN_BASE}/ffmpeg-core.js`,        'text/javascript'),
        toBlobURL(`${CDN_BASE}/ffmpeg-core.wasm`,      'application/wasm'),
        toBlobURL(`${CDN_BASE}/ffmpeg-core.worker.js`, 'text/javascript'),
      ])
      await ffmpegInstance.load({ classWorkerURL, coreURL, wasmURL, workerURL })
    })().catch((e) => {
      // ロード失敗時はリセットして次回リトライ可能にする
      ffmpegInstance = null
      loadPromise = null
      throw e
    })
  }

  await loadPromise
  return ffmpegInstance!
}

// ─── 出力ファイル名生成 ───────────────────────────────────────
export function buildOutputFilename(inputName: string, format: VideoFormat | AudioFormat): string {
  const base = inputName.replace(/\.[^.]+$/, '')
  return `${base}.${format}`
}

// ─── FFmpeg 初期化 ────────────────────────────────────────────
export async function initFFmpeg(_onProgress?: ProgressCallback): Promise<void> {
  await getFFmpeg()
}

// ─── ファイル変換 ─────────────────────────────────────────────
export async function convertFile(
  file: File,
  opts: ConvertOptions,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const ff = await getFFmpeg()

  const inputExt  = file.name.split('.').pop()?.toLowerCase() ?? 'mp4'
  const inputName = `input.${inputExt}`
  const outputName = buildOutputFilename(file.name, opts.outputFormat)

  await ff.writeFile(inputName, await fetchFile(file))

  // ハンドラー登録
  const is2Pass = opts.rateControlMode === '2pass' && !opts.audioOnly && opts.videoCodec !== 'copy'
  let passOffset = 0

  const progressHandler = ({ ratio }: { ratio: number }) => {
    if (!Number.isFinite(ratio) || ratio < 0) return
    const scaled = is2Pass
      ? passOffset + Math.max(0, Math.min(0.5, ratio * 0.5))
      : Math.max(0, Math.min(1, ratio))
    onProgress?.(scaled)
  }

  const logLines: string[] = []
  const logHandler = ({ message }: { message: string }) => {
    logLines.push(message)
  }

  ff.on('progress', progressHandler)
  ff.on('log', logHandler)

  try {
    if (is2Pass) {
      // ── 2-pass エンコード ──
      const pass1Args = buildFFmpegArgs(inputName, outputName, opts, 1)
      const code1 = await ff.exec(pass1Args)
      if (code1 !== 0) {
        throw new Error(`FFmpeg pass 1 failed (exit ${code1})\n${logLines.slice(-5).join('\n')}`)
      }
      passOffset = 0.5

      const pass2Args = buildFFmpegArgs(inputName, outputName, opts, 2)
      const code2 = await ff.exec(pass2Args)
      if (code2 !== 0) {
        throw new Error(`FFmpeg pass 2 failed (exit ${code2})\n${logLines.slice(-5).join('\n')}`)
      }
    } else {
      // ── 通常エンコード ──
      const args = buildFFmpegArgs(inputName, outputName, opts)
      const code = await ff.exec(args)
      if (code !== 0) {
        throw new Error(`FFmpeg failed (exit ${code})\n${logLines.slice(-5).join('\n')}`)
      }
    }

    const raw  = await ff.readFile(outputName) as Uint8Array
    // SharedArrayBuffer は Blob コンストラクタ非対応のため通常の ArrayBuffer にコピー
    const buf  = new ArrayBuffer(raw.byteLength)
    new Uint8Array(buf).set(raw)
    return new Blob([buf], { type: MIME_MAP[opts.outputFormat] ?? 'application/octet-stream' })
  } finally {
    ff.off('progress', progressHandler)
    ff.off('log', logHandler)
    // 仮想 FS のクリーンアップ
    await ff.deleteFile(inputName).catch(() => {})
    await ff.deleteFile(outputName).catch(() => {})
    await ff.deleteFile('passlog-0.log').catch(() => {})
    await ff.deleteFile('passlog-0.log.mbtree').catch(() => {})
  }
}

// ─── FFmpeg 引数ビルダー ──────────────────────────────────────
function buildFFmpegArgs(
  inputName: string,
  outputName: string,
  opts: ConvertOptions,
  pass?: 1 | 2,
): string[] {
  const args: string[] = ['-y']

  // 高速シーク（入力前）
  if (opts.startTime && opts.startTime > 0) {
    args.push('-ss', String(opts.startTime))
  }

  args.push('-i', inputName)

  // 終了時間（-t = duration）
  if (opts.endTime !== null && opts.endTime !== undefined) {
    args.push('-t', String(opts.endTime - (opts.startTime ?? 0)))
  }

  if (opts.audioOnly) {
    // ── 音声出力モード ──
    args.push('-vn')
    appendAudioCodecArgs(args, opts)
    if (opts.stripMetadata) args.push('-map_metadata', '-1')
    args.push(outputName)
  } else if (pass === 1) {
    // ── 2-pass: 第1パス ──
    appendVideoCodecArgs(args, opts, 1)
    args.push('-an', '-f', 'null', '/dev/null')
  } else {
    // ── 動画変換 (通常 or 2-pass 第2パス) ──
    appendVideoCodecArgs(args, opts, pass)
    appendAudioCodecArgs(args, opts)
    if (opts.stripMetadata) args.push('-map_metadata', '-1')
    args.push(outputName)
  }

  return args
}

function appendVideoCodecArgs(args: string[], opts: ConvertOptions, pass?: 1 | 2) {
  const codec = opts.videoCodec ?? 'libx264'

  if (codec === 'copy') {
    args.push('-c:v', 'copy')
    return
  }

  args.push('-c:v', codec)

  // レート制御
  const rc = opts.rateControlMode ?? 'crf'
  if (rc === 'crf') {
    args.push('-crf', String(opts.crf ?? 23))
    if (codec === 'libvpx-vp9') {
      args.push('-b:v', '0') // VP9 CRF モードは b:v 0 が必要
    }
  } else {
    // CBR / 2-pass
    args.push('-b:v', opts.videoBitrate ?? '2000k')
    if (pass !== undefined) {
      args.push('-pass', String(pass), '-passlogfile', 'passlog')
    }
  }

  // x264 / x265 専用オプション
  if (codec === 'libx264' || codec === 'libx265') {
    if (opts.preset) args.push('-preset', opts.preset)
    if (opts.tune && opts.tune !== 'none') args.push('-tune', opts.tune)
    if (codec === 'libx264' && opts.profile) args.push('-profile:v', opts.profile)
  }

  // VP9 専用オプション
  if (codec === 'libvpx-vp9') {
    if (opts.vp9Quality)                     args.push('-quality', opts.vp9Quality)
    if (opts.vp9CpuUsed !== undefined)       args.push('-cpu-used', String(opts.vp9CpuUsed))
  }

  // ピクセルフォーマット
  if (opts.pixelFormat) args.push('-pix_fmt', opts.pixelFormat)

  // フレームレート
  if (opts.fps !== null && opts.fps !== undefined) args.push('-r', String(opts.fps))

  // 映像フィルターチェーン
  const vf = buildVideoFilters(opts)
  if (vf.length > 0) args.push('-vf', vf.join(','))
}

function appendAudioCodecArgs(args: string[], opts: ConvertOptions) {
  const codec = opts.audioCodec ?? 'aac'

  if (codec === 'none') {
    args.push('-an')
    return
  }
  if (codec === 'copy') {
    args.push('-c:a', 'copy')
    return
  }

  args.push('-c:a', codec)

  // ビットレート (可逆コーデックは不要)
  if (codec !== 'flac' && codec !== 'pcm_s16le' && opts.audioBitrate) {
    args.push('-b:a', opts.audioBitrate)
  }

  // サンプルレート
  if (opts.sampleRate !== null && opts.sampleRate !== undefined) {
    args.push('-ar', String(opts.sampleRate))
  }

  // チャンネル
  if (opts.audioChannels && opts.audioChannels !== 'original') {
    args.push('-ac', opts.audioChannels)
  }

  // 音量フィルター
  if (opts.volumeDb && opts.volumeDb !== 0) {
    args.push('-af', `volume=${opts.volumeDb}dB`)
  }
}

function buildVideoFilters(opts: ConvertOptions): string[] {
  const filters: string[] = []

  if (opts.deinterlace) filters.push('yadif')

  // スケール (-2 でアスペクト比を自動保持)
  if (opts.scaleWidth || opts.scaleHeight) {
    const maintainAr = opts.maintainAspectRatio !== false
    const w = opts.scaleWidth  ?? (maintainAr ? -2 : -1)
    const h = opts.scaleHeight ?? (maintainAr ? -2 : -1)
    filters.push(`scale=${w}:${h}`)
  }

  // 回転
  switch (opts.rotate) {
    case '90':  filters.push('transpose=1');          break
    case '180': filters.push('vflip,hflip');          break
    case '270': filters.push('transpose=2');          break
  }

  // 反転
  if (opts.flipHorizontal) filters.push('hflip')
  if (opts.flipVertical)   filters.push('vflip')

  return filters
}
