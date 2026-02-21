import type { TokenUsage } from './codexJsonl';

export function diffTokenUsage(previous: TokenUsage, current: TokenUsage): TokenUsage | null {
  const delta: TokenUsage = {
    input_tokens: current.input_tokens - previous.input_tokens,
    cached_input_tokens: current.cached_input_tokens - previous.cached_input_tokens,
    output_tokens: current.output_tokens - previous.output_tokens,
    reasoning_output_tokens: current.reasoning_output_tokens - previous.reasoning_output_tokens,
    total_tokens: current.total_tokens - previous.total_tokens,
  };

  const normalized: TokenUsage = {
    input_tokens: Math.max(delta.input_tokens, 0),
    cached_input_tokens: Math.max(delta.cached_input_tokens, 0),
    output_tokens: Math.max(delta.output_tokens, 0),
    reasoning_output_tokens: Math.max(delta.reasoning_output_tokens, 0),
    total_tokens: Math.max(delta.total_tokens, 0),
  };

  const hasAnyPositive = (
    normalized.input_tokens > 0
    || normalized.cached_input_tokens > 0
    || normalized.output_tokens > 0
    || normalized.reasoning_output_tokens > 0
    || normalized.total_tokens > 0
  );

  return hasAnyPositive ? normalized : null;
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

export function resolveTokenUsage(
  previousTotalUsage: TokenUsage | null,
  currentTotalUsage: TokenUsage,
  fallbackUsage: TokenUsage,
): TokenUsage | null {
  if (!previousTotalUsage) {
    return fallbackUsage;
  }

  const delta = diffTokenUsage(previousTotalUsage, currentTotalUsage);
  if (delta) {
    return delta;
  }

  if (isSameTokenUsage(previousTotalUsage, currentTotalUsage)) {
    return null;
  }

  return fallbackUsage;
}
