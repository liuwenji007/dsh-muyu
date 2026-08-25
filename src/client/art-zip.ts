/**
 * Read a zip (store or deflate) into named byte arrays.
 * Enough for art packs; no ZIP64, encryption, or data-descriptor-only layouts.
 */
const EOCD = 0x0605_4b50
const CENTRAL = 0x0201_4b50
const LOCAL = 0x0403_4b50

/**
 * Inflate a raw deflate stream (ZIP method 8).
 * @param data - compressed payload from a zip local file.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('deflate zip needs DecompressionStream')
  }
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function findEocd(bytes: Uint8Array): number {
  const view = viewOf(bytes)
  const min = Math.max(0, bytes.length - 22 - 65_535)
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (view.getUint32(i, true) === EOCD) return i
  }
  throw new Error('not a zip')
}

function decodeName(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/**
 * Unpack zip entries to basename → bytes. Directory entries are skipped.
 * @param bytes - zip file bytes.
 */
export async function unzip(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const view = viewOf(bytes)
  const eocd = findEocd(bytes)
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const out: Record<string, Uint8Array> = {}

  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL) {
      throw new Error('zip central directory truncated')
    }
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen)
    const name = decodeName(nameBytes)
    offset += 46 + nameLen + extraLen + commentLen

    if ((flags & 0x0001) !== 0) throw new Error('encrypted zip is not supported')
    if (name.endsWith('/')) continue
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL) {
      throw new Error(`zip local header missing for ${name}`)
    }
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.length) throw new Error(`zip payload truncated for ${name}`)
    const payload = bytes.subarray(dataStart, dataEnd)

    let data: Uint8Array
    if (method === 0) {
      data = payload.slice()
    } else if (method === 8) {
      data = await inflateRaw(payload)
    } else {
      throw new Error(`zip method ${method} is not supported`)
    }
    out[name] = data
  }
  return out
}
