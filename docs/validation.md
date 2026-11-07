# 本地验证记录

本次开发环境：macOS ARM64，Node.js 24 / 26，.NET 9。没有推送、远程标签或发布操作。

- 上游 `dotnet build` 通过；完整 xUnit 回归 105 项通过，提供 EU4/HOI4 CWTools 规则以启用合成夹具。
- `npm run check`：语法、技能生成、21 项单元与浏览器交互测试通过。
- 两项真实集成测试分别验证通用 JSONL/MCP 与官方 Cordis、Tools、SkillRegistry、MCP 客户端集成；在开发引擎和 self-contained 引擎上均通过。
- 覆盖同连接多会话并发选库、独立查询、释放会话、旧客户端行为、DSH 各聊天隔离、绑定/解绑、owner RPC 准入、无 Connection 服务的宿主、卸载清理。
- 覆盖 EU4/HOI4 合成数据构建、刷新、旧版本保留、失败/取消保留原注册、导入/移除、外部文件删除保护、空行号解析错误及分页。
- `scripts/management-smoke.py` 对两种引擎构建均通过。
- 实际 Chromium 页面检查无脚本错误；桌面及 390px 窄屏无横向溢出。截图在 `artifacts/screenshots/`。
- 本地 npm 包包含完整 macOS ARM64 引擎归档、技能、许可证和说明。`scripts/verify-package.mjs` 从包解压到临时目录，禁止网络获取引擎，验证离线安装、校验、API 探测与空注册表。

本次未实际执行 Windows/Linux 环境，CI 文件已覆盖三种操作系统的本机构建和集成。四项使用 Unix shebang 的模拟进程测试和两项模拟引擎归档测试在 Windows 跳过；Windows 仍执行真实引擎集成测试。其余五种 RID 可由构建脚本生成，本地包只携带本次实际构建的平台。

`npm audit` 对开发锁文件中的官方 DSH `0.2.2-rc.1` 依赖图报告 14 条传递影响记录，实际根源为 MCP HTTP/OAuth 重定向、undici 和 zod 的上游公告。插件使用官方桥接的 stdio 传输；本仓库没有修改宿主提供的 DSH peer 包，也没有使用强制升级覆盖它们。此结果不等于这些依赖已修复；升级宿主/桥接版本后需重新做兼容性验证。原始本地输出保存在 `artifacts/npm-audit.json`。
