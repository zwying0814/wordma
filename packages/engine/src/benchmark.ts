import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CacheStats } from './cache/build-cache';
import { buildSite } from './build';

export type BenchmarkOptions = {
  posts?: number;
  repeats?: number;
  keepWorkspace?: boolean;
  workspace?: string;
};

export type BenchmarkScenario = {
  medianMs: number;
  runs: number[];
  cache?: CacheStats;
};

export type BenchmarkResult = {
  workspace: string;
  posts: number;
  repeats: number;
  routes: number;
  compiledEntries: number;
  islands: number;
  cold: BenchmarkScenario;
  warm: BenchmarkScenario;
  changeOne: BenchmarkScenario;
  budgets: {
    coldMs: number;
    warmMs: number;
    changeOneMs: number;
  };
  warnings: string[];
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : Math.round(
        ((sorted[middle - 1] ?? 0) +
          (sorted[middle] ?? 0)) /
          2,
      );
}

function writeFile(
  root: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function isoDate(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + offset))
    .toISOString()
    .slice(0, 10);
}

export function createBenchmarkWorkspace(
  posts = 100,
): string {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-bench-'),
  );

  writeFile(
    root,
    'wordma.site.yaml',
    [
      'site:',
      '  title: Benchmark Site',
      '  description: 100 post benchmark',
      '  url: https://bench.example.com',
      'theme:',
      '  id: wordma-theme-default',
      'pagination:',
      '  pageSize: 10',
    ].join('\n'),
  );

  writeFile(
    root,
    'package.json',
    JSON.stringify(
      {
        name: 'wordma-benchmark',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
  );

  mkdirSync(path.join(root, 'content/posts'), {
    recursive: true,
  });

  for (let index = 0; index < 20; index += 1) {
    writeFile(
      root,
      `content/posts/images/img-${index}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>`,
    );
  }

  writeFile(
    root,
    'components/bench.tsx',
    [
      "import { useState } from 'react';",
      "import styles from './bench.module.css';",
      'export default function Bench() {',
      '  const [value] = useState(1);',
      '  return <span className={styles.box}>bench-{value}</span>;',
      '}',
    ].join('\n'),
  );
  writeFile(
    root,
    'components/bench.module.css',
    '.box { display: inline-block; }',
  );

  for (let index = 0; index < posts; index += 1) {
    const image =
      index < 20
        ? `\n![image](./images/img-${index}.svg)\n`
        : '';
    const island =
      index === 0
        ? [
            '',
            "import Bench from '../../components/bench';",
            '',
            '<Bench />',
          ].join('\n')
        : '';

    writeFile(
      root,
      `content/posts/post-${String(index).padStart(3, '0')}.mdx`,
      [
        '---',
        `title: Bench Post ${index}`,
        `date: ${isoDate(index % 365)}`,
        `description: Benchmark post ${index}`,
        'tags:',
        `  - tag-${index % 5}`,
        '  - bench',
        'categories:',
        `  - category-${index % 3}`,
        '---',
        '',
        `# Bench Post ${index}`,
        '',
        `Paragraph for benchmark post ${index}.`,
        image,
        '```ts',
        `export const value${index} = ${index};`,
        '```',
        island,
      ].join('\n'),
    );
  }

  return root;
}

export async function runBuildBenchmark(
  options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const posts = options.posts ?? 100;
  const repeats = options.repeats ?? 3;
  const root =
    options.workspace ?? createBenchmarkWorkspace(posts);
  const outDir = path.join(root, '.bench-dist');
  const budgets = {
    coldMs: 8000,
    warmMs: 2000,
    changeOneMs: 2000,
  };
  const coldRuns: number[] = [];
  const warmRuns: number[] = [];
  const changeRuns: number[] = [];
  let lastBuild: Awaited<ReturnType<typeof buildSite>> | undefined;
  let warmCache: CacheStats | undefined;
  let changeCache: CacheStats | undefined;

  const timedBuild = async (): Promise<{
    durationMs: number;
    result: Awaited<ReturnType<typeof buildSite>>;
  }> => {
    const started = Date.now();
    const result = await buildSite({ root, outDir });
    return {
      durationMs: Date.now() - started,
      result,
    };
  };

  try {
    for (let index = 0; index < repeats; index += 1) {
      rmSync(path.join(root, '.wordma/cache'), {
        recursive: true,
        force: true,
      });
      const run = await timedBuild();
      coldRuns.push(run.durationMs);
      lastBuild = run.result;
    }

    for (let index = 0; index < repeats; index += 1) {
      const run = await timedBuild();
      warmRuns.push(run.durationMs);
      warmCache = run.result.cache;
      lastBuild = run.result;
    }

    for (let index = 0; index < repeats; index += 1) {
      writeFile(
        root,
        'content/posts/post-050.mdx',
        [
          '---',
          'title: Bench Post 50 updated',
          'date: 2026-02-20',
          'tags:',
          '  - tag-0',
          '  - bench',
          'categories:',
          '  - category-2',
          '---',
          '',
          `# Updated ${index}`,
          '',
          `Changed content ${index}.`,
        ].join('\n'),
      );
      const run = await timedBuild();
      changeRuns.push(run.durationMs);
      changeCache = run.result.cache;
      lastBuild = run.result;
    }

    const cold = {
      medianMs: median(coldRuns),
      runs: coldRuns,
    };
    const warm = {
      medianMs: median(warmRuns),
      runs: warmRuns,
      ...(warmCache ? { cache: warmCache } : {}),
    };
    const changeOne = {
      medianMs: median(changeRuns),
      runs: changeRuns,
      ...(changeCache ? { cache: changeCache } : {}),
    };
    const warnings: string[] = [];

    if (cold.medianMs > budgets.coldMs) {
      warnings.push(
        `cold ${cold.medianMs}ms exceeds ${budgets.coldMs}ms`,
      );
    }
    if (warm.medianMs > budgets.warmMs) {
      warnings.push(
        `warm ${warm.medianMs}ms exceeds ${budgets.warmMs}ms`,
      );
    }
    if (changeOne.medianMs > budgets.changeOneMs) {
      warnings.push(
        `changeOne ${changeOne.medianMs}ms exceeds ${budgets.changeOneMs}ms`,
      );
    }

    return {
      workspace: root,
      posts,
      repeats,
      routes: lastBuild?.routes ?? 0,
      compiledEntries: lastBuild?.compiledEntries ?? 0,
      islands: lastBuild?.islands ?? 0,
      cold,
      warm,
      changeOne,
      budgets,
      warnings,
    };
  } finally {
    if (!options.keepWorkspace && !options.workspace) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
