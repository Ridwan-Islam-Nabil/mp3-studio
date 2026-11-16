import type { StorageLike } from "../session";

/** localStorage, or null where accessing it throws (sandboxed iframes, blocked site data). */
export function getStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
