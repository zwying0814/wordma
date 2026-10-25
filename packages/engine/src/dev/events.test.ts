import { describe, expect, it } from 'bun:test';

import { EventWriter, EVENTS_VERSION } from './events';

describe('EventWriter', () => {
  it('逐行输出带版本的 NDJSON 事件', () => {
    const lines: string[] = [];
    const writer = new EventWriter({
      write: (line) => {
        lines.push(line);
      },
      now: () => new Date('2026-10-25T10:00:00.000Z'),
    });

    writer.emit({
      type: 'ready',
      url: 'http://127.0.0.1:4321/',
      root: '/site',
      outDir: '/site/.wordma/dev',
      basePath: '',
      watch: true,
    });
    writer.emit({
      type: 'exit',
      code: 0,
    });

    expect(lines).toHaveLength(2);
    expect(lines.every((line) => !line.includes('\n'))).toBe(
      true,
    );

    const first = JSON.parse(lines[0] ?? '') as {
      v: number;
      seq: number;
      time: string;
      type: string;
      url: string;
    };
    const second = JSON.parse(lines[1] ?? '') as {
      v: number;
      seq: number;
      type: string;
      code: number;
    };

    expect(first.v).toBe(EVENTS_VERSION);
    expect(first.seq).toBe(1);
    expect(first.time).toBe('2026-10-25T10:00:00.000Z');
    expect(first.type).toBe('ready');
    expect(first.url).toBe('http://127.0.0.1:4321/');
    expect(second.seq).toBe(2);
    expect(second.type).toBe('exit');
    expect(second.code).toBe(0);
  });

  it('消息中的换行不会破坏 NDJSON', () => {
    const lines: string[] = [];
    const writer = new EventWriter({
      write: (line) => {
        lines.push(line);
      },
    });

    writer.emit({
      type: 'build-error',
      durationMs: 1,
      diagnostics: [
        {
          code: 'MDX_PARSE_ERROR',
          severity: 'error',
          source: 'mdx',
          message: 'line 1\nline 2',
        },
      ],
    });

    expect(lines).toHaveLength(1);
    expect(
      (JSON.parse(lines[0] ?? '') as {
        diagnostics: Array<{ message: string }>;
      }).diagnostics[0]?.message,
    ).toBe('line 1\nline 2');
  });
});
