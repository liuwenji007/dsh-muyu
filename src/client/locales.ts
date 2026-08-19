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
  'settings.section.feel': '手感',
  'settings.section.art': '图源',
  'settings.enabled': '显示浮层',
  'settings.enabled.hint': '关掉后设置页仍在，只是右下角不再画出角色。',
  'settings.plaque': '功德牌',
  'settings.plaque.censer': '香炉',
  'settings.plaque.board': '木牌',
  'settings.autoDelayMs': '忙碌后第一次自动敲',
  'settings.autoIntervalMs': '自动敲间隔',
  'settings.comboThreshold': '大包连击阈值',
  'settings.ms': '毫秒',
  'settings.artBaseUrl': '自定义图源前缀',
  'settings.artBaseUrl.hint': '填 CDN 或静态目录 URL，留空用内置图。目录里需有 idle.png、auto-hit.png、manual-hit.png、bump.png、bump-big.png、stick.png、board.png、censer.png、add.png。',
  'settings.artBaseUrl.placeholder': 'https://example.com/muyu/',
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
  'settings.section.feel': 'Feel',
  'settings.section.art': 'Art',
  'settings.enabled': 'Show overlay',
  'settings.enabled.hint': 'When off, the settings page stays; the corner sprite does not paint.',
  'settings.plaque': 'Merit plaque',
  'settings.plaque.censer': 'Censer',
  'settings.plaque.board': 'Board',
  'settings.autoDelayMs': 'First auto-knock after busy',
  'settings.autoIntervalMs': 'Auto-knock interval',
  'settings.comboThreshold': 'Big-bump combo',
  'settings.ms': 'ms',
  'settings.artBaseUrl': 'Custom art base URL',
  'settings.artBaseUrl.hint': 'CDN or static folder URL; leave blank for packaged sprites. Expected files: idle.png, auto-hit.png, manual-hit.png, bump.png, bump-big.png, stick.png, board.png, censer.png, add.png.',
  'settings.artBaseUrl.placeholder': 'https://example.com/muyu/',
} satisfies Record<MuyuKey, string>
