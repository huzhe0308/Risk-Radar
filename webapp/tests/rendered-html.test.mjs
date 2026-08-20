import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/", init = undefined) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, init ?? { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Time Plan Viewer shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>Fusa Risk Radar<\/title>/i);
  assert.match(html, /\/vendor\/xlsx\.full\.min\.js/);
  assert.match(html, /class="loading-screen"/);
  assert.match(html, /正在载入时间计划/);
});

test("keeps the Excel-backed canvas, management dashboard, and AI assistant wired", async () => {
  const [page, canvas, data, css, aiPanel, aiActions, aiRoute, dashboard, insights] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ProjectPlanCanvas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/AiChatPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ai-actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ManagementDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/plan-insights.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /accept="\.xlsx,\.xls"/);
  assert.match(page, /parseWorkbook/);
  assert.match(page, /<ProjectPlanCanvas/);
  assert.match(page, /data\.views\.map/);
  assert.match(page, /<AiChatPanel/);
  assert.match(page, /<ManagementDashboard/);
  assert.match(page, /管理概览/);
  assert.match(page, /时间线/);
  assert.match(page, /<MilestoneDrawer/);
  assert.match(page, /<ProjectMilestoneDrawer/);
  assert.match(page, /修改里程碑/);
  assert.match(page, /添加里程碑/);
  assert.doesNotMatch(page, /数据概览/);
  assert.doesNotMatch(page, /编辑项目/);
  assert.doesNotMatch(page, /数据检查提醒/);
  assert.doesNotMatch(page, /showValidation/);
  assert.match(page, /columnWidth/);
  assert.match(page, /onMilestoneClick/);

  assert.match(canvas, /className="project-plan-lanes"/);
  assert.match(canvas, /className="project-plan-scroll"/);
  assert.match(canvas, /className="project-plan-years"/);
  assert.match(canvas, /className="project-plan-months"/);
  assert.match(canvas, /strokeDasharray/);
  assert.match(canvas, /highlightedProjectNames/);
  assert.match(canvas, /highlightedMilestoneKeys/);
  assert.match(canvas, /milestone-change-overlay/);
  assert.match(canvas, /M \$\{x1\} \$\{y1\} L \$\{x2\} \$\{y2\}/);
  assert.match(canvas, /function frameWeekRange/);
  assert.match(canvas, /Math\.round\(\(start\.x \+ dx\) \/ weekWidth\)/);
  assert.match(canvas, /startWeek: range\.start\.week/);
  assert.match(canvas, /W\{range\.start\.week\}\/\{range\.start\.year\}<i>→<\/i>W\{range\.end\.week\}\/\{range\.end\.year\}/);
  assert.match(canvas, /item\.kind === "frame" \? 34 : renderedHeight/);
  assert.match(canvas, /candidate\.parentFrameId === item\.id/);
  assert.match(canvas, /textDisplayHeight/);

  assert.match(page, /window\.XLSX\.read/);
  assert.match(data, /xlsx\.utils\.sheet_to_json/);
  assert.match(data, /Connections/);
  assert.match(data, /colWidth/);
  assert.match(data, /parentViewId/);
  assert.match(data, /startWeek: optionalPositiveNumber\(item\.startWeek\)/);
  assert.match(data, /x: Number\.isFinite\(x\) \? Math\.max\(0, x\) : 80/);
  assert.match(data, /function inferTextFrameBindings/);
  assert.match(data, /parentFrameId: candidate\.frame\.id/);
  assert.match(data, /bindingDisabled/);
  assert.match(page, /item\.parentFrameId === itemId/);
  assert.match(page, /所属虚线框/);
  assert.match(data, /mergeTestIntoParent/);
  assert.match(data, /dedupeViewContent/);
  assert.match(data, /hasReferenceTestContent/);
  assert.doesNotMatch(data, /if \(!views\.some\(\(view\) => view\.name\.toLowerCase\(\) === "test"\)\)/);

  assert.match(css, /\.plan-grid-shell/);
  assert.match(css, /\.plan-fixed-column/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /\.plan-connection-layer/);
  assert.match(css, /\.choice-chip/);
  assert.match(css, /\.milestone-editor-backdrop[^}]*z-index:\s*1600/);
  assert.match(css, /\.plan-grid-shell[^}]*isolation:\s*isolate/);
  assert.match(css, /\.ai-panel/);
  assert.match(css, /\.management-dashboard/);
  assert.match(css, /\.dashboard-kpis/);
  assert.match(aiPanel, /\/api\/ai/);
  assert.match(aiPanel, /应用 \$\{message\.actions\?\.length \|\| 0\} 项更改/);
  assert.match(aiActions, /validateAiCommand/);
  assert.match(aiActions, /applyAiActions/);
  assert.match(aiActions, /add_connection/);
  assert.match(aiActions, /update_connection/);
  assert.match(aiActions, /add_plan_item/);
  assert.match(aiActions, /update_plan_item/);
  assert.match(aiRoute, /response_format:\s*\{ type: "json_object" \}/);
  assert.match(aiRoute, /Authorization: `Bearer \$\{config\.api_key\}`/);
  assert.match(aiRoute, /MANAGEMENT_ANALYSIS_PROMPT/);
  assert.match(aiRoute, /management_analysis/);
  assert.match(dashboard, /AI 深度解读/);
  assert.match(dashboard, /健康度基于日期有效性、依赖顺序和计划范围计算/);
  assert.doesNotMatch(dashboard, /待复核/);
  assert.match(insights, /export function analyzePlan/);
  assert.match(insights, /后置节点早于前置节点/);
  assert.doesNotMatch(insights, /依赖关系端点缺失/);
});

