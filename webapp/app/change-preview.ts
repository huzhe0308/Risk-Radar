import type { AppData } from "./types";

export const CHANGE_PREVIEW_KEY = "time-plan-viewer-v4-change-preview";

export type PlanChangePreviewItem = {
  kind: string;
  entityType: string;
  view?: string;
  project?: string;
  item: string;
};

export type PlanChangePreview = {
  data: AppData;
  changes: PlanChangePreviewItem[];
  sourceFile: string;
  createdAt: number;
};

export function savePlanChangePreview(preview: Omit<PlanChangePreview, "createdAt">): void {
  window.sessionStorage.setItem(CHANGE_PREVIEW_KEY, JSON.stringify({ ...preview, createdAt: Date.now() }));
}

export function loadPlanChangePreview(): PlanChangePreview | null {
  const serialized = window.sessionStorage.getItem(CHANGE_PREVIEW_KEY);
  if (!serialized) return null;
  try {
    const preview = JSON.parse(serialized) as PlanChangePreview;
    if (!preview?.data?.views?.length || !Array.isArray(preview.changes)) return null;
    return preview;
  } catch {
    return null;
  }
}
