/**
 * Title text helpers shared by the player's Titles row and the GM's title
 * library (ROADMAP M6.4, DESIGN §4 "Bonuses").
 */

export type TitleBonus = { stat: string; flat?: number; percent?: number };

/** A fraction (0.1) as the percent the GM types ("10"), without float noise. */
export const percentText = (fraction: number) => String(Math.round(fraction * 1e6) / 1e4);

/**
 * A title's bonuses in words, in the order given: "+10% Strength, +0.5
 * Vitality". Flat amounts read in sheet units (stat ÷ divisor), as on the sheet.
 */
export function describeTitleBonuses(
  bonuses: readonly TitleBonus[],
  stats: readonly { id: string; name: string }[],
  display: { displayDivisor: number; displayDecimals: number },
): string {
  const name = (id: string) => stats.find((s) => s.id === id)?.name ?? id;
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const parts: string[] = [];
  for (const b of bonuses) {
    if (b.percent !== undefined && b.percent !== 0) {
      parts.push(`${sign(b.percent)}${percentText(Math.abs(b.percent))}% ${name(b.stat)}`);
    }
    if (b.flat !== undefined && b.flat !== 0) {
      const v = Math.abs(b.flat) / display.displayDivisor;
      parts.push(`${sign(b.flat)}${v.toFixed(display.displayDecimals)} ${name(b.stat)}`);
    }
  }
  return parts.join(', ');
}
