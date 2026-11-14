import type { Locator, Page } from '@playwright/test';

export const ballOf = (page: Page) => page.getByRole('button', { name: /^Attività in corso: / });

/** The focusable controls whose box overlaps the activity ball's. */
export async function underBall(page: Page, ball: Locator) {
  const box = await ball.boundingBox();
  if (!box) throw new Error('no ball box');
  return page.evaluate((rect) => {
    const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(selector)]
      .filter((el) => !el.getAttribute('aria-label')?.startsWith('Attività in corso'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.left < rect.x + rect.width &&
          r.right > rect.x &&
          r.top < rect.y + rect.height &&
          r.bottom > rect.y
        );
      })
      .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName);
  }, box);
}
