import { diffTokenUsage, resolveTokenUsage } from '@main/types';

describe('token usage utilities', () => {
  it('clamps mixed cumulative deltas to non-negative per-field increments', () => {
    const delta = diffTokenUsage(
      {
        input_tokens: 155_806,
        cached_input_tokens: 50_000,
        output_tokens: 1_139,
        reasoning_output_tokens: 0,
        total_tokens: 156_945,
      },
      {
        input_tokens: 157_067,
        cached_input_tokens: 49_900,
        output_tokens: 1_360,
        reasoning_output_tokens: 0,
        total_tokens: 158_327,
      },
    );

    expect(delta).toEqual({
      input_tokens: 1_261,
      cached_input_tokens: 0,
      output_tokens: 221,
      reasoning_output_tokens: 0,
      total_tokens: 1_382,
    });
  });

  it('returns null for duplicate cumulative totals', () => {
    const usage = resolveTokenUsage(
      {
        input_tokens: 100,
        cached_input_tokens: 50,
        output_tokens: 20,
        reasoning_output_tokens: 10,
        total_tokens: 120,
      },
      {
        input_tokens: 100,
        cached_input_tokens: 50,
        output_tokens: 20,
        reasoning_output_tokens: 10,
        total_tokens: 120,
      },
      {
        input_tokens: 100,
        cached_input_tokens: 50,
        output_tokens: 20,
        reasoning_output_tokens: 10,
        total_tokens: 120,
      },
    );

    expect(usage).toBeNull();
  });

  it('uses fallback usage for the first token event in a session', () => {
    const usage = resolveTokenUsage(
      null,
      {
        input_tokens: 10,
        cached_input_tokens: 2,
        output_tokens: 6,
        reasoning_output_tokens: 1,
        total_tokens: 19,
      },
      {
        input_tokens: 10,
        cached_input_tokens: 2,
        output_tokens: 6,
        reasoning_output_tokens: 1,
        total_tokens: 19,
      },
    );

    expect(usage).toEqual({
      input_tokens: 10,
      cached_input_tokens: 2,
      output_tokens: 6,
      reasoning_output_tokens: 1,
      total_tokens: 19,
    });
  });

  it('uses fallback usage when every cumulative counter decreases', () => {
    const usage = resolveTokenUsage(
      {
        input_tokens: 100,
        cached_input_tokens: 60,
        output_tokens: 20,
        reasoning_output_tokens: 10,
        total_tokens: 120,
      },
      {
        input_tokens: 90,
        cached_input_tokens: 55,
        output_tokens: 15,
        reasoning_output_tokens: 8,
        total_tokens: 105,
      },
      {
        input_tokens: 4,
        cached_input_tokens: 1,
        output_tokens: 2,
        reasoning_output_tokens: 0,
        total_tokens: 6,
      },
    );

    expect(usage).toEqual({
      input_tokens: 4,
      cached_input_tokens: 1,
      output_tokens: 2,
      reasoning_output_tokens: 0,
      total_tokens: 6,
    });
  });
});
