import { useEffect } from 'react';

import { useAppStore } from '@renderer/store';
import type { CodexProject } from '@main/types';

import { DateGroupedSessions } from '../sidebar/DateGroupedSessions';

function formatProjectOption(project: CodexProject): string {
  return `${project.name} - ${project.cwd} (${project.sessionCount})`;
}

export const Sidebar = (): JSX.Element => {
  const {
    projects,
    projectsLoading,
    activeProjectCwd,
    fetchProjects,
    selectProject,
    searchQuery,
    setSearchQuery,
  } = useAppStore((state) => ({
    projects: state.projects,
    projectsLoading: state.projectsLoading,
    activeProjectCwd: state.activeProjectCwd,
    fetchProjects: state.fetchProjects,
    selectProject: state.selectProject,
    searchQuery: state.searchQuery,
    setSearchQuery: state.setSearchQuery,
  }));

  useEffect(() => {
    if (projects.length === 0 && !projectsLoading) {
      void fetchProjects();
    }
  }, [projects.length, projectsLoading, fetchProjects]);

  useEffect(() => {
    if (projects.length > 0 && !activeProjectCwd) {
      void selectProject(projects[0].cwd);
    }
  }, [projects, activeProjectCwd, selectProject]);

  return (
    <aside className="sidebar-shell">
      <div className="sidebar-header">
        <h1 className="sidebar-title">codex-devtools</h1>
        <p className="sidebar-subtitle">Sessions by project</p>
      </div>

      <div className="sidebar-controls">
        <label className="sidebar-label" htmlFor="project-select">
          Project
        </label>
        <select
          id="project-select"
          className="app-select"
          value={activeProjectCwd ?? ''}
          onChange={(event) => {
            void selectProject(event.target.value);
          }}
          disabled={projectsLoading || projects.length === 0}
        >
          {projects.map((project) => (
            <option key={project.cwd} value={project.cwd}>
              {formatProjectOption(project)}
            </option>
          ))}
        </select>

        <label className="sidebar-label" htmlFor="session-search">
          Search
        </label>
        <input
          id="session-search"
          className="app-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Find sessions"
        />
      </div>

      <DateGroupedSessions />
    </aside>
  );
};
