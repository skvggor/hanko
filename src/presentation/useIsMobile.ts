import { useEffect, useState } from "react";

const MOBILE_QUERY = "(hover: none) and (pointer: coarse)";

function readMatchMedia(): MediaQueryList | null {
  const window = globalThis.window as (Window & typeof globalThis) | undefined;
  if (window === undefined || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(MOBILE_QUERY);
}

function isMobile(): boolean {
  return readMatchMedia()?.matches ?? false;
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobile);

  useEffect(() => {
    const query = readMatchMedia();
    if (query === null) return undefined;

    const sync = (): void => setMobile(query.matches);

    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return mobile;
}
