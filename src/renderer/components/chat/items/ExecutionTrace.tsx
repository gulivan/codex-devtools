import { useMemo, useState } from 'react';

import { CodeBlockViewer } from '../viewers/CodeBlockViewer';
import { MarkdownViewer } from '../viewers/MarkdownViewer';

import type { CodexToolExecution } from '@main/types';

interface ExecutionTraceProps {
  execution: CodexToolExecution;
}

function prettyPrintJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export const ExecutionTrace = ({ execution }: ExecutionTraceProps): JSX.Element => {
  const [expanded, setExpanded] = useState(false);

  const output = execution.functionOutput?.output ?? '';
  const formattedArguments = useMemo(
    () => prettyPrintJson(execution.functionCall.arguments),
    [execution.functionCall.arguments],
  );
  const formattedOutput = useMemo(() => prettyPrintJson(output), [output]);

  return (
    <section className={`trace-card ${execution.functionOutput?.isError ? 'error' : ''}`}>
      <button type="button" className="trace-header" onClick={() => setExpanded((value) => !value)}>
        <span className="trace-name">{execution.functionCall.name}</span>
        <span className="trace-meta">{expanded ? 'Hide' : 'Show'} trace</span>
      </button>

      {expanded ? (
        <div className="trace-body">
          <h5>Arguments</h5>
          <CodeBlockViewer code={formattedArguments} language="json" title="function_call.arguments" />

          <h5>Output</h5>
          {formattedOutput.includes('\n') || formattedOutput.startsWith('{') || formattedOutput.startsWith('[') ? (
            <CodeBlockViewer code={formattedOutput} language="json" title="function_call_output.output" />
          ) : (
            <MarkdownViewer markdown={formattedOutput || '_No output yet_'} />
          )}
        </div>
      ) : null}
    </section>
  );
};
