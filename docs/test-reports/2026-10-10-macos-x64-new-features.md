# 2026-10-10 macOS x64 新功能与完整回归测试

本轮四项新功能在 VMware macOS x64 的源码及实际程序包中均通过；完整桌面套件分别为 **20/20 PASS**，底层测试为 **35 PASS / 0 FAIL / 1 Windows 专用 SKIP**。没有发现需要修改业务代码的产品缺陷。修正了测试驱动对临时路径和 Bash 版本的假设，并补充 Mac 快捷键、Option 选择及 tmux 剪贴板关闭时的回退验证。

**这不等于 macOS 完整原生验收完成。** Finder、交通灯/原生菜单、另一文本应用粘贴、真实系统文件选择器/Finder 拖入、Preview 实际显示及睡眠唤醒仍受当前工具能力限制。Apple Silicon 和实体 Intel Mac 未在本轮测试。逐项结果及可复核观测见下文和 [脱敏证据](2026-10-10-macos-x64-new-features.evidence.json)。

## 环境与目标

- 日期/时区：2026-10-10，Asia/Shanghai；各次执行的 UTC 起止时间及退出码见证据 JSON。
- 已执行 `git fetch --prune origin`、`git switch main`、`git pull --ff-only origin main`，并阅读更新后的 AGENTS.md、TESTING.md、交接指南、验收清单、报告模板、README、工作流与测试源码。
- 最新文档/应用提交：`ba8e022dd87b324ae1d9efd6c2257515a44e410c`；本轮新功能提交：`f92ec7cb5c57c98a1a6df7ba287440c3344912d2`。程序版本仍为 **0.2.3**，是 main 上后续新功能的本地构建，**不是原 v0.2.3 Release 资产**。
- 本地测试分支：`codex/macos-new-features-20261010`。应用源码、依赖和资源没有修改；4 个测试文件已固化到本地提交 `13da8024ced3edd7d9980ae37d74af5560f20325`，最终文件 SHA-256 单列在证据中。未发布新版本、移动标签或推送远端；GitHub 当前公开状态保持原样。
- 系统：macOS 15.8.1 / build 24H32，x86_64；Electron/Node 为 x64，非 Rosetta。VMware 客机，4 个逻辑 CPU、8 GiB，图形设备 Vendor ID `0x15ad`，单屏 1718×918。不能据此推断实体 Mac 的硬件兼容性。
- 工具：Node 24.21.0、npm 11.19.0、Electron 44.7.0、系统 Bash 3.2.57、Python 3.9.6、tmux 3.7c、系统 screen 4.00.03、`/usr/libexec/sftp-server`。
- 所有应用使用独立 `QUAYTERM_DATA_DIR`；SSH/SFTP、故障注入、文件写入及 tmux/screen 仅使用本轮回环服务、临时目录和专用 socket。未连接或扫描用户 LAN 主机，未操作日常配置或会话。主机信任检查使用本轮协议 fixture 独立生成的预期指纹。
- 原生应用控制接口不可用；未使用 AppleScript 等其他方式绕过。页面操作和截图来自被测 Electron 应用的 Playwright/CDP，不能当成系统桌面或第三方程序画面证据。
- 原始日志、私有驱动、失败 trace、截图、安装副本和产物在本机 `.private/qa/2026-10-10-macos-new-features/` 与 `release/macos-new-features-20261010/`；不提交原始私有证据。共享 JSON 记录步骤、观测、退出码、时间及本机文件哈希。

## 新功能验证

