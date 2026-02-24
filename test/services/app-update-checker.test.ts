import { checkForAppUpdate } from '@main/services/infrastructure/AppUpdateChecker';

describe('app update checker', () => {
  it('reports update available when latest release is newer than current version', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          tag_name: 'v1.3.0',
          html_url: 'https://github.com/gulivan/codex-devtools/releases/tag/v1.3.0',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ) as unknown as typeof fetch;

    const status = await checkForAppUpdate({
      currentVersion: '1.2.0',
      fetchImpl,
    });

    expect(status.updateAvailable).toBe(true);
    expect(status.latestVersion).toBe('1.3.0');
    expect(status.releaseUrl).toContain('/v1.3.0');
    expect(status.error).toBeNull();
  });

  it('handles failed release fetch without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;

    const status = await checkForAppUpdate({
      currentVersion: '1.2.0',
      fetchImpl,
    });

    expect(status.updateAvailable).toBe(false);
    expect(status.latestVersion).toBeNull();
    expect(status.error).toContain('HTTP 503');
  });
});
