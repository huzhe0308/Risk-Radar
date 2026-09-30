import type { Project, View } from "./types";
import { analyzePlan } from "./plan-insights";

export type WorkspaceMode =
  | "overview"
  | "timeline"
  | "cea"
  | "feishu-table"
  | "change-feed"
  | "safety-plan"
  | "safety-components"
  | "cea2-info";

export type WorkspaceState = {
  mode: WorkspaceMode;
  view: View;
  visibleProjects: Project[];
  searchQuery: string;
  tagFilter: string;
  sortMode: "manual" | "date" | "name";
};

const MODE_INFO: Record<WorkspaceMode, { label: string; description: string }> = {
  overview: {
    label: "管理概览",
    description: "管理驾驶舱，展示计划健康度评分、近期关键节点、计划体检结果（依赖顺序异常、日期范围异常、节点集中度等），并提供 AI 深度解读。",
  },
  timeline: {
    label: "时间线",
    description: "以周为横轴的项目计划画板，支持里程碑展示（菱形/三角/旗帜等形状）、项目间箭头连接、虚线框和自由文本标注，可拖拽编辑。",
  },
  cea: {
    label: "CEA 版本",
    description: "按软件版本号（IPD 迭代、CEA 平台、量产节点、发布节点）自动分组并重新排列里程碑，支持按组折叠展开。",
  },
  "feishu-table": {
    label: "飞书表格",
    description: "展示飞书多维表格通过 webhook 推送的原始记录数据，以表格形式浏览，支持按字段搜索和分表查看。",
  },
  "change-feed": {
    label: "变更提醒",
    description: "实时监控飞书多维表格的数据变更，展示每条变更的字段级差异对比（旧值→新值），已读/未读状态管理。",
  },
  "safety-plan": {
    label: "Safety Plan",
    description: "功能安全计划面板，包含四个子页签：1. Project Plan（项目计划时间线甘特图，展示平台里程碑和各车型 SOP 分组）2. Safety Plan（按项目展示安全交付物 Status/Remark，含 General 和 Per-Component 4B/4C/5S 视图）3. System & Subsystem（按系统分组展示 System-Level Safety Activities Phase 4A）4. Component Safety Plan（按组件展示 ISO 26262 Work Products，支持批量修改 Status）。此面板数据存储在 Neon 数据库，修改后自动保存。",
  },
  "safety-components": {
    label: "Equipment Matrix",
    description: "功能安全组件矩阵，展示 125 个安全组件 × 17 个车型的适用性矩阵，支持按 CEA 版本/域/供应商筛选，可点击单元格标记/取消标记标准 (S)，含供应商视图和组件详情视图，数据存储在云端并自动保存。",
  },
  "cea2-info": {
    label: "CEA Safety Plan",
    description: "CEA 功能安全计划面板，包含三个子页签：1. HUT 清单（车型明细、产品组、Impact Analysis 分类、SOP 分组、PEP 对比、Change Level 定义、Reference Car 逻辑、RACI 矩阵）2. 交付物（Tailoring Matrix 裁剪矩阵、General Phase 1-8、Component Dev 4A、Supplier 5S 四个子视图，支持 Status/Tailoring/日期/链接/备注编辑）3. 时间线（PEP CEA 里程碑 + CEA 开发关键里程碑 + 安全活动甘特图）。数据存储在云端 app_state 表并自动保存。",
  },
};

const SORT_LABELS: Record<string, string> = {
  manual: "默认（手动排序）",
  date: "按首个里程碑日期",
  name: "按项目名称",
};

function formatMilestoneList(project: Project): string {
  if (!project.milestones.length) return "  （暂无里程碑）\n";
  return project.milestones
    .map((ms) => {
      let line = `  • ${ms.iteration} — ${ms.releaseDate}`;
      if (ms.remark) line += ` [${ms.remark}]`;
      if (ms.detailRemark) line += ` — ${ms.detailRemark}`;
      if (ms.shape && ms.shape !== "diamond") line += ` <${ms.shape}>`;
      return line;
    })
    .join("\n");
}

function formatConnections(view: View): string {
  if (!view.connections.length) return "";
  const lines = view.connections.map((conn) => {
    const fromProject = view.projects.find((p) => p.name === conn.fromProject);
    const toProject = view.projects.find((p) => p.name === conn.toProject);
    const fromMs = fromProject?.milestones.find((m) => m.id === conn.fromMsId);
    const toMs = toProject?.milestones.find((m) => m.id === conn.toMsId);
    const lineTypeLabel = conn.lineType.includes("dash") ? "虚线" : "实线";
    return `  ${conn.fromProject}/${fromMs?.iteration || "?"} → ${conn.toProject}/${toMs?.iteration || "?"}（${lineTypeLabel}，${conn.color}）`;
  });
  return lines.join("\n");
}

