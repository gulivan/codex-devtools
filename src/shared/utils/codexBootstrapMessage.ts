export type CodexBootstrapMessageKind =
  | 'agents_instructions'
  | 'environment_context'
  | 'permissions_instructions'
  | 'collaboration_mode';

const AGENTS_HEADING_PATTERN = /^#?\s*AGENTS\.md instructions\b/i;
const AGENTS_INSTRUCTIONS_BLOCK_PATTERN = /<INSTRUCTIONS>[\s\S]*<\/INSTRUCTIONS>/i;
const ENVIRONMENT_CONTEXT_WRAPPER_PATTERN = /^<environment_context>[\s\S]*<\/environment_context>$/i;
const ENVIRONMENT_CONTEXT_CWD_PATTERN = /<cwd>[\s\S]*<\/cwd>/i;
const ENVIRONMENT_CONTEXT_SHELL_PATTERN = /<shell>[\s\S]*<\/shell>/i;
const PERMISSIONS_INSTRUCTIONS_WRAPPER_PATTERN =
  /^<permissions\s+instructions>[\s\S]*<\/permissions\s+instructions>$/i;
const COLLABORATION_MODE_WRAPPER_PATTERN = /^<collaboration_mode>[\s\S]*<\/collaboration_mode>$/i;

export function classifyCodexBootstrapMessage(content: string): CodexBootstrapMessageKind | null {
  const value = content.trim();
  if (!value) {
    return null;
  }

  if (AGENTS_HEADING_PATTERN.test(value) && AGENTS_INSTRUCTIONS_BLOCK_PATTERN.test(value)) {
    return 'agents_instructions';
  }

  if (
    ENVIRONMENT_CONTEXT_WRAPPER_PATTERN.test(value) &&
    ENVIRONMENT_CONTEXT_CWD_PATTERN.test(value) &&
    ENVIRONMENT_CONTEXT_SHELL_PATTERN.test(value)
  ) {
    return 'environment_context';
  }

  if (PERMISSIONS_INSTRUCTIONS_WRAPPER_PATTERN.test(value)) {
    return 'permissions_instructions';
  }

  if (COLLABORATION_MODE_WRAPPER_PATTERN.test(value)) {
    return 'collaboration_mode';
  }

  return null;
}

export function isCodexBootstrapMessage(content: string): boolean {
  return classifyCodexBootstrapMessage(content) !== null;
}
