# dsh-muyu

DeepSeek Harness **Web** 电子木鱼浮层：往 `shell.overlay` 挂一条目，右下角可敲的角色、木棍热区光标、按会话计的功德牌。敲击和功德只存在浏览器里，不进 session log。

GitHub topics 建议：`dsh` · `dsh-plugin` · `deepseek-harness`

## 它做什么

- 会话忙碌时自动轻敲，每次 +1 功德；自动敲不加连击、不起包。
- 点角色头部手动敲：每次 +1 功德；连敲到阈值后先大包再小包。
- 牌子默认香炉，到 10000 显示为 `Nk`。记功德时从角色上飘 `+1`。
- 切换当前会话会清零姿态和连击，牌子显示该会话的数字。

## 安装

这是一个 **bundle 插件**（`dsh.bundle` + `dsh.client`），装进跑 Web 的 profile 后会自动进入 `dsh.profile.bundles`。

本地（当前仓库）：

```bash
pnpm install   # 会跑 prepare，打出 lib/index.js 和 lib/client.js
dsh plugin --profile web add link:/Users/HandsomeLiu/Documents/deepseek-harness/dsh-muyu
dsh --profile web
```

以后发到 GitHub：

```bash
dsh plugin --profile web add github:<你的账号>/dsh-muyu
```

pnpm ≥10 会拦截 git 依赖的 `prepare`。第一次失败后，把 pnpm 打印的包名写进该 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  dsh-muyu: true
```

再执行一次 `add`。只允许你信任源码的包；建议钉 commit：`github:<账号>/dsh-muyu#<sha>`。

发到 npm 之后（`pnpm publish` 会带上已构建的 `lib/`），普通用户不用 allowBuilds：

```bash
dsh plugin --profile web add dsh-muyu
```

也可以 `pnpm pack` 出 `.tgz`，再 `dsh plugin add ./dsh-muyu-0.1.0.tgz`。

若当前 Web 组合包已经内置了 `ui-muyu`，再装本插件会挂上**两只**木鱼。在 profile 的 `cordis.patch.yml` 里关掉内置行：

```yaml
- id: ui-muyu
  disabled: true
```

## 配置

浏览器半会用 schema 默认值。宿主 yaml 里的 `config` **目前到不了浏览器**，改手感请改 `src/config.ts` 的 default 后重新 `pnpm run build`。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 为 `false` 时不注册浮层 |
| `autoDelayMs` | `1000` | 忙碌后第一次自动敲的等待 |
| `autoIntervalMs` | `1000` | 自动敲间隔 |
| `autoHitMs` | `280` | 自动敲姿态停留 |
| `comboThreshold` | `5` | 达到后松手播大包 |
| `bumpMs` / `bumpMaxMs` | `800` / `2400` | 小包停留及其上限 |
| `bumpBigMs` / `bumpBigMaxMs` | `800` / `2400` | 大包停留及其上限 |
| `plaque` | `censer` | `censer` 香炉 / `board` 木牌 |

## 发布清单

1. 把本目录推到 GitHub 公开仓库，加上 topic `dsh`、`dsh-plugin`、`deepseek-harness`。
2. 等 DeepSeek Harness 有 tagged npm 发布后，把 `peerDependencies` 钉到实际版本，再 `pnpm publish --access public`。
3. 在 Harness 仓库 Discussions 的 Show and tell 贴安装命令；没有官方插件商店，收录靠 npm 搜索、GitHub topic 和社区转载。

当前 Harness 仍是 pre-release，`@deepseek-ai/dsh-*` 多数还不在 npm 上。第三方用户要从源码跑 `dsh`，并用上面的 `link:` 安装本包。

## 开发

```bash
pnpm install
pnpm test
pnpm run build
```

`prepare` 必须能在没有旁边那份 harness checkout 的情况下打出 `lib/`。浏览器半是 Cordis 模块表用的 CJS factory（`window.__ModuleLoader__.load`），PNG 和 CSS Modules 打进 `lib/client.js`。

## License

MIT
