import { createLogger } from '../src/shared/utils/logger';

describe('createLogger', () => {
  it('prefixes info logs with scope', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = createLogger('Test');

    logger.info('hello', { id: 1 });

    expect(spy).toHaveBeenCalledWith('[Test]', 'hello', { id: 1 });
    spy.mockRestore();
  });

  it('prefixes error logs with scope', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger('Test');

    logger.error('boom');

    expect(spy).toHaveBeenCalledWith('[Test]', 'boom');
    spy.mockRestore();
  });
});
