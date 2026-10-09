# Linux x64 简单回归 — 2026-10-09

本轮简单回归通过，未发现需要修改产品代码的缺陷。**这不是 Linux 完整验收，也不是已发布程序包的验收。** 所有下述结果均来自本轮新执行，没有把此前测试记录计入本轮通过数。

本报告先记录 18:09–18:11 的初轮源码回归，文末再追加驱动纠正和 macOS 产品修复后的 Linux 新包回归；各阶段的提交、包哈希和范围分别判断，不将初轮结论套给后续产物。

## 基线和隔离

- 受测源码：`938d38f4c480f9836f51b3da2432a8532adbd7d3`，源码元数据版本 0.2.2，含尚未发布的外部打开功能。
- 分支：`codex/linux-cross-platform-20261009`；从核实后的 `origin/main` 创建独立工作区，原 `main` 工作区没有切换分支或修改文件。
- 系统：Ubuntu 26.04.1 LTS，Linux `7.0.0-38-generic`，x86_64；Node 22.23.2、npm 10.9.8、Electron 44.7.0、Playwright 1.64.0、Python 3.14.4。
- 本轮主要执行时间：2026-10-09 18:09:39–18:11:44，Asia/Shanghai；逐条 UTC 时间和退出码见 [脱敏证据 JSON](2026-10-09-linux-x64-simple-regression.evidence.json)。
- GUI 使用本轮私有目录解包的 Xvfb，虚拟屏幕 1600×1000×24；没有向系统安装软件包。测试进程使用独立 DISPLAY/XAUTHORITY，移除 WAYLAND_DISPLAY 并设置 XDG_SESSION_TYPE=x11，不占用日常桌面剪贴板。
- 运行的是源码 Electron；沿用仓库测试已有的 `--no-sandbox`，**不能作为真实发行程序默认沙箱启动的证据**。本轮没有下载、构建或启动 Release 安装包。
- 所有应用测试均使用脚本创建的独立 `QUAYTERM_DATA_DIR`。SSH/SFTP 只连本机回环 fixture；写入、错误注入和临时文件均限测试目录，没有读取 LAN 凭证、连接业务主机或运行远端业务命令。
- SFTP/PTY 辅助工具复用本机既有测试工具路径，未修改其文件；Xvfb 工具、依赖、日志和截图只保留在本轮工作区的忽略目录中。

## 本轮执行结果

| 命令                                                                                                                     | 退出码 | 实际结果                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------- |
| `npm ci`                                                                                                                 | 0      | 新工作区安装 442 个包；未修改锁文件         |
| `npm run check`                                                                                                          | 0      | 类型与代码格式检查通过                      |
| `npm run build`                                                                                                          | 0      | 类型检查与 Vite 生产渲染器构建通过          |
| `npm test`                                                                                                               | 0      | 30 项：29 PASS、0 FAIL、1 SKIP、0 CANCELLED |
| `xvfb-run -a -s '-screen 0 1600x1000x24' npx playwright test tests/desktop-smoke.e2e.cjs tests/appearance-files.e2e.cjs` | 0      | 7 PASS、0 FAIL、0 SKIP、0 FLAKY             |

唯一单元测试 SKIP 是 `Windows drive discovery tolerates unavailable volumes but preserves file operation errors`，由该用例的 `process.platform !== 'win32'` 条件决定，符合本轮 Linux 范围；没有为通过而跳过失败用例。依赖安装另报告 8 个 moderate 审计提示，未执行自动升级或强制修复；本轮不包含依赖安全审计。

完整的现有 `.test.cjs` 套件覆盖 SSH/SFTP 集成、实际 PTY 请求和尺寸、文件/路径/版本冲突、取消与断连、终端解析及状态。桌面层只选了下列两份文件，没有执行 `tests/app.e2e.cjs`。