| 新功能/相关边界 | 结果 | 本轮实际观察 |
| --- | --- | --- |
| tmux 鼠标模式自动复制 | PASS | tmux 3.7c 开启 mouse，直接拖选中文文本，系统剪贴板及 tmux buffer 内容一致；普通点击、滚轮继续发送 SSH 鼠标报告。开启自动复制时才复制，重复选择相同范围也更新剪贴板。 |
| Mac 本地选择与回退 | PASS | Shift 和 Option 均能强制本地选择、复制，且不发送错误鼠标字节；tmux `set-clipboard off` 时 Shift 回退仍正常。smoke 另覆盖 1000/1002/1003 三种鼠标模式、手动 ⌘C 和协议写入。 |
| 远端剪贴板授权边界 | PASS | 有真实选择才允许一次 UTF-8 OSC 52 写入；第二次写入和读取查询被拒绝。直接启动下，失焦后 12 ms、按键后 5 ms、切换会话后 83 ms 的写入仍被拒绝，早于 1.5 秒授权期限；超时 1603 ms 及不可信 DOM 鼠标事件同样被拒绝。单测还覆盖无效编码、超限及分块输入。 |
| 每会话文件侧栏 | PASS | 两个会话各自保留目录、两层展开、导航历史和 420 px 滚动位置；切换、隐藏/恢复、拖动到另一面板、转到 SFTP 再返回后仍保留。另一个会话保存后刷新，展开不丢失，新增子目录文件可见。不同真实端点的独有文件也核对无串用。 |
| 四向拖动分屏 | PASS | 左/右/上/下拖放、中心合并、嵌套分屏、横纵分隔线、标签排序及八种手动布局均通过。四个独立 SSH/PTY 保留标记与原会话，无重连或镜像输入；单独反查 PTY 尺寸从 `35 60` 到 `35 71`，PTY 标识不变。 |
| 空面板收起与重连 | PASS | 已用面板最后一个标签关闭/移走后收起；手动预留的未用空位保留。取消关闭不改变布局，全部关闭保留一个起始面板，自身拖放无副作用。单会话断开并重连时原面板和宽度保留。 |

自动复制开关跨新进程保留，并在重启后的实际选择中生效。普通 ⌘A/C/V/F、应用 ⌘Shift T/K/W/B、Ctrl Tab/Shift Tab、Alt 1–9、文件 ⌘S/C/V/A、Shift 多选、F2、Delete、Shift F10 及真实 shell 控制键均另做应用内验证；原生菜单与物理 ⌘Q 不包含在这些通过项内。

## 发行格式与产物

已先固定生产 `dist`，再运行 `CSC_IDENTITY_AUTO_DISCOVERY=false` 下的 `npm run licenses && npx electron-builder --mac --x64 --config.directories.output=release/macos-new-features-20261010`；不在源码桌面测试期间重建/清空 renderer。构建用第三方许可清单随产物保留；完成后恢复原仓库许可文件，未提交平台依赖清单差异。

| 格式 | SHA-256 | 本轮实际执行 |
| --- | --- | --- |
| `QuayTerm-0.2.3-mac.zip` | `d8ffb28223a5dae79a0fbf6d744765ff965e937e3677edbbb73eaaec2137a724` | ditto 解压后的实际主程序；完整桌面 20 PASS，直接启动补测及窗口/退出流程 |
| `QuayTerm-0.2.3.dmg` | `04cc8102ff1b0400988a55166595a2cde8e8afb613ddb415deee732b5fcda57b` | hdiutil 校验、只读挂载、ditto 复制并卸载；实际主程序直接启动、Keychain、窗口/退出流程 |
| 两份 `app.asar` | `ca3a4604e6f1e834c6013d66431966d17dfb3623de8ac02b95250fd4f2fe2a3c` | 完全相同，版本 0.2.3，Mach-O x86_64；ZIP 承担完整功能测试 |

包内共 626 个归档条目，无项目 `.private/`、`tests/`、`test-results/` 或 `.git/`；逐字节比较了主进程代码与 renderer 构建文件，均与受测本地文件一致。Mac 包的 asar 不与 Linux 报告的哈希混用。

两格式 `codesign --verify --deep --strict` 均退出 1（未签名），`spctl --assess --type execute` 均退出 3（无可用签名）。本地构建没有 quarantine 属性；未删除隔离属性、关闭 Gatekeeper 或放宽沙箱。解包程序可运行不证明正常下载后的 Finder 首次启动已通过。R01/R02 的原生入口子项及 D01 仍 BLOCKED。

| 启动方式 | 实际安全环境与结论 |
| --- | --- |
| 源码 smoke | `isPackaged=false`，无 `no-sandbox`，但有 `use-mock-keychain` 和 `password-store=basic`，只作功能回归。其余源码桌面套件沿用显式 `--no-sandbox`。 |
| Playwright 实际程序包 | 显式 `chromiumSandbox: true`；实测 `isPackaged=true`、无 `no-sandbox`、无 mock Keychain、未设置 password-store；窗口 sandbox/contextIsolation/webSecurity 为 true，nodeIntegration 为 false。 |
| 直接启动 ZIP/DMG | 只增加 `--inspect=0 --remote-debugging-port=0`，通过回环公开接口观察；主进程及相关子进程实际参数无替代安全环境的开关，renderer 有 sandbox。仍是带调试观察的启动，不作为 Finder 交互证明。 |

