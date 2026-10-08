# QuayTerm 验证记录

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
