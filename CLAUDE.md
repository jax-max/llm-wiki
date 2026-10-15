# 仓库协作要求

## 测试分工

- AI 只负责核心功能的单元测试，例如配置校验、Wiki 文件访问与搜索、关系解析、Agent 查询方法、工具预算和取消逻辑。
- Web、客户端和前端测试由用户执行。AI 应提供测试案例、执行步骤、命令及预期结果，不得自行启动或操作浏览器、客户端，也不得执行这些测试。
- Web/API 集成测试、模型协议端到端测试、前端交互测试、视觉及响应式验收和真实模型冒烟测试，均交给用户执行。
- AI 可以编写和维护上述测试与验收说明，但不得把未执行的项目标记为通过。
- 修改 Web 或客户端后，交付时说明核心单测结果，并列出需要用户执行的验证命令和案例。

`web/` 测试入口：

- `npm test`：核心单元测试，AI 可执行。
- `npm run test:web`：Web/API 与协议集成测试，由用户执行。
- `npm run test:client`：客户端 Markdown 与 React 交互测试，由用户执行。
- `npm run build`、`npm run dev`、`npm start`、`npm run preview:fixture`、`npm run smoke:live` 及浏览器手工验收，由用户执行。

具体案例见 [web/TESTING.md](web/TESTING.md)。
