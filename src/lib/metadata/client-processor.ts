export function removePNGMetadata(buffer: ArrayBuffer): Uint8Array {
  const data = new Uint8Array(buffer)

  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) {
    if (data[i] !== pngSignature[i]) throw new Error('有効なPNGファイルではありません')
  }

  const result: number[] = []
  for (let i = 0; i < 8; i++) result.push(data[i])

  let pos = 8
  const essentialChunks = ['IHDR', 'PLTE', 'IDAT', 'IEND']

  while (pos < data.length) {
    if (pos + 8 > data.length) break

    const length =
      (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]
    const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7])
    const chunkSize = 12 + length

    if (pos + chunkSize > data.length) break

    if (essentialChunks.includes(type)) {
      for (let i = 0; i < chunkSize; i++) result.push(data[pos + i])
    }

    if (type === 'IEND') break
    pos += chunkSize
  }

  return new Uint8Array(result)
}

export function removeJPEGMetadata(buffer: ArrayBuffer): Uint8Array {
  const data = new Uint8Array(buffer)

  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error('有効なJPEGファイルではありません')

  const result: number[] = [0xff, 0xd8]
  let pos = 2

  while (pos < data.length) {
    if (data[pos] !== 0xff) { pos++; continue }

    const marker = data[pos + 1]

    if (marker === 0xd9) { result.push(0xff, 0xd9); break }

    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      result.push(0xff, marker)
      pos += 2
      continue
    }

    if (pos + 3 >= data.length) break

    const segmentLength = (data[pos + 2] << 8) | data[pos + 3]
    if (pos + 2 + segmentLength > data.length) break

    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe
    if (!isMetadata) {
      for (let i = 0; i < segmentLength + 2; i++) result.push(data[pos + i])
    }

    pos += 2 + segmentLength
  }

  return new Uint8Array(result)
}

export async function processImage(file: File): Promise<{ blob: Blob; mimeType: string }> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)

  let cleanedData: Uint8Array
  let mimeType: string

  if (data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) {
    cleanedData = removePNGMetadata(buffer)
    mimeType = 'image/png'
  } else if (data[0] === 0xff && data[1] === 0xd8) {
    cleanedData = removeJPEGMetadata(buffer)
    mimeType = 'image/jpeg'
  } else {
    throw new Error('PNG または JPEG 形式のファイルを使用してください')
  }

  return { blob: new Blob([cleanedData.buffer as ArrayBuffer], { type: mimeType }), mimeType }
}