## 自动化与补测

所有下列最终运行退出码均为 0；完整命令、时间、首次失败及测试文件哈希在证据 JSON。测试前在独立 Electron 辅助进程的内存中保存可用剪贴板格式，不将其内容输出或落盘。

| 执行 | 结果/范围 |
| --- | --- |
| `npm ci`、显式安装锁定的 Electron 运行时、`npm run check`、`npm run build` | PASS；生产资源为 `index-CYrFYRw4.js`。npm 安装报告 8 个开发依赖中等告警；`npm audit --omit=dev` 为 0 个漏洞。未做依赖升级。 |
| 可移植三文件测试 | 21 PASS / 0 FAIL / 1 Windows 专用 SKIP |
| 设置本机 SFTP/tmux 路径后的 `npm test` | 最终 35 PASS / 0 FAIL / 1 Windows 专用 SKIP；包含上一行，不能相加 |
| 源码 smoke | 1 PASS，三种鼠标模式在 macOS 上各含 Shift/Option 分支 |
| 修正驱动后的源码 `npx playwright test` | 20 PASS / 0 FAIL / 0 SKIP；新功能 5 项及全部原有桌面回归 |
| `QUAYTERM_TEST_EXECUTABLE=<ZIP实际主程序>`，相同全套 | 20 PASS / 0 FAIL / 0 SKIP，运行时沙箱断言通过 |
| 直接启动剪贴板授权补测 | 6 组 PASS；读查询、单次授权、失焦、按键、后台会话、超时、不可信事件 |
| ZIP/DMG 各自直接启动 | 各 7 组 PASS；实际运行参数、Keychain 保存/新 PID 自动认证、编辑焦点、退出取消/确认、窗口 API |
| 直接启动 PTY 补测 | 5 组 PASS；真实 tmux/screen 窗口、切换、分离/重附着、尺寸、独立性、50,000 行输出 |
| 直接启动文件故障补测 | 5 组 PASS；三方向 SHA-256 一致、覆盖/自身/链接保护、传输取消/断连、认证/拒绝连接、原子保存能力、BOM/CRLF/超限 |
| 直接启动 UI 矩阵 | 7 组 PASS；显示、端点浏览、选择/多行确认、快捷键、文件键、可见错误/重连、自动复制重启 |
| 主机与信任 | 3 组 PASS；主机管理、同端口换密钥阻断、known_hosts 导入、隔离进程中存储不可用分支 |
| 配置升级/替换/重装 | 3 步 PASS；可信旧 v0.2.2 ZIP → 新 ZIP → 新 DMG → 删除本轮程序副本后重装；主机/信任/偏好/可解密密码保留 |
| 真实默认程序打开 | 原始 `shell.openPath` 成功，Preview 11.0 新进程出现；本地打开原文件，远端两份副本哈希一致、路径独立且客户端退出后保留。第三方画面仍 BLOCKED。 |
| 5 分钟空闲与停止服务 | PASS；300,087 ms 后输入正常，停止本轮服务后显示“连接已关闭”，无 renderer 异常。睡眠/唤醒仍 BLOCKED。 |

真实升级来源的 ZIP SHA-256 为 `a3e24677888d2eea52c1d4791e05d7f32339218472a89c18ba86cd326acf2c54`，旧 asar 为 `03e5a4a43feb3d9e02d72d3f38f1dc2614fca262d934d5bd3b94ef57bec09feb`；本轮重新计算，与已核验的历史 Release 证据一致。替换仅发生在本轮临时程序目录。

Keychain 不仅核对可用性：真实存储后退出、换新 PID、无需重输密码完成 SSH 认证；配置权限为 0600，未保存密码明文。不可用分支仅在隔离进程注入接口故障，验证提示、内存认证和退出后重新索取密码，不修改系统 Keychain。

## 核心用例结果

按 [验收清单](../test-acceptance.md) 逐项判断；部分子项完成时，父项仍保留 BLOCKED。历史结果未直接搬作本轮新包通过证据。

