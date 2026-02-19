import { startStandaloneCli } from '../src/main/standalone';

describe('standalone startup guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('logs and sets a non-zero exit code when startup fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    startStandaloneCli(async () => {
      throw new Error('startup failed');
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[0]).toBe('[Standalone]');
    expect(errorSpy.mock.calls[0]?.[1]).toBe('Standalone startup failed');
  });
});
