import {
  classifyCodexBootstrapMessage,
  isCodexBootstrapMessage,
} from '../../src/shared/utils/codexBootstrapMessage';

describe('codexBootstrapMessage', () => {
  it('classifies AGENTS instructions prelude', () => {
    const content = '# AGENTS.md instructions for /repo\n\n<INSTRUCTIONS>\nkeep concise\n</INSTRUCTIONS>';
    expect(classifyCodexBootstrapMessage(content)).toBe('agents_instructions');
    expect(isCodexBootstrapMessage(content)).toBe(true);
  });

  it('does not classify AGENTS heading without instructions wrapper', () => {
    const content = '# AGENTS.md instructions for /repo';
    expect(classifyCodexBootstrapMessage(content)).toBeNull();
    expect(isCodexBootstrapMessage(content)).toBe(false);
  });

  it('classifies environment_context prelude', () => {
    const content =
      '<environment_context>\n  <cwd>/Users/demo/repo</cwd>\n  <shell>zsh</shell>\n</environment_context>';
    expect(classifyCodexBootstrapMessage(content)).toBe('environment_context');
    expect(isCodexBootstrapMessage(content)).toBe(true);
  });

  it('classifies permissions instructions prelude', () => {
    const content =
      '<permissions instructions>\nfilesystem sandboxing applies\n</permissions instructions>';
    expect(classifyCodexBootstrapMessage(content)).toBe('permissions_instructions');
    expect(isCodexBootstrapMessage(content)).toBe(true);
  });

  it('classifies collaboration mode prelude', () => {
    const content = '<collaboration_mode># Collaboration Mode: Default\n</collaboration_mode>';
    expect(classifyCodexBootstrapMessage(content)).toBe('collaboration_mode');
    expect(isCodexBootstrapMessage(content)).toBe(true);
  });

  it('classifies turn aborted action wrapper', () => {
    const content = '<turn_aborted>the user interrupted the previous turn</turn_aborted>';
    expect(classifyCodexBootstrapMessage(content)).toBe('turn_aborted');
    expect(isCodexBootstrapMessage(content)).toBe(true);
  });

  it('does not classify regular user prompts', () => {
    expect(classifyCodexBootstrapMessage('fix sidebar titles')).toBeNull();
    expect(isCodexBootstrapMessage('fix sidebar titles')).toBe(false);
  });
});
