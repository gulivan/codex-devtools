import { useMemo, useState } from 'react';

import { notifyChatLayoutInvalidated } from '../chatLayoutEvents';

export type StreamArtifactLine = {
  timestamp: string;
  engine: string;
  agent: string;
  eventType: string;
  providerThreadId: string | null;
  stageId: string | null;
  payload: unknown;
};

type StreamArtifactItemProps = {
  content?: string;
  events?: StreamArtifactLine[] | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseLine(line: string): StreamArtifactLine | null {
  const parsed = JSON.parse(line);
  const record = asRecord(parsed);
  if (!record) return null;

  const timestamp = asString(record.timestamp);
  const engine = asString(record.engine);
  const agent = asString(record.agent);
  const eventType = asString(record.event_type);
  if (!timestamp || !engine || !agent || !eventType) return null;

  return {
    timestamp,
    engine,
    agent,
    eventType,
    providerThreadId: asString(record.provider_thread_id),
    stageId: asString(record.stage_id),
    payload: record.payload ?? null,
  };
}

export function parseStreamArtifactContent(content: string): StreamArtifactLine[] | null {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const parsed: StreamArtifactLine[] = [];
  for (const line of lines) {
    try {
      const event = parseLine(line);
      if (!event) return null;
      parsed.push(event);
    } catch {
      return null;
    }
  }
  return parsed.length ? parsed : null;
}

function previewPayload(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const StreamArtifactItem = ({
  content = '',
  events: preParsedEvents = undefined,
}: StreamArtifactItemProps): JSX.Element | null => {
  const events = useMemo(
    () => (preParsedEvents !== undefined ? preParsedEvents : parseStreamArtifactContent(content)),
    [content, preParsedEvents],
  );
  const [expanded, setExpanded] = useState(false);

  if (!events) return null;

  return (
    <section className={`stream-artifact ${expanded ? 'open' : ''}`}>
      <button
        type="button"
        className="stream-artifact-summary"
        onClick={() => {
          setExpanded((value) => !value);
          notifyChatLayoutInvalidated();
        }}
        aria-expanded={expanded}
      >
        <span>
          Stream events: <strong>{events.length}</strong>
        </span>
        <span className="stream-artifact-summary-hint">
          {events[0].engine}:{events[0].agent}
        </span>
      </button>

      <div className="stream-artifact-list">
        {events.map((event, index) => (
          <article key={`${event.timestamp}-${event.eventType}-${index}`} className="stream-artifact-event">
            <header className="stream-artifact-event-header">
              <span className="stream-artifact-badge">{event.eventType}</span>
              <span className="stream-artifact-time">{event.timestamp}</span>
            </header>
            <p className="stream-artifact-meta">
              <code>{event.engine}</code> / <code>{event.agent}</code>
              {event.providerThreadId ? (
                <>
                  {' '}thread <code>{event.providerThreadId}</code>
                </>
              ) : null}
              {event.stageId ? (
                <>
                  {' '}stage <code>{event.stageId}</code>
                </>
              ) : null}
            </p>
            {expanded ? (
              <pre className="stream-artifact-payload">{previewPayload(event.payload)}</pre>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};
