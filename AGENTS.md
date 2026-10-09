# QuayTerm agent 入口

QuayTerm（泊岸）是私有、不开源的 SSH/SFTP 桌面客户端，使用 Electron、React、Ant Design、xterm.js 和 `@electerm/ssh2`。保持仓库私有及现有许可，不发布源码、测试凭证或用户配置。

## 接手测试

1. 先读 [TESTING.md](TESTING.md) 的最新记录和 [agent 测试交接指南](docs/agent-testing.md)，核对代码版本、目标系统和已有证据。指南中的 v0.2.1 数量属于历史基线，后续提交以实际测试结果为准。
2. 按 [验收用例与完成标准](docs/test-acceptance.md) 执行该系统未完成的项目。CI 通过、打包成功、源码运行、发布包实测是不同结论。
3. 复制 [测试报告模板](docs/test-report-template.md)，逐项记录实际结果和证据。历史记录见 [TESTING.md](TESTING.md)；使用说明见 [README.md](README.md)。

## 工作约束

- 用户提供的真实局域网主机默认仅限 SSH 登录、PTY/resize 和 SFTP 浏览；不要为测试在那里执行命令、安装依赖或改动文件。写入、断网及 tmux/screen 测试使用本地临时服务或已获授权的隔离测试机。已有授权的测试无需再次确认。
- 使用独立的 `QUAYTERM_DATA_DIR`。不要覆盖日常配置、关闭用户原有会话，或清理并非本次创建的进程、文件和 tmux/screen 会话。
- 密码通过机器本地的私有文件提供，不出现在命令行参数、日志、截图、报告或提交中。`.private/`、`release/`、`test-results/` 不提交；提交报告前检查脱敏和暂存差异。
- 核对 `package.json`、工作流和测试源码后再运行文档命令。Windows/macOS 先运行可移植测试子集；完整测试目前依赖 Linux 的真实 PTY 工具。
- 不通过删断言、跳过失败用例、改业务逻辑迎合测试、关闭沙箱或系统安全机制来制造通过结果。区分环境受阻与可复现的产品缺陷。
- 修复仅限任务涉及的问题，保留其他人的工作；修复后重测失败项及相关回归。报告绑定具体代码提交和产物哈希，不把旧包测试结果算给新包。
- 只有满足完成标准才能写“该平台验收完成”。没有目标系统、真实桌面、测试服务或必要凭证时，如实保留 `BLOCKED` / `NOT_RUN`，继续不依赖它们的工作。

本文件和交接文档不替代用户当前指令；发布新版本、扩大真实主机操作范围等，仍以用户实际授权为准。

## 2026-10-09 后续开发与文件打开约定

- 本轮从 `main` 的 `b2cf253a6152c311222c1c477c3bc2d27de13cdc`（v0.2.2）接续。保留 Windows 修复：不可用盘符不影响目录浏览、SFTP 断连关闭流、BOM/CRLF 连续保存、盘符重复选择和 LF 检出。Windows 已有 [报告](docs/test-reports/2026-10-08-windows-x64-0.2.1.md)，其中未完成项仍需补测；macOS 真实桌面验收待后续进行。
- 文件右键的“用本地程序打开”使用系统默认程序。单个本地文件直接打开原文件；远端普通文件完整下载到系统临时目录 `quayterm-open-*` 后打开，每次生成独立副本。保留扩展名，处理 Windows 不合法/保留文件名，不执行远端命令、不自动回传外部修改。
- 二进制/PDF、非 UTF-8 文件双击自动转到外部程序；UTF-8 文本保留内置编辑及 BOM/换行语义，大文本仍保留 2 MiB 的内置编辑限制。读取失败、权限错误和断连不能误当成二进制。显式“编辑文件”保持编辑器行为。
- `fileRead` 对外部打开返回结构化的 `{ external: true, reason }`。不要依赖通过 Electron `contextBridge` 抛出的 Error 自定义属性，桥接会丢失这些属性；其他 I/O 错误仍应报错。`fileOpenLocal` 在主进程调用 `shell.openPath`，必须处理其非空错误字符串。
- 下载失败/取消或默认程序打开失败，清理本次临时目录。成功打开的副本在退出客户端后保留，避免破坏仍在使用它的外部程序；由系统/用户清理临时文件。不要复用并覆盖旧副本，不把临时副本的修改视为已保存到远端。
- 同名上传始终默认不覆盖：每次传输确认都重置 `overwrite=false`，只有明确勾选允许覆盖才可替换；后端保留传输前及原子写入前的冲突检查。不要因添加外部打开入口改变这一约定。
- 相关回归在 `tests/local-files.test.cjs`、`core.test.cjs`、`appearance-files.e2e.cjs` 和 `desktop-smoke.e2e.cjs`。自动化中的默认程序调用使用替身以免启动 CI 上未知应用，实际下载/文件读写和界面路径仍真实执行；各目标 OS 的真实默认文件关联需要另做原生实测，不能把替身调用算作已打开第三方应用。
- Playwright 的 Electron 启动器在 Linux 默认添加 `--no-sandbox`，即使 `args: []`。程序包测试必须设置 `chromiumSandbox: true`，并确认 `app.isPackaged === true` 且运行时没有 `no-sandbox` 开关；只看启动参数数组或 `webPreferences.sandbox` 不足以证明默认沙箱。源码测试可沿用现有的显式 `--no-sandbox`，不得冒充程序包验收。
- 本项目锁定的 Playwright 在未指定 `executablePath` 的源码启动路径加载 Electron loader，其中包含 `--password-store=basic`、`--use-mock-keychain`；指定包路径不走同一 loader 路径。不要仅看 loader 文件就对所有程序包宣称注入这些参数，必须分别采集源码/包的实际开关与存储后端。真实默认环境需直接启动实际程序，以回环调试端口/公开 CDP 和现有 IPC 做观察，记录完整进程参数与隔离配置；系统策略阻止启动则记 BLOCKED，不放宽安全策略。
