import { useEffect } from 'react';

import { ErrorBoundary } from '@renderer/components/common/ErrorBoundary';
import { TabbedLayout } from '@renderer/components/layout/TabbedLayout';
import { useAppStore } from '@renderer/store';

import { ConfirmDialog } from './components/common/ConfirmDialog';

export const App = (): JSX.Element => {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    const isDarkPreferred = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveTheme = theme === 'system' ? (isDarkPreferred ? 'dark' : 'light') : theme;

    root.classList.toggle('light', effectiveTheme === 'light');
  }, [theme]);

  return (
    <ErrorBoundary>
      <TabbedLayout />
      <ConfirmDialog />
    </ErrorBoundary>
  );
};
