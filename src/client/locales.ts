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
  'settings.nav': '木鱼',
  'settings.title': '木鱼',
  'settings.enabled': '显示浮层',
  'settings.enabled.hint': '关掉后设置页仍在，只是右下角不再画出角色。',
  'settings.plaque': '功德牌',
  'settings.plaque.censer': '香炉',
  'settings.plaque.board': '木牌',
  'settings.autoDelayMs': '忙碌后第一次自动敲（毫秒）',
  'settings.autoIntervalMs': '自动敲间隔（毫秒）',
  'settings.comboThreshold': '大包连击阈值',
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
  'settings.nav': 'Wooden fish',
  'settings.title': 'Wooden fish',
  'settings.enabled': 'Show overlay',
  'settings.enabled.hint': 'When off, the settings page stays; the corner sprite does not paint.',
  'settings.plaque': 'Merit plaque',
  'settings.plaque.censer': 'Censer',
  'settings.plaque.board': 'Board',
  'settings.autoDelayMs': 'Busy wait before the first auto-knock (ms)',
  'settings.autoIntervalMs': 'Auto-knock interval while busy (ms)',
  'settings.comboThreshold': 'Combo knocks that release the big bump',
} satisfies Record<MuyuKey, string>
