/**
 * QF.66: what a player's phone says when the GM opens another campaign under
 * it. `home` is the first campaign this page joined, so a switch back reads
 * as one; a restored backup (`<id>-restored`, `<id>-restored-2`, QF.44) is an
 * earlier copy whose levels and history are as they were.
 */
export function campaignSwitchNotice(to: string | null, home: string | null): string {
  if (to !== null && to === home) {
    return '[The GM switched back to the campaign you started in. Your sheet shows it again.]';
  }
  if (to !== null && /-restored(-\d+)?$/.test(to)) {
    return '[The GM opened an earlier copy of the campaign, from a backup. Your sheet shows your levels and history as they were then.]';
  }
  if (to === 'demo') return '[The GM opened the demo campaign.]';
  return '[The GM opened another campaign. Your sheet now shows that campaign.]';
}

/** QF.66: why a phone whose character the open campaign lacks is waiting. */
export function missingCharacterReason(campaign: string | null): string {
  const named = campaign ? ` (“${campaign}”)` : '';
  return `The GM has opened another campaign${named}, which does not have your character. This screen rejoins when they switch back; or use Switch character.`;
}
