import { invoke } from '@tauri-apps/api/core';

export type WorkspaceErrorCode =
  | 'INVALID_ROOT'
  | 'MISSING_CONTENT_DIR'
  | 'INVALID_PATH'
  | 'UNSAFE_PATH'
  | 'NOT_FOUND'
  | 'NOT_A_NOTE'
  | 'TOO_LARGE'
  | 'INVALID_ENCODING'
  | 'INVALID_SEGMENT'
  | 'INVALID_COLLECTION'
  | 'INVALID_SLUG'
  | 'INVALID_TITLE'
  | 'INVALID_PAGE_TYPE'
  | 'MISSING_COLLECTION'
  | 'ALREADY_EXISTS'
  | 'WRITE_FAILED'
  | 'DELETE_FAILED';

export type WorkspaceError = {
  code: WorkspaceErrorCode | string;
  message: string;
  path?: string;
};

export type CreateNoteInput = {
  root: string;
  collection: string;
  slug: string;
  title: string;
  pageType?: string;
};

export type CreatedNote = {
  path: string;
};

export function isWorkspaceError(
  value: unknown,
): value is WorkspaceError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WorkspaceError).code === 'string' &&
    typeof (value as WorkspaceError).message === 'string'
  );
}

export function workspaceErrorMessage(
  error: unknown,
): string {
  if (isWorkspaceError(error)) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '工作区操作失败';
}

export async function readNote(
  root: string,
  path: string,
): Promise<string> {
  const result = await invoke<{ content: string }>(
    'workspace_read',
    { root, path },
  );

  return result.content;
}

export function writeNote(
  root: string,
  path: string,
  content: string,
): Promise<void> {
  return invoke<void>('workspace_write', {
    root,
    path,
    content,
  });
}

export function createNote(
  input: CreateNoteInput,
): Promise<CreatedNote> {
  return invoke<CreatedNote>('workspace_create_note', {
    root: input.root,
    collection: input.collection,
    slug: input.slug,
    title: input.title,
    pageType: input.pageType,
  });
}

export function deleteNote(
  root: string,
  path: string,
): Promise<void> {
  return invoke<void>('workspace_delete_note', {
    root,
    path,
  });
}
