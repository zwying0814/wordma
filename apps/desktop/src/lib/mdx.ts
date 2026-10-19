import type { ComponentMeta } from '@/types/api';

/** 站点目录 components/*.tsx 的读写与编译（主进程 esbuild） */

export function listComponents(): Promise<ComponentMeta[]> {
  return window.api.invoke('list_components') as Promise<ComponentMeta[]>;
}

export function getComponent(name: string): Promise<{ name: string; code: string }> {
  return window.api.invoke('get_component', { name }) as Promise<{
    name: string;
    code: string;
  }>;
}

export function saveComponent(
  name: string,
  code: string
): Promise<ComponentMeta> {
  return window.api.invoke('save_component', { name, code }) as Promise<ComponentMeta>;
}

export function deleteComponent(name: string): Promise<void> {
  return window.api.invoke('delete_component', { name }) as Promise<void>;
}

export type CompileResult =
  | { ok: true; url: string; hash: string }
  | { ok: false; errors: string[] };

/** 取岛的 import() 地址（hash 变化即重新编译，浏览器侧天然失效缓存） */
export function compileComponent(name: string): Promise<CompileResult> {
  return window.api.invoke('compile_component', { name }) as Promise<CompileResult>;
}

export function openComponentsDir(): Promise<string> {
  return window.api.invoke('open_components_dir') as Promise<string>;
}
