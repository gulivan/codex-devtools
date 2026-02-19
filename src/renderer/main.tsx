import './index.css';

import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import { initializeEventListeners, useAppStore } from './store';

const Bootstrap = (): JSX.Element => {
  const fetchProjects = useAppStore((state) => state.fetchProjects);
  const fetchConfig = useAppStore((state) => state.fetchConfig);

  useEffect(() => {
    const cleanup = initializeEventListeners();
    void fetchProjects();
    void fetchConfig();

    return cleanup;
  }, [fetchProjects, fetchConfig]);

  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
);
