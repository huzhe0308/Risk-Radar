import type { Milestone, Project, View } from "./types";

export type InsightSeverity = "critical" | "warning" | "info";

export type PlanInsight = {
  id: string;
  severity: InsightSeverity;
  category: "dependency" | "range" | "date" | "schedule" | "density";
  title: string;
  description: string;
  projectId?: string;
  milestoneId?: string;
  date?: string;
};

export type UpcomingMilestone = {
  projectId: string;
  projectName: string;
  milestoneId: string;
  milestoneName: string;
  date: string;
  daysAway: number;
};

export type PlanAnalysis = {
  projectCount: number;
  milestoneCount: number;
  upcoming30Count: number;
  upcoming90Count: number;
  healthScore: number;
  criticalCount: number;
  warningCount: number;
  insights: PlanInsight[];
  upcoming: UpcomingMilestone[];
  localSummary: string;
};

const DAY = 86_400_000;

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function dayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function findMilestone(project: Project | undefined, milestoneId: string): Milestone | undefined {
  return project?.milestones.find((milestone) => milestone.id === milestoneId);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((dayStart(to).valueOf() - dayStart(from).valueOf()) / DAY);
}

export function analyzePlan(view: View, now = new Date()): PlanAnalysis {
  const today = dayStart(now);
  const start = parseDate(view.startDate);
  const end = parseDate(view.endDate);
  const insights: PlanInsight[] = [];
  const upcoming: UpcomingMilestone[] = [];
  let milestoneCount = 0;
  let upcoming30Count = 0;
  let upcoming90Count = 0;

  for (const project of view.projects) {
    for (const milestone of project.milestones) {
      milestoneCount += 1;
      const date = parseDate(milestone.releaseDate);
      if (!date) {
        insights.push({
          id: `date_${project.uuid}_${milestone.id}`,
          severity: "critical",
          category: "date",
          title: "里程碑日期无效",
          description: `${project.name} / ${milestone.iteration} 缺少可识别的计划日期。`,
          projectId: project.uuid,
          milestoneId: milestone.id,
        });
        continue;
      }

      const daysAway = daysBetween(today, date);
      if (daysAway >= 0) {
        if (daysAway <= 30) upcoming30Count += 1;
        if (daysAway <= 90) upcoming90Count += 1;
        upcoming.push({
          projectId: project.uuid,
          projectName: project.name,
          milestoneId: milestone.id,
          milestoneName: milestone.iteration,
          date: milestone.releaseDate,
          daysAway,
        });
      }

      if ((start && date < start) || (end && date > end)) {
        insights.push({
          id: `range_${project.uuid}_${milestone.id}`,
          severity: "warning",
          category: "range",
          title: "里程碑超出计划视图范围",
          description: `${project.name} / ${milestone.iteration}（${milestone.releaseDate}）不在 ${view.startDate} 至 ${view.endDate} 内。`,
          projectId: project.uuid,
          milestoneId: milestone.id,
          date: milestone.releaseDate,
        });
      }
    }
  }

  for (const connection of view.connections) {
    const fromProject = view.projects.find((project) => project.name === connection.fromProject);
    const toProject = view.projects.find((project) => project.name === connection.toProject);
    const fromMilestone = findMilestone(fromProject, connection.fromMsId);
    const toMilestone = findMilestone(toProject, connection.toMsId);
    const fromDate = fromMilestone ? parseDate(fromMilestone.releaseDate) : null;
    const toDate = toMilestone ? parseDate(toMilestone.releaseDate) : null;
    if (fromProject && toProject && fromMilestone && toMilestone && fromDate && toDate && toDate < fromDate) {
      insights.push({
        id: `dependency_order_${connection.id}`,
        severity: "critical",
        category: "dependency",
        title: "后置节点早于前置节点",
        description: `${toProject.name} / ${toMilestone.iteration} 比前置节点 ${fromProject.name} / ${fromMilestone.iteration} 早 ${Math.abs(daysBetween(fromDate, toDate))} 天。`,
        projectId: toProject.uuid,
        milestoneId: toMilestone.id,
        date: toMilestone.releaseDate,
      });
    }
  }

  const datedMilestones = view.projects.flatMap((project) => project.milestones.flatMap((milestone) => {
    const date = parseDate(milestone.releaseDate);
    return date ? [{ project, milestone, date }] : [];
  })).sort((a, b) => a.date.valueOf() - b.date.valueOf());

  for (let index = 0; index < datedMilestones.length; index += 1) {
    const windowEnd = datedMilestones[index].date.valueOf() + 14 * DAY;
    const cluster = datedMilestones.slice(index).filter((item) => item.date.valueOf() <= windowEnd);
    if (cluster.length >= 5) {
      const first = cluster[0];
      const last = cluster[cluster.length - 1];
      insights.push({
        id: `density_${first.milestone.id}`,
        severity: "warning",
        category: "density",
        title: "短周期内里程碑较集中",
        description: `${first.milestone.releaseDate} 至 ${last.milestone.releaseDate} 的14天窗口内安排了 ${cluster.length} 个里程碑，建议检查资源与评审容量。`,
        projectId: first.project.uuid,
        milestoneId: first.milestone.id,
        date: first.milestone.releaseDate,
      });
      break;
    }
  }

  upcoming.sort((a, b) => a.daysAway - b.daysAway);
  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (a.date || "9999").localeCompare(b.date || "9999"));
  const criticalCount = insights.filter((insight) => insight.severity === "critical").length;
  const warningCount = insights.filter((insight) => insight.severity === "warning").length;
  const healthScore = Math.max(0, Math.min(100, 100 - criticalCount * 18 - warningCount * 7));
  const localSummary = criticalCount || warningCount
    ? `当前视图包含 ${view.projects.length} 个项目、${milestoneCount} 个里程碑。规则扫描发现 ${criticalCount} 项高优先级问题和 ${warningCount} 项提醒；未来30天有 ${upcoming30Count} 个节点，建议优先处理依赖与日期范围问题。`
    : `当前视图包含 ${view.projects.length} 个项目、${milestoneCount} 个里程碑，未发现依赖顺序或日期范围异常；未来30天有 ${upcoming30Count} 个节点。`;

  return {
    projectCount: view.projects.length,
    milestoneCount,
    upcoming30Count,
    upcoming90Count,
    healthScore,
    criticalCount,
    warningCount,
    insights,
    upcoming,
    localSummary,
  };
}
