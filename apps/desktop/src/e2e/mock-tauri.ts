import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';

import type {
  EngineBuildResult,
  EngineInspectResult,
} from '@/features/engine/api';
import type { PreviewState } from '@/features/preview/api';
import type { WorkspaceInfo } from '@/features/workspace/api';

export type E2EState = {
  workspace: WorkspaceInfo;
  content: string;
  writes: Array<{ path: string; content: string }>;
  previewStarts: number;
  previewStops: number;
  builds: number;
  calls: string[];
  newWorkspaceInitialized: boolean;
};

declare global {
  interface Window {
    __WORDMA_E2E__?: E2EState;
  }
}

const workspace: WorkspaceInfo = {
  path: '/e2e/workspace',
  name: 'E2E Workspace',
};

const newWorkspace: WorkspaceInfo = {
  path: '/e2e/new',
  name: 'New Project',
};

const initialState = `---
title: Hello E2E
---

# Hello E2E

Initial body.
`;

function inspectResult(): EngineInspectResult {
  return {
    workspace: workspace.path,
    themeId: 'wordma-theme-default',
    site: {
      title: 'E2E Site',
      language: 'zh-CN',
      basePath: '',
    },
    theme: {
      id: 'wordma-theme-default',
      displayName: 'Default',
      version: '0.0.0',
      path: 'themes/default',
    },
    postFields: [],
    pageFields: [],
    pageTypes: [],
    pages: [],
    settings: [],
    settingsDefaults: {},
    settingsValues: {},
    entries: [
      {
        id: 'posts/hello',
        collection: 'posts',
        kind: 'post',
        title: 'Hello E2E',
        slug: 'hello',
        relativePath: 'content/posts/hello.mdx',
        draft: false,
      },
    ],
    collections: [
      { name: 'posts', kind: 'post', count: 1 },
    ],
    tags: [],
    categories: [],
    diagnostics: [],
  };
}

function buildSuccess(): EngineBuildResult {
  return {
    code: 0,
    event: {
      v: 1,
      type: 'build-success',
      durationMs: 42,
      routes: 3,
      compiledEntries: 1,
      islands: 0,
      diagnostics: [],
    },
    stderr: '',
  };
}

export function setupE2EMocks(): void {
  if (window.__WORDMA_E2E__) return;

  const state: E2EState = {
    workspace,
    content: initialState,
    writes: [],
    previewStarts: 0,
    previewStops: 0,
    builds: 0,
    calls: [],
    newWorkspaceInitialized: false,
  };
  window.__WORDMA_E2E__ = state;

  (window as Window & { isTauri?: boolean }).isTauri = true;
  mockWindows('main', 'preview');
  mockIPC(
    (command, args) => {
      state.calls.push(command);
      const payload = (args ?? {}) as Record<string, unknown>;

      switch (command) {
        case 'load_workspaces':
          return {
            workspaces: [
              {
                path: workspace.path,
                name: workspace.name,
                lastOpenedAt: Date.now(),
                exists: true,
              },
              {
                path: newWorkspace.path,
                name: newWorkspace.name,
                lastOpenedAt: Date.now() - 1000,
                exists: true,
              },
            ],
            autoOpenLast: false,
          };

        case 'workspace_status': {
          const target = String(payload.path ?? '');
          const isNew = target === newWorkspace.path;
          return {
            path: target,
            name: isNew ? newWorkspace.name : workspace.name,
            hasSiteConfig: isNew
              ? state.newWorkspaceInitialized
              : true,
            hasContentDir: isNew
              ? state.newWorkspaceInitialized
              : true,
          };
        }

        case 'initialize_workspace':
          state.newWorkspaceInitialized = true;
          return newWorkspace;

        case 'open_workspace':
          return String(payload.path ?? '') === newWorkspace.path
            ? newWorkspace
            : workspace;

        case 'remove_recent_workspace':
          return {
            workspaces: [],
            autoOpenLast: false,
          };

        case 'set_auto_open_last':
          return null;

        case 'engine_inspect':
          return inspectResult();

        case 'workspace_read':
          return { content: state.content };

        case 'workspace_write': {
          const path = String(payload.path ?? '');
          const content = String(payload.content ?? '');
          state.content = content;
          state.writes.push({ path, content });
          return null;
        }

        case 'workspace_create_note':
          return { path: 'content/posts/created.mdx' };

        case 'workspace_delete_note':
          return null;

        case 'engine_build':
          state.builds += 1;
          return buildSuccess();

        case 'engine_start_dev':
          return {
            url: 'http://127.0.0.1:9999/',
            port: 9999,
          };

        case 'engine_stop':
          return null;

        case 'theme_list':
          return [];

        case 'theme_apply':
        case 'theme_settings_apply':
          return {
            themeId: 'wordma-theme-default',
            diagnostics: [],
          };

        case 'deps_list':
          return {
            exists: false,
            dependencies: [],
            trustedDependencies: [],
          };

        case 'preview_start':
          state.previewStarts += 1;
          return {
            open: true,
            url: 'http://127.0.0.1:9999/',
          } satisfies PreviewState;

        case 'preview_stop':
          state.previewStops += 1;
          return null;

        case 'preview_status':
          return { open: false } satisfies PreviewState;

        case 'plugin:opener|open_path':
        case 'plugin:opener|reveal_item_in_dir':
        case 'plugin:dialog|open':
        case 'plugin:window|set_title':
          return null;

        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
