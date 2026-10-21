/**
 * The GM key reaches the GM window in the URL fragment (`/gm#key=…`), which
 * browsers never send to the server or put in Referer headers. It is moved to
 * sessionStorage (this tab only) and wiped from the address bar at once, so it
 * never shows in history, bookmarks, a join URL or a QR (DESIGN §7, D48).
 */
const STORAGE_KEY = 'the-system.gmKey';

export function takeGmKey(location: Location = window.location): string | null {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const fromHash = params.get('key');
  if (fromHash) {
    try {
      sessionStorage.setItem(STORAGE_KEY, fromHash);
    } catch {
      // Storage blocked: the key still works for this page load.
    }
    window.history.replaceState(null, '', location.pathname + location.search);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetGmKey(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
