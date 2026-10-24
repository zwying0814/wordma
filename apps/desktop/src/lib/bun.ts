import { Command } from '@tauri-apps/plugin-shell';

/**
 * 调用随应用打包的 Bun sidecar。
 *
 * 例：`const out = await bun(['--version']).execute();`
 */
export function bun(args: string[]) {
  return Command.sidecar('binaries/bun', args);
}
