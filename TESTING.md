# QuayTerm 验证记录

## 2026-10-10：Windows 新工作区功能原生回归

受测源码 `ba8e022dd87b324ae1d9efd6c2257515a44e410c`，本机重建版本字符串 0.2.3 的 Windows 包，非 v0.2.3 Release 原资产。产物哈希、首次驱动失败及清理见 [Windows 报告](docs/test-reports/2026-10-10-windows-x64-workspace.md) 和 [脱敏证据](docs/test-reports/2026-10-10-windows-x64-workspace.evidence.json)。

- 检查/构建、22 可移植测试通过；源码和实际包各 11 / 11 桌面用例通过。
- 每会话侧栏、四向/嵌套分屏、空面板及重连通过；Windows 包连接用户本轮授权的隔离 Linux 服务，真实 tmux 3.6 自动复制、Shift 选择、screen 4.09.01、PTY/resize、分离/重附着和 50,000 行输出共 7 组通过。
- 直接启动、真实 DPAPI 跨进程、偏好持久化和便携运行通过；记事本原文件/副本/UTF-16、外部修改不回传、终端选区跨应用粘贴、退出后副本保留通过。
- 未发现产品缺陷，业务代码未改，修正了本机测试驱动。PNG 画面已由用户人工确认通过；PDF 画面和最后两个目录清理仍 BLOCKED。完整平台矩阵 4 PASS / 2 BLOCKED / 13 NOT_RUN，**不能称 Windows 核心验收完成**。
- 远端专用会话、客户端、查看器和外部临时副本已清理；本轮私有资料/凭证目录及本地构建目录的删除被自动审批拒绝，具体路径见报告。未绕过拒绝，原有文件/报告保留。

## 2026-10-10：终端自动复制、文件侧栏与拖动布局

本轮修复 tmux 鼠标模式自动复制、每会话文件侧栏状态、四向拖动分屏，以及已使用空面板的自动收起；保留手动布局预留空位。完整记录、首次失败与复测、最终源码清单和本地修复包哈希见 [Linux 工作区报告](docs/test-reports/2026-10-10-linux-x64-workspace.md)。

- 类型/格式检查、生产构建通过；底层与集成测试 35 PASS / 1 Windows 专用 SKIP。
- 最终源码及默认沙箱下的 Linux 修复包各 20 / 20 桌面用例通过，覆盖真实回环 SSH/PTY、tmux/screen、文件操作、50,000 行输出和新增交互；未使用用户 LAN 主机。
- tar.gz 实际解压程序、AppImage 解包运行均完成直接启动和正常退出；本机缺少 FUSE 2 库，AppImage 默认启动保持 BLOCKED。
- Windows x64、macOS x64/arm64 ZIP 交叉构建和格式检查通过，共享可移植测试在 Linux 通过；原生桌面补测留待对应平台执行。

本地修复包保留 0.2.3 版本字符串，位于 `release/workspace-20261010-final/`，不是原 v0.2.3 Release。各平台 `app.asar` SHA-256 同为 `cfe0bc5588b92b877ed95a51b1f4e1e17084de8e7e780cacb0d69a46e96a1ee8`。本轮没有发布新版本，不将全量自动化通过扩展为所有平台、所有原生验收项目完成。

## v0.2.3 发布验证与历史证据