| ID | 状态 | 本轮证据/剩余子项 |
| --- | --- | --- |
| A01 | PASS | 类型/格式、构建、35+1 底层及源码 smoke/完整 20 项桌面通过；唯一 skip 为 Windows 专用项 |
| R01 | BLOCKED | ZIP/DMG 校验、解包/挂载复制、实际程序运行与架构通过；正常 Finder、下载隔离首次许可未验证 |
| R02 | BLOCKED | 两格式直接启动的窗口 API 与退出取消/确认通过；交通灯、原生菜单、物理 ⌘Q 未验证 |
| R03 | PASS | 旧版到新 ZIP/DMG、程序删除重装保留配置和可解密密码；独立卸载器 N/A |
| H01 | PASS | 新建/编辑/删除、四排序、分组/标记、表格/列表、跨进程保存、双击/+ 连接 |
| H02 | PASS | 首次拒绝/信任、重连、同端口换密钥拒绝、详情/删除/重信任、专用 hashed known_hosts 导入；选文件入口使用替身，原生选择器归 F02 |
| P01 | PASS | 两格式实际 Keychain 新进程认证及偏好恢复；隔离不可用分支提示、内存可用、磁盘无密码、重启索取密码 |
| T01 | PASS | 原 2+2→3+1、八布局、四向及嵌套拖放、分隔线与真实 PTY 反查；连接无重复/丢失/重建 |
| T02 | BLOCKED | 自动/手动复制、开关、重复选择、全选/清除、新旧会话/重启、多行取消/确认及 bracketed SSH 字节通过；另一原生文本应用粘贴未验证 |
| T03 | BLOCKED | 应用/终端/文件/输入框完整快捷键矩阵及真实 shell 中断/挂起/退出通过；原生菜单与物理 ⌘Q 未验证 |
| T04 | PASS | 六主题/持久化、高亮、中文/emoji/组合字符、ANSI 16/256/RGB、文本属性、回车清行、备用屏幕、50,000 行末尾及响应 |
| T05 | PASS | 真实 tmux 3.7c 与 screen 4.00.03 的独立窗口、切换、resize、分离/重附着；mouse 下 Shift/Option 及直接拖选复制 |
| F01 | PASS | 每会话侧栏状态、展开/滚动/历史、隐藏恢复、宽度/焦点，以及两侧本地/A/B 端点、过滤/排序/导航 |
| F02 | BLOCKED | 应用内三处菜单、目标/多选、新建/属性/复制/删除/上传下载及键盘通过；真实系统选择器/Finder 拖入未验证 |
| F03 | PASS | 本地→A→B→本地文件树哈希一致；同名覆盖每次默认关、拒绝/取消/显式允许、自身/子目录/链接及传输取消/断连保护 |
| F04 | PASS | 本地/远端 UTF-8、BOM/CRLF 连续 ⌘S、旧版本保存拒绝、二进制分流、2 MiB 限制、不支持原子替换时报错保留原文 |
| F05 | BLOCKED | 菜单/分流/独立副本/错误清理/不回传及真实默认程序调用与退出后副本保留通过；Preview 实际文件显示未观察 |
| N01 | BLOCKED | 错误认证/拒绝连接、可见错误/手动重连、传输中断/取消通过；300,087 ms 空闲与停止服务通过，睡眠/唤醒未验证 |
| Q01 | PASS | 本轮进程、fixture、PTY、查看器、挂载及临时配置已清理，剪贴板恢复成功；证据脱敏，保留首次失败及本机日志 |

64 MiB 传输分别在已传 196,608 字节后取消/断连，既有目标均未损坏；取消无 part，断连留下的 1 个本轮远端 part 在核实后只于隔离目录清理。程序未承诺网络已断开时仍能即时删除远端临时文件。外部打开样本为仓库 PNG，19,777 字节，SHA-256 `5b47a174460df56ac8e1e79cdaca0f8adb390e55f28ba251af1a3609456c0706`。lsof 对 VMware 共享挂载的告警不作为第三方文件显示证据。

## 首次失败、修正与复测

