# Windows x64 简单回归 — 三平台协调轮次

## 结论与范围

**最终修复版本补测（19:03–19:06）通过：**检查/构建、16 项可移植测试、源码 smoke 1/1、新生成的 Windows x64 解包程序 smoke 1/1。两种 smoke 各完成鼠标 1000/1002/1003 三种模式的 Shift 本地选择、复制及普通点击转发断言；未发现新的 Windows 产品缺陷。最终代码、产物、启动参数及核对脚本首次错误见文末，旧 `938d38f` 包不计为修复包。

**首轮简单源码回归通过，未发现需要修复的新产品缺陷。** check/build 均退出 0；16 项可移植测试、1 项 Electron 桌面 smoke、4 项文件路径专项通过，失败/跳过均为 0。以下原始记录对应 18:08–18:20 的首轮；18:33 起的测试驱动补测另见本文末尾。

**后续补测：源码 smoke 1/1、安装后程序 smoke 1/1、多选关联用例最终 3/3 通过。** 首次专项执行的 1 项失败及测试适配错误均保留；失败轮次留下的两个临时目录清理被自动审批检查阻止，清理状态仍为 `BLOCKED`。

这不是完整 Windows 验收，不将源码执行算作安装包测试，也不将外部程序替身调用算作真实第三方应用显示。Playwright 插桩启动不等于普通入口的默认安全启动或真实凭证存储验收，实际启动参数补充见文末。上一轮未完成的图片/PDF、正常退出后副本保留等原生验证不因本轮通过而升级。

## 环境与代码

- 日期：2026-10-09，Asia/Shanghai（UTC+08:00）；实际运行 18:08:47–18:09:56。
- Windows 10 专业版 10.0.19045，实际进程 `win32 x64`；Node 24.21.0、npm 11.19.0、Electron 44.7.0、Playwright 1.64.0。
- 文档与受测源码：`938d38f4c480f9836f51b3da2432a8532adbd7d3`，运行版本字符串 0.2.2，包含发布版 v0.2.2 之后的新文件打开功能。
- 已检查 AGENTS.md、TESTING.md、交接指南、package.json 和测试入口；fetch 后远端 main 仍为上述提交。
- 工作分支：`codex/windows-cross-platform-20261009`，从 origin/main 建立；未修改业务代码、未推 main、未发布 Release。
- 依赖锁未变化，使用现有安装依赖，本轮未更新依赖。

## 实际命令与结果

所有操作在仓库根目录进行。新增私有配置仅改变测试选择、日志与输出目录，保持原测试超时、单 worker 设置；测试传入的 Windows `args` 未显式添加 `--no-sandbox`，不能仅凭这一点判断驱动注入参数或默认安全状态。

| 命令                                                                                                                                                                               | 时间（UTC+08:00） | 退出码 | PASS / FAIL / SKIP |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -----: | ------------------ |
| `npm run check`                                                                                                                                                                    | 18:08:47–18:08:54 |      0 | 格式与类型检查通过 |
| `npm run build`                                                                                                                                                                    | 18:08:54–18:09:07 |      0 | renderer 构建通过  |
| `node --test tests/workspace.test.cjs tests/local-files.test.cjs tests/terminal-display.test.cjs`                                                                                  | 18:09:07          |      0 | 16 / 0 / 0         |
| `npx playwright test --config .private/qa/2026-10-09-windows-cross-platform/native.config.cjs desktop-smoke.e2e.cjs`                                                               | 18:09:07–18:09:24 |      0 | 1 / 0 / 0          |
| `npx playwright test --config .private/qa/2026-10-09-windows-cross-platform/features.config.cjs --grep "local file context\|SFTP context\|binary double-click\|same-name uploads"` | 18:09:24–18:09:56 |      0 | 4 / 0 / 0          |

原始文件仅本机保留于 `.private/qa/2026-10-09-windows-cross-platform/`，对应 `01-check.log` 至 `05-focused-files.log`。时间、用例名、结果和日志/驱动哈希见 [脱敏证据 JSON](2026-10-09-windows-x64-simple-regression.evidence.json)。未上传原始日志、截图、配置或凭证。

## 文件打开/传输重点回归

