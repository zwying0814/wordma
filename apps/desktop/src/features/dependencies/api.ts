import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type DependencyGroup =
  | 'dependencies'
  | 'devDependencies'
  | 'optionalDependencies'
  | 'peerDependencies';

export type DependencyItem = {
  name: string;
  version: string;
  group: DependencyGroup;
  installed: boolean;
  installedVersion?: string;
  lifecycleScripts: string[];
  trusted: boolean;
};

export type DependencyState = {
  exists: boolean;
  packageJson?: string;
  dependencies: DependencyItem[];
  trustedDependencies: string[];
};

export type DependencyAction = 'add' | 'remove' | 'update';

export type DependencyOperationResult = {
  operationId: string;
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  restartedEngine: boolean;
  restartError?: string;
};

export type DependencyLogEvent = {
  operationId: string;
  stream: 'stdout' | 'stderr';
  line: string;
};

export type DependencyError = {
  code: string;
  message: string;
  path?: string;
};

export function isDependencyError(
  value: unknown,
): value is DependencyError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DependencyError).code === 'string' &&
    typeof (value as DependencyError).message === 'string'
  );
}

export function dependencyErrorMessage(
  error: unknown,
): string {
  if (isDependencyError(error)) {
    return `[${error.code}] ${error.message}`;
  }
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '依赖操作失败';
}

export function listDependencies(
  root: string,
): Promise<DependencyState> {
  return invoke<DependencyState>('deps_list', { root });
}

export function installDependencies(input: {
  root: string;
  action: DependencyAction;
  packages: string[];
  dev?: boolean;
  allowTrustedScripts?: boolean;
}): Promise<DependencyOperationResult> {
  return invoke<DependencyOperationResult>(
    'deps_install',
    {
      root: input.root,
      action: input.action,
      packages: input.packages,
      dev: input.dev,
      allowTrustedScripts: input.allowTrustedScripts,
    },
  );
}

export function onDependencyLog(
  handler: (event: DependencyLogEvent) => void,
): Promise<UnlistenFn> {
  return listen<DependencyLogEvent>('deps://log', (event) => {
    handler(event.payload);
  });
}
