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
    "当前界面：Safety Plan\n这是功能安全计划面板，包含上游活动和组件管理两个页签。此面板由 iframe 嵌入，我无法读取其内部数据。\n\n如果你需要修改项目计划，请切换到时间线界面。",
  "safety-components":
    "当前界面：Components\n这是功能安全组件管理面板。此面板由 iframe 嵌入，我无法读取其内部数据。\n\n如果你需要修改项目计划，请切换到时间线界面。",
};

const MODE_SUGGESTIONS: Record<WorkspaceMode, string[]> = {
  overview: ["当前健康度怎么样？", "近期有哪些关键节点？", "有哪些高优先级问题？"],
  timeline: ["当前有哪些项目？", "列出所有里程碑", "有多少条连接箭头？"],
  cea: ["按版本分组说明里程碑", "IPD 迭代有哪些？", "量产节点有哪些？"],
  "feishu-table": ["飞书表格里有什么数据？", "有多少条同步记录？"],
  "change-feed": ["最近有什么变更？", "有哪些未读变更？"],
  "safety-plan": ["Safety Plan 是什么？", "如何修改安全计划？"],
  "safety-components": ["组件管理是什么？", "如何修改组件数据？"],
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
      const wsContext = buildWorkspaceContext({
        mode: workspaceMode,
        view,
        visibleProjects: visibleProjects || view.projects,
        searchQuery,
        tagFilter,
        sortMode,
      });
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