| 桌面用例                                                                                       | 本轮结果 |
| ---------------------------------------------------------------------------------------------- | -------- |
| 本地文件菜单、右键对象、多选、文件夹内粘贴                                                     | PASS     |
| SFTP 菜单上传/下载、文件夹及另一侧传输                                                         | PASS     |
| 二进制/PDF 双击外部打开、独立副本、文本仍编辑、读取错误仍报错                                  | PASS     |
| 同名上传取消/拒绝/明确覆盖，以及下一次覆盖授权重置                                             | PASS     |
| 终端文件树编辑、六种主题热切换及连接保持                                                       | PASS     |
| 高亮保留 ANSI、同一行进度重绘和备用屏幕                                                        | PASS     |
| desktop smoke：SSH/SFTP 协议、BOM/CRLF 连续保存、剪贴板、控制键/resize、自动复制和外部打开 IPC | PASS     |

外部程序入口的自动化调用使用 `shell.openPath` 替身；实际下载、文件内容、临时副本、菜单和 IPC 路径均真实执行。**未在本轮声称系统默认第三方应用已经实际显示文件。** 新采集的菜单截图已检查，“用本地程序打开”标签可见且未裁切；截图不是完整真实桌面验收证据。

## 缺陷、范围和后续

本轮没有 FAIL、重试掩盖或产品修复提交，仅新增此报告与脱敏证据。未重新执行历史失败或引用旧日志充当本轮结果。

以下不在本轮简单回归范围，保持未验证：

- Release 安装、升级/卸载、默认沙箱下的发行程序行为。
- 实际桌面文件关联、第三方查看器的图像显示和本地修改体验。
- 完整 `app.e2e.cjs` 的布局拖动、真实 tmux/screen GUI 会话等流程；本轮底层 PTY 通过不能替代这些 GUI 项。
- 真实桌面输入法、多屏/DPI、跨应用剪贴板、睡眠/唤醒和完整快捷键矩阵。
- Windows/macOS 运行；由各自环境执行，不能把 Linux 结果转用。

因此仅可写“本轮 Linux 源码简单回归通过”，不能据此写“Linux 核心验收完成”或“三平台全部验收完成”。需要完整验收时继续使用 [验收清单](../test-acceptance.md)。

## 清理、证据与协调

- 自动化关闭本轮应用、SSH/SFTP 服务、PTY 子进程和 Xvfb；进程复查无本轮遗留进程。
- 比较本轮开始前后的 `/tmp/quayterm-*`，无新增残留目录；已完成与失败的测试下载副本均由测试清理。
- 日常配置、原工作区和既有会话未改动。原始日志、截图、工具与 node_modules 保留于本轮独立工作区的忽略目录；未提交凭证、用户配置、密文或二进制。
- 本地证据目录为 `.private/qa/linux-cross-platform-20261009/`；GUI JSON 位于 `.private/e2e-report.json`。可共享的命令、退出码、时间、每项结果和原始证据哈希见附带 JSON，原始文件仅本机保留。
- 按协调要求，只推送 `codex/linux-cross-platform-20261009` 私有分支，不推送 `main`，不创建 Release。
- 初次 `list_projects` 只看到 Linux 本机项目，未找到指定 Mac 项目。可见 QuayTerm 父项目为 `01ca1cfd-9e32-4175-9380-45f29c0bc6b0`，路径 `/home/kk/workspace/ssh_client`。随后协调方已告知 Mac 聊天“准备 QuayTerm macOS 测试”建成，本轮未继续调查或冒充 Mac 执行，此项不阻塞 Linux 回归。

## 后续阶段一：修正程序包驱动的沙箱判断

汇总分支纳入 Mac 的 `b8be37441fb165995df44c5ad37ba2a35a7123ce`（指定实际可执行文件并断言打包身份）和 `58e9ef3c3ffc9f21dc5dab83eac6d2dd20688a19`（多选修饰键按平台选择），保留它们的 ancestry。此阶段产品仍为 `938d38f`。

使用此前本地 Linux 测试包，逐字节核对 12 个主进程/shared/图标/新构建 dist 文件及关键包元数据，运行时可执行文件与锁定的 Electron 44.7.0 相同。旧包 `app.asar` 为 `02ae584447ddd543bb19c511e614c565f730b441f30cdcfe7049d85928594b01`，不是 GitHub v0.2.2 原资产，也不是下节的 Shift 修复包。

