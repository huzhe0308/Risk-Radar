"use client";

import { useEffect, useRef, useState } from "react";
import { applyAiActions } from "./ai-actions";
import type { AiAction, AiCommandResult } from "./ai-actions";
import type { View } from "./types";

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

export function AiChatPanel({ view, onApplyView }: { view: View; onApplyView: (view: View) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: "我可以调整里程碑、箭头和画布元素。例如：从 IPD5.0 连一条绿色虚线箭头到 SOP；在 PEP 行右侧添加“风险评审”文本；或添加一个标注 Concept 阶段的虚线框。" },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, sending]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    const userMessage: ChatMessage = { id: id(), role: "user", content };
    const history = messages.filter((item) => item.id !== "welcome").map(({ role, content: text }) => ({ role, content: text }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSending(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, view, history }),
      });
      const payload = await response.json() as AiCommandResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "AI 请求失败");
      setMessages((current) => [...current, {
        id: id(),
        role: "assistant",
        content: payload.reply,
        actions: payload.actions,
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
      {open && <aside className="ai-panel" aria-label="AI 计划助手">
        <div className="ai-panel-head">
          <div><span className="eyebrow">BAILIAN ASSISTANT</span><strong>AI 计划助手</strong><small>当前视图：{view.name}</small></div>
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
          {sending && <div className="ai-message assistant is-thinking"><span className="ai-message-role">AI</span><p>正在分析当前视图<span>…</span></p></div>}
          <div ref={bottomRef} />
        </div>
        <div className="ai-composer">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
          }} rows={3} maxLength={4000} placeholder="例如：从 IPD5.0 到 SOP 添加一条绿色虚线箭头" disabled={sending} />
          <div><small>Enter 发送 · Shift+Enter 换行</small><button onClick={() => void send()} disabled={sending || !input.trim()}>发送</button></div>
        </div>
      </aside>}
    </>
  );
}