使用仓库 `tests/appearance-files.e2e.cjs` 的前四个相关用例，并换用 Windows 本机隔离 fixture：SSH peer 仅监听 127.0.0.1，SFTP 接到 Git for Windows 的 `sftp-server.exe`。测试驱动只将远端导航转换成该服务的 POSIX 路径；本地文件断言仍使用真实 Windows 文件路径。

| 场景          | 本轮结果                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地菜单      | PASS：右键目标、多选保持、文件夹内新建/粘贴、重命名/删除路径正确                                                                                                              |
| SFTP 文件操作 | PASS：上传文件/目录、下载、重命名及传输到另一侧真实执行，内容检查通过                                                                                                         |
| 外部打开路径  | PASS（调用边界）：大二进制与 PDF 双击分流，文本保留内置编辑；重复打开产生不同副本，内容一致，修改副本不影响源；多选禁用、文件夹无该动作、读取失败不误开、默认程序错误清理副本 |
| 同名上传      | PASS：每次默认不覆盖；取消不写；未勾选保留原文并报错；明确勾选才替换；下一次再次回到未勾选                                                                                    |

`shell.openPath` 与文件选择器在专项自动化中使用替身。真实文件读写和 SSH/SFTP 下载并未替换；但本轮不启动或控制图片/PDF/文本查看器，因此不声明完整 F05 原生显示通过。smoke 另覆盖 BOM/CRLF 连续保存、SSH/SFTP、Unicode、剪贴板、控制键、resize 与渲染隔离。

## 缺陷与边界

- 新产品缺陷：无。没有删除断言、放宽预期或调整业务代码来获得通过结果。
- 本轮简单回归阻塞：无。
- 证据采集错误：运行前进程采集使用管道输出，没有保证空输出时也写入 JSON；`processes-before.json` 未形成有效快照。收尾读取该文件报不存在，但同一 shell 后续命令成功令最终退出码为 0。保留此错误，不将缺失基线当成空列表，也不声称完成进程前后对比。该采集命令不属于上表逐条独立记录退出码的产品测试。
- 未执行：Linux 专用完整 PTY 套件、tmux/screen、安装/卸载/升级、新安装包验证、第三方默认程序视觉检查及此前全部平台验收矩阵；这些项目属于本轮范围之外，不能写作 PASS。
- 本轮均为源码启动 Electron。安装器/便携产物 SHA-256 不适用本次源码结论；没有借用旧包结果。

## 保留与清理

- 既有未提交报告 `docs/test-reports/2026-10-09-windows-x64-0.2.2-external-open.md` 原样保留，其前后 SHA-256 均为 `41b9d8e629a69fbb592b44e1b68b35b4e0faed35eb46d76cf9eee51a2b20b299`；本轮不将它暂存或提交。
- 没有覆盖原 `.private/e2e-report.json`、根目录 test-results 或前轮 QA 证据；本轮使用独立日志和输出目录。
- 每次启动 Electron 均使用独立 `QUAYTERM_DATA_DIR`，文件专项的四个串行用例共享该套件的测试配置。测试 finally 关闭其 Electron/回环服务并清理本次临时目录。重新采集的结束时进程查询返回 0 个 `QuayTerm.exe`、`electron.exe`、`sftp-server.exe` 匹配项，只证明该时点没有这些匹配进程；因为运行前快照缺失，不作完整前后比较。结束快照已明确写出 `[]`，采集时间与限制保存在脱敏证据中。
- 本轮未操作真实业务主机，未关闭既有查看器或用户会话；没有访问真实主机凭证。新生成的测试凭证留在临时私有文件并随 fixture 清理，没有进入报告或提交。
- 首轮提交仅保存本报告和脱敏证据。推送目标为原私有仓库的同名分支，供三平台协调使用；没有向其他聊天发送消息。

## 2026-10-09 后续：打包启动驱动与多选修饰键

### 代码与安装包身份

本节受测产品仍为 `938d38f4c480f9836f51b3da2432a8532adbd7d3`。只合入测试/文档变更，核对 `electron`、`src`、`shared`、依赖锁、资源和许可均无产品差异；源码复用首轮成功构建的 dist。阅读文档及执行测试时 HEAD 为 `4b160b3bb721d314097c0fb112496857aed0faac`。

