"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { applyAiActions } from "./ai-actions";
import { callAi } from "./ai-client";
import type { AiAction } from "./ai-actions";
import type { Project, View } from "./types";
import { buildWorkspaceContext, type WorkspaceMode } from "./workspace-context";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AiAction[];
  summaries?: string[];
  warnings?: string[];
  applied?: boolean;
};

function id() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeSafetyPlanData(data: Record<string, unknown>, mode: string): string {
  const lines: string[] = [];
  lines.push("【Safety Plan 面板实际数据】");

  const deliverables = data.deliverables as Array<{ phase: string; isoPart: string; items: Array<{ id: string; activity: string; deliverable: string; owner: string; level: string }> }> | undefined;
  if (deliverables && Array.isArray(deliverables)) {
    let totalItems = 0;
    deliverables.forEach(ph => { totalItems += (ph.items?.length || 0); });
    lines.push(`- 安全交付物阶段数：${deliverables.length}，总交付物数：${totalItems}`);
    deliverables.forEach(ph => {
      lines.push(`  • ${ph.phase} (${ph.isoPart}) — ${ph.items?.length || 0} 项`);
    });
  }

  const cm = data.componentManagement as { components?: unknown[]; vehicles?: unknown[]; domains?: unknown[]; suppliers?: unknown[] } | undefined;
  if (cm) {
    lines.push(`- 组件管理：${cm.components?.length || 0} 个组件，${cm.vehicles?.length || 0} 个车型，${cm.domains?.length || 0} 个域，${cm.suppliers?.length || 0} 个供应商`);
  }

  const upstream = data.upstreamPlan as { views?: Record<string, { projects?: unknown[] }> } | undefined;
  if (upstream?.views) {
    const viewNames = Object.keys(upstream.views);
    lines.push(`- 上游计划视图：${viewNames.join("、")}`);
    viewNames.forEach(vn => {
      const projects = upstream.views![vn]?.projects;
      if (Array.isArray(projects)) lines.push(`  • ${vn}：${projects.length} 个项目`);
    });
  }

  const sp = data.safetyPlanPerProject as Record<string, { statuses?: Record<string, string>; remarks?: Record<string, string> }> | undefined;
  if (sp && Object.keys(sp).length > 0) {
    const projects = Object.keys(sp);
    lines.push(`- Safety Plan per Project 已编辑数据：${projects.length} 个项目`);
    projects.slice(0, 10).forEach(p => {
      const statuses = sp[p]?.statuses || {};
      const statusValues = Object.values(statuses);
      const done = statusValues.filter(s => s === "done").length;
      const progress = statusValues.filter(s => s === "progress").length;
      const planned = statusValues.filter(s => s === "planned").length;
      lines.push(`  • ${p.substring(0, 50)}：${done} Done, ${progress} In Progress, ${planned} Planned`);
    });
  }

  const csp = data.compSafetyPlan as Record<string, { statuses?: Record<string, string> }> | undefined;
  if (csp && Object.keys(csp).length > 0) {
    const keys = Object.keys(csp);
    lines.push(`- Component Safety Plan 已编辑数据：${keys.length} 个项目×组件组合`);
  }

  const tpl = data.componentSafetyTemplate as { isoGroups?: Record<string, unknown[]> } | undefined;
  if (tpl?.isoGroups) {
    const parts = Object.keys(tpl.isoGroups);
    let totalWp = 0;
    parts.forEach(p => { totalWp += (tpl.isoGroups![p]?.length || 0); });
    lines.push(`- 组件安全模板：${parts.length} 个 ISO 部分，${totalWp} 个工作产品`);
  }

  if (mode === "safety-components" && cm?.components) {
    const comps = cm.components as Array<{ abbreviation?: string; fullName?: string; domain?: string; asil?: string; supplier?: string }>;
    lines.push(`- 组件列表（前 20 个）：`);
    comps.slice(0, 20).forEach(c => {
      lines.push(`  • ${c.abbreviation || ""} — ${c.fullName || ""} [Domain: ${c.domain || ""}, ASIL: ${c.asil || "—"}]`);
    });
  }

  return lines.join("\n");
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
  overview: "管理概览",
  timeline: "时间线",
  cea: "CEA 版本",
  "feishu-table": "飞书表格",
  "change-feed": "变更提醒",
  "safety-plan": "Safety Plan",
  "safety-components": "Components",
};

