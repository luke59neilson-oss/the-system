import type { Page } from '@playwright/test';

/** One text element whose contrast is below the bar. */
export interface ContrastFailure {
  where: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
}

/**
 * M8.3 (WCAG 1.4.3): every visible text element on the page against the
 * background it really sits on. The background is composed from the element's
 * ancestors (translucent panels over the page gradient); a gradient layer is
 * judged at every one of its colour stops, so the worst stop counts. Opacity on
 * an ancestor fades the text toward its background. Disabled controls are
 * exempt (WCAG: inactive UI components), as is text hidden from everyone
 * (`visibility: hidden`, zero size, `aria-hidden`).
 *
 * Runs in the page as a string: the e2e tsconfig has no DOM lib.
 */
const SCAN = (min: number, root: string) => `(() => {
  const MIN = ${min};
  const parse = (s) => {
    const m = s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const stops = (img) => (img.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter(Boolean);
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = (c) => {
    const ch = c.slice(0, 3).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hex = (c) => 'rgb(' + c.slice(0, 3).map(Math.round).join(',') + ')';
  // Keep the darkest and the lightest candidate: light text fails on the
  // lightest, dark text on the darkest.
  const extremes = (list) => {
    let lo = list[0], hi = list[0];
    for (const c of list) {
      if (lum(c) < lum(lo)) lo = c;
      if (lum(c) > lum(hi)) hi = c;
    }
    return lo === hi ? [lo] : [lo, hi];
  };
  const backgrounds = (el) => {
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(n);
    let cands = [[0, 0, 0, 1]];
    for (const n of chain) {
      const cs = getComputedStyle(n);
      const g = cs.backgroundImage.includes('gradient') ? stops(cs.backgroundImage) : [];
      if (g.length) {
        const next = [];
        for (const s of g) for (const c of cands) next.push(over(s, c));
        cands = extremes(next);
      }
      const bc = parse(cs.backgroundColor);
      if (bc && bc[3] > 0) cands = cands.map((c) => over(bc, c));
    }
    return cands;
  };
  const describe = (el) => {
    const parts = [];
    for (let n = el; n && parts.length < 4; n = n.parentElement) {
      const id = n.getAttribute('data-testid');
      parts.unshift(n.tagName.toLowerCase() + (id ? '[' + id + ']' : n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).join('.') : ''));
      if (id) break;
    }
    return parts.join(' > ');
  };
  const scope = document.querySelector(${JSON.stringify(root)}) || document.body;
  const failures = [];
  let checked = 0;
  for (const el of scope.querySelectorAll('*')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    if (el.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"], option, script, style')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    let alpha = 1;
    for (let n = el; n; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
    if (alpha === 0) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    checked++;
    let worst = Infinity, worstBg = null;
    for (const bg of backgrounds(el)) {
      const text = over([fg[0], fg[1], fg[2], fg[3] * alpha], bg);
      const q = ratio(text, bg);
      if (q < worst) { worst = q; worstBg = bg; }
    }
    if (worst < MIN) {
      failures.push({
        where: describe(el),
        text: el.textContent.trim().slice(0, 40),
        fg: cs.color + (alpha < 1 ? ' @' + alpha.toFixed(2) : ''),
        bg: hex(worstBg),
        ratio: Math.round(worst * 100) / 100,
      });
    }
  }
  return { checked, failures };
})()`;

export async function contrastFailures(
  page: Page,
  { min = 4.5, root = 'body' }: { min?: number; root?: string } = {},
): Promise<{ checked: number; failures: ContrastFailure[] }> {
  return page.evaluate<{ checked: number; failures: ContrastFailure[] }>(SCAN(min, root));
}
