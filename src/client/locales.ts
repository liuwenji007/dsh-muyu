/** `muyu` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'knock.aria': '敲木鱼',
  'plaque.aria': '当前会话功德',
  'pose.idle': '傻笑',
  'pose.autoHit': '轻敲',
  'pose.manualHit': '被敲',
  'pose.bump': '小包',
  'pose.bumpBig': '大包',
} satisfies Record<string, string>

/** The muyu namespace key union. */
export type MuyuKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'knock.aria': 'Knock the wooden fish',
  'plaque.aria': 'Session merit',
  'pose.idle': 'Silly smile',
  'pose.autoHit': 'Light knock',
  'pose.manualHit': 'Hit',
  'pose.bump': 'Small bump',
  'pose.bumpBig': 'Big bump',
} satisfies Record<MuyuKey, string>
