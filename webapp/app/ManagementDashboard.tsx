"use client";

import { useMemo, useState } from "react";
import type { View } from "./types";
import { analyzePlan } from "./plan-insights";
import type { PlanInsight, UpcomingMilestone } from "./plan-insights";

type AiResponse = { reply?: string; error?: string };

function severityLabel(insight: PlanInsight): string {
  if (insight.severity === "critical") return "高优先级";
  if (insight.severity === "warning") return "需关注";
  return "提示";
}

function dateLabel(item: UpcomingMilestone): string {
  if (item.daysAway === 0) return "今天";
  if (item.daysAway === 1) return "明天";
  return `${item.daysAway} 天后`;
}

export function ManagementDashboard({
  view,
  onLocate,
}: {
  view: View;
  onLocate: (projectId: string, milestoneId: string) => void;
}) {
  const analysis = useMemo(() => analyzePlan(view), [view]);
  const [aiSummary, setAiSummary] = useState("");
  const [aiError, setAiError] = useState("");
  const [loading, setLoading] = useState(false);

  const generateAiSummary = async () => {
    setLoading(true);
    setAiError("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "management_analysis",
          message: `请生成当前计划的管理摘要。规则扫描结果：${analysis.localSummary}`,
          view,
          history: [],
        }),
      });
      const payload = await response.json() as AiResponse;
      if (!response.ok) throw new Error(payload.error || "AI 管理摘要生成失败");
      setAiSummary(payload.reply || analysis.localSummary);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 管理摘要生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="management-dashboard" aria-label="管理驾驶舱">
      <div className="dashboard-kpis">
        <article className="dashboard-kpi accent">
          <span>计划健康度</span>
          <strong>{analysis.healthScore}<small>/100</small></strong>
          <em>{analysis.criticalCount ? `${analysis.criticalCount} 项高优先级问题` : "关键规则检查通过"}</em>
        </article>
        <article className="dashboard-kpi">
          <span>项目与里程碑</span>
          <strong>{analysis.projectCount}<small> 个项目</small></strong>
          <em>共 {analysis.milestoneCount} 个里程碑</em>
        </article>
        <article className="dashboard-kpi">
          <span>未来 30 天</span>
          <strong>{analysis.upcoming30Count}<small> 个节点</small></strong>
          <em>90 天内共 {analysis.upcoming90Count} 个</em>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="dashboard-panel dashboard-brief">
          <div className="dashboard-panel-head">
            <div><span className="eyebrow">EXECUTIVE BRIEF</span><h2>管理摘要</h2></div>
            <button className="button button-primary" onClick={() => void generateAiSummary()} disabled={loading}>
              {loading ? "AI 分析中…" : "✦ AI 深度解读"}
            </button>
          </div>
          <p className="dashboard-local-summary">{aiSummary || analysis.localSummary}</p>
          {aiError && <div className="dashboard-ai-error">{aiError}<small>规则扫描结果仍可正常使用。</small></div>}
          <div className="dashboard-priority-row">
            <span className="priority-critical"><b>{analysis.criticalCount}</b> 高优先级</span>
            <span className="priority-warning"><b>{analysis.warningCount}</b> 需关注</span>
          </div>
        </article>

        <article className="dashboard-panel dashboard-risks">
          <div className="dashboard-panel-head">
            <div><span className="eyebrow">PLAN HEALTH CHECK</span><h2>计划体检</h2></div>
            <span className="dashboard-count">{analysis.insights.length} 项</span>
          </div>
          <div className="dashboard-list">
            {analysis.insights.slice(0, 10).map((insight) => (
              <button
                key={insight.id}
                className={`dashboard-insight severity-${insight.severity}`}
                onClick={() => insight.projectId && insight.milestoneId && onLocate(insight.projectId, insight.milestoneId)}
                disabled={!insight.projectId || !insight.milestoneId}
              >
                <i />
                <span><small>{severityLabel(insight)}</small><strong>{insight.title}</strong><em>{insight.description}</em></span>
                {insight.projectId && insight.milestoneId && <b>定位 →</b>}
              </button>
            ))}
            {!analysis.insights.length && <div className="dashboard-empty"><b>✓</b><strong>未发现计划异常</strong><span>依赖顺序、日期范围和节点密度检查均通过。</span></div>}
          </div>
        </article>

        <article className="dashboard-panel dashboard-upcoming">
          <div className="dashboard-panel-head">
            <div><span className="eyebrow">NEXT 90 DAYS</span><h2>近期关键节点</h2></div>
            <span className="dashboard-count">{analysis.upcoming90Count} 个</span>
          </div>
          <div className="dashboard-list">
            {analysis.upcoming.filter((item) => item.daysAway <= 90).slice(0, 10).map((item) => (
              <button key={`${item.projectId}_${item.milestoneId}`} className="dashboard-milestone" onClick={() => onLocate(item.projectId, item.milestoneId)}>
                <time dateTime={item.date}><b>{item.date.slice(5, 7)}</b><span>{item.date.slice(8, 10)}</span></time>
                <span><strong>{item.milestoneName}</strong><small>{item.projectName}</small></span>
                <em>{dateLabel(item)}</em>
              </button>
            ))}
            {!analysis.upcoming.some((item) => item.daysAway <= 90) && <div className="dashboard-empty compact"><b>—</b><strong>未来90天暂无里程碑</strong><span>可以切换视图或补充近期计划。</span></div>}
          </div>
        </article>
      </div>
      <p className="dashboard-method-note">健康度基于日期有效性、依赖顺序和计划范围计算。</p>
    </section>
  );
}