test("AI route reads credentials only from YAML or server environment", async () => {
  const route = await readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8");
  assert.match(route, /envKey \|\| yaml\?\.api_key \|\| ""/);
  assert.doesNotMatch(route, /apiKey\s*=.*sk-/i);
  assert.match(route, /connections: view\.connections\.map/);
  assert.match(route, /planItems: \(view\.planItems \|\| \[\]\)\.map/);
});

test("Excel analysis sends structured workbook data to the AI comparison API", async () => {
  const [page, diff, route, mainPage, preview] = await Promise.all([
    readFile(new URL("../app/excel-analysis/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/excel-analysis/excel-diff.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/excel-analysis/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/change-preview.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /当前基线 · Current Plan/);
  assert.match(page, /更新版本 · After/);
  assert.match(page, /extractWorkbookForAi/);
  assert.match(page, /fetch\("\/api\/excel-analysis"/);
  assert.match(page, /调用 AI 对比分析/);
  assert.match(page, /parseWorkbook/);
  assert.match(page, /compareExcelWorkbooks/);
  assert.match(page, /savePlanChangePreview/);
  assert.match(page, /打开完整时间计划视图/);
  assert.match(page, /JSON\.parse\(JSON\.stringify\(baseline\)\)/);
  assert.doesNotMatch(page, /window\.open/);
  assert.doesNotMatch(page, /<ProjectPlanCanvas/);
  assert.match(mainPage, /loadPlanChangePreview/);
  assert.match(mainPage, /<ExcelAnalysisEmbedded/);
  assert.match(mainPage, /baselineData=\{data\}/);
  assert.match(mainPage, /在当前时间计划中显示变更|onApplyChanges/);
  assert.match(mainPage, /setData\(migrateAppData\(parseWorkbook\(workbook\)\)\)/);
  assert.match(mainPage, /highlightedProjectNames={changeHighlights.projects}/);
  assert.match(mainPage, /highlightedMilestoneKeys={changeHighlights.milestones}/);
  assert.match(preview, /CHANGE_PREVIEW_KEY/);
  assert.match(page, /延期/);
  assert.match(page, /提前/);
  assert.match(diff, /mode: "time-plan" \| "generic"/);
  assert.match(diff, /export function extractWorkbookForAi/);
  assert.match(route, /SYSTEM_PROMPT/);
  assert.match(route, /response_format: \{ type: "json_object" \}/);
  assert.match(route, /Authorization: `Bearer \$\{config\.api_key\}`/);
  assert.match(route, /buildResult/);
});

test("Project plan canvas supports a non-editable embedded timeline", async () => {
  const canvas = await readFile(new URL("../app/ProjectPlanCanvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /readOnly = false/);
  assert.match(canvas, /更新版 Excel · 只读时间线预览/);
  assert.match(canvas, /readOnly=\{readOnly\}/);
  assert.match(canvas, /connectionColor/);
});

test("Feishu Wiki sheets can be imported with the signed-in user's permissions", async () => {
  const [page, route, session, start, callback, envExample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feishu/import/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feishu/oauth/session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feishu/oauth/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feishu/oauth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(page, /从飞书读取/);
  assert.match(page, /登录飞书/);
  assert.match(page, /P5Ugw4MOpi8Ew7kiY7Rcjh1xnsf/);
  assert.match(page, /fetch\("\/api\/feishu\/oauth\/status"/);
  assert.match(page, /window\.location\.assign\("\/api\/feishu\/oauth\/start"\)/);
  assert.match(page, /重定向 URL（先加入开放平台/);
  assert.match(page, /fetch\("\/api\/feishu\/oauth\/logout"/);
  assert.match(page, /fetch\("\/api\/feishu\/import"/);
  assert.match(page, /book_append_sheet/);
  assert.match(page, /parseWorkbook\(workbook\)/);
  assert.match(route, /getFeishuUserSession\(request\)/);
  assert.doesNotMatch(route, /tenant_access_token/);
  assert.match(route, /wiki\/v2\/spaces\/get_node/);
  assert.match(route, /values_batch_get/);
  assert.match(route, /node\.obj_type !== "sheet"/);
  assert.doesNotMatch(route, /cli_[A-Za-z0-9]{10,}/);
  assert.match(session, /authen\/v2\/oauth\/token/);
  assert.match(session, /grant_type: "refresh_token"/);
  assert.match(session, /AES-GCM/);
  assert.match(session, /HttpOnly; SameSite=Lax/);
  assert.match(start, /accounts\.feishu\.cn\/open-apis\/authen\/v1\/authorize/);
  assert.match(start, /offline_access/);
  assert.match(start, /code_challenge_method: "S256"/);
  assert.match(callback, /state !== flow\.state/);
  assert.doesNotMatch(page, /access_token|refresh_token/);
  assert.match(envExample, /FEISHU_APP_ID=/);
  assert.match(envExample, /FEISHU_APP_SECRET=/);
  assert.match(envExample, /FEISHU_REDIRECT_URI=/);
  assert.match(envExample, /FEISHU_SESSION_SECRET=/);
});
