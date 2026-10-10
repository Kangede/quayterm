# Linux 终端与工作区修复测试

## 环境与受测版本

- 日期：2026-10-10，Asia/Shanghai。
- 目标：用户提出的四项终端/工作区改进；Linux 全量自动化、真实 SSH/PTY/tmux 与本地修复包测试。Windows/macOS 进行可移植检查和交叉构建，原生补测由用户在对应平台继续。
- 环境：Ubuntu 26.04.1 x64、Linux 7.0.0-38-generic、Wayland 桌面；Node 22.23.2、npm 10.9.8、Electron 44.7.0、tmux 3.6、screen 4.09.01。
- 文档/代码基线：`14c25bfc86a270162f5f24537259fb5ef6acef75`；受测修复代码已固化到提交 `f92ec7cb5c57c98a1a6df7ba287440c3344912d2`。没有新发布标签；程序版本字符串仍为 0.2.3，不能与原 v0.2.3 Release 混用。
- 源码、测试、依赖清单等 38 个文件的 SHA-256 清单保存在本机 `source-manifest.sha256`，清单哈希为 `97f74221a52621084f349f118a4d5c019968a8dd22749b23e5260287052cf362`。
- 所有 SSH/SFTP、tmux、screen 操作使用一次性回环服务、独立 `QUAYTERM_DATA_DIR` 和专用 socket。没有连接、扫描或操作用户 LAN 主机。
- 原始日志、失败 trace、截图和运行信息均在忽略目录 `.private/qa/20261010-workspace/`，仅本机保留。以下摘要及产物哈希可用于核对版本。

## 四项改进的验证

| 项目 | 状态 | 实际观察 |
| --- | --- | --- |
| tmux 鼠标模式自动复制 | PASS | 真实 tmux 启用 `mouse on`，不按修饰键拖选含中文的文本，系统剪贴板与 tmux buffer 均包含所选文本；普通点击和滚轮仍有 SSH 鼠标报告。Shift 拖选不发鼠标报告，并可自动复制；重复选择相同范围也重新复制。关闭自动复制后不更新剪贴板。 |
| 剪贴板边界 | PASS | 无选取动作、普通点击后的远端 OSC 52 写入被阻止；读取查询无响应。可移植测试覆盖单次授权、超时、取消、UTF-8、无效 Base64、超限及分块输入。桌面 smoke 覆盖 1000/1002/1003 鼠标模式。 |
| 每会话文件侧栏 | PASS | 两个独立 SSH 会话分别保留所在目录、两层展开、导航历史与 420px 滚动位置；切换标签、隐藏/显示、移动会话、转到 SFTP 再返回后仍保留。另一会话保存文件、再刷新目录时，展开状态保持，已展开子目录中新增加的文件也能出现。 |
| 拖动自动分屏 | PASS | 实际鼠标拖动覆盖左/右/上/下及嵌套分屏、中间合并、标签排序和两个方向的分隔线调整；四个独立 SSH/PTY 的连接总数保持 4，各自输出标记仍在，终端标识不变。八种手动布局菜单均可继续使用。 |
| 空面板收起 | PASS | 有过会话的面板在最后一个标签关闭或移走后消失，相邻空间自动填补；手动网格中从未使用的空面板保留，使用后再清空会收起；取消关闭不改变布局，全部关闭后剩一个起始面板。 |
| 重连与状态不变量 | PASS | 单标签面板断开后重连仍保留原面板和宽度；状态测试覆盖四向拖放、5 个嵌套面板、比例保留、无效目标、自身拖放，以及多轮预设/移动中会话唯一归属。 |

直接 tmux 复制依赖其允许发送 OSC 52，默认 `set-clipboard external` 即可；自行关闭此项时仍可使用 Shift 本地选择。远端内容只在当前终端的真实选取动作后 1.5 秒内允许一次最多 1 MiB 的 UTF-8 写入，不提供读取能力。

## 自动化与程序包

| 执行入口 | 结果 | 证据 |
| --- | --- | --- |
| `npm run check`、生产构建 | PASS | `check-complete.log`、`build-complete.log`、`format-complete.log` |
| `npm test` | 35 PASS / 0 FAIL / 1 SKIP | `core.log`；唯一跳过项为 Windows 专用不可用盘符用例 |
| 可移植三个测试文件 | 21 PASS / 0 FAIL / 1 SKIP | `portable.log`；在 Linux 执行，已包含在上一行内，不重复累计 |
| 最终源码的全部桌面用例 | 20 / 20 PASS | `e2e-complete.log`、`e2e-complete.json`；含真实 tmux/screen、50,000 行输出、文件传输/覆盖保护、外部打开、主题、高亮及本轮新增交互 |
| 最终 Linux 修复包的全部桌面用例 | 20 / 20 PASS | `packaged-complete.log`、`packaged-complete.json`；同一套完整断言，运行时默认沙箱 |
| Linux AppImage / tar.gz 构建 | PASS | `package-linux-complete.log` |
| Windows x64 ZIP 构建及格式检查 | PASS | `package-windows-complete.log`；PE32+ x86-64 |
| macOS x64 / arm64 ZIP 构建及格式检查 | PASS | `package-macos-complete.log`；Mach-O x86_64 / arm64 |
| tar.gz 解压后直接启动与正常关闭 | PASS | `direct-tar.json`、截图；实际主程序，独立临时配置 |
| AppImage 解包运行与正常关闭 | PASS | `APPIMAGE_EXTRACT_AND_RUN=1`；`direct-appimage-extract.json`、截图 |
| AppImage 默认 FUSE 启动 | BLOCKED | 本机缺 `libfuse.so.2`，原始错误见 `direct-appimage.json`；未安装库或修改系统策略 |
| Windows/macOS 原生桌面运行 | BLOCKED | 当前只有 Linux；不能用交叉构建或 Linux 上的可移植测试代替原生运行 |

