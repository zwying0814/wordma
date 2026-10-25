import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';

import { runBuildBenchmark } from './benchmark';

describe('build benchmark', () => {
  it('生成 cold/warm/changeOne 数据并清理临时工作区', async () => {
    const result = await runBuildBenchmark({
      posts: 5,
      repeats: 1,
    });

    expect(result.posts).toBe(5);
    expect(result.repeats).toBe(1);
    expect(result.routes).toBeGreaterThanOrEqual(5);
    expect(result.compiledEntries).toBeGreaterThanOrEqual(5);
    expect(result.cold.runs).toHaveLength(1);
    expect(result.warm.runs).toHaveLength(1);
    expect(result.changeOne.runs).toHaveLength(1);
    expect(result.cold.medianMs).toBeGreaterThan(0);
    expect(result.warm.medianMs).toBeGreaterThan(0);
    expect(result.changeOne.medianMs).toBeGreaterThan(0);
    expect(result.warm.cache?.hits).toBeGreaterThan(0);
    expect(result.changeOne.cache?.misses).toBeGreaterThan(0);
    expect(result.budgets.coldMs).toBe(8000);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(existsSync(result.workspace)).toBe(false);
  }, 30000);
});
