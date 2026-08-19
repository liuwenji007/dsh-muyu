# dsh-muyu

[English](README.md) | 中文

DeepSeek Harness Web 客户端的电子木鱼浮层：向 `shell.overlay` 列表贡献一条目，把可敲的鲸鱼角色图钉在右下角，头上热区使用木棍光标，旁边是按会话计的功德牌。角色只渲染一层人物图；木棍不会合成进姿态图。敲击与功德留在浏览器 store 里，从不进入 session log。

忙闲信号来自 `useSessions` 里当前会话的 `running` 位（与 InputBar 同源的 `host/session-status`）。`autoDelayMs` 之后按 `autoIntervalMs` 自动轻敲直到会话空闲：每次自动敲先闪 `autoHit`，持续 `autoHitMs` 再回到 idle，并记 1 功德。自动敲不加 combo，也不起包。在头上 pointer-down 记 1 功德并加 1 combo；松手时 combo 低于 `comboThreshold` 播小包，达到或超过阈值则先大包再小包。起包停留随这次手动连敲的时长变长，且每阶段分别以 `bumpMaxMs` / `bumpBigMaxMs` 封顶。恢复过程不让给自动敲；再次按下会取消恢复并继续累加 combo。切换当前会话会清零姿态和 combo，牌子显示该会话的数字（未见过则为 0）。牌子在 9999 以内显示精确计数，从 10000 起显示为 `Nk`。`plaque` 在木牌和香炉之间切换（默认香炉）。记功德的敲击还会从角色上飘出 `add.png`。

把 `src/client/assets/` 里的文件换成新图，并让 [`poses.ts`](src/client/assets/poses.ts) 指向它们即可；tsdown 会把 `png`/`webp`/`gif`/`svg` 的 import 内联成 client bundle 里的 `data:` URL。`prefers-reduced-motion` 仍换图，只是跳过牌子跳动和上飘 +1。

`/client` 导出为 `apply` / `inject`、`Config` 和 `createMuyuStore`。

本包是 **bundle 插件**（`dsh.bundle` 加 `dsh.client`），装进 Web profile 后会进入 `dsh.profile.bundles`。GitHub topic 建议：`dsh`、`dsh-plugin`、`deepseek-harness`。

## 安装

```bash
pnpm install   # 会跑 prepare，打出 lib/index.js 和 lib/client.js
dsh plugin --profile web add link:/abs/path/to/dsh-muyu
dsh --profile web
```

仓库公开到 GitHub 之后：

```bash
dsh plugin --profile web add github:<账号>/dsh-muyu
```

pnpm ≥10 会拦截 git 依赖的 `prepare`。第一次 `add` 失败后，把 pnpm 打印的包名写进该 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  dsh-muyu: true
```

再执行一次 `add`。这是安装时在本机执行该包代码的许可；建议钉 commit：`github:<账号>/dsh-muyu#<sha>`，避免后续 push 悄悄改掉装上的内容。

发到 npm 之后（`pnpm publish` 的包已带 `lib/`），普通用户不用 `allowBuilds`：

```bash
dsh plugin --profile web add dsh-muyu
```

`pnpm pack` 出的 `.tgz` 也可以：`dsh plugin add ./dsh-muyu-0.1.0.tgz`。

若当前 Web 组合包已经内置 `ui-muyu` 行，再装本包会挂上第二只木鱼。在 profile 的 `cordis.patch.yml` 里关掉内置行：

```yaml
- id: ui-muyu
  disabled: true
```

Harness 仍是 pre-release，多数 `@deepseek-ai/dsh-*` peer 还不在 npm 上。第三方需从源码跑 `dsh`，并用上面的 `link:` 安装，直到那些包有 tagged 发布。

## 配置

浏览器半在 `apply` 里套用 schema 默认值。宿主 yaml 里的 `config` 到不了浏览器 fiber；改手感请改 [`src/config.ts`](src/config.ts) 的 default 后重新构建。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 为 `false` 时不注册浮层 |
| `autoDelayMs` | `1000` | 忙碌后第一次自动敲的等待（毫秒） |
| `autoIntervalMs` | `1000` | 自动敲间隔（毫秒） |
| `autoHitMs` | `280` | 自动敲姿态停留（毫秒） |
| `comboThreshold` | `5` | 达到后松手播大包 |
| `bumpMs` / `bumpMaxMs` | `800` / `2400` | 小包停留及其上限（毫秒） |
| `bumpBigMs` / `bumpBigMaxMs` | `800` / `2400` | 大包停留及其上限（毫秒） |
| `plaque` | `censer` | 功德牌：`censer` 香炉 / `board` 木牌 |

## 模型体验

无，因为本浮层只是浏览器玩具：敲击与功德从不进入 session log、prompt、schema、流或工具结果。

#### KV Cache 影响

无；本包从不组装或发送 provider 请求。

## 已知限制与暂缓事项

- **占位图** — 随包装的是带标签的替身；替换它们只需改 import 路径，不必改 slot。
- **功德只存在于浏览器本地** — 独占 store 把按会话记账的计数写进 `localStorage` 的 `dsh.muyu.merit`。重新加载和插件 fiber remount 会从该映射恢复。没有当前会话时显示 0。配额或隐私模式导致的存储失败只让本页不再持久化。不写 session log。
- **不能拖拽** — 角色图固定在右下角，避免挡住 Cordis 面板。

## 开发

```bash
pnpm install
pnpm test
pnpm run build
```

`prepare` 从 `src/` 打出 `lib/`，不依赖旁边那份 harness checkout。浏览器半是 Cordis 模块表用的 CJS factory（`window.__ModuleLoader__.load`）；PNG 和 CSS Modules 打进 `lib/client.js`。

## 发布

1. 把本目录推到 GitHub 公开仓库，加上 topic `dsh`、`dsh-plugin`、`deepseek-harness`。
2. 等 Harness 有 tagged npm 发布后，把 `peerDependencies` 钉到实际版本范围，再 `pnpm publish --access public`。
3. 在 Harness 仓库 Discussions 的 Show and tell 贴安装命令。没有官方插件商店；收录靠 npm 搜索、GitHub topic 和社区转载。

## License

MIT
