/* The main flows at a phone and a desktop width, on the recorded catalogue at the
   recording time. Every test also fails on a console error, an uncaught error,
   a Supabase read the recording lacks, or a page wider than the window. */
import { test as base, expect, type Page } from '@playwright/test';
import { fixture, overflow, prepareContext, settle, type Network } from './support/env.ts';

const meta = fixture().meta;

const test = base.extend<{ saved: string[] | undefined; net: Network }>({
  saved: [undefined, { option: true }],
  net: [async ({ context, page, saved }, use) => {
    const net = await prepareContext(context, { saved });
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(`console error: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
    await use(net);
    expect(net.misses, 'Supabase reads missing from the recording (npm run e2e:record)').toEqual([]);
    expect(errors, 'console and page errors').toEqual([]);
    await noOverflow(page);
  }, { auto: true }],
});

const noOverflow = async (page: Page) => {
  expect(await overflow(page), `horizontal overflow on ${new URL(page.url()).pathname}`).toBeNull();
};

const open = async (page: Page, path: string) => {
  await page.goto(path);
  await settle(page);
  await noOverflow(page);
};

/* The desktop project is 1440 px: from 1280 px Now's left rail holds When and Mood. */
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;
const eventsShown = (page: Page) => page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Events/ });

test.describe('Now', () => {
  test('loads the night, a walk and the timeline', async ({ page }) => {
    await open(page, 'index.html');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /View walk/ })).toBeVisible();
    await expect(eventsShown(page)).toHaveText(new RegExp(`\\b${meta.counts.today}\\b`));
    await expect(page.getByRole('region', { name: 'Events' }).getByRole('link', { name: meta.eventTitle })).toBeVisible();
  });

  test('a mood narrows the list', async ({ page }) => {
    await open(page, 'index.html');
    const moods = page.getByRole('group', { name: 'Mood' });
    const mood = moods.getByRole('button', { name: new RegExp(`^${RegExp.escape(meta.mood.label)}`) });
    await mood.click();
    await expect(mood).toHaveAttribute('aria-pressed', 'true');
    await expect(moods.getByRole('button', { name: /^All\b/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(eventsShown(page)).toHaveText(new RegExp(`\\b${meta.mood.count}\\b`));
    await noOverflow(page);
  });

  test('changing the dates updates the list', async ({ page }) => {
    await open(page, 'index.html');
    if (isDesktop(page)) {
      const when = page.getByRole('group', { name: 'When' });
      await when.getByRole('button', { name: /^Weekend\b/ }).click();
      await expect(when.getByRole('button', { name: /^Weekend\b/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(eventsShown(page)).toHaveText(new RegExp(`\\b${meta.counts.weekend}\\b`));
    } else {
      /* The When key pours out its presets. */
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'When' });
      await panel.getByRole('button', { name: /^Tomorrow\b/ }).click();
      /* The panel folds back into its key before it is gone. */
      await expect(panel).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Tomorrow', exact: true })).toBeVisible();
      await expect(eventsShown(page)).toHaveText(new RegExp(`\\b${meta.counts.tomorrow}\\b`));
      await expect(page.getByRole('heading', { level: 2, name: /^Tomorrow\b/ })).toBeVisible();
    }
    await noOverflow(page);

    /* Pick dates opens the date sheet; Cancel keeps the selection. */
    if (isDesktop(page)) await page.getByRole('group', { name: 'When' }).getByRole('button', { name: /^Pick dates\b/ }).click();
    else {
      await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
      await page.getByRole('dialog', { name: 'When' }).getByRole('button', { name: /^Pick dates\b/ }).click();
    }
    const sheet = page.getByRole('dialog', { name: 'Pick dates' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Date', { exact: true })).toBeVisible();
    await noOverflow(page);
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeHidden();
    await expect(eventsShown(page)).toHaveText(new RegExp(`\\b${isDesktop(page) ? meta.counts.weekend : meta.counts.tomorrow}\\b`));
  });

  test('search opens a dialog with local previews', async ({ page }) => {
    await open(page, 'index.html');
    const trigger = page.getByRole('banner').getByRole('button', { name: 'Search events or places' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Search events or places' });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('searchbox', { name: 'Search events or places' });
    await expect(input).toBeFocused();
    await input.pressSequentially(meta.searchQuery);
    await expect(dialog.getByRole('heading', { name: /^Events\b/ })).toBeVisible();
    await expect(dialog.locator('a[href^="detail.html?id="]').first()).toBeVisible();
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    if (isDesktop(page)) {
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('/');
      await expect(dialog).toBeVisible();
      await expect(input).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });

  test('the walk card opens the walk with its stops', async ({ page }) => {
    await open(page, 'index.html');
    const card = page.getByRole('link', { name: /View walk/ });
    const title = (await page.locator('#home-walk-title').innerText()).trim();
    const stops = (await card.locator('.home-walk__stops [data-notranslate]').allInnerTexts()).map(s => s.trim());
    expect(stops.length).toBeGreaterThan(1);
    await card.click();
    await expect(page).toHaveURL(/\/route\.html\?/);
    await settle(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    const list = page.getByRole('main').getByRole('list').first();
    for (const stop of stops) await expect(list.getByRole('link', { name: new RegExp(`^${RegExp.escape(stop)}`) })).toBeVisible();
    await noOverflow(page);
  });
});

test.describe('Pages', () => {
  test('Map', async ({ page }) => {
    await open(page, 'map.html');
    await expect(page.getByRole('heading', { name: 'Map of Tallinn' })).toBeAttached();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Events/ })).toBeVisible();
  });

  test('an event', async ({ page }) => {
    await open(page, `detail.html?id=${encodeURIComponent(meta.eventId)}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(meta.eventTitle);
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  test('the recorded walk', async ({ page }) => {
    await open(page, meta.walkHref);
    await expect(page.getByRole('main').getByRole('list').first().getByRole('listitem').first()).toBeVisible();
  });

  test('All events', async ({ page }) => {
    await open(page, 'discover.html');
    await expect(page.getByRole('heading', { level: 1, name: 'All events' })).toBeVisible();
    await expect(page.getByRole('main').locator(`a[href="detail.html?id=${meta.eventId}"]`).first()).toBeVisible();
  });

  test('All places', async ({ page }) => {
    await open(page, 'places.html');
    await expect(page.getByRole('heading', { level: 1, name: 'All places' })).toBeVisible();
  });

  test('Saved, empty', async ({ page }) => {
    await open(page, 'saved.html');
    await expect(page.getByRole('heading', { level: 1, name: 'Saved' })).toBeVisible();
    await expect(page.getByText('Nothing saved yet.')).toBeVisible();
  });

  test.describe('with two saves', () => {
    test.use({ saved: meta.savedIds });
    test('Saved', async ({ page }) => {
      await open(page, 'saved.html');
      const main = page.getByRole('main');
      for (const id of meta.savedIds) await expect(main.locator(`a[href="detail.html?id=${id}"]`)).toBeVisible();
      /* Two timed shows on one night offer a walk through them. */
      await expect(main.locator('a[href^="route.html?"]').first()).toBeVisible();
    });
  });

  test('You', async ({ page }) => {
    await open(page, 'profile.html');
    await expect(page.getByRole('heading', { level: 1, name: 'You' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Appearance/ })).toBeVisible();
  });

  test('About', async ({ page }) => {
    await open(page, 'about.html');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
