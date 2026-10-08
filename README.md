# QuayTerm · 泊岸

一个私有的 SSH + SFTP 桌面客户端。Quay 是码头：多个远程会话可以在自己的面板中停靠、切换。界面按需求中的 Termius / TermX 布局组织，采用 electerm 同类核心技术。

## 启动

当前 0.1.1 程序包放在 `release/0.1.1/`；此前 0.1.0 包保留在 `release/`。构建脚本默认仍输出到 `release/`：

| 平台                | 文件                                 | 当前验证状态                           |
| ------------------- | ------------------------------------ | -------------------------------------- |
| Linux x64           | `linux/QuayTerm-0.1.1.AppImage`      | 已完成本机运行、三台局域网主机连接测试 |
| Linux x64           | `linux/quayterm-0.1.1.tar.gz`        | 解压运行 `quayterm`；已验证解包程序    |
| Windows x64         | `windows/QuayTerm-0.1.1-win.zip`     | 已交叉构建；待 Windows 原生验收        |
| macOS Intel         | `macos/QuayTerm-0.1.1-mac.zip`       | 已交叉构建、未签名；待 macOS 原生验收  |
| macOS Apple Silicon | `macos/QuayTerm-0.1.1-arm64-mac.zip` | 已交叉构建、未签名；待 macOS 原生验收  |

Linux AppImage 需要系统的 FUSE 支持。也可以使用 tar.gz 包，或运行 AppImage 的 `--appimage-extract-and-run` 模式。Windows 解压后运行 `QuayTerm.exe`。macOS 发布前需要在 macOS 上进行签名和验收；当前 zip 是开发验证包。

从源代码运行需要 Node.js 22.12+：

```sh
npm ci
npm start
```

开发模式：

```sh
npm run dev
```

## 使用

- **远程主机**：添加名称、地址、端口、用户名、密码、分组、标记、颜色和备注。双击连接；悬停显示编辑按钮，右侧编辑并保存。右上角可以切换表格 / 列表、筛选标记和排序。搜索框支持 `user@host:port`、`ssh user@host -p port` 和带方括号的 IPv6 地址。
- **已知主机**：显示已信任的 SSH 服务端指纹，点击查看 SHA-256 指纹和算法。支持导入 OpenSSH `known_hosts`（含哈希主机名），以及移除记录。服务端指纹变化会阻止连接；核实后可移除旧记录并重新连接。
- **终端**：每个会话拥有独立 SSH 连接和 PTY。默认显示左侧 SFTP 文件树，单击箭头展开目录、双击进入目录或编辑文本。侧栏跟随当前聚焦的会话，也可隐藏或调整宽度。
- **布局**：支持单一、双列、三列、双行、三行、2×2、右侧双行、底部双列。新面板可以独立连接主机；标签可在面板之间拖动，也可在同一面板中排序。切换布局和拖动不会重建 SSH 会话；缩减布局会合并标签。分隔线可拖动调整尺寸。
- **SFTP**：左侧默认本地，右侧选择主机；点击任一侧左上角的名称可重新选择本地或主机。输入路径跳转，支持隐藏文件、过滤、按名称 / 日期 / 大小排序，以及 Windows 磁盘选择。
- **文件**：拖放文件或文件夹到另一侧开始传输，也可把系统文件管理器中的本地文件拖入。传输前确认目标，可选择允许覆盖。支持本地到远端、远端到本地及远端到远端的流式传输。双栏连接相同地址、端口和用户名时，也会阻止复制到自身或子目录。支持递归目录、进度、取消、新建文件 / 文件夹、重命名、确认删除和文本编辑。编辑保存时检查版本，检测到外部修改会保留原文件并提示重新打开。

## 快捷键

| 操作                  | 快捷键                                    |
| --------------------- | ----------------------------------------- |
| 新连接                | Ctrl / ⌘ Shift T                          |
| 连接选择器            | Ctrl / ⌘ Shift K；非终端页也可 Ctrl / ⌘ K |
| 复制 / 粘贴终端内容   | Ctrl Shift C / V；macOS ⌘ C / V           |
| 查找终端内容          | Ctrl Shift F；macOS ⌘ F                   |
| 关闭当前会话          | Ctrl / ⌘ Shift W，确认后断开              |
| 当前面板内切换会话    | Ctrl Tab / Ctrl Shift Tab                 |
| 当前面板第 1–9 个会话 | Alt 1…9                                   |
| 文件侧栏开关          | Ctrl / ⌘ Shift B                          |
| 保存正在编辑的文件    | Ctrl / ⌘ S                                |
| 文件重命名 / 删除     | F2 / Delete                               |
| 文件多选              | Ctrl / ⌘ 单击、Shift 单击、Ctrl / ⌘ A     |

