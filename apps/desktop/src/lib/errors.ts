/**
 * 主进程抛出的异常经 IPC 会带上 Electron 的包装前缀
 * （`Error invoking remote method 'x': Error: 真正的信息`），这里剥掉它。
 */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const match = /Error invoking remote method '[^']*':\s*(?:Error:\s*)?([\s\S]*)$/.exec(raw);
  return (match?.[1] ?? raw).trim();
}
