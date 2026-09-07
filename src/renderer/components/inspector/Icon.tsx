import * as React from 'react';
const paths = {
  logo: 'M9 5 3 12l6 7m6-14 6 7-6 7M14 3l-4 18',
  sessions: 'M4 4h16v12H8l-4 4V4m4 4h8m-8 4h5',
  stats: 'M4 20V10m6 10V4m6 16v-7m5 7H2',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  search: 'M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  chevron: 'm9 5 7 7-7 7',
  folder: 'M3 6h6l2 2h10v12H3V6Z',
  terminal: 'm5 7 5 5-5 5m8 0h6',
  message: 'M4 4h16v13H9l-5 4V4Z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  tool: 'm14 6 4 4m-6-7 9 9-9 9-9-9 9-9Z',
  event: 'm3 12 4-7 5 14 5-14 4 7',
  refresh: 'M20 7v5h-5M4 17v-5h5m10-5a8 8 0 0 0-14-1m0 11a8 8 0 0 0 14 1',
  copy: 'M8 8h13v13H8V8ZM16 4V2H2v14h2',
  check: 'm5 12 4 4L20 5',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  cube: 'm12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5m-9 5v9',
  external: 'M14 3h7v7m0-7L10 14m0-10H3v17h17v-7',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'm6 6 12 12M18 6 6 18',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l4 2',
  branch: 'M6 3v13m0-9h7a5 5 0 0 0 5-5M6 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 16 }: { name: IconName; size?: number }): JSX.Element {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export const compact = (n: number): string => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
export const dollars = (n: number | null): string => n === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 ? 4 : 2 }).format(n);
export function duration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60000), seconds = Math.floor(ms / 1000) % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m ${seconds}s`;
}
