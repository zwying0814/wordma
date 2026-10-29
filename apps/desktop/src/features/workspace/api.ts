import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export type RecentWorkspace = {
  path: string;
  name: string;
  lastOpenedAt: number;
  exists: boolean;
};

export type WorkspaceState = {
  workspaces: RecentWorkspace[];
  autoOpenLast: boolean;
};

export type WorkspaceInfo = {
  path: string;
  name: string;
};

export type WorkspaceStatus = {
  path: string;
  name: string;
  hasSiteConfig: boolean;
  hasContentDir: boolean;
};

export function loadWorkspaces(): Promise<WorkspaceState> {
  return invoke<WorkspaceState>('load_workspaces');
}

export function getWorkspaceStatus(
  path: string,
): Promise<WorkspaceStatus> {
  return invoke<WorkspaceStatus>('workspace_status', { path });
}

export function initializeWorkspace(
  path: string,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>('initialize_workspace', { path });
}

export function openWorkspace(path: string): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>('open_workspace', { path });
}

export function removeRecentWorkspace(path: string): Promise<WorkspaceState> {
  return invoke<WorkspaceState>('remove_recent_workspace', { path });
}

export function setAutoOpenLast(enabled: boolean): Promise<void> {
  return invoke<void>('set_auto_open_last', { enabled });
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择或新建笔记空间',
  });

  return typeof selected === 'string' ? selected : null;
}
