import type { TokenUsage } from './codexJsonl';

export function diffTokenUsage(previous: TokenUsage, current: TokenUsage): TokenUsage | null {
  const delta: TokenUsage = {
    input_tokens: current.input_tokens - previous.input_tokens,
    cached_input_tokens: current.cached_input_tokens - previous.cached_input_tokens,
    output_tokens: current.output_tokens - previous.output_tokens,
    reasoning_output_tokens: current.reasoning_output_tokens - previous.reasoning_output_tokens,
    total_tokens: current.total_tokens - previous.total_tokens,
  };

  const hasNegative = (
    delta.input_tokens < 0
    || delta.cached_input_tokens < 0
    || delta.output_tokens < 0
    || delta.reasoning_output_tokens < 0
    || delta.total_tokens < 0
  );
  if (hasNegative) {
    return null;
  }

  const isDuplicate = (
    delta.input_tokens === 0
    && delta.cached_input_tokens === 0
    && delta.output_tokens === 0
    && delta.reasoning_output_tokens === 0
    && delta.total_tokens === 0
  );

  return isDuplicate ? null : delta;
}

export function isSameTokenUsage(left: TokenUsage, right: TokenUsage): boolean {
  return (
    left.input_tokens === right.input_tokens
    && left.cached_input_tokens === right.cached_input_tokens
    && left.output_tokens === right.output_tokens
    && left.reasoning_output_tokens === right.reasoning_output_tokens
    && left.total_tokens === right.total_tokens
  );
}
