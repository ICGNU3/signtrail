"use client";

import { useEffect, useState } from "react";

export function SignTrailFrame() {
  const [src, setSrc] = useState("/signtrail.html");

  useEffect(() => {
    setSrc(`/signtrail.html${window.location.search}${window.location.hash}`);
  }, []);

  return (
    <main className="site-shell">
      <iframe
        className="signtrail-frame"
        src={src}
        title="SignTrail document signing workspace"
        allow="clipboard-read; clipboard-write"
      />
    </main>
  );
}
