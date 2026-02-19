import type { ErrorInfo } from 'react';

import { ErrorBoundary } from '@renderer/components/common/ErrorBoundary';

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs caught errors through the shared renderer logger scope', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boundary = new ErrorBoundary({ children: null });
    const error = new Error('Renderer exploded');
    const errorInfo = { componentStack: '\n at App' } as ErrorInfo;

    boundary.componentDidCatch(error, errorInfo);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe('[Renderer:ErrorBoundary]');
    expect(errorSpy.mock.calls[0]?.[1]).toBe('Renderer error boundary captured an error');
    expect(errorSpy.mock.calls[0]?.[2]).toBe(error);
    expect(errorSpy.mock.calls[0]?.[3]).toBe(errorInfo);
  });
});
