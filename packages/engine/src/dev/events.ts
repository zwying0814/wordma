export const EVENTS_VERSION = 1;

export type JsonDiagnostic = {
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  path?: string;
  exportName?: string;
  [key: string]: unknown;
};

export type ReadyEvent = {
  type: 'ready';
  url: string;
  root: string;
  outDir: string;
  basePath: string;
  watch: boolean;
};

export type BuildStartEvent = {
  type: 'build-start';
  reason: 'initial' | 'watch' | 'manual';
  changed?: string[];
};

export type BuildSuccessEvent = {
  type: 'build-success';
  durationMs: number;
  routes: number;
  compiledEntries: number;
  islands: number;
  diagnostics: JsonDiagnostic[];
  cache?: {
    hits: number;
    misses: number;
    disabled?: boolean;
  };
};

export type BuildErrorEvent = {
  type: 'build-error';
  durationMs: number;
  diagnostics: JsonDiagnostic[];
};

export type ReloadEvent = {
  type: 'reload';
  buildId: string;
};

export type WatchEvent = {
  type: 'watch';
  changed: string[];
};

export type ExitEvent = {
  type: 'exit';
  code: number;
};

export type DevEventPayload =
  | ReadyEvent
  | BuildStartEvent
  | BuildSuccessEvent
  | BuildErrorEvent
  | ReloadEvent
  | WatchEvent
  | ExitEvent;

export type EventEnvelope = DevEventPayload & {
  v: typeof EVENTS_VERSION;
  seq: number;
  time: string;
};

export type EventWriterOptions = {
  write?: (line: string) => void;
  now?: () => Date;
};

/**
 * 逐行输出 NDJSON 事件。
 *
 * 调用方必须保证 stdout 只由该 writer 写入。
 */
export class EventWriter {
  private seq = 0;
  private readonly writeLine: (line: string) => void;
  private readonly now: () => Date;

  constructor(options: EventWriterOptions = {}) {
    this.writeLine =
      options.write ?? ((line) => console.log(line));
    this.now = options.now ?? (() => new Date());
  }

  emit(payload: DevEventPayload): EventEnvelope {
    const envelope: EventEnvelope = {
      v: EVENTS_VERSION,
      seq: (this.seq += 1),
      time: this.now().toISOString(),
      ...payload,
    };

    this.writeLine(JSON.stringify(envelope));

    return envelope;
  }
}
