import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const p = (...parts) => join(ROOT, ...parts)