源码 Electron 测试沿用项目既有 `--no-sandbox` 及 Playwright 的模拟密码存储注入，只作为源码功能回归。程序包路径显式启用 `chromiumSandbox: true`，实测 `app.isPackaged=true`、`noSandbox=false`、`useMockKeychain=false`、未设置 `password-store`，窗口 `sandbox=true`、`contextIsolation=true`、`nodeIntegration=false`、`webSecurity=true`。

两个直接启动检查均未使用 Playwright Electron loader，仅传入回环调试端口进行 CDP 观察，记录本次程序及子进程的实际参数，无 `no-sandbox`、`use-mock-keychain`、`password-store=basic`。实际界面可见、版本为 0.2.3，`secureStorage=true`、渲染进程没有暴露 Node.js；正常关闭窗口后进程退出。此项只证明存储可用性，未验证密码重启解密。FUSE 启动失败保留为环境阻塞；可直接使用 tar.gz，或使用 AppImage 官方解包运行模式。

最终构建位于 `release/workspace-20261010-final/`。四个平台/架构的 `app.asar` SHA-256 一致：

`cfe0bc5588b92b877ed95a51b1f4e1e17084de8e7e780cacb0d69a46e96a1ee8`

归档中没有项目的 `.private/`、`tests/`、`test-results/` 或参考仓库；均使用最终渲染资源 `index-CYrFYRw4.js`。校验和也保存到该输出目录的 `SHA256SUMS`。

| 本地修复产物 | SHA-256 |
| --- | --- |
| `QuayTerm-0.2.3.AppImage` | `33ee70dcaac161fad1dff9a68c01609a86873d0013a31ea16e07917f6c5c54e1` |
| `quayterm-0.2.3.tar.gz` | `39f8cc03602efe45a64cba41cb25af4247dd2020a0fe77c9b7ba853a40e3edae` |
| `windows/QuayTerm-0.2.3-win.zip` | `b847d2399ca51c8dc1112c35fab4f6895cac75cf575e79ca8d2d759e58446845` |
| `macos/QuayTerm-0.2.3-mac.zip` | `1672133027a4287d53d11f4af154a6eec95dfdc18c223a3ce17201e8b3103a4d` |
| `macos/QuayTerm-0.2.3-arm64-mac.zip` | `d6cc546cfcaabb5c3b21cfdb1c66de7ce08b95b8401af77d917bc6ef15ea0d14` |

## 失败、修正与复测

1. 新交互测试首轮 3 PASS / 2 FAIL：一个测试正好拖到两条分隔线交叉点，实际拖动了横向分隔线；另一个精确按钮名称未包含 Ant Design 图标的可访问名称。改为避开交叉点测试各方向、正确定位重连按钮，保留所有功能断言。`interactions-first.log` 和 `interactions-first-traces/` 保留原始证据，复测 5 / 5。
2. 首轮完整源码测试 18 PASS / 2 FAIL。重复选区的补发复制与正常选择通知重叠，可能晚到并覆盖之后写入的剪贴板内容；使用选择通知版本判断，仅在没有通知时补发，随后含同范围重复选择和剪贴板哨兵的测试通过。
3. 同轮另一失败为启动时白屏：测试启动时间与构建清空/重建 `dist` 的时间重合。后续固定渲染产物后再启动源码测试，打包仅在独立输出目录复制这些资源；完整复测通过。`e2e-full.log`、`e2e-first.json`、`e2e-first-traces/` 保留原始失败，不将首次失败改写为通过。
4. 后续补上保存/传输刷新时对展开分支的重新读取，并用新出现的子目录文件验证读取确实完成，避免仅检查旧缓存仍暂时可见。最终结果以 `*-complete` 日志及上面的新产物哈希为准；早期 `8f501fbd…` 包和中间日志不代表最终构建。

## 清理与范围

本轮只清理测试创建的应用进程、回环 SSH/SFTP、独立 tmux socket、screen 会话和临时配置/文件；保留脱敏测试证据与最终构建。不会修改用户原有主机、会话和数据目录。

本报告针对这四项改进及完整 Linux 自动化回归，不升级为 [验收清单](../test-acceptance.md) 中所有原生项目都已完成。真实外部程序画面、密码跨进程解密、系统睡眠/唤醒、输入法、多显示器及完整安装升级矩阵未在本轮重新验收。Windows/macOS 后续在对应系统运行可移植子集、更新后的 `desktop-smoke.e2e.cjs` 并补真实 tmux 与鼠标操作；本轮不声称跨平台核心验收或签名/公证验收完成。