初次指定包的 smoke 和文件套件在私有运行时前置检查中失败：`isPackaged=true`，但 `app.commandLine.hasSwitch('no-sandbox')=true`。核对 Playwright 1.64 的已安装实现确认，Linux 启动器在没有 `chromiumSandbox: true` 时会自动添加该开关，传 `args: []` 并不能避免。此失败证明了测试入口的证据缺陷，不是通过禁用断言可以解决的产品问题。

独立修复提交 `75ef3c4fe6361b246df509599573b3dddb8b71b2` 为两个程序包桌面入口及 `scripts/test-packaged.cjs` 明确启用 `chromiumSandbox`，并核对 `isPackaged` 与实际 `no-sandbox` 开关。该修改不改变产品代码，也不调整系统安全设置。修复后 check、源码 smoke 1/1、旧包 smoke 1/1、必要前置与受影响文件用例 3/3 通过；首次失败日志/JSON/trace 保留于本机 `initial-no-sandbox-failure/`。

| 本机实际开关采样    | 源码模式                 | 指定包模式（修正后） |
| ------------------- | ------------------------ | -------------------- |
| `app.isPackaged`    | false                    | true                 |
| `no-sandbox`        | true（沿用源码测试行为） | false                |
| `password-store`    | `basic`                  | 空值/未设置          |
| `use-mock-keychain` | true                     | false                |

这与已安装启动器的条件分支一致：源码路径加载带模拟存储参数的 loader，显式指定可执行文件走另一条路径。静态 loader 内容不能推广到所有程序包。本报告不把有/无这些开关或 `secureStorageAvailable=true` 当作凭证保存/重启解密通过。

另使用 `child_process.spawn` 直接启动旧包，仅加入回环 CDP 端口和独立测试配置，不经 Electron 自动化 loader。既有 IPC 可读取空配置、版本和平台；主/相关子进程实际参数不含 `--no-sandbox`、`--password-store=basic`、`--use-mock-keychain`，渲染器有 `--enable-sandbox`、`NoNewPrivs=1`、`Seccomp=2`。正常 quit IPC 后退出 0。

独立采样器最初错误假设 `/proc/.../cmdline` 的每个参数都独立按 NUL 分段，而 Chromium 会把进程标题折成一个长段，导致误报未找到 renderer。保留这两次采样失败；改用参数边界匹配并保留完整原始参数后，同样的安全断言通过，没有删除断言或更改系统策略。该错误不表示程序启动被阻止。

## 后续阶段二：Shift 产品修复和新 Linux 包

- 产品修复：`12456e9e395b62707d6b5d14f2ccd355c66f5817`；加入 `macOptionClickForcesSelection`，在 macOS 鼠标报告模式下让 Shift 走 Option 强制本地选择路径。
- 鼠标强化回归：`2efad3c288d03a8b9f6acd4279bc02fb71823e74`；文件导航/覆盖等待修正：`6a0d28f385d438717ec13e6ba462fe7d47aee67b`。Mac 原提交历史均保留，公共沙箱修复和按模式限定的说明没有被回退。
- 构建时汇总提交：`703ef3cf55dfbbb217beb2eca8f454ae32b7f2f7`，产品文件与 `12456e9` 一致。随后仅增加 Windows 提供的 smoke 实际运行时 annotation 及报告；最终源码/新包 smoke 驱动提交为 `819108f2087d626f3884e0545af81a997877b7a2`。
- 新包是本机重新生成的 Linux x64 解包程序，运行版本字符串仍为 0.2.2。不是旧包、安装器或新的 Release；仅测试/报告变更没有要求重复打包。
- 新包 `app.asar` SHA-256：`e1cdf75c0c579d3d0979d87f6171ebb75120752403ba637c7de91c76d51bee86`。12 个应用文件与本轮源码/新 dist 一致，Electron 可执行文件也与锁定的运行时匹配；详细文件哈希见证据 JSON。

