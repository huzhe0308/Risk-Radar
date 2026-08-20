import { createContext, useContext } from "react";
import type { PlanChangePreviewItem } from "../change-preview";
import type { AppData } from "../types";

export type ExcelAnalysisContextValue = {
  baselineData: AppData;
  onApplyChanges: (data: AppData, changes: PlanChangePreviewItem[], sourceFile: string) => void;
  onClose: () => void;
};

export const ExcelAnalysisContext = createContext<ExcelAnalysisContextValue | null>(null);

export function useExcelAnalysisContext(): ExcelAnalysisContextValue | null {
  return useContext(ExcelAnalysisContext);
}
