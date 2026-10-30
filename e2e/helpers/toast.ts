import { expect, type Page } from './test';

/**
 * Waits for a DING toast containing `text`. Earlier DINGs queue ahead of it
 * and each shows for a few seconds (MU.2 made more GM actions notify), so the
 * wait allows for several to pass first.
 */
export async function expectToast(page: Page, text: string, queued = 6): Promise<void> {
  await expect(page.getByTestId('ding-toast')).toContainText(text, {
    timeout: 5_000 + queued * 3_000,
  });
}