const MODE_WELCOME: Record<WorkspaceMode, string> = {
  overview:
    "当前界面：管理概览\n这是管理驾驶舱，我可以帮你解读：\n\n• 计划健康度评分和体检结果\n• 近期 30/90 天关键节点\n• 高优先级问题和依赖顺序异常\n• 节点集中度预警\n\n点击下方快捷问题，或直接问我。",
  timeline:
    "当前界面：时间线\n这是项目计划画板，我可以帮你：\n\n• 查看当前有哪些项目和里程碑\n• 修改里程碑日期、推迟/提前\n• 添加箭头连接、虚线框、文本标注\n• 了解连接关系和画布元素\n\n点击下方快捷问题，或直接说你的需求。",
  cea:
    "当前界面：CEA 版本\n里程碑按版本号自动分组（IPD / CEA / 量产 / 发布），我可以帮你：\n\n• 查看各版本分组的里程碑分布\n• 了解某个版本包含哪些里程碑\n• 按组别统计和解读\n\n点击下方快捷问题开始。",
  "feishu-table":
    "当前界面：飞书表格\n这里展示飞书多维表格通过 Webhook 推送的原始记录。我可以帮你：\n\n• 查看有多少条同步记录\n• 了解各分表的数据量\n• 说明飞书数据同步的状态\n\n注意：此界面为只读数据浏览，修改计划请切换到时间线。",
  "change-feed":
    "当前界面：变更提醒\n这里实时监控飞书多维表格的数据变更。我可以帮你：\n\n• 查看最近有哪些数据变更\n• 了解未读的变更提醒\n• 说明字段级差异对比\n\n注意：此界面为变更监控，修改计划请切换到时间线。",
  "safety-plan":
    "当前界面：Safety Plan\n这是功能安全计划面板，包含四个子页签：\n\n1. Project Plan — 项目计划时间线甘特图，展示平台里程碑和各车型（Hut）的 SOP 分组里程碑节点\n2. Safety Plan — 按项目展示安全交付物（Deliverables）的 Status/Remark，支持自动保存。包含 General 和 Per-Component (4B/4C/5S) 两个视图\n3. System & Subsystem — 按系统分组展示 System-Level Safety Activities（Phase 4A），每个系统有独立的 Status/Remark\n4. Component Safety Plan — 按组件展示 ISO 26262 工作产品（Work Products），支持批量修改 Status\n\n此面板由 iframe 嵌入，我无法读取其内部数据。如果你需要修改项目计划，请切换到时间线界面。",
  "safety-components":
    "当前界面：Components\n这是功能安全组件管理面板，包含：组件矩阵（Component Matrix）、Per-Vehicle Detail（按车型筛选组件适用性）、ECU 变体（ECU Variants）等视图。此面板由 iframe 嵌入，我无法读取其内部数据。\n\n如果你需要修改项目计划，请切换到时间线界面。",
};

const MODE_SUGGESTIONS: Record<WorkspaceMode, string[]> = {
  overview: ["当前健康度怎么样？", "近期有哪些关键节点？", "有哪些高优先级问题？"],
  timeline: ["当前有哪些项目？", "列出所有里程碑", "有多少条连接箭头？"],
  cea: ["按版本分组说明里程碑", "IPD 迭代有哪些？", "量产节点有哪些？"],
  "feishu-table": ["飞书表格里有什么数据？", "有多少条同步记录？"],
  "change-feed": ["最近有什么变更？", "有哪些未读变更？"],
  "safety-plan": ["四个子页面分别是什么？", "如何修改安全计划 Status？", "Per-Component 视图是什么？"],
  "safety-components": ["组件管理有哪些视图？", "Per-Vehicle Detail 是什么？"],
};