v0.2.3 汇总 v0.2.2 正式标签之后的外部程序打开功能、macOS Shift 拖选修复及三端回归记录。发布以新版本提交的 main 验证/打包运行及指向同一提交的新标签作为本轮证据，具体 commit、Actions 和资产 SHA-256 记录在 [v0.2.3 Release](https://github.com/Kangede/quayterm/releases/tag/v0.2.3)。旧绿色运行不替代本轮验证。

下方三端原生报告保留其实际受测的本地修复构建版本字符串 0.2.2 和哈希，不改写为对 v0.2.3 Release 二进制的完整原生验收。Mac VMware x64 的 12 PASS / 7 BLOCKED、未签名/公证、Windows 两处清理受审批拒绝、Mac 早期剪贴板未完整恢复等限制继续有效，详见各平台报告及发布说明。

## 2026-10-09：三平台协调回归汇总

本轮修复 macOS 鼠标报告模式下 Shift 拖选失败的问题（产品修复 `12456e9`），并明确区分源码、修复包、自动化启动参数和直接启动证据。下列报告均保留原失败、复测、产物哈希和未完成项，不代表三平台完整验收：

| 平台                    | 本轮修复后主要结果                                                                                                                 | 报告                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Linux x64 / Xvfb        | portable 15 PASS / 1 Windows 专用 SKIP；源码/新包 smoke 各 1 PASS；新包文件专项 4 PASS；直接启动的实际参数及 renderer 隔离检查通过 | [Linux 报告](docs/test-reports/2026-10-09-linux-x64-simple-regression.md)     |
| Windows 10 x64          | portable 16 PASS；源码/新包 smoke 各 1 PASS，含三种鼠标模式；此前两目录清理仍 BLOCKED                                              | [Windows 报告](docs/test-reports/2026-10-09-windows-x64-simple-regression.md) |
| VMware macOS 15.8.1 x64 | 源码、ZIP、DMG smoke 及修复包文件套件通过；核心 19 项为 12 PASS / 7 BLOCKED                                                        | [Mac 报告](docs/test-reports/2026-10-09-macos-x64-0.2.2.md)                   |

产品包均是版本字符串仍为 0.2.2 的后续修复构建，不是新 Release，也不能用旧 `938d38f` 包替代。各平台和测试层级的数字不相加作为核心验收总数。最终固定 HEAD 的 CI 结果在 [草稿 PR #1](https://github.com/Kangede/quayterm/pull/1) 正文更新；中间提交的绿色结果不自动适用于后续 HEAD。

## 2026-10-09：自动化启动证据的校正

后续三平台协调回归发现，Playwright 1.64 的 Electron 启动器在 Linux 未指定 `chromiumSandbox: true` 时会自动添加 `--no-sandbox`。因此，以下历史已打包自动化记录中仅基于 `args: []` 或 `webPreferences.sandbox=true` 作出的“默认沙箱”判断不能作为该项通过证据；其功能断言结果保留，沙箱结论以新驱动和运行时实测为准。相关说明和补测结果记入 [Linux 简单回归报告](docs/test-reports/2026-10-09-linux-x64-simple-regression.md)。产品代码没有因此改动。

源码模式的 Electron loader 含 `--password-store=basic`、`--use-mock-keychain`；指定包路径不走相同 loader 路径。必须按实际模式采集参数，不能将静态 loader 内容推广到所有已打包程序，也不能将带模拟参数的功能回归视为真实系统凭证存储验收。

## 2026-10-09：macOS x64 修复包实测

本轮 VMware macOS 15.8.1 x64 结果见 [测试报告](docs/test-reports/2026-10-09-macos-x64-0.2.2.md) 和 [脱敏证据](docs/test-reports/2026-10-09-macos-x64-0.2.2.evidence.json)。核心 19 项为 **12 PASS、0 FAIL、7 BLOCKED**，本平台验收尚未完成；不代表实体 Intel Mac 或 Apple Silicon。

修复提交 `12456e9e395b62707d6b5d14f2ccd355c66f5817` 解决 macOS 鼠标报告模式下 Shift 拖选不能复制的问题。底层测试 29 PASS / 1 个 Windows 专用 SKIP，最终源码及实际 ZIP、DMG 各 1 项 smoke 通过，修复包功能套件 6/6 通过。另在直接启动的修复包上验证真实 Keychain 跨进程认证、tmux/screen 与 PTY、配置替换/重装、文件读写及传输故障；没有关闭沙箱或系统安全策略。

剩余原生子项为正常 Finder/下载隔离入口、交通灯/菜单及物理 ⌘Q、另一文本应用粘贴、系统文件选择器/Finder 拖入、Preview 实际画面和睡眠唤醒。包未签名/公证。运行时版本仍为 0.2.2，产物哈希见报告；这是未发布的本地修复构建，本轮没有更新 main 或 Release。

## 2026-10-09：用本地程序打开（待发布）

从 v0.2.2 的 `b2cf253a6152c311222c1c477c3bc2d27de13cdc` 接续，保留 Windows 原生测试的全部修复。本节测试的是后续源码及本地 Linux 构建；运行时版本号仍为 0.2.2，不是 GitHub 上既有 v0.2.2 Release 资产，本轮没有重新发布 Release。

新增本地列表、双栏 SFTP 和终端文件树的“用本地程序打开”；远端文件流式下载到独立临时副本，本地文件打开原文件。二进制、PDF、非 UTF-8 文件双击外部打开，普通文本与 BOM/CRLF 连续保存行为保持。成功副本在客户端退出后保留，不自动上传；失败/取消清理该次下载。

同名上传原本就默认不覆盖，每次传输确认将覆盖选项重置为关闭。本轮添加更明确的提示并通过 UI 验证拒绝、取消、显式允许以及下一次重置，未放宽后端覆盖检查。

| 本机验证（Linux x64，Node 22.23.2） | 结果与范围                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`、`npm run build`    | 通过                                                                                                                                        |
| `npm test`                          | 30 项：29 PASS、0 FAIL、1 SKIP；跳过的是 Windows 专用不可用盘符测试                                                                         |
| `npx playwright test`               | 15 / 15 通过；含既有快捷键、真实 PTY tmux/screen、50,000 行输出、新外部打开和覆盖确认                                                       |
| Linux 已打包程序                    | 默认沙箱下 `appearance-files.e2e.cjs` 的 6 / 6 用例通过；下载真实执行，第三方程序调用使用替身                                               |
| 真实默认程序调用                    | 同一 Linux 程序包通过真实 SFTP 下载 PNG，原始 `shell.openPath` 返回成功，启动系统默认 `org.gnome.Loupe.desktop` 的新进程，下载字节/哈希一致 |
| 退出后副本                          | 退出该测试客户端后，副本内容不变、查看器仍运行；随后只清理本轮查看器进程、文件和 fixture                                                    |

本地受测包 `app.asar` SHA-256：`02ae584447ddd543bb19c511e614c565f730b441f30cdcfe7049d85928594b01`。包中 `sandbox=true`、`contextIsolation=true`、`nodeIntegration=false`。真实默认程序测试样本为仓库自身 PNG 图标，19,777 字节，SHA-256 为 `5b47a174460df56ac8e1e79cdaca0f8adb390e55f28ba251af1a3609456c0706`；只通过 SFTP 读取本地隔离服务，没有在用户 LAN 主机上运行命令或写入文件。

新增回归覆盖：小/大二进制与 ASCII PDF、UTF-8 采样跨字符边界、文本/空文件/读取错误的区别、远端同名副本隔离、Windows 保留文件名和路径字符、文件权限、取消和失败清理、系统无默认程序时的错误，以及上传覆盖选项不沿用上一次授权。

首轮桌面测试暴露了 `contextBridge` 丢弃 Error 自定义属性导致二进制分流失败，改为返回结构化的外部打开结果后复测通过。另修正测试驱动中模态框退场后的焦点等待，以及 Ant Design 图标参与菜单可访问名称导致的精确定位失败；保留原失败日志，未删除功能断言。最终完整桌面运行为 15 / 15。

本机日志在忽略目录 `.private/`：`core-external-open.log`、`e2e-external-open-final.log`、`packaged-external-open.log`、`real-default-open.json`；初次失败保留于 `e2e-external-open.log` 和 `e2e-external-open-rerun.log`。菜单截图已检查，无裁切。原生 Wayland 图片查看器的图像内容未做视觉自动化验收，不将进程启动写作第三方画面验证。Windows/macOS 的实际默认文件关联及外部程序显示仍需按新增 [F05 验收要求](docs/test-acceptance.md) 补测。

## v0.2.2：Windows 修复发布

v0.2.2 将下方 Windows 测试发现的修复纳入发布版本，并按用户指令从 `main` 发布。该版本的构建提交、CI 结果、资产 SHA-256 和新包抽查记录见 [v0.2.2 Release](https://github.com/Kangede/quayterm/releases/tag/v0.2.2)。下面的 0.2.1 本地修复包报告仍绑定原有代码和哈希，不作为新版本二进制已经完成完整验收的证明。

## 2026-10-08：Windows x64 本机补测

Windows 10 x64 的本轮原生结果见 [独立测试报告](docs/test-reports/2026-10-08-windows-x64-0.2.1.md) 和 [脱敏证据](docs/test-reports/2026-10-08-windows-x64-0.2.1.evidence.json)。最终修复代码为 `41af01282c39fb4717cfc5ffa4975308d112939e`；本地安装器/便携包的哈希在报告中，不能与原 v0.2.1 Release 混用。

修复了空光驱阻断文件浏览、断连后 SFTP 传输挂起、编辑器丢失 BOM/CRLF 格式、规范化路径后的盘符重新选择，以及 Windows 检出换行导致格式检查失败。13 项可移植测试和扩展后的 1 项桌面 smoke 通过；实际包完成多组功能/故障检查、3 个 LAN SSH/SFTP 登录、2 个真实 tmux 3.4 验证。screen 缺失，部分系统交互和完整键盘矩阵仍未完成，因此 **Windows 核心验收尚未完成**。其他系统未复测这些修复。

## 此前 Linux 与 CI 记录

最后核对：2026-10-08（Asia/Shanghai）。本地执行环境：Linux x64 桌面、Node.js 22.23.2、Electron 44.7.0；另外已有 GitHub 三平台 CI 结果。

给其他系统的 agent：[交接指南](docs/agent-testing.md) · [验收用例与完成标准](docs/test-acceptance.md) · [报告模板](docs/test-report-template.md)。以下明确区分版本和运行范围，历史通过不自动适用于新的发行包。

## 0.2.1：自动复制与 CI 修复

- 新增持久化的“选中文本后自动复制”开关，默认关闭。
- 桌面用例覆盖：默认不复制、开启后双击选词复制、清除选区保留剪贴板、关闭后不复制、手动复制仍可用。该用例在三个系统的原生桌面测试中执行。
- 首次 GitHub 运行 `37754591310` 的 Linux 构建成功，Windows/macOS 均在同一条文件路径比较断言失败。文件列表返回原生真实路径，测试却与未规范化的临时路径直接比较；现已使用 `fs.realpathSync.native` 验证，并增加目录链接 / Windows junction 的回归测试。
- CI 保留全部检查，增加失败诊断产物和执行超时。修复提交 `5bffb398da7abe69ab7e5b6c7e7f861a236e3e09` 的 [运行 37758264822](https://github.com/Kangede/quayterm/actions/runs/37758264822) 三个 job 已全部成功。

| 0.2.1 验证范围 | 已核实结果                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| Linux CI       | 23 项底层/集成、13 项桌面用例全部通过；AppImage/tar.gz 构建成功                |
| Windows x64 CI | 10 项可移植测试、1 项原生桌面 smoke 通过；NSIS/portable 构建成功               |
| macOS arm64 CI | 10 项可移植测试、1 项原生桌面 smoke 通过；arm64/x64 DMG/ZIP 构建成功           |
| v0.2.1 Release | 上述 CI 的 8 个二进制资产及 SHA256SUMS 已发布；远端资产 SHA-256 与上传文件一致 |

10 项可移植测试已包含在 Linux 的 23 项中。桌面 CI 从源码启动 Electron，不运行最终安装器或发行程序；Windows/macOS smoke 使用真实 SSH/SFTP 协议回环服务，但不执行真实 PTY、tmux 或 screen。macOS runner 为 `macos-26-arm64`，因此 x64 包的原生执行仍待 Intel 机器验证。

上述结果不能替代 Windows/macOS 的安装后完整操作、系统密码存储重启、原生输入法等验收，也不能把 0.1.1/0.2.0 的本地包结果升级为 0.2.1 发行包结果。按交接指南逐平台补齐。

## 0.2.0 已通过记录

| 验证                                | 结果                                           |
| ----------------------------------- | ---------------------------------------------- |
| TypeScript + Vite 生产构建          | 通过                                           |
| 代码格式及类型检查                  | 通过                                           |
| 底层与状态测试                      | 22 / 22 通过                                   |
| 真实桌面交互测试                    | 13 / 13 通过                                   |
| 既有局域网 SSH + SFTP 测试（0.1.1） | 3 / 3 通过                                     |
| Linux 已打包程序默认沙箱启动        | 通过                                           |
| 运行时依赖 npm audit                | 0 个已报告漏洞                                 |
| 四种打包产物中的 app.asar           | 内容哈希一致；均不包含测试、私有凭证或参考仓库 |

### 0.2.0 新增验证

- 本地 / 远端文件右键、目录和空白处右键、Shift+F10、保留多选、点击目标切换。
- 属性、重命名、确认删除、新建；复制到目标文件夹、下载、文件 / 文件夹上传和传输到另一侧。文件选择器在自动化中返回专用临时路径，后续文件传输使用真实 SFTP。
- 六种配色热切换与持久化，新终端继承主题，连接数不因换肤增加。
- 显示层错误 / 警告 / 成功高亮，脚本真彩色及 256 色保留，关闭高亮可立即还原。
- CJK、emoji、组合字符的单元格位置；ValueError / UserWarning / Traceback 识别。
- 通过真实 SSH 数据通道反复发送回车及清行，确认进度只占一行；显式换行会增加新行。
- 备用屏幕暂停高亮，返回普通屏幕后恢复；原有 tmux / screen 和 50,000 行输出回归通过。
- 已打包 Linux 0.2.0 程序在默认沙箱下重复执行新增的四组桌面验收，4 / 4 通过。报告：`.private/packaged-features-0.2.0.log`。

本次新增文件操作仅在一次性本地目录和隔离 SSH/SFTP 测试服务中执行，没有修改用户提供的局域网主机文件。

### 底层与状态测试

- 地址和端口验证、SSH 参数白名单。
- 安全存储不可用时不将密码写入磁盘；加密凭证重载。
- SHA-256 主机指纹、变更拒绝、OpenSSH 哈希主机名和导入过滤。
- 独立 SSH 连接与真实 PTY；尺寸变更请求到达服务端。
- 通过真实 OpenSSH SFTP 子系统浏览目录与符号链接。
- Unicode、UTF-8 BOM、CRLF 文本读写及版本冲突保护。
- 文件 / 目录创建、重命名、递归删除和根目录保护。
- 递归上传下载、内容一致性、覆盖控制和取消传输。
- 两个独立 SSH/SFTP 服务之间的 1 MiB 二进制传输及字节一致性。
- 两个会话连接同一主机时的复制到自身保护；拒绝或取消操作不打开源文件流。
- Linux 文件权限保留、原生路径和本地文件复制。
- 遍历八种布局及多次面板间移动，确保会话无重复、无丢失。
- SSH 快速连接格式、IPv6 和非法输入。

### 桌面交互测试

1. 主机列表、右侧编辑、显示方式、持久化。
2. 真实 SSH 终端中文 / Unicode / ANSI 颜色；控制键、复制粘贴、bracketed paste、查找和侧栏开关。
3. 按图十五实际建立左右各两个标签；跨面板拖动后成为左三右一，四个 SSH 连接保持独立且不重新连接。覆盖连接快捷键、八种布局切换和标签合并。
4. 本地隔离 tmux 3.6 与 screen：启动、Ctrl+B / Ctrl+A 前缀、新窗口、备用屏幕、尺寸变化和分离。
5. 终端文件树编辑与保存；双栏 SFTP 的两侧均能切换本地 / 远端。
6. 实际 UI 拖动上传、远端重命名、拖动下载、确认删除，核对文件内容。
7. 50,000 行终端输出完成，验证流量控制、滚动缓存和最后一行；关闭会话快捷键。
8. 已知主机详情、渲染进程隔离和未捕获错误检查。
9. 无 Linux 专用依赖的原生验收脚本：通过本机临时服务验证真实 SSH/SFTP 协议连接、Unicode、粘贴、控制键、resize、目录与文本读取，并检查本地文件与凭证隔离。0.2.0 当时仅在本地 Linux 通过；后续三平台 0.2.1 CI 结果见上方，在 macOS 还检查原生编辑菜单。

测试用的 screen / tmux 仅在一次性本地目录及专用 socket / 会话名下运行。没有对用户提供的主机执行这些测试命令。

### 局域网主机

| 连接              | 密码认证 | PTY / 登录输出    | SFTP 列表 | resize     |
| ----------------- | -------- | ----------------- | --------- | ---------- |
| 10.50.1.220:22222 | 通过     | 515 字节初始输出  | 通过      | 请求已发送 |
| 10.50.1.220:30137 | 通过     | 528 字节初始输出  | 通过      | 请求已发送 |
| 10.50.1.234:22    | 通过     | 1700 字节初始输出 | 通过      | 请求已发送 |

这些主机的测试只建立新的终端会话和 SFTP 浏览，不发送 shell 命令、不上传、不修改、不删除文件。远端的 resize 请求没有通过执行远端命令进行反查；尺寸传递由本地真实 PTY 测试验证。

### 已打包程序复测

Linux 解包程序以默认沙箱启动，通过真实桌面界面逐一连接三台局域网主机并显示 SFTP 目录；未输入远端命令。AppImage 通过 extract-and-run 启动，并在新进程中从 GNOME Secret Service 解密已保存密码，再次完成真实 SSH / SFTP 连接。

0.1.1 的已打包 Linux 程序使用全新临时数据目录，再次通过三台局域网主机的真实 SSH/SFTP 验收，核对主机指纹且不发送 shell 命令。报告：`.private/packaged-0.1.1.json`。

上述三台局域网主机的记录属于 0.1.1；0.2.0 的新增功能在本地隔离服务和 Linux 已打包程序中验证，未重复在用户主机上执行文件操作。

## 0.2.1 产物与未完成的原生验证

当前 [v0.2.1 Release](https://github.com/Kangede/quayterm/releases/tag/v0.2.1) 包含 Linux x64 AppImage/tar.gz、Windows x64 NSIS/portable、macOS x64/arm64 DMG/ZIP，均来自已通过的 CI 运行。早期 0.2.0 本地包只是历史记录。

本机只有 Linux；其他系统的 CI 成功范围已在上方列明。四个目标系统/架构的 0.2.1 发行包完整核心验收均尚无完整报告，尤其需补 Windows 安装与便携运行、macOS 两架构实际启动、DPAPI/Keychain 密码重启保存、真实桌面快捷键/文件交互、连接真实测试机运行 tmux/screen，以及受控中断恢复。详见 [平台缺口表](docs/agent-testing.md) 和 [逐项完成条件](docs/test-acceptance.md)。

v0.2.1 Windows 未做 Authenticode 签名，macOS 未做发行签名/公证；这些状态与功能验收分别记录。此版本不声称经过长期断网恢复、大型目录性能、所有 SSH 服务端或所有输入法的穷尽验证。

## 证据

CI 证据可从上方固定运行链接查看。本机详细报告和截图位于 `.private/`，不提交到 Git、不打进安装包，新机器克隆后不会获得它们。以下文件可能随复测更新，不能只凭文件名推断受测版本：

- `core-test.log`：最近底层测试记录；0.2.0 为 22 项，0.2.1 为 23 项。
- `e2e-report.json`、`e2e.log`：13 项桌面测试。
- `lan-report.json`：只读局域网测试。
- `hosts.png`、`terminal.png`、`two-tabs-per-pane.png`、`split.png`、`tmux.png`、`sftp.png`：界面截图。
- `context-menu.png`、`paper-theme.png`、`output-highlights.png`：0.2.0 右键菜单、主题与高亮截图。
- `terminal-display-0.2.0.log`、`packaged-features-0.2.0.log`：控制序列及已打包程序新增验收。
- `package-linux-0.2.0.log`、`package-windows-0.2.0.log`、`package-macos-0.2.0.log`：构建记录。

macOS 窗口配置和编辑快捷键按 [Electron 自定义标题栏](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)及 [before-input-event](https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event) 说明调整；这属于代码适配依据，不替代 macOS 原生运行证据。

0.2.1 安装包校验和随 Release 的 `SHA256SUMS` 发布。旧版 `release/0.2.0/SHA256SUMS` 仅是本机历史文件，不能校验新版资产。后续验收应按报告模板新增带 OS、架构、版本和日期的记录。
