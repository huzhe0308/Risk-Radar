"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { savePlanChangePreview } from "../change-preview";
import { parseWorkbook, loadBaselineAppData, buildWorkbook } from "../data";
import type { AppData } from "../types";
import { useExcelAnalysisContext } from "./context";
import { compareExcelWorkbooks, extractWorkbookForAi, type ChangeKind, type ComparisonResult, type ExcelChange } from "./excel-diff";

const STORAGE_KEY = "time-plan-viewer-v4";

function prepareChangePreviewData(baseline: AppData): AppData {
  return JSON.parse(JSON.stringify(baseline)) as AppData;
}

type WorkbookState = {
  name: string;
  size: number;
  workbook: any;
  sheetNames: string[];
};

type BaselineState = {
  data: AppData | null;
  workbook: any | null;
  source: "localStorage";
  loading: boolean;
  error: string;
};

type FilterKind = "all" | ChangeKind;

const kindLabels: Record<ChangeKind, string> = {
  added: "新增",
  removed: "删除",
  modified: "修改",
  delayed: "延期",
  advanced: "提前",
};

function fileSize(size: number): string {
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function ExcelFileCard({ label, hint, file, loading, onChoose, onClear }: {
  label: string;
  hint: string;
  file: WorkbookState | null;
  loading: boolean;
  onChoose: () => void;
  onClear: () => void;
}) {
  return (
    <article className={`excel-diff-file-card ${file ? "loaded" : ""}`}>
      <div className="excel-diff-file-icon">01</div>
      <div className="excel-diff-file-copy">
        <span>{label}</span>
        {file ? (
          <>
            <strong title={file.name}>{file.name}</strong>
            <small>{fileSize(file.size)} · {file.sheetNames.length} 个工作表</small>
          </>
        ) : (
          <>
            <strong>{hint}</strong>
            <small>支持 .xlsx 和 .xls</small>
          </>
        )}
      </div>
      <div className="excel-diff-file-actions">
        <button className="button button-primary" onClick={onChoose} disabled={loading}>{loading ? "读取中…" : file ? "更换" : "选择文件"}</button>
        {file && <button className="excel-diff-clear" onClick={onClear} title="移除文件">×</button>}
      </div>
    </article>
  );
}

function BaselineCard({ baseline, loading }: { baseline: BaselineState; loading: boolean }) {
  if (!baseline.data) {
    return (
      <article className={`excel-diff-file-card excel-baseline-card ${baseline.error ? "fallback" : "loading"}`}>
        <div className="excel-diff-file-icon">●</div>
        <div className="excel-diff-file-copy">
          <span>当前基线 · Current Plan</span>
          <strong>{loading ? "正在加载时间计划数据…" : "未找到当前时间计划数据"}</strong>
          <small>{baseline.error || "基线取自时间计划主页面的当前状态"}</small>
        </div>
      </article>
    );
  }
  const data = baseline.data;
  const activeView = data.views.find((view) => view.id === data.activeViewId);
  const totalProjects = data.views.reduce((sum, view) => sum + view.projects.length, 0);
  return (
    <article className="excel-diff-file-card excel-baseline-card primary">
      <div className="excel-diff-file-icon">●</div>
      <div className="excel-diff-file-copy">
        <span>当前基线 · Current Plan</span>
        <strong title={data.title}>{data.title || "未命名计划"}</strong>
        <small>来源：时间计划当前状态 · {data.views.length} 个视图 · {totalProjects} 个项目 · 激活视图：{activeView?.name || "—"}</small>
      </div>
      <div className="excel-diff-file-actions"><span className="excel-baseline-tag">已同步</span></div>
    </article>
  );
}

function ChangeRow({ change }: { change: ExcelChange }) {
  const location = [change.view, change.address ? `${change.sheet}!${change.address}` : ""].filter(Boolean).join(" / ");
  return (
    <tr>
      <td><span className={`excel-change-badge ${change.kind}`}>{kindLabels[change.kind]}</span></td>
      <td><strong>{change.project || "未识别项目"}</strong></td>
      <td><strong>{change.item}</strong>{location && <small>{location}</small>}{change.reason && <small className="excel-change-reason" title={change.reason}>AI：{change.reason}</small>}</td>
      <td>{change.field}</td>
      <td className="excel-change-value old" title={change.oldValue}>{change.oldValue || "—"}</td>
      <td className="excel-change-value new" title={change.newValue}>{change.newValue || "—"}</td>
      <td>{change.daysDelta != null ? <strong className={change.daysDelta > 0 ? "delay-value" : "advance-value"}>{change.daysDelta > 0 ? `+${change.daysDelta}` : change.daysDelta} 天</strong> : <span className={`risk-dot ${change.severity}`}>{change.severity === "high" ? "高" : change.severity === "medium" ? "中" : "低"}</span>}</td>
    </tr>
  );
}

export default function ExcelAnalysisPage() {
  const embeddedContext = useExcelAnalysisContext();
  const baselineData = embeddedContext?.baselineData;
  const onApplyChanges = embeddedContext?.onApplyChanges;
  const onClose = embeddedContext?.onClose;
  const newInputRef = useRef<HTMLInputElement>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [newFileLoading, setNewFileLoading] = useState(false);
  const [newFile, setNewFile] = useState<WorkbookState | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [updatedPlan, setUpdatedPlan] = useState<AppData | null>(null);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [query, setQuery] = useState("");
  const [baseline, setBaseline] = useState<BaselineState>({ data: null, workbook: null, source: "localStorage", loading: true, error: "" });

  useEffect(() => {
    let alive = true;
    const bootstrap = async () => {
      for (let attempt = 0; attempt < 50 && !window.XLSX; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      if (!alive) return;
      setEngineReady(Boolean(window.XLSX));
      if (!window.XLSX) return;
      try {
        const { data, source } = baselineData ? { data: baselineData, source: "localStorage" as const } : loadBaselineAppData(STORAGE_KEY);
        const workbook = buildWorkbook(data);
        if (alive) setBaseline({ data, workbook, source, loading: false, error: "" });
      } catch (error) {
        if (alive) setBaseline({ data: null, workbook: null, source: "localStorage", loading: false, error: error instanceof Error ? error.message : "基线加载失败" });
      }
    };
    void bootstrap();
    const onStorage = (event: StorageEvent) => {
      if (baselineData) return;
      if (event.key !== STORAGE_KEY) return;
      if (!window.XLSX) return;
      setBaseline((prev) => ({ ...prev, loading: true }));
      try {
        const { data, source } = loadBaselineAppData(STORAGE_KEY);
        const workbook = buildWorkbook(data);
        setBaseline({ data, workbook, source, loading: false, error: "" });
      } catch (error) {
        setBaseline({ data: null, workbook: null, source: "localStorage", loading: false, error: error instanceof Error ? error.message : "基线加载失败" });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => { alive = false; window.removeEventListener("storage", onStorage); };
  }, [baselineData]);

  const importNewFile = async (file: File) => {
    if (!/\.xlsx?$/i.test(file.name)) {
      window.alert("请选择 .xlsx 或 .xls 格式的 Excel 文件。");
      return;
    }
    if (!window.XLSX) return;
    setNewFileLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: true, cellFormula: true });
      const state = { name: file.name, size: file.size, workbook, sheetNames: workbook.SheetNames };
      setNewFile(state);
      try {
        setUpdatedPlan(parseWorkbook(workbook));
      } catch {
        setUpdatedPlan(null);
      }
      if (baseline?.workbook) {
        const immediateResult = compareExcelWorkbooks(baseline.workbook, workbook, window.XLSX);
        setResult(immediateResult);
        setFilter("all");
        setQuery("");
      } else {
        setResult(null);
      }
    } catch (error) {
      window.alert(`Excel 加载失败：${error instanceof Error ? error.message : "文件无法读取"}`);
    } finally {
      setNewFileLoading(false);
      if (newInputRef.current) newInputRef.current.value = "";
    }
  };

  const runComparison = async () => {
    if (!baseline?.workbook || !newFile || !window.XLSX) return;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const before = extractWorkbookForAi(baseline.workbook, window.XLSX, "当前时间计划.xlsx");
      const after = extractWorkbookForAi(newFile.workbook, window.XLSX, newFile.name);
      const response = await fetch("/api/excel-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ before, after }),
      });
      const payload = await response.json() as ComparisonResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "AI 对比分析失败");
      setResult(payload);
      setFilter("all");
      setQuery("");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "AI 对比分析失败，请重试。");
    } finally {
      setAnalyzing(false);
    }
  };

  const isHiddenChange = (change: ExcelChange) => {
    if (change.entityType !== "milestone") return true;
    if (!["delayed", "advanced", "added", "removed"].includes(change.kind)) return true;
    return false;
  };

  const filteredChanges = useMemo(() => {
    if (!result) return [];
    const needle = query.trim().toLowerCase();
    return result.changes.filter((change) => {
      if (isHiddenChange(change)) return false;
      if (filter !== "all" && change.kind !== filter) return false;
      if (!needle) return true;
      return [change.summary, change.item, change.project, change.view, change.field, change.oldValue, change.newValue].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [filter, query, result]);

  const visibleStats = useMemo(() => {
    if (!result) return null;
    const visible = result.changes.filter((change) => !isHiddenChange(change));
    const affectedProjects = new Set(visible.map((change) => change.project).filter(Boolean));
    const affectedViews = new Set(visible.map((change) => change.view).filter(Boolean));
    return {
      total: visible.length,
      added: visible.filter((change) => change.kind === "added").length,
      removed: visible.filter((change) => change.kind === "removed").length,
      modified: visible.filter((change) => change.kind === "modified").length,
      delayed: visible.filter((change) => change.kind === "delayed").length,
      advanced: visible.filter((change) => change.kind === "advanced").length,
      highRisk: visible.filter((change) => change.severity === "high").length,
      affectedProjects: affectedProjects.size,
      affectedViews: affectedViews.size,
    };
  }, [result]);

  useEffect(() => {
    if (baseline?.workbook && newFile && engineReady) void runComparison();
    // A newly selected file should show its visual comparison without another click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline?.workbook, newFile, engineReady]);

  const clearNewFile = () => {
    setNewFile(null);
    setUpdatedPlan(null);
    setResult(null);
    setAnalysisError("");
  };

  const openChangePreview = () => {
    if (!updatedPlan || !result || !baseline.data || !newFile) return;
    if (result.mode !== "time-plan") {
      window.alert("新版 Excel 不是可识别的 Time Plan 格式，无法在原时间计划视图中显示。");
      return;
    }
    try {
      const previewData = prepareChangePreviewData(baseline.data);
      const changes = result.changes.filter((change) => !isHiddenChange(change)).map((change) => ({
        kind: change.kind,
        entityType: change.entityType,
        view: change.view,
        project: change.project,
        item: change.item,
      }));
      if (onApplyChanges) {
        onApplyChanges(previewData, changes, newFile.name);
        onClose?.();
        return;
      }
      savePlanChangePreview({ data: previewData, sourceFile: newFile.name, changes });
      window.location.assign("/?changePreview=1");
    } catch {
      window.alert("无法创建变更预览，请释放浏览器存储空间后重试。");
    }
  };

  return (
    <main className={`excel-diff-shell ${onClose ? "embedded" : ""}`}>
      <header className="excel-viewer-topbar">
        {onClose ? <div className="excel-viewer-brand"><span className="brand-mark"><span className="radar-dot" /><span className="radar-ring ring-outer" /><span className="radar-ring ring-inner" /><span className="radar-sweep" /></span><strong>Excel 变更分析</strong></div> : <Link className="excel-viewer-brand" href="/"><span className="brand-mark"><span className="radar-dot" /><span className="radar-ring ring-outer" /><span className="radar-ring ring-inner" /><span className="radar-sweep" /></span><strong>Fusa Risk Radar</strong></Link>}
        <div className="excel-viewer-actions"><span className="excel-diff-engine">{engineReady ? "Excel 本地提取 · AI 云端判断" : "正在准备 Excel 引擎…"}</span>{onClose ? <button className="button button-quiet" onClick={onClose}>关闭</button> : <Link className="button button-quiet" href="/">返回时间计划</Link>}</div>
        <input ref={newInputRef} type="file" accept=".xlsx,.xls" hidden onChange={(event) => event.target.files?.[0] && void importNewFile(event.target.files[0])} />
      </header>

      <div className="excel-diff-content">
        <section className="excel-diff-hero">
          <div><span className="eyebrow">AI EXCEL CHANGE INTELLIGENCE</span><h1>让 AI 判断两个计划版本之间发生了什么</h1><p>浏览器先提取项目、里程碑与工作表结构，再调用已配置的大模型 API 完成对象匹配、变更判断、风险分级和管理分析。</p></div>
          <div className="excel-diff-steps"><span className={newFile ? "done" : "active"}>1 上传新版 Excel</span><i /><span className={result ? "done" : newFile ? "active" : ""}>2 AI 分析</span><i /><span className={result ? "done" : ""}>3 查看结果</span></div>
        </section>

        <section className="excel-diff-upload-grid">
          <BaselineCard baseline={baseline} loading={!engineReady || baseline.loading} />
          <div className="excel-diff-arrow">→</div>
          <ExcelFileCard label="更新版本 · After" hint="选择发生变化的 Excel 版本" file={newFile} loading={newFileLoading} onChoose={() => newInputRef.current?.click()} onClear={clearNewFile} />
        </section>

        {baseline.error && <div className="excel-diff-error"><strong>无法读取当前计划基线</strong><span>{baseline.error}</span><Link href="/">返回时间计划</Link></div>}

        <div className="excel-diff-runbar">
          <div>{analyzing ? <><strong>AI 正在分析两个版本</strong><span>正在匹配项目与里程碑、判断变化并生成管理摘要…</span></> : baseline.error ? <><strong>当前计划基线不可用</strong><span>请先返回时间计划页面，确认当前视图内容后再进入 Excel 分析</span></> : newFile ? <><strong>准备就绪</strong><span>将以“时间计划当前状态 → 更新版”方向把结构化数据提交给 AI 判断</span></> : <><strong>请上传新版 Excel</strong><span>Excel 在浏览器内解析；提取后的结构化内容会发送给已配置的 AI API</span></>}</div>
          <button className="button button-primary excel-diff-run" disabled={!engineReady || !baseline?.workbook || !newFile || analyzing} onClick={() => void runComparison()}>{analyzing ? "AI 分析中…" : "调用 AI 对比分析"}</button>
        </div>

        {analysisError && <div className="excel-diff-error"><strong>AI 分析未完成</strong><span>{analysisError}</span><button onClick={() => void runComparison()} disabled={analyzing}>重新分析</button></div>}

        {result && visibleStats && (
          <section className="excel-diff-results">
            <div className="excel-diff-result-head"><div><span className="eyebrow">AI COMPARISON RESULT</span><h2>AI 变更分析结果</h2><p>{result.mode === "time-plan" ? "AI 已按 Time Plan 业务对象完成判断" : "AI 已按通用工作表内容完成判断"}{result.truncated ? " · 模型结果已达到返回上限" : ""}</p></div><span className={`excel-diff-status ${visibleStats.highRisk ? "warning" : "ok"}`}>{visibleStats.highRisk ? `${visibleStats.highRisk} 项需重点关注` : "AI 未识别到高风险变化"}</span></div>

            <div className="excel-diff-kpis">
              <article><span>全部变更</span><strong>{visibleStats.total}</strong><small>{visibleStats.affectedProjects} 个项目 · {visibleStats.affectedViews} 个视图</small></article>
              <article className="delay"><span>延期</span><strong>{visibleStats.delayed}</strong><small>计划日期向后移动</small></article>
              <article className="advance"><span>提前</span><strong>{visibleStats.advanced}</strong><small>计划日期向前移动</small></article>
              <article className="add"><span>新增</span><strong>{visibleStats.added}</strong><small>新增结构或内容</small></article>
              <article className="remove"><span>删除</span><strong>{visibleStats.removed}</strong><small>从新版本移除</small></article>
              <article><span>其他修改</span><strong>{visibleStats.modified}</strong><small>字段、样式或关系调整</small></article>
            </div>

            <div className="excel-diff-ai-analysis"><span>AI</span><div><strong>大模型总体判断</strong><p>{result.analysis || "AI 已完成分析，详细变化如下。"}</p></div></div>
            <div className="excel-diff-insights"><div><span>!</span><strong>AI 结论与建议</strong></div><ul>{result.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul></div>

            <div className="excel-diff-table-panel">
              <div className="excel-diff-table-tools">
                <div className="excel-diff-filters">{(["all", "delayed", "advanced", "added", "removed", "modified"] as FilterKind[]).map((kind) => <button key={kind} className={filter === kind ? "active" : ""} onClick={() => setFilter(kind)}>{kind === "all" ? "全部" : kindLabels[kind]}</button>)}</div>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、里程碑或变更内容" />
              </div>
              <div className="excel-diff-table-scroll">
                <table className="excel-diff-table"><thead><tr><th>类型</th><th>项目</th><th>变更项</th><th>字段</th><th>基线值</th><th>更新值</th><th>影响</th></tr></thead><tbody>{filteredChanges.map((change) => <ChangeRow key={change.id} change={change} />)}</tbody></table>
                {!filteredChanges.length && <div className="excel-diff-no-result">当前筛选条件下没有变更。</div>}
              </div>
            </div>

            <section className="excel-updated-timeline">
              <div className="excel-updated-timeline-head">
                <div><span className="eyebrow">CHANGE PREVIEW IN ORIGINAL PLAN</span><h2>在原时间计划视图中查看变更</h2><p>保持当前时间计划的日期、箭头、布局和样式完全不变，只在发生变化的项目和里程碑上叠加橙色标记；编辑、筛选、缩放和导出等原有功能全部保留。</p></div>
                <div className="excel-plan-controls">
                  <button className="button button-primary" onClick={openChangePreview} disabled={!updatedPlan || result.mode !== "time-plan"}>{onApplyChanges ? "在当前时间计划中显示变更" : "打开完整时间计划视图"}</button>
                </div>
              </div>
              {!updatedPlan && <div className="excel-updated-timeline-empty">新版 Excel 未识别到可展示的 Time Plan 视图。</div>}
            </section>
          </section>
        )}
      </div>
    </main>
  );
}
