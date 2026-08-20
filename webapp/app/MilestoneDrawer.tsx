"use client";

import { useEffect, useState } from "react";
import type { Milestone, Project } from "./types";

function normalizeColor(value: string): string {
  if (value.startsWith("#")) return value;
  if (value === "red") return "#c0392b";
  if (value === "orange") return "#fa8c16";
  if (value === "green") return "#52c41a";
  if (value === "blue") return "#008c82";
  return "#0f766e";
}

export function MilestoneDrawer({
  project,
  milestone,
  onClose,
  onSave,
  onDelete,
}: {
  project: Project;
  milestone: Milestone;
  onClose: () => void;
  onSave: (patch: Partial<Milestone>) => void;
  onDelete: () => void;
}) {
  const [iteration, setIteration] = useState(milestone.iteration);
  const [releaseDate, setReleaseDate] = useState(milestone.releaseDate);
  const [remark, setRemark] = useState(milestone.remark);
  const [detailRemark, setDetailRemark] = useState(milestone.detailRemark);
  const [color, setColor] = useState(milestone.color);
  const [shape, setShape] = useState(milestone.shape);
  const [textColor, setTextColor] = useState(milestone.textColor);
  const [week, setWeek] = useState(milestone.week != null ? String(milestone.week) : "");
  const [year, setYear] = useState(milestone.year != null ? String(milestone.year) : "");

  useEffect(() => {
    setIteration(milestone.iteration);
    setReleaseDate(milestone.releaseDate);
    setRemark(milestone.remark);
    setDetailRemark(milestone.detailRemark);
    setColor(milestone.color);
    setShape(milestone.shape);
    setTextColor(milestone.textColor);
    setWeek(milestone.week != null ? String(milestone.week) : "");
    setYear(milestone.year != null ? String(milestone.year) : "");
  }, [milestone]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const save = () => {
    const patch: Partial<Milestone> = {
      iteration: iteration.trim() || "未命名里程碑",
      releaseDate: releaseDate.trim(),
      remark: remark.trim(),
      detailRemark,
      color,
      shape,
      textColor,
    };
    if (week.trim() && year.trim()) {
      const w = Number(week);
      const y = Number(year);
      if (!isNaN(w) && !isNaN(y)) {
        patch.week = w;
        patch.year = y;
      }
    }
    return onSave(patch);
  };

  const colorOptions = [
    { value: "red", swatch: "#c0392b" },
    { value: "orange", swatch: "#fa8c16" },
    { value: "green", swatch: "#52c41a" },
    { value: "blue", swatch: "#008c82" },
  ];

  const shapeOptions = [
    "triangle",
    "triangle-hollow",
    "diamond",
    "diamond-hollow",
    "diamond-dashed",
    "cross",
  ];

  const textOptions = ["#1a1a1a", "#ffffff", "#c0392b", "#f5c842"];

  return (
    <div className="milestone-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="milestone-editor" role="dialog" aria-modal="true" aria-labelledby="milestone-editor-title">
      <div className="drawer-head">
        <div>
          <span className="eyebrow">MILESTONE DETAIL</span>
          <h2 id="milestone-editor-title">修改里程碑</h2>
          <p className="drawer-context">{project.name}</p>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="关闭里程碑编辑">×</button>
      </div>
      <div className="drawer-scroll">
        <label className="form-field">
          <span>名称</span>
          <input autoFocus value={iteration} onChange={(event) => setIteration(event.target.value)} />
        </label>
        <div className="drawer-row">
          <label className="form-field">
            <span>日期</span>
            <input type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} />
          </label>
          <label className="form-field">
            <span>备注</span>
            <input value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="如 SOP释放" />
          </label>
        </div>
        <div className="drawer-row">
          <label className="form-field">
            <span>定位周</span>
            <input type="number" min="1" max="53" value={week} onChange={(event) => setWeek(event.target.value)} placeholder="如 13" />
          </label>
          <label className="form-field">
            <span>定位年</span>
            <input type="number" min="2000" max="2099" value={year} onChange={(event) => setYear(event.target.value)} placeholder="如 26 表示2026" />
          </label>
        </div>
        <label className="form-field">
          <span>详细备注</span>
          <textarea value={detailRemark} onChange={(event) => setDetailRemark(event.target.value)} rows={3} placeholder="可填写里程碑的详细描述…" />
        </label>

        <div className="drawer-section">
          <div className="section-title"><span>颜色</span></div>
          <div className="choice-row">
            {colorOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`choice-chip ${color === option.value ? "active" : ""}`}
                onClick={() => setColor(option.value)}
              >
                <span className="choice-swatch" style={{ background: option.swatch }} />
              </button>
            ))}
          </div>
          <label className="form-field">
            <span>自定义颜色</span>
            <input type="color" value={normalizeColor(color)} onChange={(event) => setColor(event.target.value)} />
          </label>
        </div>

        <div className="drawer-section">
          <div className="section-title"><span>形状</span></div>
          <div className="choice-row shape-row-wide">
            {shapeOptions.map((item) => (
              <button
                key={item}
                type="button"
                className={`choice-chip shape-chip ${shape === item ? "active" : ""}`}
                onClick={() => setShape(item)}
              >
                <span className={`grid-marker-shape shape-${item}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <div className="section-title"><span>文字颜色</span></div>
          <div className="choice-row">
            {textOptions.map((item) => (
              <button
                key={item}
                type="button"
                className={`choice-chip text-chip ${textColor === item ? "active" : ""}`}
                style={{ color: item, borderColor: item === "#ffffff" ? "#dbe3ee" : "transparent" }}
                onClick={() => setTextColor(item)}
              >
                文
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="drawer-actions">
        <button className="danger-button" onClick={onDelete}>删除里程碑</button>
        <div>
          <button className="button button-quiet" onClick={onClose}>取消</button>
          <button className="button button-primary" onClick={() => { save(); onClose(); }}>保存修改</button>
        </div>
      </div>
      </section>
    </div>
  );
}
