import * as React from 'react';
import type { StatsResult, TimePoint } from '../../../shared/inspector';
import { compact, dollars } from './Icon';

type SeriesKey = 'cached' | 'input' | 'output' | 'price';
const SERIES: { key: SeriesKey; label: string }[] = [
  { key: 'cached', label: 'Cached input' }, { key: 'input', label: 'Uncached input' },
  { key: 'output', label: 'Output' }, { key: 'price', label: 'API price · USD' },
];
const readableDate = (key: string): string => new Date(key.length === 10 ? `${key}T12:00:00Z` : key).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export class UsageChart extends React.PureComponent<{ points: TimePoint[]; title: string; compact?: boolean }, { hidden: SeriesKey[]; active: number | null; showTable: boolean }> {
  state = { hidden: [] as SeriesKey[], active: null as number | null, showTable: false };
  render(): JSX.Element {
    const { points, title } = this.props;
    const visible = SERIES.filter(s => !this.state.hidden.includes(s.key));
    const width = 1000, height = this.props.compact ? 245 : 300, left = 63, right = 74, top = 23, bottom = height - 37;
    const tokensMax = Math.max(1, ...points.flatMap(p => visible.filter(s => s.key !== 'price').map(s => p[s.key] || 0)));
    const priceMax = Math.max(0.01, ...points.map(p => p.price || 0));
    const x = (i: number): number => left + (width - left - right) * (points.length <= 1 ? .5 : i / (points.length - 1));
    const y = (v: number, key: SeriesKey): number => bottom - (bottom - top) * v / (key === 'price' ? priceMax : tokensMax);
    const path = (key: SeriesKey): string => {
      let result = '', open = false;
      points.forEach((point, i) => { const value = point[key]; if (value === null) { open = false; return; } result += `${open ? 'L' : 'M'}${x(i).toFixed(2)},${y(value, key).toFixed(2)} `; open = true; });
      return result;
    };
    const activeIndex = this.state.active === null ? null : Math.min(points.length - 1, this.state.active);
    const active = activeIndex === null ? null : points[activeIndex];
    const setPointer = (event: React.MouseEvent<SVGSVGElement>): void => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const relative = (event.clientX - bounds.left) / bounds.width * width;
      this.setState({ active: Math.max(0, Math.min(points.length - 1, Math.round((relative - left) / (width - left - right) * (points.length - 1)))) });
    };
    return <section className="cx-card cx-usage-chart" aria-label={`${title}: tokens and estimated price`}>
      <header className="cx-card-head"><div><h2>{title}</h2><p>Token volume on the left. API-equivalent USD on the right.</p></div><span className="cx-badge">4 series</span></header>
      <div className="cx-chart-legend">{SERIES.map(series => <button key={series.key} type="button" aria-pressed={!this.state.hidden.includes(series.key)} className={this.state.hidden.includes(series.key) ? 'is-muted' : ''} onClick={() => this.setState(s => ({ hidden: s.hidden.includes(series.key) ? s.hidden.filter(key => key !== series.key) : [...s.hidden, series.key] }))}><i className={`cx-line-key ${series.key}`} />{series.label}</button>)}</div>
      <div className="cx-chart-wrap">
        <svg className="cx-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Four-series time graph. Arrow keys inspect values; a data table is available below." tabIndex={0} onMouseMove={setPointer} onMouseLeave={() => this.setState({ active: null })} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); this.setState({ active: Math.max(0, Math.min(points.length - 1, (this.state.active === null ? 0 : this.state.active) + (event.key === 'ArrowRight' ? 1 : -1))) }); } }}>
          <title>{title}: cached input, uncached input, output and estimated API price</title>
          {Array.from({ length: 5 }, (_, i) => <g key={i}><line className="cx-gridline" x1={left} x2={width - right} y1={top + (bottom - top) * i / 4} y2={top + (bottom - top) * i / 4} /><text className="cx-axis" x={left - 14} y={top + (bottom - top) * i / 4 + 4} textAnchor="end">{compact(tokensMax * (1 - i / 4))}</text><text className="cx-axis cx-price-axis" x={width - right + 13} y={top + (bottom - top) * i / 4 + 4}>{dollars(priceMax * (1 - i / 4))}</text></g>)}
          {points.length > 0 && [0, .25, .5, .75, 1].map((ratio, i) => { const index = Math.round(ratio * (points.length - 1)); return <text key={i} className="cx-axis" x={x(index)} y={height - 9} textAnchor="middle">{readableDate(points[index].key)}</text>; })}
          {visible.map(series => <path key={series.key} data-series={series.key} className={`cx-series ${series.key}`} d={path(series.key)} fill="none" strokeWidth="2.3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
          {active && activeIndex !== null && <g><line className="cx-crosshair" x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={bottom} />{visible.filter(s => active[s.key] !== null).map(series => <circle key={series.key} className={`cx-point ${series.key}`} cx={x(activeIndex)} cy={y(active[series.key]!, series.key)} r={4.5} />)}</g>}
        </svg>
      </div>
      <div className="cx-chart-readout" aria-live="polite">{active ? <React.Fragment><strong>{active.key}</strong>{SERIES.map(series => <span key={series.key}><i className={`cx-dot ${series.key}`} />{series.label}: <b>{series.key === 'price' ? dollars(active.price) : compact(active[series.key])}</b></span>)}</React.Fragment> : <span>Hover or use arrow keys to inspect · Input excludes cached tokens · Output includes reasoning</span>}</div>
      <button className="cx-text-button cx-data-toggle" onClick={() => this.setState(s => ({ showTable: !s.showTable }))} aria-expanded={this.state.showTable}>{this.state.showTable ? 'Hide' : 'Show'} data table</button>
      {this.state.showTable && <div className="cx-data-table"><table><thead><tr><th>Time</th><th>Cached input</th><th>Uncached input</th><th>Output</th><th>API price</th></tr></thead><tbody>{points.map(point => <tr key={point.key}><td>{point.key}</td><td>{point.cached.toLocaleString()}</td><td>{point.input.toLocaleString()}</td><td>{point.output.toLocaleString()}</td><td>{dollars(point.price)}</td></tr>)}</tbody></table></div>}
    </section>;
  }
}