function formatPlanItems(view: View): string {
  const items = view.planItems || [];
  if (!items.length) return "";
  const frames = items.filter((item) => item.kind === "frame");
  const texts = items.filter((item) => item.kind === "text");
  const lines: string[] = [];
  if (frames.length) {
    lines.push(`  虚线框（${frames.length} 个）：`);
    for (const f of frames) {
      const boundTexts = texts.filter((t) => t.parentFrameId === f.id);
      lines.push(`    □ ${f.text || "（无标题）"} — 位置(${f.x}, ${f.y}) 尺寸(${f.width}×${f.height})${boundTexts.length ? ` 绑定${boundTexts.length}个文本` : ""}`);
    }
  }
  if (texts.length) {
    const unbound = texts.filter((t) => !t.parentFrameId);
    if (unbound.length) {
      lines.push(`  独立文本（${unbound.length} 个）：`);
      for (const t of unbound) {
        lines.push(`    ◇ ${t.text.replace(/\n/g, " ").slice(0, 60)} — 位置(${t.x}, ${t.y})`);
      }
    }
  }
  return lines.join("\n");
}

function formatInsights(view: View): string {
  const analysis = analyzePlan(view);
  const lines: string[] = [];
  lines.push(`- 健康度评分：${analysis.healthScore}/100`);
  lines.push(`- 高优先级问题：${analysis.criticalCount} 项`);
  lines.push(`- 需关注问题：${analysis.warningCount} 项`);
  lines.push(`- 未来 30 天节点：${analysis.upcoming30Count} 个`);
  lines.push(`- 未来 90 天节点：${analysis.upcoming90Count} 个`);
  if (analysis.insights.length) {
    lines.push(`- 体检详情（前 5 项）：`);
    for (const insight of analysis.insights.slice(0, 5)) {
      const icon = insight.severity === "critical" ? "[!]" : insight.severity === "warning" ? "[~]" : "[i]";
      lines.push(`  ${icon} ${insight.title}：${insight.description}`);
    }
  }
  if (analysis.upcoming.length) {
    lines.push(`- 近期节点（前 5 个）：`);
    for (const item of analysis.upcoming.slice(0, 5)) {
      const daysLabel = item.daysAway === 0 ? "今天" : `${item.daysAway} 天后`;
      lines.push(`  ${item.date} ${item.projectName}/${item.milestoneName}（${daysLabel}）`);
    }
  }
  return lines.join("\n");
}

function formatCeaGroups(view: View): string {
  const groups = new Map<string, { count: number; milestones: string[] }>();
  for (const project of view.projects) {
    for (const ms of project.milestones) {
      const key = ms.iteration.trim().replace(/\s+/g, "").toUpperCase();
      let group = "other";
      if (/^IPD/.test(key)) group = "IPD 迭代";
      else if (/^CEA/.test(key)) group = "CEA 平台";
      else if (["SOP", "SP", "PRE-PVF", "UFT"].includes(key) || key.startsWith("PVS")) group = "量产节点";
      else if (["SWRELEASE", "VEHICLERELEASE", "RELEASETEST", "RELEASE"].includes(key)) group = "发布节点";
      const entry = groups.get(group) || { count: 0, milestones: [] };
      entry.count += 1;
      if (!entry.milestones.includes(ms.iteration)) entry.milestones.push(ms.iteration);
      groups.set(group, entry);
    }
  }
  if (!groups.size) return "";
  const lines: string[] = [];
  for (const [groupName, info] of groups) {
    lines.push(`  ${groupName}：${info.count} 个里程碑（${info.milestones.slice(0, 8).join("、")}${info.milestones.length > 8 ? "…" : ""}）`);
  }
  return lines.join("\n");
}

