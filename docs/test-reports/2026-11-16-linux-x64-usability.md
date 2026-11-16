# 文件交互、凭证编辑与提示气泡修复验证

## 环境与代码

- 日期：2026-11-16，Asia/Shanghai；Linux x64、Ubuntu 26.04.1、Node 22.23.2、Electron 44.7.0。
- 基线：`470735a464a79bf19711e753f69fb62ca69f1adb`（v0.2.5）；四项修复实现：`a4bbaaea6743a970eb0181d9555c8940fd282969`，后续路径输入保护：`eb5d24f1d5b381a87e8ed8fcd8f88243d8a163c1`（版本字符串均为 0.2.6）。
- 使用真实桌面、独立 `QUAYTERM_DATA_DIR`、一次性本地文件和回环 SSH/SFTP 服务。未读取用户实际主机密码，未操作用户 LAN 主机或日常配置。
- 日志、截图、trace 保存在忽略目录 `.private/qa/20261116-usability/`。各轮桌面输出隔离，不覆盖历史测试证据。

## 复现和结果

旧渲染构建的四项专项均明确失败：隐藏文件不可见；名称输入框 Enter 后创建对话框仍未提交；已有主机的密码输入值为空；添加会话的提示气泡超出窗口，截图可见右侧和底部白色滚动条。原始结果见 `baseline.log`、`baseline.json`、`ui-source/baseline-results/`。

| 验证项 | 结果 | 观察与边界 |
| --- | --- | --- |
| 隐藏文件默认显示 | PASS | 终端侧栏、嵌套目录、本地列表和双栏 SFTP 都显示点文件；手动隐藏及侧栏隐藏/恢复保持所选状态；已有明确的 `showHidden=false` 偏好仍生效 |
| Enter 创建 | PASS | 本地文件/文件夹按 Enter 后实际创建；空名称不提交，IME 组合输入事件不提前提交，重复名称保留对话框供修改 |
| 真实 SFTP 创建 | PASS | 在真实 OpenSSH SFTP 子系统上创建文件及文件夹；人为延迟一次操作，连续两次 Enter 仅调用后端一次，输入框和确认按钮保持禁用直到结束 |
| 密码显示与修改 | PASS | 已保存密码以掩码填入，眼睛切换明文；重新打开和切换对象恢复掩码；修改、清空后保存得到预期状态；普通主机列表与保存响应不带密码/密文 |
| 凭证读取与存储边界 | PASS | 元数据编辑不提交密码；迟到的读取结果不覆盖另一主机；读取失败后仅保存备注不清除旧密码；过长替换被拒绝后旧的内存密码仍可用 |
| 外围白条 | PASS | 两种窗口尺寸及单一/双列/网格布局中，对添加按钮提示出现、消失的逐帧采样均无页面溢出或外围滚动条，气泡在视口内；修复前后截图已检查 |
| 内部滚动与既有功能 | PASS | 文件列表滚动位置、文件编辑器、模态框、Shift 连选、分屏、tmux/screen、文件传输、覆盖保护等完整回归保留 |

密码读取通过选定主机的专用 IPC，默认启动数据、主机列表及保存响应继续脱敏；测试只使用生成或固定的无实际用途测试凭证。磁盘加密/内存回退策略保持不变。加密重载与读取失败由测试 vault 覆盖；桌面脚本在系统安全存储可用时还会移除测试主机的内存副本，验证实际密文读取。源码启动中使用模拟钥匙串或 basic 后端的结果不替代真实系统凭证持久化验收。

## 本地自动化

| 入口 | 结果 | 证据 |
| --- | --- | --- |
| 类型/格式与生产构建 | PASS | `check-complete.log`、`build-final.log` |
| 凭证专项 | 4 / 4 PASS | `credentials-unit-fixed.log`；已包含在完整底层套件内 |
| 六项界面专项 | 6 / 6 PASS | `targeted-fixed.log`、`targeted-fixed.json`；已包含在完整桌面套件内 |
| 完整底层/集成套件 | 47 PASS / 0 FAIL / 1 SKIP | `core.log`；跳过的是 Windows 专用不可用盘符测试 |
| 完整源码桌面套件 | 29 / 29 PASS，无跳过和重试通过 | `full-final.log`、`full-final.json` |
| 路径输入保护后的完整源码桌面套件 | 30 / 30 PASS，无跳过和重试通过 | `full-navigation-fixed.log`、`full-navigation-fixed.json` |

开发过程中的失败也予以保留：两个凭证单测最初没有提供保存 API 要求的完整主机字段；一个延迟读取测试最初假设 Electron 测试求值环境有全局 `require`，改用公开的 `process.getBuiltinModule` 与 `createRequire` 后通过。完整桌面首轮为 28 PASS / 1 FAIL，原因是确认按钮加载图标改变了其可访问名称；修正定位后仍断言该按钮禁用、请求次数为一次，完整复测 29 / 29。对应 `credentials-unit.log`、`targeted.log`、`full-e2e.log` 及失败 trace 保留，没有删除功能断言。

## 发布验证范围

七项可移植界面专项（包含后续路径输入保护）和凭证单测已加入三平台 CI；真实 PTY/SFTP 写入仍在 Linux 套件中执行。源码 Linux 测试沿用项目原有的显式 `--no-sandbox`，不视为程序包默认沙箱证据。

最终 v0.2.6 的 CI 提交、三平台结果、实际 Linux 发布包验证与八个安装包的 SHA-256 记在 [Release](https://github.com/Kangede/quayterm/releases/tag/v0.2.6)。旧包结果不升级到新包，Windows/macOS 基础 CI 不替代全部原生安装/签名/公证、密码重启、输入法、系统睡眠等验收。历史限制继续保留。

## 首轮 CI 发现的目录输入竞态

[首轮 CI 43825956784](https://github.com/Kangede/quayterm/actions/runs/43825956784) 的 Linux 任务通过；Windows、macOS 中新增六项功能专项均通过，但原有桌面 smoke 在本地目录跳转后找不到测试配置文件。失败截图显示 Windows 仍停留在主目录，macOS 的输入路径也被干扰，错误地解析到主目录下；未将该轮记为全通过。

原实现会在目录请求返回时无条件替换路径输入框。通过延迟初始列表响应，在 Linux 确定性复现了用户已输入目标目录却被旧路径覆盖（`path-race-before.log`、`path-race-before.json`），而不是仅增加测试等待。

修复记录路径输入的编辑版本：请求期间用户开始编辑后，旧响应不再回写输入；用户按 Enter 导航后仍正常显示规范化路径。新增用例验证晚到列表仍可显示，但输入草稿保持，之后 Enter 能打开正确目录。完整复测 30 / 30 通过；首轮 CI 日志和两个平台诊断包保存在 `first-ci-logs.zip`、`first-ci-windows/`、`first-ci-macos/`，失败证据保留。
