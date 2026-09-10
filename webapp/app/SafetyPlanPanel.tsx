"use client";

import { useEffect, useRef, useState } from "react";

export function SafetyPlanPanel() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(true);
  }, []);

  return (
    <div className="safety-plan-wrapper">
      {!loaded && <div className="safety-plan-loading">Loading Safety Plan Dashboard…</div>}
      <iframe
        ref={iframeRef}
        src="/safety-plan/index.html"
        title="CEA 2.X Safety Plan Dashboard"
        className="safety-plan-iframe"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