- **QA-MAC-PATH（测试驱动）**：扩展底层首轮 34 PASS / 1 FAIL / 1 SKIP，SFTP 返回 `/private/var/...`，fixture 预期 `/var/...`；完整桌面首轮的文件复制路径断言同因失败。测试 fixture、桌面临时目录改为先对 `os.tmpdir()` 使用 `fs.realpathSync.native`，保留严格路径和内容断言，未修改产品路径行为。底层复测 35 PASS / 1 SKIP，完整桌面复测通过。
- **QA-MAC-BASH（测试驱动）**：完整桌面首轮实际 shell 粘贴命令成功，但协议断言假设 shell 已打开 bracketed paste。macOS Bash 3.2.57 不主动协商此模式。保留真实 shell 粘贴执行验证，另由 fixture 显式发送启用序列，断言完整 SSH 包裹字节，再取消探测输入；没有删除功能断言或将 Bash 不支持当作产品缺陷。
- 完整桌面首轮合计 **7 PASS / 2 FAIL / 11 未执行**（serial 后续项因前置失败未运行）；原日志、两份 trace 和截图均保留。最终源码及实际 ZIP 均 **20/20**，没有遗留跳过或依赖随机重试的失败。
- 测试键按平台使用 ⌘；新工作区测试增加 Option 选择及 tmux 禁用 OSC 52 时 Shift 回退。只修改 4 个测试文件，应用/依赖/资源清单与 `ba8e022` 完全一致，因此不因测试驱动修改重新生成业务包。
- **辅助工具初始化**：测试前剪贴板读取返回没有 MIME 类型的空项，第一版备份助手拒绝构造 ClipboardItem，在任何桌面用例之前退出；修正为仅保留有类型的项后建立内存备份。未把此辅助工具失败算作产品缺陷。测试内容及最终恢复结果单独记录，不宣称覆盖不受 Electron 支持的剪贴板格式。
- **B-MAC-NATIVE**：当前原生应用控制 API 禁用。需要具备原生交互能力的测试会话或人工补 R01/R02/T02/T03/F02/F05/N01 所列系统交互；程序 API 或 CDP 成功不能替代。
- **B-MAC-SIGN**：本地包未签名、公证，系统评估拒绝；需要 Developer ID/公证及正常下载许可流程才能验证发行信任，未降低系统策略。

## 扩展与发行状态

| ID | 状态 | 范围/限制 |
| --- | --- | --- |
| E01 输入法/键盘 | BLOCKED | 没有真实中文 IME/非英文键盘操作证据；发送 Unicode 不等于输入法测试 |
| E02 DPI/多显示器 | BLOCKED | VMware 单屏，未覆盖实体硬件、混合缩放或多屏 |
| E03 路径/规模 | NOT_RUN | 已测基础中文/空格/规范化、目录树和 64 MiB 故障传输；完整超长路径、大目录矩阵未做 |
| E04 长时/网络 | NOT_RUN | 30 分钟以上空闲、多次睡眠及慢速/多服务端矩阵未做 |
| D01 签名/公证 | BLOCKED | 实际未签名且 spctl 拒绝，与核心功能统计分开 |

## 清理与结论

- 已确认本轮 QuayTerm/Electron、Node fixture、Python PTY、SFTP、专用 tmux/screen、Preview 均结束，无本轮残留挂载。传输残留 part 与外部打开副本均仅在所属测试目录清理。
- 最后一次空闲/断开测试完成后，剪贴板备份助手恢复成功并退出，其配置目录已删除。原始剪贴板内容未输出或保存到文件；恢复范围限 Electron 可读取的格式。
- 发现 1 个创建于本轮之前的 `quayterm-open-*` 临时目录，核对创建时间后保留，未读取或删除其内容。日常配置和原有会话未改动，未删除可能被其他 QuayTerm 实例使用的系统 Keychain 项。
- 保留本轮构建、安装副本、日志、截图、trace 和私有测试脚本供本机复核；旧的默认测试报告/失败产物在新运行前已归档。报告与共享 JSON 已检查脱敏，`.private/`、`release/`、`test-results/` 不提交。
- **核心父项统计：PASS 12 / FAIL 0 / BLOCKED 7 / NOT_RUN 0 / N/A 0。** 核心验收仍未完成；已完成本机新功能与可执行回归，不扩大为所有 macOS 硬件或原生系统交互均通过。
- 下一步：具备原生交互能力的测试会话或人工补 R01、R02、T02、T03、F02、F05、N01；Apple Silicon 与实体 Intel Mac 分别绑定自己的程序包/哈希执行。其他平台沿用各自报告，不能使用本轮 Mac 结果替代。
- 测试修正与脱敏报告保留在本地分支 `codex/macos-new-features-20261010`；测试驱动提交见环境节。未获本轮推送指令，未向远端写入。
