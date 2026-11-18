/** Rate limits hold under parallel requests (no check-then-insert race). */
import { beforeAll, describe, expect, it } from 'vitest';
import { MINUTE, rateLimit } from '@/lib/rate-limit';

beforeAll(() => {
  process.env.RATE_LIMIT_MULTIPLIER = '1';
});

describe('rateLimit', () => {
  it('30 parallel hits on a limit of 5: exactly 5 allowed', async () => {
    const bucket = `test-race-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 30 }, () => rateLimit(bucket, 5, MINUTE)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
