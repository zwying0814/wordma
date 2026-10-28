import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Package,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  dependencyErrorMessage,
  installDependencies,
  listDependencies,
  onDependencyLog,
  type DependencyAction,
  type DependencyGroup,
  type DependencyItem,
  type DependencyState,
} from './api';

type DependencyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspacePath: string;
  onApplied: () => Promise<void>;
};

const GROUP_LABELS: Record<DependencyGroup, string> = {
  dependencies: '运行依赖',
  devDependencies: '开发依赖',
  optionalDependencies: '可选依赖',
  peerDependencies: '对等依赖',
};

const GROUP_ORDER: DependencyGroup[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function splitSpecs(specs: string): string[] {
  return specs
    .split(/[\s,]+/)
    .map((spec) => spec.trim())
    .filter(Boolean);
}

function packageName(spec: string): string {
  const scope = spec.startsWith('@');
  const index = spec.indexOf('@', scope ? 1 : 0);
  return index > 0 ? spec.slice(0, index) : spec;
}

function resultError(
  stderr: string,
  code: number | null,
): string {
  const text = stderr.trim();
  if (text) return text;
  return `bun 退出码：${code ?? 'unknown'}`;
}

export function DependencyDialog({
  open,
  onOpenChange,
  workspacePath,
  onApplied,
}: DependencyDialogProps) {
  const [state, setState] = useState<DependencyState | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(
    null,
  );
  const [specs, setSpecs] = useState('');
  const [dev, setDev] = useState(false);
  const [allowScripts, setAllowScripts] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [removeTarget, setRemoveTarget] =
    useState<DependencyItem | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      setState(await listDependencies(workspacePath));
    } catch (loadError) {
      setLoadError(dependencyErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  useEffect(() => {
    if (!open) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void onDependencyLog((event) => {
      setLogs((current) =>
        [
          ...current,
          `${
            event.stream === 'stderr' ? '! ' : ''
          }${event.line}`,
        ].slice(-500),
      );
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => {
        // 日志监听失败不影响依赖操作本身
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [open]);

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logs]);

  const groups = useMemo(() => {
    const map = new Map<DependencyGroup, DependencyItem[]>();
    for (const item of state?.dependencies ?? []) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }

    return GROUP_ORDER.filter((group) => map.has(group)).map(
      (group) => ({
        group,
        items: map.get(group) ?? [],
      }),
    );
  }, [state]);

  const selectedSpecs = useMemo(
    () => splitSpecs(specs),
    [specs],
  );
  const selectedNames = useMemo(
    () => selectedSpecs.map(packageName),
    [selectedSpecs],
  );
  const trusted = useMemo(
    () => new Set(state?.trustedDependencies ?? []),
    [state],
  );
  const canAllowScripts =
    selectedNames.length > 0 &&
    selectedNames.every((name) => trusted.has(name));

  useEffect(() => {
    if (!canAllowScripts) setAllowScripts(false);
  }, [canAllowScripts]);

  const run = async (
    action: DependencyAction,
    packages: string[],
    options: {
      dev?: boolean;
      allowTrustedScripts?: boolean;
      label: string;
    },
  ): Promise<boolean> => {
    setRunning(true);
    setError(null);
    setLogs([]);

    try {
      const result = await installDependencies({
        root: workspacePath,
        action,
        packages,
        dev: options.dev,
        allowTrustedScripts: options.allowTrustedScripts,
      });

      if (!result.success) {
        const message = resultError(
          result.stderr,
          result.code,
        );
        setError(message);
        toast.error(`${options.label}失败`);
      } else {
        toast.success(
          result.restartedEngine
            ? `${options.label}，开发预览已重启`
            : options.label,
        );
        if (result.restartError) {
          setError(
            `依赖已更新，但重启预览失败：${result.restartError}`,
          );
        }
      }

      await load();

      if (result.success) {
        try {
          await onApplied();
        } catch (refreshError) {
          setError(
            `依赖已更新，但刷新工作区失败：${dependencyErrorMessage(
              refreshError,
            )}`,
          );
        }
      }

      return result.success;
    } catch (operationError) {
      const message = dependencyErrorMessage(operationError);
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setRunning(false);
    }
  };

  const handleAdd = () => {
    if (selectedNames.length === 0) {
      setError('请输入包名');
      return;
    }

    void run('add', selectedSpecs, {
      dev,
      allowTrustedScripts: allowScripts,
      label: dev ? '已添加到开发依赖' : '已添加依赖',
    }).then((success) => {
      if (!success) return;
      setSpecs('');
      setAllowScripts(false);
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-4" />
              工作区依赖
            </DialogTitle>
            <DialogDescription>
              Bun 操作默认使用 --ignore-scripts。生命周期脚本只在包已加入 trustedDependencies 时允许。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(88vh-9rem)] space-y-5 overflow-y-auto pr-1">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  添加依赖
                </h2>
                <div className="flex items-center gap-2">
                  <Label htmlFor="deps-dev">开发依赖</Label>
                  <Switch
                    id="deps-dev"
                    checked={dev}
                    disabled={running}
                    onCheckedChange={setDev}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  value={specs}
                  disabled={running}
                  placeholder="react@^19.0.0, @scope/pkg"
                  onChange={(event) =>
                    setSpecs(event.target.value)
                  }
                />
                <Button
                  type="button"
                  disabled={running || specs.trim() === ''}
                  onClick={handleAdd}
                >
                  {running ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Package />
                  )}
                  添加
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border p-2">
                <div>
                  <Label htmlFor="deps-scripts">
                    允许可信脚本
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    仅当本次添加的包全部在 trustedDependencies 中时可用。
                  </p>
                </div>
                <Switch
                  id="deps-scripts"
                  checked={allowScripts}
                  disabled={running || !canAllowScripts}
                  onCheckedChange={setAllowScripts}
                />
              </div>

              {state && state.trustedDependencies.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  已信任：
                  {state.trustedDependencies.map((name) => (
                    <Badge key={name} variant="outline">
                      {name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  当前 package.json 没有 trustedDependencies。
                </p>
              )}
            </section>

            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  依赖列表
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={running || !state?.exists}
                  onClick={() =>
                    void run('update', [], {
                      label: '依赖已全部更新',
                    })
                  }
                >
                  <RefreshCw />
                  全部更新
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在读取 package.json…
                </div>
              ) : loadError ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {loadError}
                </p>
              ) : !state?.exists ? (
                <p className="text-sm text-muted-foreground">
                  package.json 不存在。
                </p>
              ) : groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  没有依赖。
                </p>
              ) : (
                <div className="space-y-4">
                  {groups.map(({ group, items }) => (
                    <div key={group} className="space-y-2">
                      <h3 className="text-xs font-medium text-muted-foreground">
                        {GROUP_LABELS[group]}
                      </h3>
                      <ul className="space-y-1">
                        {items.map((item) => (
                          <li
                            key={`${group}:${item.name}`}
                            className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5"
                          >
                            <span className="font-mono text-xs font-medium">
                              {item.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {item.version}
                            </span>
                            <Badge
                              variant={
                                item.installed
                                  ? 'secondary'
                                  : 'outline'
                              }
                            >
                              {item.installed
                                ? `已安装${item.installedVersion ? ` ${item.installedVersion}` : ''}`
                                : '未安装'}
                            </Badge>
                            {item.lifecycleScripts.length > 0 && (
                              <Badge variant="destructive">
                                脚本：{item.lifecycleScripts.join(', ')}
                              </Badge>
                            )}
                            {item.trusted && (
                              <Badge variant="outline">
                                已信任
                              </Badge>
                            )}
                            <div className="ml-auto flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={running}
                                onClick={() =>
                                  void run(
                                    'update',
                                    [item.name],
                                    {
                                      label: `已更新 ${item.name}`,
                                    },
                                  )
                                }
                              >
                                更新
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={running}
                                onClick={() =>
                                  setRemoveTarget(item)
                                }
                              >
                                <Trash2 />
                                移除
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {(logs.length > 0 || running) && (
              <section className="space-y-2 border-t pt-4">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  输出
                </h2>
                <pre
                  ref={logRef}
                  className="h-40 overflow-y-auto rounded-lg bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap"
                >
                  {logs.length > 0
                    ? logs.join('\n')
                    : '等待 bun 输出…'}
                </pre>
              </section>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span className="whitespace-pre-wrap">
                  {error}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        title="移除依赖？"
        description={`将从 package.json 移除 ${
          removeTarget?.name ?? ''
        } 并更新 lockfile。`}
        confirmLabel="移除"
        destructive
        onConfirm={() => {
          const target = removeTarget;
          setRemoveTarget(null);
          if (target) {
            void run('remove', [target.name], {
              label: `已移除 ${target.name}`,
            });
          }
        }}
        onOpenChange={(next) => {
          if (!next) setRemoveTarget(null);
        }}
      />
    </>
  );
}
