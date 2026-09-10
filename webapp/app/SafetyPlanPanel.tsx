"use client";

import { useEffect, useRef, useState } from "react";

export function SafetyPlanPanel({ initialTab }: { initialTab?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded && initialTab && iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        { type: "switch-tab", tab: initialTab },
        "*"
      );
    }
  }, [loaded, initialTab]);

  return (
    <div className="safety-plan-wrapper">
      {!loaded && <div className="safety-plan-loading">Loading Safety Plan Dashboard…</div>}
      <iframe
        ref={iframeRef}
        src={initialTab ? `/safety-plan/index.html#${initialTab}` : "/safety-plan/index.html"}
        title="CEA 2.X Safety Plan Dashboard"
        className="safety-plan-iframe"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