Ctrl+A、Ctrl+B、Ctrl+C、Ctrl+D、Ctrl+Z、Tab、方向键和普通 Ctrl+K 保留给远端 shell、screen、tmux 等程序。终端使用 `xterm-256color`，支持 Unicode、ANSI/真彩色、备用屏幕、PTY 尺寸同步和 bracketed paste。多行粘贴会先显示内容供确认。

## 本地数据

数据保存到 Electron 的用户数据目录下的 `quayterm.json`（通常为 Linux 的 `~/.config/QuayTerm/`、Windows 的 `%APPDATA%/QuayTerm/`、macOS 的 `~/Library/Application Support/QuayTerm/`）。主机、已知指纹和界面偏好保存在此设备。

密码通过 Electron `safeStorage` 调用系统安全存储：Windows DPAPI、macOS Keychain、Linux Secret Service / Keyring。如果安全存储不可用或退化为 `basic_text`，密码仅保留在进程内存中。界面会提示这一状态；不会回退到明文保存密码。已有密码留空不修改。

测试凭证位于项目之外的私有测试文件中，不包含在源码提交或程序包中。程序不会上传主机配置或进行云同步。

## 技术与目录

核心组合：Electron 44、React 19、Ant Design 6、Vite 8、xterm.js 6，以及与 electerm 相同的 `@electerm/ssh2` 1.22.1。使用上游稳定版 xterm.js；SSH、SFTP 和 PTY 协议交给成熟库处理。

- `electron/`：SSH 连接、指纹校验、SFTP / 本地文件、传输、密码存储、窗口和 IPC。
- `src/components/`：主机管理、终端工作区和文件界面。
- `src/lib/workspace.ts`：独立面板、标签移动和布局状态。
- `src/lib/terminals.ts`：持久化终端实例、按键、搜索、流量确认和尺寸同步。
- `tests/`：网络集成、文件安全、桌面交互与真实 PTY 测试。
- `scripts/test-lan.cjs`：只读的局域网连接测试。
- `.github/workflows/desktop.yml`：Linux / Windows / macOS 原生构建与验证流程，可用于私有仓库。

渲染进程启用 context isolation 和 sandbox，不开放 Node.js。界面通过白名单 IPC 访问主进程；不在本地开放 Web 服务端口。远端文件按文本显示，远端 OSC 52 不可读写本机剪贴板。

技术参考检出：`../electerm-reference`，提交 `b4a2dc7b6da9fa012fe1ad62df1c851594e7849f`。原项目为 MIT；新项目为私有代码，第三方许可见 `THIRD-PARTY-NOTICES.txt` 和 `LICENSE`。

## 测试与打包

详细实测结果见 [TESTING.md](TESTING.md)。

```sh
npm run check
npm test
npm run test:e2e
npm run dist:linux
npm run dist:win
npm run dist:mac
```

完整网络 / PTY 集成测试在 Linux 上运行，需要 Python 3、Bash、OpenSSH `sftp-server`、tmux 和 screen。通过 `QUAYTERM_SFTP_SERVER`、`QUAYTERM_TMUX` 指定测试程序路径。本次工具只解包到 `.private/tooling/`，未更改系统服务。

Windows / macOS 可以运行无 Linux 依赖的测试；桌面测试会在本机启动临时 SSH/SFTP 协议服务，验证连接、粘贴、控制键、目录列表、文本读取和 resize。tmux/screen 仍由 Linux 的真实 PTY 测试覆盖：

```sh
node --test tests/workspace.test.cjs tests/local-files.test.cjs
npm run build
npx playwright test tests/desktop-smoke.e2e.cjs
```

局域网测试通过 `QUAYTERM_TEST_HOSTS` 指向私有 JSON 数组，字段为 `name/address/port/username/password`。仅新建 SSH PTY、发送 resize 请求和列出 SFTP 主目录，不发送远端 shell 命令，不写远端文件。

已打包程序也可通过 `scripts/test-packaged.cjs` 进行只读验收，设置 `QUAYTERM_EXECUTABLE`（程序路径）、`QUAYTERM_TEST_HOSTS`（私有凭证文件）、`QUAYTERM_EXPECTED_FINGERPRINTS`（含预先确认指纹的 `lan-report.json`）。测试使用一次性数据目录，不修改日常配置。

## 当前范围

当前版本实现密码 SSH 和 SFTP，按照需求不提供密钥认证、证书、Telnet、串口、保管库或云同步。内置编辑器支持 2 MiB 以内的 UTF-8 文本；保留 BOM 和换行。二进制文件通过传输功能处理。递归传输不跟随符号链接，以免意外跨目录复制。

文件保存使用临时文件加原子替换，尽量保留原文件权限和所有者。覆盖远端文件要求服务端支持 OpenSSH 的原子 rename 扩展；不支持时操作失败并保留原文件。网络中断时可能留下尚未清理的 `.quayterm-*.part` 文件。

Windows 和 macOS 当前已完成交叉打包，尚未在对应系统运行；macOS 包未签名。三平台原生验证、发布签名与公证应在正式发布前完成。
