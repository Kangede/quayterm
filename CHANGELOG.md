# QuayTerm 变更记录

## 0.2.3 — 2026-10-09

与上一正式版本 v0.2.2 比较：

- 文件右键新增“用本地程序打开”。远端文件下载到独立临时副本后交给系统默认程序，本地文件直接打开；二进制、PDF、非 UTF-8 文件双击采用该方式，普通文本继续使用内置编辑器。
- 外部打开保留文件扩展名及副本独立性，处理 Windows 文件名限制；失败下载/打开会清理该次副本。成功副本在客户端退出后保留，外部修改不会自动上传，需另存或自行回传。
- 修复 macOS 在 tmux 等程序开启鼠标报告时 Shift 拖选无法形成选区、复制仍保留旧剪贴板的问题。Shift 与 Option 均可走本地选择路径，普通鼠标事件仍传到远端。
- 明确同名上传提示并加强回归。原有默认不覆盖策略保持：每次确认重新取消覆盖勾选，只有明确授权才能替换同名文件。
- 加强三平台的程序包入口、多选、目录导航、鼠标模式及实际启动参数测试；修正 Linux Playwright 隐式禁用沙箱造成的验证误判。按源码/程序包模式记录存储开关，保留独立直接启动证据。
- 汇总三端测试报告、失败原因、复测结果及验收限制，更新 agent 交接说明。

### 验证范围与保留限制

- 本轮发布构建的提交、Actions 及资产校验和以 [v0.2.3 Release](https://github.com/Kangede/quayterm/releases/tag/v0.2.3) 为准；既有原生报告使用同一修复产品实现的本地 0.2.2 构建，不能写成对新发布包的完整原生验收。
- [VMware macOS x64 报告](docs/test-reports/2026-10-09-macos-x64-0.2.2.md) 的核心项目为 12 PASS / 7 BLOCKED。正常 Finder/下载隔离入口、原生窗口菜单、跨应用粘贴、系统选择器/Finder 拖入、Preview 可见画面、睡眠唤醒等仍有未完成子项；不代表实体 Mac 或 Apple Silicon 完整验收。
- Windows 尚未做 Authenticode 发行签名，macOS 尚未做 Developer ID 签名/公证。实际系统信任限制不因发布而消失，没有关闭系统安全策略来取得通过。
- [Windows 报告](docs/test-reports/2026-10-09-windows-x64-simple-regression.md) 记录两处测试临时目录的清理被自动审批拒绝（`blocked by policy`），不能声称完全清理。Mac 早期测试未备份原剪贴板、不能保证全程恢复；后续恢复/清理的范围按报告保留。
- [Linux 报告](docs/test-reports/2026-10-09-linux-x64-simple-regression.md) 明确 Xvfb、公开调试连接和第三方程序替身的边界。功能回归、产物构建和完整原生验收是不同结论。

## 0.2.2 — 2026-10-09

修复 Windows 不可用盘符阻断文件浏览、SFTP 断连清理挂起、BOM/CRLF 连续保存、盘符再次选择及检出换行格式问题。历史发布记录见 [v0.2.2](https://github.com/Kangede/quayterm/releases/tag/v0.2.2)。
