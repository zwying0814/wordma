import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type PreviewState = {
  open: boolean;
  url?: string;
};

export function startPreview(
  root: string,
): Promise<PreviewState> {
  return invoke<PreviewState>('preview_start', { root });
}

export function stopPreview(): Promise<void> {
  return invoke<void>('preview_stop');
}

export function getPreviewStatus(): Promise<PreviewState> {
  return invoke<PreviewState>('preview_status');
}

export function onPreviewState(
  handler: (state: PreviewState) => void,
): Promise<UnlistenFn> {
  return listen<PreviewState>(
    'preview://state',
    (event) => {
      handler(event.payload);
    },
  );
}
