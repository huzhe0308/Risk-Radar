"use client";

import type { ExcelAnalysisContextValue } from "./excel-analysis/context";
import { ExcelAnalysisContext } from "./excel-analysis/context";
import ExcelAnalysisPage from "./excel-analysis/page";

export function ExcelAnalysisEmbedded(props: ExcelAnalysisContextValue) {
  return (
    <ExcelAnalysisContext.Provider value={props}>
      <ExcelAnalysisPage />
    </ExcelAnalysisContext.Provider>
  );
}
