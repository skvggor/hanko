export const MOBILE_BREAKPOINT = 768;

export function isMobileViewport(width: number): boolean {
  return width <= MOBILE_BREAKPOINT;
}

export function prefersReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function prefersCoarsePointer(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(pointer: coarse)").matches;
}