function polar(radius: number, angle: number): [number, number] { return [190 + radius * Math.cos(angle), 190 + radius * Math.sin(angle)]; }
export function rayPath(hour: number, value: number, max: number): string {
  const gap = .035, angle = hour * Math.PI / 12 - Math.PI / 2, next = (hour + 1) * Math.PI / 12 - Math.PI / 2;
  const outer = 62 + (max ? value / max * 85 : 0);
  const a = polar(62, angle + gap), b = polar(outer, angle + gap), c = polar(outer, next - gap), d = polar(62, next - gap);
  return `M${a.join(',')} L${b.join(',')} A${outer},${outer} 0 0 1 ${c.join(',')} L${d.join(',')} A62,62 0 0 0 ${a.join(',')} Z`;
}
export class ActivityClock extends React.PureComponent<{ hourly: StatsResult['hourly']; timezone: string }, { metric: 'events' | 'tokens'; active: number | null }> {
  state = { metric: 'events' as 'events' | 'tokens', active: null as number | null };
  render(): JSX.Element {
    const { hourly, timezone } = this.props, { metric, active } = this.state;
    const max = Math.max(0, ...hourly.map(h => h[metric])), total = hourly.reduce((sum, h) => sum + h[metric], 0);
    const peak = hourly.reduce((best, hour) => hour[metric] > best[metric] ? hour : best, hourly[0] || { hour: 0, events: 0, tokens: 0 });
    const selected = active === null ? peak : hourly[active];
    return <section className="cx-card cx-clock-card"><header className="cx-card-head"><div><h2>Hourly activity</h2><p>A full day, at a glance.</p></div><select aria-label="Hourly activity metric" value={metric} onChange={event => this.setState({ metric: event.target.value as 'events' | 'tokens' })}><option value="events">Events</option><option value="tokens">Tokens</option></select></header>
      <svg className="cx-clock" viewBox="0 0 380 380" role="img" aria-label={`24-hour radial activity in ${timezone}. Longer rays mean more ${metric}.`}>
        <title>00 through 24 hours, clockwise; ray length encodes {metric}</title>
        {[62, 92, 120, 147].map(radius => <circle key={radius} className="cx-clock-grid" cx="190" cy="190" r={radius} />)}
        {Array.from({ length: 24 }, (_, hour) => <path key={`track:${hour}`} className="cx-ray-track" d={rayPath(hour, 1, 1)} />)}
        {hourly.map(hour => <path key={hour.hour} data-hour={hour.hour} className={`cx-ray ${active === hour.hour ? 'is-active' : ''}`} d={rayPath(hour.hour, hour[metric], max)} tabIndex={0} onFocus={() => this.setState({ active: hour.hour })} onMouseEnter={() => this.setState({ active: hour.hour })} onBlur={() => this.setState({ active: null })} onMouseLeave={() => this.setState({ active: null })}><title>{String(hour.hour).padStart(2, '0')}:00–{String(hour.hour + 1).padStart(2, '0')}:00 · {hour[metric].toLocaleString()} {metric}</title></path>)}
        {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => { const p = polar(171, hour * Math.PI / 12 - Math.PI / 2); return <text key={hour} className="cx-clock-label" x={p[0]} y={p[1] + 4} textAnchor="middle">{hour === 0 ? '00 / 24' : String(hour).padStart(2, '0')}</text>; })}
        <text className="cx-clock-total" x="190" y="189" textAnchor="middle">{compact(total)}</text><text className="cx-clock-unit" x="190" y="209" textAnchor="middle">{metric}</text>
      </svg>
      <div className="cx-clock-note"><span><i className="cx-dot input" />{max ? `${active === null ? 'Peak' : 'Selected'} · ${String(selected.hour).padStart(2, '0')}:00–${String(selected.hour + 1).padStart(2, '0')}:00` : 'No activity in this range'}</span><strong>{compact(selected[metric])} {metric}</strong></div>
      <p className="cx-card-foot">{timezone} · Longer rays = more {metric}</p>
    </section>;
  }
}