| 本轮最终针对性验证               | 退出码 | 实际结果                                                                           |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `npm run check`、`npm run build` | 各 0   | 类型/格式、修复后渲染器构建通过                                                    |
| 可移植/终端测试子集              | 0      | 16 项：15 PASS、0 FAIL、1 个 Windows 专用 SKIP                                     |
| 新源码 desktop smoke             | 0      | 1/1 PASS，含 Linux 三种鼠标模式步骤                                                |
| 构建新本地 Linux 包              | 0      | 独立输出到忽略目录，不替换已有包                                                   |
| 同一驱动 + 新包 desktop smoke    | 0      | 1/1 PASS，`isPackaged=true`、`no-sandbox=false`                                    |
| 新包文件专项（包含所需串行前置） | 0      | 4/4 PASS：本地菜单/多选、SFTP 操作、二进制打开/远端多选、同名覆盖                  |
| 新包 + 只读打包脚本              | 0      | 1 个生成的回环端点 SSH/SFTP 通过，指纹核对、凭证未落盘、打包身份与沙箱开关检查通过 |
| 新包直接启动 + 回环 CDP          | 0      | 实际进程参数与 renderer 隔离检查通过，正常退出 0                                   |

smoke 对 1000、1002、1003 模式逐项确认：Shift 拖选后复制到对应标记，选择期间没有 SSH 鼠标报告，普通点击仍发送 SGR 鼠标事件。本机是 Linux，只能验证 Linux 的 Shift 路径保持正常；Mac Shift/Option 特有行为由 Mac 自身证据证明。两种 smoke 的真实 annotation 均随 JSON 保留，源码含基本存储/模拟 Keychain 参数，新包没有这两项，新包也没有 `no-sandbox`。

新包独立启动同样不经过 `_electron.launch`；记录了主进程、zygote、GPU、utility 和 renderer 的完整 `/proc` 参数与安全状态。renderer 明确有 `--enable-sandbox`、`NoNewPrivs=1`、`Seccomp=2`；主进程和部分 utility 本来采用不同隔离方式，不能据此声称每个子进程都具有同样沙箱。`bootstrap.secureStorageAvailable=true` 仅是可用性观察，不是凭证持久化验收。

所有 GUI 仍在隔离 Xvfb 中，直接启动额外使用了回环 CDP 调试端口。文件选择器/外部应用入口的功能套件仍使用替身；未补真实查看器画面、物理桌面/输入法/睡眠、完整快捷键矩阵或完整平台验收。新产品阶段没有重跑未受影响的全部集成项目。

## 追加证据、清理与最终 CI 边界

旧产品驱动阶段的证据在 `.private/qa/linux-cross-platform-20261009-driver-b8be374/`；新产品阶段在 `.private/qa/linux-cross-platform-20261009-mac-shift-final/`。公开的脱敏 JSON 分别记录 `packagedDriverRegression`、`finalMouseRegression`，包括版本、精确命令、时间/退出码、annotation、包文件哈希和直接启动参数，不能跨阶段混用。

初次沙箱前置失败留下两个本轮测试配置目录。核实它们在阶段前不存在、所有者、生成前缀、失败时间段以及测试标记/Chromium 重建内容后，已定向清理；不涉及日常配置或 Windows 那两个审批受阻目录。最终复查没有新增的 `quayterm-*` 临时目录或本工作区的活动测试进程，测试工具/日志/本地包保留在忽略目录。

初轮 `e2e-report.json` 已归档到初轮 QA 目录。初轮菜单截图采用测试脚本固定路径，被后续套件覆盖；其当时查看记录和哈希仍保留，但不再声称原始 PNG 在旧路径可读。新包菜单截图已单独归档。上述采样/证据保留限制如实记录，未用重试隐藏失败。

[中间 CI 37922248994](https://github.com/Kangede/quayterm/actions/runs/37922248994) 对应 `703ef3c`，三个 job 均成功。该运行不能代表后来加入 annotation/报告后的最新 HEAD；最终收齐报告后，对固定 HEAD 派发的 CI 结果只在 [草稿 PR #1](https://github.com/Kangede/quayterm/pull/1) 正文更新，避免为写回结果再次改变 HEAD。Mac 最终报告与其 BLOCKED 项以 Mac 提交为准，本报告不代填。
