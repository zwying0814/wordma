import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type EngineRuntimeState =
  | 'starting'
  | 'running'
  | 'stopped'
  | 'crashed';

export type EngineStateEvent = {
  state: EngineRuntimeState;
  code?: number | null;
};

export type EngineLogEvent = {
  stream: 'stdout' | 'stderr' | 'engine';
  line: string;
};

export type EngineDiagnostic = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  source: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  path?: string;
  field?: string;
  exportName?: string;
  module?: string;
};

export type EngineEvent = {
  v: number;
  seq?: number;
  time?: string;
  type: string;
  [key: string]: unknown;
};

export type EngineStart = {
  url: string;
  port: number;
};

export type EngineBuildResult = {
  code: number | null;
  event?: EngineEvent;
  stderr: string;
};

export type EngineInspectEntry = {
  id: string;
  collection: string;
  kind: 'post' | 'page';
  type?: string;
  title: string;
  slug: string;
  relativePath: string;
  date?: string;
  draft: boolean;
};

export type EngineInspectResult = {
  workspace: string;
  themeId: string;
  site: {
    title: string;
    language: string;
    basePath: string;
  };
  theme: {
    id: string;
    displayName: string;
    version: string;
    path: string;
  } | null;
  postFields: Array<Record<string, unknown>>;
  pageFields: Array<Record<string, unknown>>;
  pageTypes: Array<Record<string, unknown>>;
  pages: Array<Record<string, unknown>>;
  settings: Array<Record<string, unknown>>;
  settingsDefaults: Record<string, unknown>;
  settingsValues: Record<string, unknown>;
  entries: EngineInspectEntry[];
  collections: Array<{
    name: string;
    kind: string;
    count: number;
  }>;
  tags: Array<{
    name: string;
    slug: string;
    count: number;
    url?: string;
  }>;
  categories: Array<{
    name: string;
    slug: string;
    count: number;
    url?: string;
  }>;
  diagnostics: EngineDiagnostic[];
};

export function startEngineDev(
  root: string,
  port?: number,
): Promise<EngineStart> {
  return invoke<EngineStart>('engine_start_dev', {
    root,
    port,
  });
}

export function stopEngine(): Promise<void> {
  return invoke<void>('engine_stop');
}

export function buildWithEngine(
  root: string,
  outDir?: string,
): Promise<EngineBuildResult> {
  return invoke<EngineBuildResult>('engine_build', {
    root,
    outDir,
  });
}

export function inspectWithEngine(
  root: string,
): Promise<EngineInspectResult> {
  return invoke<EngineInspectResult>('engine_inspect', {
    root,
  });
}

export function onEngineEvent(
  handler: (event: EngineEvent) => void,
): Promise<UnlistenFn> {
  return listen<EngineEvent>('engine://event', (event) => {
    handler(event.payload);
  });
}

export function onEngineLog(
  handler: (event: EngineLogEvent) => void,
): Promise<UnlistenFn> {
  return listen<EngineLogEvent>('engine://log', (event) => {
    handler(event.payload);
  });
}

export function onEngineState(
  handler: (event: EngineStateEvent) => void,
): Promise<UnlistenFn> {
  return listen<EngineStateEvent>(
    'engine://state',
    (event) => {
      handler(event.payload);
    },
  );
}
