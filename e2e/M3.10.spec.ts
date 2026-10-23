import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.10 Notes: a private Markdown journal (shareable with the GM), live party
// notes, tags and search. Players get their own journal and the party notes,
// never GM notes or another player's journal; the GM (and the GM's View-as
// panes) never get a journal entry the player has not shared.

const GM_KEY = 'e2e-gm-key-m310-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.10');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
  await server.stop();
});

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Every WebSocket frame the page receives, as text. */
function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

/** The demo's GM-only note and Jake's private entry (title and a body phrase). */
const GM_NOTE = ['Drum reveal', 'tutorial boss'];
const JAKE_PRIVATE = ['Something is watching', 'Not telling the others yet'];

test('journal and party notes: private, shareable, live, tagged and searchable', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  const gmFrames = watchFrames(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Notes Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  // Jake on a laptop: his two journal entries and both party notes, newest first.
  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  const jakeFrames = watchFrames(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  const notes = laptop.getByTestId('notes');
  await expect(notes.getByTestId('note-heading')).toHaveText([
    'Tutorial map',
    'Camp rules',
    'Questions for the System',
    'Something is watching',
  ]);
  await expect(notes.getByTestId('note-label')).toHaveText([
    'Party · by the GM',
    'Party · by Miranda',
    'Journal · shared with the GM',
    'Journal · private',
  ]);
  // Markdown renders as elements (bold, a list), never as raw markers.
  await notes.getByRole('button', { name: /Something is watching/ }).click();
  const body = notes.getByTestId('note-body-view');
  await expect(body.locator('strong')).toHaveText('Drum');
  await expect(body.locator('li')).toHaveText([
    'It stops when I draw the bow',
    'Nobody else hears it',
  ]);
  await expect(body).not.toContainText('**');
  await notes.scrollIntoViewIfNeeded();
  await laptop.screenshot({ path: path.join(shots, 'player-notes-1366x768.png') });

  // Tags filter; search covers titles, text and tags.
  await notes.getByRole('button', { name: 'Show notes tagged region:forest' }).click();
  await expect(notes.getByTestId('note-heading')).toHaveText([
    'Tutorial map',
    'Something is watching',
  ]);
  await notes.getByTestId('notes-clear-tag').click();
  await notes.getByTestId('notes-search').fill('boil water');
  await expect(notes.getByTestId('note-heading')).toHaveText(['Camp rules']);
  await notes.getByTestId('notes-search').fill('');
  await notes.getByTestId('notes-filter').selectOption('journal');
  await expect(notes.getByTestId('note')).toHaveCount(2);
  await notes.getByTestId('notes-filter').selectOption('all');

  // Miranda on a phone: party notes only.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  const mirandaFrames = watchFrames(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Miranda/ }).click();
  const phoneNotes = phone.getByTestId('notes');
  await expect(phoneNotes.getByTestId('note-heading')).toHaveText(['Tutorial map', 'Camp rules']);
  await expect(phoneNotes.getByTestId('note-label')).toHaveText([
    'Party · by the GM',
    'Party · by you',
  ]);

  // Jake writes a party note: it reaches Miranda live.
  await notes.getByTestId('note-new').click();
  await notes.getByLabel('Party notes (the whole party and the GM)').check();
  await notes.getByTestId('note-title').fill('Wolf den');
  await notes.getByTestId('note-body').fill('North of the stones. *Three* wolves.');
  await notes.getByTestId('note-tags').fill('region:stones, beast');
  await notes.getByTestId('note-save').click();
  await expect(notes.getByTestId('notes-notice')).toHaveText('Note saved.');
  await expect(phoneNotes.getByTestId('note-heading').first()).toHaveText('Wolf den');
  await expect(phoneNotes.getByTestId('note-label').first()).toHaveText('Party · by Jake');
  // Miranda cannot edit Jake's note.
  await phoneNotes.getByRole('button', { name: /Wolf den/ }).click();
  await expect(phoneNotes.getByTestId('note-body-view').locator('em')).toHaveText('Three');
  await expect(phoneNotes.getByTestId('note-edit')).toHaveCount(0);

  // Jake writes a private journal entry; Miranda and the GM never get it.
  await notes.getByTestId('note-new').click();
  await notes.getByTestId('note-title').fill('My secret plan');
  await notes.getByTestId('note-body').fill('Steal the **ring**.');
  await notes.getByTestId('note-save').click();
  await expect(notes.getByTestId('note-heading').first()).toHaveText('My secret plan');
  await expect(notes.getByTestId('note-label').first()).toHaveText('Journal · private');
  await expect(phoneNotes.getByTestId('note')).toHaveCount(3);

  // Miranda's own note: she can edit it; Jake sees the edit live.
  await phoneNotes.getByTestId('note-new').click();
  await phoneNotes.getByLabel('Party notes (the whole party and the GM)').check();
  await phoneNotes.getByTestId('note-title').fill('Herbs');
  await phoneNotes.getByTestId('note-body').fill('- Feverleaf\n- Ashroot');
  await phoneNotes.getByTestId('note-save').click();
  await expect(notes.getByTestId('note-heading').first()).toHaveText('Herbs');
  await phoneNotes.getByRole('button', { name: /Herbs/ }).click();
  await phoneNotes.getByTestId('note-edit').click();
  await phoneNotes.getByTestId('note-body').fill('- Feverleaf\n- Ashroot\n- Saltmoss');
  await phoneNotes.getByTestId('note-save').click();
  await expect(phoneNotes.getByTestId('notes-notice')).toHaveText('Changes saved.');
  await notes.getByRole('button', { name: /Herbs/ }).click();
  await expect(notes.getByTestId('note-body-view').locator('li')).toHaveText([
    'Feverleaf',
    'Ashroot',
    'Saltmoss',
  ]);
  // One column: Notes sit after Identify and before the notifications.
  const order = await phone.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: {
          querySelector: (s: string) => { getBoundingClientRect: () => { top: number } } | null;
        };
      }
    ).document;
    const top = (s: string) => d.querySelector(s)?.getBoundingClientRect().top ?? -1;
    return [
      top('[data-testid=identify]'),
      top('[data-testid=notes]'),
      top('[data-testid=history]'),
    ];
  });
  expect(order[0]).toBeLessThan(order[1] ?? 0);
  expect(order[1]).toBeLessThan(order[2] ?? 0);
  // The saved note stays open on Miranda's screen.
  await expect(phoneNotes.getByTestId('note-body-view').locator('li')).toHaveCount(3);
  await phoneNotes.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-notes-390x844.png') });

  // Sharing: the GM gets the entry only once Jake shares it.
  const beforeShare = gmFrames.length;
  await notes.getByRole('button', { name: /My secret plan/ }).click();
  await notes.getByTestId('note-share').click();
  await expect(notes.getByTestId('notes-notice')).toHaveText('The GM can now read this entry.');
  await expect
    .poll(() => gmFrames.slice(beforeShare).some((f) => f.includes('Steal the')))
    .toBe(true);
  for (const frame of gmFrames.slice(0, beforeShare)) expect(frame).not.toContain('Steal the');

  // The GM's View-as pane of Jake: shared entries only, read-only.
  const pane = await browser.newPage({ viewport: { width: 700, height: 768 } });
  const paneErrors = watchErrors(pane);
  const paneFrames = watchFrames(pane);
  await pane.goto(`${server.url}/play/demo-jake?pane=1`);
  const paneNotes = pane.getByTestId('notes');
  // Newest change first: sharing just changed "My secret plan".
  await expect(paneNotes.getByTestId('note-heading')).toHaveText([
    'My secret plan',
    'Herbs',
    'Wolf den',
    'Tutorial map',
    'Camp rules',
    'Questions for the System',
  ]);
  await expect(paneNotes.getByTestId('note-new')).toHaveCount(0);
  await paneNotes.getByRole('button', { name: /My secret plan/ }).click();
  await expect(paneNotes.getByTestId('note-edit')).toHaveCount(0);

  // Delete needs a second click; the note leaves every screen.
  await notes.getByRole('button', { name: /Wolf den/ }).click();
  await notes.getByTestId('note-delete').click();
  await notes.getByTestId('note-delete-confirm').click();
  await expect(notes.getByTestId('notes-notice')).toHaveText('Note deleted.');
  await expect(phoneNotes.getByRole('button', { name: /Wolf den/ })).toHaveCount(0);
  await expect(paneNotes.getByRole('button', { name: /Wolf den/ })).toHaveCount(0);

  // No frame to a player ever carried the GM note; Jake's unshared entry never
  // reached Miranda, the GM or the pane.
  for (const frame of [...jakeFrames, ...mirandaFrames, ...paneFrames]) {
    for (const secret of GM_NOTE) expect(frame).not.toContain(secret);
  }
  for (const frame of [...mirandaFrames, ...gmFrames, ...paneFrames]) {
    for (const secret of JAKE_PRIVATE) expect(frame).not.toContain(secret);
  }
  for (const frame of mirandaFrames) {
    expect(frame).not.toContain('Steal the');
    expect(frame).not.toContain('Questions for the System');
  }
  expect(jakeFrames.some((f) => f.includes('Not telling the others yet'))).toBe(true);

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(paneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
