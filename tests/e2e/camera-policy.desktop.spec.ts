import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test('같은 출처의 서류 촬영 카메라를 정책이 차단하지 않는다', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  const response = await page.goto('/login');
  expect(response?.headers()['permissions-policy']).toContain('camera=(self)');
  const tracks = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const tracks = stream.getVideoTracks();
    tracks.forEach(track => track.stop());
    return tracks.map(track => track.readyState);
  });
  expect(tracks.length).toBeGreaterThan(0);
  expect(tracks.every(state => state === 'ended')).toBe(true);
});
