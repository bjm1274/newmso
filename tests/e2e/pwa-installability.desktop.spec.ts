import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('login page keeps the app installable from the public root', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Installability audit is only available in Chromium.');

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration('/');
        return registration?.active?.scriptURL ?? null;
      });
    })
    .toContain('/sw.js');

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
    if (!href) return null;
    const response = await fetch(href);
    return response.json();
  });

  expect(manifest).not.toBeNull();
  expect(manifest.start_url).toBe('/');
  expect(manifest.id).toBe('/');
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192x192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/icon-512x512.png', sizes: '512x512' }),
    ])
  );

  const client = await page.context().newCDPSession(page);
  await client.send('Page.enable');
  const installability = await client.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors ?? []).toEqual([]);
});