export function AiChatPanel({
  view,
  onApplyView,
  workspaceMode = "timeline",
  visibleProjects,
  searchQuery = "",
  tagFilter = "全部标签",
  sortMode = "manual",
}: {
  view: View;
  onApplyView: (view: View) => void;
  workspaceMode?: WorkspaceMode;
  visibleProjects?: Project[];
  searchQuery?: string;
  tagFilter?: string;
  sortMode?: "manual" | "date" | "name";
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: MODE_WELCOME[workspaceMode] || MODE_WELCOME.timeline },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const modeLabel = MODE_LABELS[workspaceMode] || workspaceMode;
  const suggestions = useMemo(() => MODE_SUGGESTIONS[workspaceMode] || [], [workspaceMode]);

  useEffect(() => {
    setMessages([
      { id: "welcome", role: "assistant", content: MODE_WELCOME[workspaceMode] || MODE_WELCOME.timeline },
    ]);
  }, [workspaceMode]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, sending]);

  const send = async (overrideContent?: string) => {
    const content = (overrideContent ?? input).trim();
    if (!content || sending) return;
    const userMessage: ChatMessage = { id: id(), role: "user", content };
    const history = messages.filter((item) => item.id !== "welcome").map(({ role, content: text }) => ({ role, content: text }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSending(true);
    try {
      let wsContext = buildWorkspaceContext({
        mode: workspaceMode,
        view,
        visibleProjects: visibleProjects || view.projects,
        searchQuery,
        tagFilter,
        sortMode,
      });

      if (workspaceMode === "safety-plan" || workspaceMode === "safety-components") {
        try {
          const resp = await fetch(`/api/safety-plan?token=123456`);
          if (resp.ok) {
            const payload = await resp.json();
            const spData = payload.data;
            if (spData) {
              const summary = summarizeSafetyPlanData(spData, workspaceMode);
              if (summary) wsContext += "\n\n" + summary;
            }
          }
        } catch { /* ignore fetch errors */ }
      }

      const payload = await callAi({ message: content, view, history, workspaceContext: wsContext });
      setMessages((current) => [...current, {
        id: id(),
        role: "assistant",
        content: payload.reply,
        actions: payload.actions as AiAction[] | undefined,
        summaries: payload.summaries,
        warnings: payload.warnings,
      }]);
    } catch (error) {
      setMessages((current) => [...current, { id: id(), role: "assistant", content: error instanceof Error ? error.message : "AI 请求失败，请重试。" }]);
    } finally {
      setSending(false);
    }
  };

  const apply = (messageId: string, actions: AiAction[]) => {
    const outcome = applyAiActions(view, actions);
    if (outcome.applied) onApplyView(outcome.view);
    setMessages((current) => current.map((message) => message.id === messageId ? {
      ...message,
      applied: true,
      content: `${message.content}${outcome.applied ? `\n\n已应用 ${outcome.applied} 项更改，视图已刷新。` : "\n\n没有可应用的更改。"}`,
      warnings: [...(message.warnings || []), ...outcome.skipped],
    } : message));
  };

  return (
    <>
      <button className={`ai-fab ${open ? "is-open" : ""}`} onClick={() => setOpen((value) => !value)} aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"} aria-expanded={open}>
        <span>AI</span>{open ? "×" : "✦"}
      </button>
      {open && <aside className="ai-panel" aria-label="AI 助手">
        <div className="ai-panel-head">
          <div>
            <span className="eyebrow">AI ASSISTANT</span>
            <strong>AI 助手</strong>
            <small>当前界面：{modeLabel} · {view.name}</small>
          </div>
          <button onClick={() => setOpen(false)} aria-label="关闭 AI 助手">×</button>
        </div>
        <div className="ai-messages" aria-live="polite">
          {messages.map((message) => <div key={message.id} className={`ai-message ${message.role}`}>
            <span className="ai-message-role">{message.role === "assistant" ? "AI" : "你"}</span>
            <p>{message.content}</p>
            {!!message.summaries?.length && <div className="ai-change-preview">
              <strong>待确认更改</strong>
              <ul>{message.summaries.map((summary, index) => <li key={`${summary}_${index}`}>{summary}</li>)}</ul>
              <button disabled={message.applied} onClick={() => apply(message.id, message.actions || [])}>{message.applied ? "已应用" : `应用 ${message.actions?.length || 0} 项更改`}</button>
            </div>}
            {!!message.warnings?.length && <ul className="ai-warnings">{message.warnings.map((warning, index) => <li key={`${warning}_${index}`}>{warning}</li>)}</ul>}
          </div>)}
          {sending && <div className="ai-message assistant is-thinking"><span className="ai-message-role">AI</span><p>正在分析「{modeLabel}」界面<span>…</span></p></div>}
          <div ref={bottomRef} />
        </div>
        {messages.length <= 1 && suggestions.length > 0 && (
          <div className="ai-suggestions">
            {suggestions.map((q) => (
              <button key={q} className="ai-suggestion-chip" onClick={() => void send(q)} disabled={sending}>{q}</button>
            ))}
          </div>
        )}
        <div className="ai-composer">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
          }} rows={3} maxLength={4000} placeholder="问「当前有哪些项目」或「从 IPD5.0 到 SOP 添加绿色虚线箭头」" disabled={sending} />
          <div><small>Enter 发送 · Shift+Enter 换行</small><button onClick={() => void send()} disabled={sending || !input.trim()}>发送</button></div>
        </div>
      </aside>}
    </>
  );
}