export function buildWorkspaceContext(state: WorkspaceState): string {
  const { mode, view, visibleProjects, searchQuery, tagFilter, sortMode } = state;
  const modeInfo = MODE_INFO[mode] || MODE_INFO.timeline;

  if (mode === "cea2-info" || mode === "safety-plan" || mode === "safety-components") {
    const sections: string[] = [];
    sections.push(
      `【当前工作区】\n` +
        `- 模式：${modeInfo.label}\n` +
        `- 模式说明：${modeInfo.description}\n` +
        `- 视图名称：${view.name}\n` +
        `- 视图日期范围：${view.startDate} 至 ${view.endDate}\n` +
        `- 视图内项目总数：${view.projects.length}\n` +
        `- 显示中里程碑总数：${visibleProjects.reduce((s, p) => s + p.milestones.length, 0)}`,
    );
    if (mode === "safety-plan" || mode === "safety-components") {
      sections.push(`【注意】此面板数据需从云端 API 获取，AI 助手会自动拉取最新数据来回答问题。`);
    }
    if (mode === "cea2-info") {
      sections.push(`【注意】CEA Safety Plan 数据需从云端 API 获取，AI 助手会自动拉取最新数据来回答问题。`);
    }
    return sections.join("\n\n");
  }

  const totalMilestones = visibleProjects.reduce((sum, p) => sum + p.milestones.length, 0);
  const allMilestones = view.projects.reduce((sum, p) => sum + p.milestones.length, 0);
  const isFiltered = !!(searchQuery || (tagFilter && tagFilter !== "全部标签"));

  const sections: string[] = [];

  sections.push(
    `【当前工作区】\n` +
      `- 模式：${modeInfo.label}\n` +
      `- 模式说明：${modeInfo.description}\n` +
      `- 视图名称：${view.name}\n` +
      `- 视图日期范围：${view.startDate} 至 ${view.endDate}\n` +
      `- 视图内项目总数：${view.projects.length}\n` +
      `- 当前显示项目数：${visibleProjects.length}${isFiltered ? "（已筛选）" : ""}\n` +
      `- 显示中里程碑总数：${totalMilestones}\n` +
      (allMilestones !== totalMilestones ? `- 视图内全部里程碑：${allMilestones}\n` : "") +
      (searchQuery ? `- 搜索关键词：${searchQuery}\n` : "") +
      (tagFilter && tagFilter !== "全部标签" ? `- 标签筛选：${tagFilter}\n` : "") +
      `- 排序方式：${SORT_LABELS[sortMode] || sortMode}\n` +
      `- 连接箭头数：${view.connections.length}\n` +
      `- 画布元素数：${(view.planItems || []).length}（虚线框 ${(view.planItems || []).filter((i) => i.kind === "frame").length} + 文本 ${(view.planItems || []).filter((i) => i.kind === "text").length}）`,
  );

  if (visibleProjects.length > 0) {
    const projectLines = visibleProjects
      .map((project, index) => {
        let header = `${index + 1}. ${project.name}`;
        if (project.tag) header += ` [${project.tag}]`;
        if (project.detailRemark) header += ` — ${project.detailRemark}`;
        return header + "\n" + formatMilestoneList(project);
      })
      .join("\n");
    sections.push(`【项目与里程碑详情】\n${projectLines}`);
  }

  if (view.connections.length > 0) {
    sections.push(`【连接箭头】\n${formatConnections(view)}`);
  }

  if (view.planItems && view.planItems.length > 0) {
    sections.push(`【画布元素】\n${formatPlanItems(view)}`);
  }

  if (mode === "overview") {
    sections.push(`【计划洞察】\n${formatInsights(view)}`);
  }

  if (mode === "cea") {
    const ceaInfo = formatCeaGroups(view);
    if (ceaInfo) {
      sections.push(`【CEA 版本分组】\n${ceaInfo}`);
    }
  }

  return sections.join("\n\n");
}

