# Windows x64 简单回归 — 三平台协调轮次

## 结论与范围

**本轮请求的简单源码回归通过，未发现需要修复的新缺陷。** check/build 均退出 0；16 项可移植测试、1 项 Electron 桌面 smoke、4 项文件路径专项通过，失败/跳过均为 0。

这不是完整 Windows 验收，不将源码执行算作安装包测试，也不将外部程序替身调用算作真实第三方应用显示。上一轮未完成的图片/PDF、正常退出后副本保留等原生验证不因本轮通过而升级。

## 环境与代码

- 日期：2026-10-09，Asia/Shanghai（UTC+08:00）；实际运行 18:08:47–18:09:56。
- Windows 10 专业版 10.0.19045，实际进程 `win32 x64`；Node 24.21.0、npm 11.19.0、Electron 44.7.0、Playwright 1.64.0。
- 文档与受测源码：`938d38f4c480f9836f51b3da2432a8532adbd7d3`，运行版本字符串 0.2.2，包含发布版 v0.2.2 之后的新文件打开功能。
- 已检查 AGENTS.md、TESTING.md、交接指南、package.json 和测试入口；fetch 后远端 main 仍为上述提交。
- 工作分支：`codex/windows-cross-platform-20261009`，从 origin/main 建立；未修改业务代码、未推 main、未发布 Release。
- 依赖锁未变化，使用现有安装依赖，本轮未更新依赖。

## 实际命令与结果

所有操作在仓库根目录进行。新增私有配置仅改变测试选择、日志与输出目录，保持原测试超时、单 worker 设置；Windows 未添加 `--no-sandbox`。

| 命令 | 时间（UTC+08:00） | 退出码 | PASS / FAIL / SKIP |
| --- | --- | ---: | --- |
| `npm run check` | 18:08:47–18:08:54 | 0 | 格式与类型检查通过 |
| `npm run build` | 18:08:54–18:09:07 | 0 | renderer 构建通过 |
| `node --test tests/workspace.test.cjs tests/local-files.test.cjs tests/terminal-display.test.cjs` | 18:09:07 | 0 | 16 / 0 / 0 |
| `npx playwright test --config .private/qa/2026-10-09-windows-cross-platform/native.config.cjs desktop-smoke.e2e.cjs` | 18:09:07–18:09:24 | 0 | 1 / 0 / 0 |
| `npx playwright test --config .private/qa/2026-10-09-windows-cross-platform/features.config.cjs --grep "local file context\|SFTP context\|binary double-click\|same-name uploads"` | 18:09:24–18:09:56 | 0 | 4 / 0 / 0 |

原始文件仅本机保留于 `.private/qa/2026-10-09-windows-cross-platform/`，对应 `01-check.log` 至 `05-focused-files.log`。时间、用例名、结果和日志/驱动哈希见 [脱敏证据 JSON](2026-10-09-windows-x64-simple-regression.evidence.json)。未上传原始日志、截图、配置或凭证。

## 文件打开/传输重点回归

使用仓库 `tests/appearance-files.e2e.cjs` 的前四个相关用例，并换用 Windows 本机隔离 fixture：SSH peer 仅监听 127.0.0.1，SFTP 接到 Git for Windows 的 `sftp-server.exe`。测试驱动只将远端导航转换成该服务的 POSIX 路径；本地文件断言仍使用真实 Windows 文件路径。

| 场景 | 本轮结果 |
| --- | --- |
| 本地菜单 | PASS：右键目标、多选保持、文件夹内新建/粘贴、重命名/删除路径正确 |
| SFTP 文件操作 | PASS：上传文件/目录、下载、重命名及传输到另一侧真实执行，内容检查通过 |
| 外部打开路径 | PASS（调用边界）：大二进制与 PDF 双击分流，文本保留内置编辑；重复打开产生不同副本，内容一致，修改副本不影响源；多选禁用、文件夹无该动作、读取失败不误开、默认程序错误清理副本 |
| 同名上传 | PASS：每次默认不覆盖；取消不写；未勾选保留原文并报错；明确勾选才替换；下一次再次回到未勾选 |

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
- 工作分支仅保存本报告和脱敏证据。推送目标为原私有仓库的同名分支，供三平台协调使用；没有向其他聊天发送消息。
