"use client";

import { useEffect, useRef, useState } from "react";

export function SafetyPlanPanel({ initialTab }: { initialTab?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  const src = initialTab
    ? `/safety-plan/index.html?tab=${initialTab}`
    : "/safety-plan/index.html";

  return (
    <div className="safety-plan-wrapper">
      {!loaded && <div className="safety-plan-loading">Loading…</div>}
      <iframe
        ref={iframeRef}
        src={src}
        title="Safety Plan Dashboard"
        className="safety-plan-iframe"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
