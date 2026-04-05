import { expect, test } from '@playwright/test';

test('manifest disables share target for Samsung Internet while preserving it elsewhere', async ({ request }) => {
  const samsungManifestResponse = await request.get('/manifest.json', {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/121.0 Mobile Safari/537.36',
    },
  });
  expect(samsungManifestResponse.ok()).toBeTruthy();
  expect(samsungManifestResponse.headers()['content-type']).toContain('application/manifest+json');
  const samsungManifest = await samsungManifestResponse.json();
  expect(samsungManifest.id).toBe('/');
  expect(samsungManifest.start_url).toBe('/');
  expect(samsungManifest.share_target).toBeUndefined();

  const chromeManifestResponse = await request.get('/manifest.json', {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
    },
  });
  expect(chromeManifestResponse.ok()).toBeTruthy();
  const chromeManifest = await chromeManifestResponse.json();
  expect(chromeManifest.share_target).toBeTruthy();
});
