# QuayTerm 跨平台测试交接

最后核对：2026-10-08。目标是让另一台系统上的 agent 补齐原生测试，并留下可复核的结论。阅读顺序：本页 → [验收用例与完成标准](test-acceptance.md) → [报告模板](test-report-template.md)。

## 1. 固定基线与尚未完成的范围

| 项目         | 已核实值                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| 私有仓库     | [Kangede/quayterm](https://github.com/Kangede/quayterm)                                                |
| 发布版本     | [v0.2.1](https://github.com/Kangede/quayterm/releases/tag/v0.2.1)，2026-10-08 发布                     |
| 发布代码提交 | `5bffb398da7abe69ab7e5b6c7e7f861a236e3e09`                                                             |
| 通过的 CI    | [37758264822](https://github.com/Kangede/quayterm/actions/runs/37758264822)，上述提交的三个 job 均成功 |
| 技术栈       | Electron 44 / React 19 / Ant Design 6 / xterm.js 6 / `@electerm/ssh2`；精确版本以锁文件为准            |
| Node.js      | 22.12+；工作流选用 Node 22，各 runner 的实际小版本见相应 job 日志                                      |

此文档可能位于发布提交之后。分别记录“阅读文档的提交”“受测源码提交”和“受测安装包 SHA-256”，不要仅写 `main` 或“最新版”。新增测试证据应记录日期，不覆盖历史事实。

| 目标系统/架构       | v0.2.1 已有证据                                                                          | 本轮仍需接手的部分                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Linux x64           | Ubuntu 24.04 CI：23 项底层/集成、13 项桌面用例通过，AppImage/tar.gz 构建成功             | 发布的 0.2.1 二进制完整桌面验收；真实系统输入、重启和异常场景。0.1.1/0.2.0 的本地已打包实测不能替代此项 |
| Windows x64         | Windows Server 2025 x64 CI：10 项可移植测试、1 项桌面 smoke 通过，NSIS/portable 构建成功 | 安装器和便携版正常启动、原生窗口/快捷键、系统密码存储、文件操作、真实远端 tmux/screen 等完整验收        |
| macOS Apple Silicon | `macos-26-arm64` CI：10 项可移植测试、1 项桌面 smoke 通过；构建 arm64/x64 的 DMG/ZIP     | Apple Silicon 上 DMG/ZIP 的安装运行、Keychain、菜单/快捷键和完整功能验收                                |
| macOS Intel         | x64 DMG/ZIP 在上述 macOS arm64 runner 上构建成功                                         | Intel 机器上的源码和发布包原生执行均待验证。Rosetta 结果需单独标记，不能当成 Intel 原生通过             |

可移植的 10 项已包含在 Linux 的 23 项中，不应相加。CI smoke 从仓库启动 Electron，**没有运行最终安装器、安装后的 app 或便携发行程序**。其回环 SSH/SFTP 服务实现真实协议，但不创建操作系统 PTY、不运行 tmux/screen，也不证明 DPAPI/Keychain 重启解密正常。

Windows 发行包未做 Authenticode 签名，macOS 包未做发行签名/公证。记录首次启动的系统提示；功能验收与发行签名状态分别报告，不将“预期未签名”写成“已签名通过”。

更早的 CI 路径失败已修复：文件列表返回 `realpath`，测试应使用 `fs.realpathSync.native` 比较，不能改成字符串大小写放宽、删除断言或取消路径规范化。历史细节见 [TESTING.md](../TESTING.md)。

## 2. 第一轮应当做什么

1. 核对仓库私有、工作区状态、目标 OS/CPU、登录的图形桌面和测试账号；保留已有改动。先创建一份报告，所有新用例默认 `NOT_RUN`。
2. 运行第 3 节中该系统适用的源码测试，记录实际命令、退出码、用例数及失败详情。
3. 从 Release 下载相应二进制及校验和，核对后按第 4 节从真实发行程序执行验收；优先 Windows、两个 macOS 架构的缺口。
4. 依 [验收用例](test-acceptance.md) 完成安装、密码/偏好重启、剪贴板、文件菜单、终端显示、独立会话、tmux/screen 和异常处理。每个系统独立判断，不能沿用另一个系统的 PASS。
5. 有失败先保存证据，再定位/修复和复测。缺环境就写 `BLOCKED`，列出所需条件，继续其他用例。不要为了消除未完成项改小验收范围。
6. 提交脱敏报告；如当前任务已授权推送，将报告和必要修复推送原私有仓库。仅修改文档时无需重新构建发行包。不得覆盖 v0.2.1 的标签或已有资产。

## 3. 源码检查与自动化

在仓库根目录运行。需要 Node.js/npm、网络下载依赖及可运行 Electron 的桌面环境；运行 Electron 测试不需要另行下载 Playwright 的浏览器包。先用 `git status --short`、`git rev-parse HEAD`、`node --version` 和 `node -p "process.platform + ' ' + process.arch"` 记录环境。真实 OS/版本还需用系统信息核实。

### 所有系统通用

```sh
npm ci
npm run check
npm run build
node --test tests/workspace.test.cjs tests/local-files.test.cjs tests/terminal-display.test.cjs
npx playwright test tests/desktop-smoke.e2e.cjs
```

逐条执行并保留退出码；前一条失败不要把后续成功作为整体成功。PowerShell 中查看 `$LASTEXITCODE`，POSIX shell 查看 `$?`，均在相应命令后立即记录。用外部命令管道保存日志时，不能让最后一个日志命令掩盖测试失败。

这些测试生成临时配置和回环协议服务，不使用真实主机密码。桌面 smoke 会写入**系统剪贴板**，请在测试桌面进行，测试后清除测试内容。没有交互桌面或剪贴板服务时应标 `BLOCKED`，不能用 headless 解析测试替代原生 GUI 证据。

### Linux 完整测试

完整 `npm test` / `npm run test:e2e` 还需要 Python 3、Bash、OpenSSH `sftp-server`、tmux 和 screen；无显示服务时需要 Xvfb。先检查依赖是否存在，Ubuntu/Debian 的路径示例如下，其他发行版按实际安装位置调整：

```sh
export QUAYTERM_SFTP_SERVER=/usr/lib/openssh/sftp-server
export QUAYTERM_TMUX=/usr/bin/tmux
npm test
npm run test:e2e
```

在无桌面 Linux 的 CI 上可将最后一条替换为 `xvfb-run -a npm run test:e2e`。这不验证真实桌面的 IME、多显示器或系统密码存储。现有 Linux 源码桌面测试使用了 `--no-sandbox`，其成功不能作为发行包默认沙箱启动的证据，后者必须单独完成 R01。不要在 Windows/macOS 原样运行完整套件：`tests/fixture.cjs` 使用 Linux PTY、`/bin/bash` 和 OpenSSH 工具；依赖缺失不代表产品失败。

测试范围与限制：

| 入口                                                                            | 实际覆盖                                                                                         | 不能据此证明                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `tests/workspace.test.cjs`、`local-files.test.cjs`、`terminal-display.test.cjs` | 布局状态、系统路径/文件、终端解析和设置存储                                                      | 鼠标拖动、原生剪贴板、安装运行、真实密码重启解密                 |
| `tests/desktop-smoke.e2e.cjs`                                                   | 源码 Electron 的 SSH/SFTP 协议、Unicode、自动复制开关、粘贴、控制键、resize 请求；macOS 编辑菜单 | 发布包、真实 PTY、tmux/screen、完整 SFTP 写入流程                |
| `tests/core.test.cjs`、`app.e2e.cjs`                                            | Linux 实际 PTY、tmux/screen、文件传输、布局拖动、50,000 行输出                                   | 其他 OS 的 GUI/安装包行为                                        |
| `tests/appearance-files.e2e.cjs`                                                | 右键菜单、六主题、原始 ANSI/进度/备用屏幕；支持 Linux 已打包程序                                 | 自动覆盖所有 OS 或实际文件选择器交互；部分选择器已替换为测试路径 |
| `scripts/test-lan.cjs`                                                          | 指定主机的密码认证、PTY、resize 请求、SFTP 列表                                                  | 指纹真实性、远端尺寸反查、文件写入、复用器                       |
| `scripts/test-packaged.cjs`                                                     | 指定已打包可执行文件的只读登录/列表、预期指纹比对、临时配置                                      | 安装/卸载、密码保存后重启、完整功能                              |

`tests/desktop-smoke.e2e.cjs` 默认从源码启动；设置 `QUAYTERM_TEST_EXECUTABLE` 为已安装/解包的实际 Electron 主程序路径时，会检查 `app.isPackaged` 并执行同一组功能断言。它不读取 `QUAYTERM_EXECUTABLE`。`appearance-files.e2e.cjs` 也使用 `QUAYTERM_TEST_EXECUTABLE`，仍需真实 PTY/SFTP fixture。**Playwright 的 Electron 启动器会注入 Chromium/安全存储相关开关；即使传入 `args=[]`，也不能据此声明默认沙箱或真实 Keychain 已验证。必须核对实际进程的 `app.commandLine`，使用不经过该 loader 的独立启动补测。** 首次运行前可执行 `node node_modules/electron/install.js` 下载锁定的 Electron 运行时，避免下载占用 smoke 的测试时限。发行包 smoke 仍不能替代正常入口、系统对话框及第三方程序显示验收。

日志默认在控制台和 `.private/e2e-report.json`；部分套件写 `.private/*.png`。Electron 由测试手动启动，不保证 Playwright 默认配置自动产生 trace/截图，失败时检查实际文件并补采证据。每次运行前后归档到本机 `.private/qa/<运行编号>/`，避免报告被下一次覆盖；不要提交原始秘密数据。

### 需要构建修复版本时

```sh
# 对应原生系统任选一条；macOS 同时生成两种架构
npm run dist:linux
npm run dist:win
npm run dist:mac -- --arm64 --x64
```

输出默认在 `release/`。不得把交叉构建成功记为另一系统的原生通过。修复版本需记录新提交和新产物哈希，重新执行受影响用例；不要将本地修复包当成原 Release 资产。

## 4. 验证真实发布包

使用拥有该私有仓库访问权的 GitHub 账号，从 [v0.2.1 Release](https://github.com/Kangede/quayterm/releases/tag/v0.2.1) 下载当前系统的文件和 `SHA256SUMS`。可在浏览器下载，或使用已登录的 `gh release download v0.2.1 --repo Kangede/quayterm --pattern '<准确文件名>' --dir '<测试下载目录>'`；另一次将 pattern 改为 `SHA256SUMS`。尖括号内容需替换，不要把访问令牌写进命令或报告。

| 系统                | Release 中的准确文件名                                     | 安装后/解包后的主程序                         |
| ------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| Linux x64           | `QuayTerm-0.2.1.AppImage`、`quayterm-0.2.1.tar.gz`         | AppImage 本身；tar.gz 解包目录中的 `quayterm` |
| Windows x64         | `QuayTerm.Setup.0.2.1.exe`、`QuayTerm.0.2.1.exe`           | 安装目录中的 `QuayTerm.exe`；或便携启动器     |
| macOS Intel         | `QuayTerm-0.2.1.dmg`、`QuayTerm-0.2.1-mac.zip`             | `QuayTerm.app/Contents/MacOS/QuayTerm`        |
| macOS Apple Silicon | `QuayTerm-0.2.1-arm64.dmg`、`QuayTerm-0.2.1-arm64-mac.zip` | `QuayTerm.app/Contents/MacOS/QuayTerm`        |

GitHub 已把 Windows 资产名中的空格规范化为点，按表中的名字下载。以下仅计算下载文件的哈希，再与 `SHA256SUMS` 中对应**文件名**的一行逐字比对；下载了部分资产时，不要求其他文件也存在：

```powershell
# Windows PowerShell；便携版使用另一文件名
Get-FileHash -Algorithm SHA256 -LiteralPath .\QuayTerm.Setup.0.2.1.exe
```

```sh
# macOS；Intel 使用表中的 x64 文件名
shasum -a 256 QuayTerm-0.2.1-arm64.dmg
# Linux
sha256sum QuayTerm-0.2.1.AppImage
```

校验和用于核对 Release 资产一致性，不替代代码签名。记录文件名、哈希、CPU 架构和获取来源；哈希不符先停止使用该下载文件。

先在专用测试 OS 账号下走正常安装/启动路径，观察 SmartScreen/Gatekeeper、文件访问权限、图标、窗口、退出和卸载。不要拿 NSIS 安装器或 DMG 路径传给 Electron 自动化当成主程序。不要用关闭 Gatekeeper、杀毒、沙箱等方式掩盖启动问题；若系统策略不允许启动，记录原提示和限制，相关功能保持 `BLOCKED`，其余可独立测试的项继续。

所有功能测试均使用隔离配置。交互启动可在终端设置 `QUAYTERM_DATA_DIR` 为新建的测试目录，然后运行真实主程序；PowerShell 用 `$env:QUAYTERM_DATA_DIR = 'C:\...\qa-profile'`，macOS/Linux 用 `export QUAYTERM_DATA_DIR='/.../qa-profile'`。路径必须替换为本机目录。从 Finder/开始菜单打开时通常不会继承该变量，因此正常启动路径测试使用专用 OS 账号，不要误用日常配置。

Linux AppImage 需要合适的 FUSE/沙箱环境；记录直接启动和 extract-and-run/解包运行的区别。tar.gz 能运行不能证明 AppImage 直接启动已通过。自动化可指向已解包的实际 Electron 程序；这也不能代替 AppImage 启动路径验收。Windows 便携启动器可能不能被 `_electron.launch` 直接驱动，改用安装后的程序只能证明后者，便携版应另行交互检查。

### 只读的已打包程序自动验收

先在机器本地提供两个私有 JSON 文件，凭证文件应放仓库外，限制访问权限。不要复制上一台机器的用户配置，也不要在报告中粘贴凭证。以下只是格式示例，地址、用户名、密码和指纹均须替换为**已授权且已核实**的测试值：

```json
[
  {
    "name": "QA host A",
    "address": "test-host.example.invalid",
    "port": 22,
    "username": "qa-user",
    "password": "REPLACE_LOCALLY"
  }
]
```

```json
{
  "results": [
    {
      "address": "test-host.example.invalid",
      "port": 22,
      "fingerprint": "SHA256:REPLACE_WITH_INDEPENDENTLY_VERIFIED_VALUE"
    }
  ]
}
```

主机名应唯一、端口为数字，两个文件的 `address/port` 必须完全一致。当前 packaged 脚本逐条等待首次指纹确认，因此主机数组中不要重复同一 `address/port`；同端点多账号/多会话另走交互用例。指纹应来自管理员、受控测试服务的已知密钥或其他可信独立渠道。`test-lan.cjs` 会自动接受首次见到的指纹；其报告只能证明“观察到该指纹”，未经独立核实不能直接作为可信指纹来源。

Windows PowerShell（所有路径都需替换）：

```powershell
$env:QUAYTERM_EXECUTABLE = 'C:\path\to\installed\QuayTerm.exe'
$env:QUAYTERM_TEST_HOSTS = 'C:\private\qa-hosts.json'
$env:QUAYTERM_EXPECTED_FINGERPRINTS = 'C:\private\qa-fingerprints.json'
$env:QUAYTERM_TEST_REPORT = 'C:\private\qa-packaged-result.json'
node scripts/test-packaged.cjs
```

macOS/Linux（Linux 将 executable 换成已解包的 `quayterm`）：

```sh
export QUAYTERM_EXECUTABLE='/Applications/QuayTerm.app/Contents/MacOS/QuayTerm'
export QUAYTERM_TEST_HOSTS='/absolute/private/qa-hosts.json'
export QUAYTERM_EXPECTED_FINGERPRINTS='/absolute/private/qa-fingerprints.json'
export QUAYTERM_TEST_REPORT='/absolute/private/qa-packaged-result.json'
node scripts/test-packaged.cjs
```

脚本自行建立/删除一次性配置，使用 `rememberPassword: false`，不发 shell 命令、不写远端文件。通过时必须同时检查退出码 0、报告中的版本，以及非空 `results` 与本次所有预期主机一一对应，不能让空主机数组得到“全通过”。失败可能不产生 JSON，需保留控制台错误；不要读取前一次报告当成本次结果。

`npm run test:lan` 只需 `QUAYTERM_TEST_HOSTS`，也可指定 `QUAYTERM_TEST_REPORT`；仅在允许首次信任的受控测试环境使用它。用户真实主机优先用已核实指纹的 packaged 流程或交互核对。没有原局域网或凭证时不扫描网络、不猜测账号；标记该补充项受阻，利用隔离服务完成其他测试。

## 5. 测试服务、数据与清理

- 文件写入、错误认证、指纹变化、大量输出、断开连接等使用一次性服务。Linux 现有 fixture 只监听 `127.0.0.1`，但其 SFTP 初始目录并非 chroot 安全边界；不要对外暴露这个固定测试密码的服务。
- Windows/macOS 的真实 tmux/screen 验收需要可达的、已授权的 Linux/Unix 测试机或隔离 VM；客户端必须在目标系统上运行。源码 smoke 的回显服务器不能运行这些程序。没有该环境时 T05 为 `BLOCKED`，不是 `PASS` 或 `N/A`。
- 使用明确的本地和远端测试根目录、专用文件名、专用 tmux socket / screen 会话。不要覆盖用户文件、导入用户全部 known_hosts，或修改业务主机 SSH 配置制造故障。
- 上传下载样本包含空文件、中文/空格文件名、UTF-8 BOM/CRLF、小目录树及二进制文件。比较字节数和 SHA-256，不能仅凭进度变成 100% 判定成功。
- 保存证据后关闭本次连接/应用，停止本次创建的服务与会话，检查测试目录内残留 `.quayterm-*.part`。清理只针对核实过的测试根目录，不使用跨目录通配删除或无 socket 限定的 `tmux kill-server`。

私有配置和原始截图不随仓库克隆迁移。报告应包含脱敏的步骤、结论和足够复核的证据；若原证据只在本机，明确写“仅本机保留”，提供日志摘要/哈希并说明复现方法，不能引用下一位 agent 无法访问的绝对路径作为唯一证明。

## 6. 给另一台机器 agent 的任务示例

> 请阅读仓库根目录 AGENTS.md、docs/agent-testing.md 和 docs/test-acceptance.md，在这台机器上补齐 QuayTerm 的原生验收。先报告实际 OS/架构、受测提交和发行包 SHA-256，再执行对应平台尚未完成的必测项。使用隔离配置与测试服务，不改动真实业务主机。用 docs/test-report-template.md 逐项记录结果、证据、阻塞和清理情况，必要修复后复测；不要将源码 CI 或打包成功当作发行包通过。将脱敏报告及任务范围内的修复提交并推送到此私有仓库，最终按完成标准说明还缺哪些项目。
