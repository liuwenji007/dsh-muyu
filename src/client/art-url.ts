/**
 * Join a user-supplied art base with a file name. Blank base keeps the fallback.
 * @param base - URL or path prefix.
 * @param file - asset basename.
 * @param fallback - packaged data URL / href.
 */
export function resolveArtUrl(base: string | undefined, file: string, fallback: string): string {
  const trimmed = base?.trim() ?? ''
  if (trimmed === '') return fallback
  const root = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  return `${root}${file}`
}
