import { deflateRawSync, crc32 } from 'node:zlib'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * A ZIP writer, in the standard library.
 *
 * There is no archiver in this repository's dependencies and there is no zip in
 * Node, so the choice was a new dependency, shelling out to /usr/bin/zip, or
 * this. Shelling out is what breaks on the one machine that does not have it —
 * the same failure the browser fallback in render.mjs exists to avoid — and a
 * dependency is a lot of supply chain for forty lines of a format that has not
 * changed since 1989.
 *
 * DATED 1980-01-01, the zero of the ZIP epoch, on purpose. A zip stamped with
 * the wall clock is a different file on every build even when nothing in it
 * changed, which is the same reproducibility problem the PDF date normalisation
 * in render.mjs solves. Committed or not, a build should be able to say that
 * nothing moved.
 */

const EPOCH_TIME = 0      // 00:00:00
const EPOCH_DATE = 33     // 1980-01-01, as DOS packs it: (0 << 9) | (1 << 5) | 1

/** Every file under `dir`, depth-first, as POSIX-separated paths relative to it. */
export function filesUnder(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, base))
    else out.push(relative(base, full).split(sep).join('/'))
  }
  return out
}

/**
 * @param {{name: string, data: Buffer}[]} entries — `name` is the path inside
 *        the archive, so callers control the folder a colleague unpacks.
 */
export function zipSync(entries) {
  const locals = []
  const central = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const sum = crc32(data)
    const deflated = deflateRawSync(data, { level: 9 })
    // Storing beats deflating on data that is already compressed — every PNG in
    // here — and a zip that grew in the making is a bad look.
    const store = deflated.length >= data.length
    const body = store ? data : deflated
    const method = store ? 0 : 8

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(0, 6)           // flags
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(EPOCH_TIME, 10)
    local.writeUInt16LE(EPOCH_DATE, 12)
    local.writeUInt32LE(sum, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)          // extra length
    locals.push(local, nameBuf, body)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)             // version made by
    cd.writeUInt16LE(20, 6)             // version needed
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(EPOCH_TIME, 12)
    cd.writeUInt16LE(EPOCH_DATE, 14)
    cd.writeUInt32LE(sum, 16)
    cd.writeUInt32LE(body.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)             // extra
    cd.writeUInt16LE(0, 32)             // comment
    cd.writeUInt16LE(0, 34)             // disk number
    cd.writeUInt16LE(0, 36)             // internal attrs
    // >>> 0 is load-bearing: `<<` in JS is a SIGNED 32-bit operation, so the
    // mode shifted into the high half comes back negative and the write throws.
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38) // external attrs: a regular file
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)

    offset += local.length + nameBuf.length + body.length
  }

  const cdBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cdBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, cdBuf, end])
}

/** Zips a directory tree under a single top-level folder name. */
export function zipDir(dir, folder) {
  return zipSync(filesUnder(dir).map((rel) => ({
    name: `${folder}/${rel}`,
    data: readFileSync(join(dir, rel)),
  })))
}
