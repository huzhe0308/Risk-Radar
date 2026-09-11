import type { Project, View } from "./types";
import { analyzePlan } from "./plan-insights";

export type WorkspaceMode =
  | "overview"
  | "timeline"
  | "cea"
  | "feishu-table"
  | "change-feed"
  | "safety-plan"
  | "safety-components";

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
    description: "功能安全计划面板（iframe 嵌入），包含 upstream 上游活动和 components 组件管理两个子页签。",
  },
  "safety-components": {
    label: "Components",
    description: "功能安全组件管理面板（iframe 嵌入），展示安全相关组件的分配和状态。",
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
