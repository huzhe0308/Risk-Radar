# Time Plan Viewer V4.0

Time Plan Viewer V4.0 is the modular web-project upgrade of the original
`Time Plan Viewer V3.40.html`. The original HTML and Excel baseline remain in
the parent folder and are not modified.

## Local start (Windows)

Double-click `start-local.cmd`, then open the Local URL printed in the window.

For command-line development:

```powershell
npm install
npm run dev
```

Node.js 22.13 or newer is required. The start script automatically prefers the
Node.js runtime bundled with Codex when it is available.

## Production check

```powershell
npm run build
npm run start
```

## AI 计划助手（阿里云百炼）

1. 打开 `config/ai.yaml`，把百炼 API Key 填入 `bailian.api_key`。
2. 如使用业务空间专属域名或海外地域，同时修改 `base_url`；模型名称可在 `model` 中调整。
3. 重启应用，点击右下角的 **AI** 按钮开始对话。

示例：`把 PEP 项目的 SOP 里程碑改到 2027-09-10`、`把 IPD3.0 推迟两周`、`从 IPD5.0 到 SOP 添加一条绿色虚线箭头`、`把连接 IPD5.0 和 SOP 的箭头改为红色`、`在 PEP 行右侧添加“风险评审”文本`、`添加一个标注 Concept 阶段的虚线框`。

AI 生成的更改会先显示预览，点击“应用更改”后才写入当前视图。API Key 只由服务端读取；`config/ai.yaml` 已加入忽略列表，请勿把真实密钥提交或分享。部署环境也可以用 `DASHSCOPE_API_KEY` 环境变量覆盖 YAML 中的 Key。

## 飞书表格导入（用户 OAuth）

1. 在 `.env.local` 中填写 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。可选填写 `FEISHU_SESSION_SECRET`；不填写时会使用 App Secret 派生 Cookie 加密密钥。
2. 启动应用，点击“从飞书读取”，复制界面显示的“飞书重定向 URL”，将它加入飞书开放平台应用的“安全设置 → 重定向 URL”。本地端口变化时需同步更新。
3. 在飞书应用“权限管理”中开通用户身份权限：`sheets:spreadsheet:readonly`、`wiki:wiki:readonly`、`offline_access`。如果安全设置中显示“刷新 user_access_token”开关，也需要开启。
4. 发布新版本，并确保登录用户位于应用可用范围内。
5. 回到本应用点击“登录飞书”，授权后即可粘贴本人有权查看的电子表格或 Wiki 表格链接。

访问令牌与刷新令牌只保存在经过 AES-GCM 加密的 HttpOnly Cookie 中，不会写入浏览器本地存储，也不会暴露给页面脚本。

## Implemented in V4.0

- React + TypeScript project structure with a local development server.
- Compatible import for the V3.40 `Config` and `Data` Excel worksheets.
- Compatible Excel export, including long Config JSON overflow rows.
- Timeline and table views, search, tag filtering, and sorting.
- View, project, and milestone creation/editing.
- Local automatic recovery through browser storage.
- Date-range controls, today marker, data integrity checks, and responsive UI.
- Excel, print/PDF, PNG, and standalone HTML exports.

## Main folders

- `app/` — product UI, data model, and Excel compatibility layer.
- `public/vendor/` — locally bundled SheetJS engine inherited from V3.40.
- `public/sample-plan.xlsx` — read-only sample used for first launch.
