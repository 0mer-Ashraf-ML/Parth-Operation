"use client";

import { useEffect, useState } from "react";

/** True when viewport width is at or below breakpoint (default 768px). */
export function useNarrowScreen(maxWidthPx = 768) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [maxWidthPx]);
  return narrow;
}
