# Linux x64 简单回归 — 2026-10-09

本轮简单回归通过，未发现需要修改产品代码的缺陷。**这不是 Linux 完整验收，也不是已发布程序包的验收。** 所有下述结果均来自本轮新执行，没有把此前测试记录计入本轮通过数。

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