| 测试修正                                  | Mac 原提交                                 | Windows cherry-pick                        |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| 指定实际安装后程序并断言 `app.isPackaged` | `b8be37441fb165995df44c5ad37ba2a35a7123ce` | `c8f9fdd54a75d1ddf230d9c3355e583054d09216` |
| 多选使用 macOS Meta / 其他平台 Control    | `58e9ef3c3ffc9f21dc5dab83eac6d2dd20688a19` | `4b160b3bb721d314097c0fb112496857aed0faac` |

安装后程序来自已完成的 [CI 37889964253](https://github.com/Kangede/quayterm/actions/runs/37889964253)，已核对该运行 `headSha=938d38f4c480f9836f51b3da2432a8532adbd7d3`、`conclusion=success`。运行版本字符串仍是 0.2.2，但这份产物包含其后新增功能，**不是现有 v0.2.2 Release 资产**。

实际设置 `QUAYTERM_TEST_EXECUTABLE` 的路径为 `C:\workspace\quayterm\.private\qa\2026-10-09-windows-external-open\installed\QuayTerm.exe`。以下哈希在执行前后及报告整理时一致：

| 产物                                      | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| 安装后实际 `QuayTerm.exe`                 | `ff51e3917a2559d1602f4267b058f9c9d88a5d0436612337cdb2535a4b485b17` |
| 同一安装目录 `resources/app.asar`         | `608192192f7d9773d1dae90f1680cca41b2dd1755bb33a8c59e73645da558924` |
| 对应 CI 安装器 `QuayTerm Setup 0.2.2.exe` | `782f1372456ead3ed8e77cf993d66df597031c108dedf189c5e01e7e3978b88e` |

本轮没有把安装器或便携启动器传给 Electron 驱动，没有重新安装或发布产物。源码 smoke 明确移除 `QUAYTERM_TEST_EXECUTABLE`；安装后 smoke 设置为上述实际程序，并通过 `app.isPackaged === true` 断言。两种方式均由 Playwright 启动，测试传入的 `args` 不含 `--no-sandbox`；实际开关见文末补充，不据此宣称普通入口默认安全启动通过。

### 实际运行与首次失败

精确命令及独立退出码见证据 JSON 的 `targetedDriverRegression.commands`。两组日志分别保存在本机忽略目录 `.private/qa/2026-10-09-windows-packaged-driver/` 和 `.private/qa/2026-10-09-windows-packaged-driver-retry/`，没有覆盖此前日志、截图或输出目录。

| 执行                                     | 时间（UTC+08:00） | 退出码 | PASS / FAIL / SKIP |
| ---------------------------------------- | ----------------- | -----: | ------------------ |
| `npm run check`                          | 18:33:47–18:33:50 |      0 | 格式与类型检查通过 |
| 当前受维护的 desktop smoke，源码模式     | 18:33:50–18:33:57 |      0 | 1 / 0 / 0          |
| 同一 desktop smoke，安装后程序模式       | 18:33:57–18:34:05 |      0 | 1 / 0 / 0          |
| 首次选择本地菜单及二进制/远端多选用例    | 18:34:05–18:34:45 |      1 | 1 / 1 / 0          |
| 补齐串行前置用例并修正私有清理适配后复测 | 18:36:10–18:36:37 |      0 | 3 / 0 / 0          |

首次本地菜单用例已通过。远端用例超时是因为筛选漏掉了前一项 SFTP 菜单用例，其负责选择主机、信任指纹和建立连接；右侧仍在“选择主机”状态。私有适配的收尾代码又将 Electron 44 的异步 `clipboard.readText()` 当作字符串，造成 `split is not a function`，提前中断了 fixture 清理。两者均为本次测试执行/适配错误，没有据此判定产品缺陷；失败日志、报告、截图、trace 和初版适配文件完整保留。

复测只包含所需的三个串行用例：本地菜单/多选、建立 SFTP 并操作文件、二进制打开/远端多选。将私有清理中的剪贴板读取与清除改为 `await`，仅清除本 fixture 路径。未重跑可移植测试全套、其余 UI 套件或已通过的两种 smoke。

文件专项副本从 **当前 `4b160b3` 的 `tests/appearance-files.e2e.cjs` 重新生成**；`multiSelectModifier` 定义及两处调用均保留，不是沿用旧版硬编码 Control 的副本。差异仅为 Windows 回环服务、相对导入/启动路径、移除原测试显式传入的 Linux `--no-sandbox` 参数、独立截图路径、远端 POSIX 路径转换及测试剪贴板清理。功能断言未删改，原始正文和适配文件的哈希、差异说明均在证据中；移除显式参数不等于证明默认安全启动。

### 边界、保留与清理状态

- 本节最终测试结果通过；真实 SSH/SFTP 协议、临时文件内容、多选行为和打包身份均有断言。原生 smoke 的远端文件来自内存回环 peer，文件专项使用实际 Git for Windows `sftp-server.exe`。
- `shell.openPath` 和文件选择器仍使用替身；没有新增第三方查看器显示、真实 OS PTY、tmux/screen、安装/卸载或完整平台验收结论。既有原生验收缺口仍保留。
- 新增两轮均明确写出运行前后进程快照 `[]`；18:33:46、18:34:45、18:36:10、18:36:37 的查询均无 `QuayTerm.exe`、`electron.exe`、`sftp-server.exe` 匹配项。这次有效快照不修复首轮已记录的缺失基线，也不代表临时文件已全部清理。
- **清理 `BLOCKED`：**首次专项收尾失败留下 `%TEMP%\quayterm-features-ZwZlv5` 和 `%TEMP%\quayterm-win-feature-peer-WpOwBA`。尝试仅删除这两个本轮目录时，自动审批检查在命令启动前拒绝，返回理由仅为 `blocked by policy`；只读复核确认目录仍存在。保留本机失败证据，不声称 Q01 或完整清理完成。
- 已通过 smoke 的测试剪贴板内容已清除；成功复测的收尾完成。没有关闭用户原有查看器或会话，没有访问真实 LAN 主机或其凭证。
- 原未提交的 external-open 报告仍保持 SHA-256 `41b9d8e629a69fbb592b44e1b68b35b4e0faed35eb46d76cf9eee51a2b20b299`，不暂存。新增提交仅包含这份报告及脱敏证据；前述两项测试修正以独立 cherry-pick 提交保留。推送限于 Windows 测试分支，不改 main/Release、不创建 PR。

## 18:43 补充：实际启动参数与安全结论边界

收到跨端对 Playwright 注入参数的核查结果后，在相同 Windows、Electron 44.7.0、Playwright 1.64.0、产品代码和已校验安装包上各做一次短暂启动采样。使用与 desktop smoke 相同的源码/安装后启动参数，`chromiumSandbox` 选项同样未传。采样命令 `node .private/qa/2026-10-09-windows-launch-flags/probe.cjs` 于 18:43:39–18:43:41 执行，退出 0；没有重跑已通过功能用例、连接主机或操作凭证/剪贴板。

这些数值是**补充采样时**通过 `app.commandLine.hasSwitch()` / `getSwitchValue()` 读取的，不冒充先前已结束测试进程的同期记录：

| 实际观察                                            | 源码启动           | 安装后程序启动     |
| --------------------------------------------------- | ------------------ | ------------------ |
| `app.isPackaged`                                    | false              | true               |
| `no-sandbox`                                        | false              | false              |
| `use-mock-keychain`                                 | true               | false              |
| `password-store`                                    | true，值 `basic`   | false，值为空      |
| `disable-setuid-sandbox`                            | false              | false              |
| `disable-web-security`                              | false              | false              |
| 窗口 `sandbox` / `contextIsolation` / `webSecurity` | true / true / true | true / true / true |
| 窗口 `nodeIntegration`                              | false              | false              |
| `safeStorage.isEncryptionAvailable()`               | true               | true               |

本机 `playwright-core/lib/coreBundle.js:45666` 的 `--no-sandbox` 自动注入分支仅作用于 Linux，所以不能把 Linux 的观察值直接套用到 Windows。`server/electron/loader.js:74–75` 包含 `--password-store=basic` 和 `--use-mock-keychain`；本次实际观察在源码启动中出现，在安装后程序中未出现。依赖文件、采样脚本和原始结果的哈希见证据 JSON 的 `launchParameterFollowUp`。

**修正结论：**保留全部功能通过结果，但本报告不再使用“默认沙箱”来概括 Playwright 运行。窗口配置 `sandbox=true` 不是普通入口实际安全状态的独立证明；`app.isPackaged=true` 只证明加载了打包应用。上述存储开关的有无，以及 Windows 上的 `isEncryptionAvailable=true`，也不证明真实 DPAPI 凭证保存/重启解密完成，不能据此认定明文后端或安全存储通过。本次没有进行相关凭证实验。

源码与安装后程序均使用独立诊断配置，采样结束前后匹配进程数均为 0；配置及日志保留在本机忽略目录。原始失败证据和此前两个受阻清理目录继续保留，未再次尝试删除。未提交的 external-open 报告未修改；本补充只更新本报告和脱敏证据。

## 19:03–19:06 最终修复版本与新 Windows 解包程序

### 产品与驱动提交

合入下列固定提交，无人工冲突处理；打包身份/沙箱断言与新增鼠标断言均保留。新增一项纯证据改进：在实际 smoke 进程中读取启动开关，写入 Playwright 的 `electron-launch` annotation，不改变功能断言。

| 内容                                     | 上游提交                                   | Windows 提交                               |
| ---------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| 程序包显式启用沙箱并检查开关             | `75ef3c4fe6361b246df509599573b3dddb8b71b2` | `7d703402549c464a3ae74c4bcd466f2681b8a170` |
| Mac Shift 强制本地选择产品修复及初版回归 | `12456e9e395b62707d6b5d14f2ccd355c66f5817` | `a8c0fdd2a1aa5e5b92422e4d66f0eea447a09068` |
| 1000/1002/1003 模式与 Option 回归        | `2efad3c288d03a8b9f6acd4279bc02fb71823e74` | `7fed70d6d97c87d6f45dc6d1a6836c4827907571` |
| 同期采集实际 smoke 启动标记              | Windows 本轮增加                           | `4f5e8a6504a986667f98cf1a1f430ce3b0a6588c` |
| 文件菜单关闭等待和覆盖目标断言           | `6a0d28f385d438717ec13e6ba462fe7d47aee67b` | `8b06f89029aeea2bb2b5d96c4c74358ac8d71db0` |

构建和源码 smoke 时 HEAD 为 **`4f5e8a6504a986667f98cf1a1f430ce3b0a6588c`**；新包 smoke 时 HEAD 为 **`8b06f89029aeea2bb2b5d96c4c74358ac8d71db0`**。后者只增加文件专项驱动断言，产品文件、依赖锁、desktop smoke 和 native probe 与构建时逐字相同，故没有为它重新构建。产品文件也已核对与上游产品修复提交 `12456e9` 一致。

最后的文件驱动已合入并通过格式/类型检查；本轮未再次运行 `appearance-files` 套件，不将早先的文件专项结果改记给新驱动。Windows 实际执行 Shift 分支，macOS 专属的 Shift 适配分支和 Option 手势不由本机结果证明。

### 新包身份和内容核对

仅执行一次 `npm run build`，再用 `electron-builder --win --x64 --dir` 从该 dist 生成独立的 **本地 win-unpacked 测试包**；输出位于 `.private/qa/2026-10-09-windows-final-mouse/package/win-unpacked/`。未生成或安装 NSIS，未运行便携启动器，未发布 Release；版本字符串仍为 0.2.2。

| 新包文件             |    字节数 | SHA-256                                                            |
| -------------------- | --------: | ------------------------------------------------------------------ |
| `QuayTerm.exe`       | 246302208 | `b9f422aef1d8877341642e046c6f80ea371283e27bc7e5c80ab0b02364492209` |
| `resources/app.asar` |   7408920 | `8b786aef3a04cb5655067feb26d9f4214db5cfbb84904dbe58942fb560f3e416` |

哈希在包测试前后保持一致。ASAR 内的 dist、主进程、shared、许可、第三方声明与图标共 14 个应用文件，逐文件 SHA-256 与本次工作树/新构建一致；没有打入根级 `.private`、测试或 Git 目录。第三方声明使用未修改的已提交文件，依赖锁未变。实际 Authenticode 查询为 `NotSigned`；构建日志中的签名工具步骤不被当作已签名证据。

首次内容核对退出 1，提示 CSS 不在归档中。定位确认资源存在，但私有核对脚本向 Windows ASAR API 传入了 `/` 分隔路径；仅将两处读取路径用 `path.normalize` 转为原生形式后，保留全部内容相等断言，复核 14 个文件通过。同一新包未被重打或替换，初版脚本及失败日志均保留。这是核对脚本错误，不是产品资源缺失。

### 最终执行结果

本机仍为 Windows 10 专业版 10.0.19045 x64；Node 24.21.0、npm 11.19.0、Electron 44.7.0、Playwright 1.64.0、electron-builder 26.15.3。所有命令、退出码和原始证据哈希见 JSON 的 `finalMouseRegression`；本机日志集中于 `.private/qa/2026-10-09-windows-final-mouse/`。

| 执行                                 | 时间（UTC+08:00） | 退出码 | 实际结果                                      |
| ------------------------------------ | ----------------- | -----: | --------------------------------------------- |
| `npm run check`                      | 19:03:39–19:03:43 |      0 | 类型/格式通过                                 |
| `npm run build`                      | 19:03:43–19:03:47 |      0 | 新修复版本构建通过                            |
| 可移植测试子集                       | 19:03:47–19:03:48 |      0 | 16 PASS / 0 FAIL / 0 SKIP                     |
| 最终源码 smoke                       | 19:03:48–19:03:56 |      0 | 1 PASS / 0 FAIL / 0 SKIP，含 3 个鼠标模式步骤 |
| 生成本地 Windows x64 解包程序        | 19:03:56–19:04:21 |      0 | 新 `win-unpacked` 完成                        |
| 首次 ASAR 内容核对                   | 19:04:21          |      1 | 私有脚本路径格式错误，证据保留                |
| 修正路径后核对同一包                 | 19:06:38          |      0 | 14 个应用文件字节一致                         |
| 合入最终纯文件驱动后 `npm run check` | 19:06:38–19:06:42 |      0 | 类型/格式通过，无需重构建                     |
| 新解包程序最终 smoke                 | 19:06:42–19:06:51 |      0 | 1 PASS / 0 FAIL / 0 SKIP，含 3 个鼠标模式步骤 |

源码与新包均逐一验证：开启鼠标模式 1000、1002、1003 时，Shift 拖选后 `Ctrl+Shift+C` 得到对应标记，拖选期间没有鼠标报告发送给 SSH；普通点击随后确实发送 SGR 鼠标事件。smoke 中原有 BOM/CRLF、外部打开调用边界、SSH/SFTP、剪贴板、控制键、resize、渲染隔离断言仍全部执行。这里是回环协议 peer，未执行真实 tmux/screen 或操作系统 PTY。

### 实际 smoke 进程的启动状态与保留事项

下面是上述两次**实际功能测试进程**的 annotation，区别于 18:43 的单独启动采样。程序包模式明确传入 `chromiumSandbox: true`，并执行 `isPackaged`/`no-sandbox` 断言；源码模式未设置 `QUAYTERM_TEST_EXECUTABLE`。

| 标记                                                | 最终源码 smoke     | 新 win-unpacked smoke |
| --------------------------------------------------- | ------------------ | --------------------- |
| `app.isPackaged`                                    | false              | true                  |
| `no-sandbox`                                        | false              | false                 |
| `use-mock-keychain`                                 | true               | false                 |
| `password-store`                                    | true，值 `basic`   | false，值为空         |
| 窗口 `sandbox` / `contextIsolation` / `webSecurity` | true / true / true | true / true / true    |
| 窗口 `nodeIntegration`                              | false              | false                 |

这些是 Playwright 驱动的功能回归，不等于用户普通入口、真实 DPAPI 重启存储、第三方程序显示或完整 Windows 验收。旧包仅保留作基线，本节的新包结论绑定上述新哈希。

两段运行均有有效的前后进程快照，匹配的 QuayTerm/Electron/SFTP 进程数均为 0；测试 finally 完成，确认并清除了本次测试剪贴板内容。未接触真实 LAN 主机或已有查看器。此前两个被自动审批拒绝清理的临时目录继续保留，未重试删除；其 `BLOCKED` 状态不被本轮通过覆盖。

旧未提交 external-open 报告仍保持 SHA-256 `41b9d8e629a69fbb592b44e1b68b35b4e0faed35eb46d76cf9eee51a2b20b299`，不暂存。私有日志、包和测试配置不上传；仅将必要测试提交、本报告和脱敏证据推送到 Windows 测试分支，main/Release 不改动。
