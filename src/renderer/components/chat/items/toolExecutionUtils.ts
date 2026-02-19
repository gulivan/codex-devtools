import type { CodexToolExecution } from '@main/types';

const TERMINAL_COMMAND_NAMES = new Set(['exec_command', 'shell_command']);

export function isTerminalCommandExecution(execution: CodexToolExecution): boolean {
  return TERMINAL_COMMAND_NAMES.has(execution.functionCall.name.toLowerCase());
}