export function buildCea2Context(ceaVersion: string, cloudData: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`【CEA ${ceaVersion} Safety Plan 数据】`);

  const sp = cloudData.safetyPlanPerProject as Record<string, { statuses?: Record<string, string>; tailoring?: Record<string, string>; remarks?: Record<string, string>; plannedDates?: Record<string, string>; actualDates?: Record<string, string> }> | undefined;
  const versionKey = `cea${ceaVersion}_`;
  if (sp) {
    const versionEntries = Object.entries(sp).filter(([k]) => k.startsWith(versionKey));
    lines.push(`- 已编辑交付物数据：${versionEntries.length} 个车型`);

    for (const [key, entry] of versionEntries.slice(0, 10)) {
      const vehicleCode = key.slice(versionKey.length);
      const statuses = entry.statuses || {};
      const statusValues = Object.values(statuses);
      const done = statusValues.filter((s) => s === "done").length;
      const progress = statusValues.filter((s) => s === "progress").length;
      const planned = statusValues.filter((s) => s === "planned").length;
      const na = statusValues.filter((s) => s === "na").length;
      const notStarted = statusValues.filter((s) => !s).length;
      const tailoring = entry.tailoring || {};
      const tailoringValues = Object.values(tailoring);
      const applicable = tailoringValues.filter((t) => t === "Applicable").length;
      const carryOver = tailoringValues.filter((t) => t === "Carry-over").length;
      const delta = tailoringValues.filter((t) => t === "Delta").length;
      const naTailoring = tailoringValues.filter((t) => t === "N/A").length;

      lines.push(`  • ${vehicleCode}：${done} Done, ${progress} In Progress, ${planned} Planned, ${notStarted} 未开始, ${na} N/A | Tailoring: ${applicable} Applicable, ${carryOver} Carry-over, ${delta} Delta, ${naTailoring} N/A`);
    }
  }

  const customs = cloudData.cea2CustomDeliverables as unknown[] | undefined;
  if (customs && customs.length > 0) {
    lines.push(`- 自定义交付物：${customs.length} 项`);
  }

  const deleted = cloudData.cea2DeletedDeliverables as string[] | undefined;
  if (deleted && deleted.length > 0) {
    lines.push(`- 已删除交付物编号：${deleted.join(", ")}`);
  }

  const cm = cloudData.componentManagement as { components?: unknown[]; vehicles?: unknown[]; domains?: unknown[]; suppliers?: unknown[] } | undefined;
  if (cm) {
    lines.push(`- 组件管理数据：${cm.components?.length || 0} 个组件，${cm.vehicles?.length || 0} 个车型，${cm.domains?.length || 0} 个域，${cm.suppliers?.length || 0} 个供应商`);
    const comps = cm.components as Array<{ abbreviation?: string; fullName?: string; domain?: string; asil?: string; supplier?: string; vehicleApplicability?: Record<string, string> }> | undefined;
    if (comps && ceaVersion) {
      lines.push(`- 组件列表（前 15 个）：`);
      comps.slice(0, 15).forEach((c) => {
        const va = c.vehicleApplicability || {};
        const marked = Object.values(va).filter((v) => v === "S" || v === "s").length;
        lines.push(`  • ${c.abbreviation || ""} — ${c.fullName || ""} [Domain: ${c.domain || ""}, ASIL: ${c.asil || "—"}, Supplier: ${(c.supplier || "").split("\n")[0].trim() || "—"}, 适用 ${marked} 个车型]`);
      });
    }
  }

  const milestones = cloudData.ceaKeyMilestones as Array<{ name: string; week: number; desc?: string; fnLevel?: string; isFreeze?: boolean }> | undefined;
  if (milestones && milestones.length > 0) {
    lines.push(`- CEA 开发关键里程碑：${milestones.length} 个`);
    milestones.slice(0, 8).forEach((m) => {
      lines.push(`  • ${m.name} (SOP${m.week > 0 ? "+" : ""}${m.week}w)${m.fnLevel ? ` [${m.fnLevel}]` : ""}${m.isFreeze ? " 🔒Freeze" : ""}`);
    });
  }

  const pepMilestones = cloudData.pepCeaMilestones as Array<{ name: string; week: number; month: number; desc?: string }> | undefined;
  if (pepMilestones && pepMilestones.length > 0) {
    lines.push(`- PEP CEA 里程碑：${pepMilestones.length} 个`);
    pepMilestones.slice(0, 6).forEach((m) => {
      lines.push(`  • ${m.name} (SOP${m.week > 0 ? "+" : ""}${m.week}w, ~M${m.month}) — ${m.desc || ""}`);
    });
  }

  const productGroups = cloudData.productGroups as Array<{ name: string; platform: string; powertrain: string; leading: string }> | undefined;
  if (productGroups && productGroups.length > 0) {
    lines.push(`- 产品组：${productGroups.map((pg) => pg.name).join(", ")}`);
  }

  const impactAnalysis = cloudData.impactAnalysis as Array<{ pg: string; classification: string; ref: string; refCar: string }> | undefined;
  if (impactAnalysis && impactAnalysis.length > 0) {
    lines.push(`- Impact Analysis：${impactAnalysis.length} 条`);
    impactAnalysis.slice(0, 6).forEach((ia) => {
      lines.push(`  • ${ia.pg}: ${ia.classification} (参考 ${ia.refCar || ia.ref || "—"})`);
    });
  }

  const mapping = cloudData.safetyPepMapping as Array<{ safetyPhase: string; safetyActivity: string; pepMilestone: string; pepWeek: number; startWeek: number; endWeek: number; notes: string }> | undefined;
  if (mapping && mapping.length > 0) {
    lines.push(`- 安全活动映射（PEP → Safety）：${mapping.length} 条`);
    const phases = [...new Set(mapping.map((m) => m.safetyPhase))];
    lines.push(`  安全阶段：${phases.join("、")}`);
  }

  return lines.join("\n");
}
