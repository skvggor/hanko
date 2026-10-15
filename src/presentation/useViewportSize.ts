import { useEffect, useState } from "react";

interface ViewportSize {
  width: number;
  height: number;
}

function readViewport(): ViewportSize {
  return {
    width: globalThis.window?.innerWidth ?? 0,
    height: globalThis.window?.innerHeight ?? 0,
  };
}

export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState(readViewport);

  useEffect(() => {
    const sync = (): void => setSize(readViewport());

    globalThis.window?.addEventListener("resize", sync);
    return () => globalThis.window?.removeEventListener("resize", sync);
  }, []);

  return size;
}
