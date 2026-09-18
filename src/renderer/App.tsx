import { useEffect } from 'react';

import { ErrorBoundary } from '@renderer/components/common/ErrorBoundary';
import { TabbedLayout } from '@renderer/components/layout/TabbedLayout';
import { useAppStore } from '@renderer/store';

import { ConfirmDialog } from './components/common/ConfirmDialog';

/**
 * Some views auto-focus an element (e.g. a search box) that sits below the
 * current scroll position. When that happens the browser scrolls the document
 * to make the focused element visible, which reads as the app "scrolling to
 * the bottom by itself" while the user is idle. Restoring the previous scroll
 * position after such a focus keeps the user where they were.
 */
const restoreScrollOnFocus = (event: FocusEvent): void => {
  const target = event.target;
  if (!target || target === document.body) {
    return;
  }

  const scroller =
    target instanceof Element && typeof target.closest === 'function'
      ? target.closest<HTMLElement>('[data-scroll-restore], [data-scroll-restore="true"]')
      : null;

  if (!scroller) {
    return;
  }

  const previous = scroller.scrollTop;
  requestAnimationFrame(() => {
    scroller.scrollTop = previous;
  });
};

export const App = (): JSX.Element => {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    const isDarkPreferred = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveTheme = theme === 'system' ? (isDarkPreferred ? 'dark' : 'light') : theme;

    root.classList.toggle('light', effectiveTheme === 'light');
  }, [theme]);

  useEffect(() => {
    document.addEventListener('focusin', restoreScrollOnFocus, true);
    return () => {
      document.removeEventListener('focusin', restoreScrollOnFocus, true);
    };
  }, []);

  return (
    <ErrorBoundary>
      <TabbedLayout />
      <ConfirmDialog />
    </ErrorBoundary>
  );
};
