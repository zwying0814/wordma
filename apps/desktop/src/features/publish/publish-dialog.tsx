import { useEffect, useMemo, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  buildWithEngine,
  onEngineLog,
  type EngineDiagnostic,
} from '@/features/engine/api';

type PublishDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspacePath: string;
};

type PublishResult =
  | {
      kind: 'success';
      outDir: string;
      routes: number;
      durationMs?: number;
      diagnostics: EngineDiagnostic[];
    }
  | {
      kind: 'error';
      outDir: string;
      diagnostics: EngineDiagnostic[];
      message: string;
    };

function defaultOutDir(workspacePath: string): string {
  const separator = workspacePath.includes('\\') ? '\\' : '/';
  const root = workspacePath.replace(/[\\/]+$/, '');

  return `${root}${separator}.wordma${separator}dist`;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '发布失败';
}

function diagnosticLocation(
  diagnostic: EngineDiagnostic,
): string | undefined {
  if (!diagnostic.file) return undefined;

  return `${diagnostic.file}${
    diagnostic.line === undefined
      ? ''
      : `:${diagnostic.line}${
          diagnostic.column === undefined
            ? ''
            : `:${diagnostic.column}`
        }`
  }`;
}

export function PublishDialog({
  open,
  onOpenChange,
  workspacePath,
}: PublishDialogProps) {
  const [selectedDir, setSelectedDir] = useState<
    string | null
  >(null);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] =
    useState<PublishResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const outDir =
    selectedDir ?? defaultOutDir(workspacePath);

  useEffect(() => {
    if (!open) return;
    setSelectedDir(null);
    setResult(null);
    setLogs([]);
    setPublishing(false);
  }, [open]);

  useEffect(() => {
    if (!publishing) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void onEngineLog((event) => {
      setLogs((current) =>
        [...current, event.line].slice(-300),
      );
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => {
        // 日志失败不影响构建结果
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [publishing]);

  const diagnostics = useMemo(
    () => result?.diagnostics ?? [],
    [result],
  );

  const chooseDirectory = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: '选择发布目录',
      });

      if (typeof selected === 'string') {
        setSelectedDir(selected);
        setResult(null);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const publish = async () => {
    setPublishing(true);
    setResult(null);
    setLogs([]);

    try {
      const outcome = await buildWithEngine(
        workspacePath,
        selectedDir ?? undefined,
      );
      const event = outcome.event;
      const eventDiagnostics = Array.isArray(
        event?.diagnostics,
      )
        ? (event?.diagnostics as EngineDiagnostic[])
        : [];
      const success =
        outcome.code === 0 &&
        event?.type === 'build-success';

      if (success) {
        setResult({
          kind: 'success',
          outDir,
          routes:
            typeof event?.routes === 'number'
              ? event.routes
              : 0,
          durationMs:
            typeof event?.durationMs === 'number'
              ? event.durationMs
              : undefined,
          diagnostics: eventDiagnostics,
        });
        toast.success('发布完成');
      } else {
        const message =
          eventDiagnostics.length > 0
            ? eventDiagnostics
                .map((diagnostic) => diagnostic.message)
                .join('\n')
            : outcome.stderr.trim() ||
              `build 退出码：${outcome.code ?? 'unknown'}`;
        setResult({
          kind: 'error',
          outDir,
          diagnostics: eventDiagnostics,
          message,
        });
        toast.error('发布失败');
      }
    } catch (error) {
      const message = errorMessage(error);
      setResult({
        kind: 'error',
        outDir,
        diagnostics: [],
        message,
      });
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  const openOutput = async () => {
    try {
      await openPath(outDir);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (publishing && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[88vh] overflow-hidden sm:max-w-2xl"
        showCloseButton={!publishing}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4" />
            发布站点
          </DialogTitle>
          <DialogDescription>
            构建静态产物到本地目录，不上传、不压缩。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(88vh-9rem)] space-y-4 overflow-y-auto pr-1">
          <section className="space-y-2">
            <Label htmlFor="publish-out-dir">输出目录</Label>
            <div className="flex gap-2">
              <Input
                id="publish-out-dir"
                value={outDir}
                readOnly
                disabled={publishing}
              />
              <Button
                type="button"
                variant="outline"
                disabled={publishing}
                onClick={() => void chooseDirectory()}
              >
                <FolderOpen />
                选择
              </Button>
            </div>
            <p className="font-mono text-[11px] break-all text-muted-foreground">
              {outDir}
            </p>
            <p className="text-xs text-muted-foreground">
              目录必须为空、或包含之前的
              .wordma-manifest.json，否则不会构建。
            </p>
          </section>

          {publishing && (
            <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在构建静态站点…
            </div>
          )}

          {result?.kind === 'success' && (
            <section className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                发布完成
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">
                  {result.routes} 个路由
                </Badge>
                {result.durationMs !== undefined && (
                  <Badge variant="outline">
                    {result.durationMs} ms
                  </Badge>
                )}
              </div>
              <p className="font-mono text-xs break-all text-muted-foreground">
                {result.outDir}
              </p>
            </section>
          )}

          {result?.kind === 'error' && (
            <section className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="size-4" />
                发布失败
              </div>
              {result.diagnostics.length === 0 ? (
                <p className="whitespace-pre-wrap text-xs text-destructive">
                  {result.message}
                </p>
              ) : (
                <ul className="space-y-2">
                  {result.diagnostics.map(
                    (diagnostic, index) => (
                      <li
                        key={`${diagnostic.code}-${index}`}
                        className="rounded-md border border-destructive/30 bg-background/40 p-2 text-xs"
                      >
                        <div className="font-mono text-[11px] text-muted-foreground">
                          [{diagnostic.code}]
                        </div>
                        <div className="mt-1">
                          {diagnostic.message}
                        </div>
                        {diagnosticLocation(diagnostic) && (
                          <div className="mt-1 font-mono text-[10px] break-all text-muted-foreground">
                            {diagnosticLocation(diagnostic)}
                          </div>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          )}

          {diagnostics.length > 0 &&
            result?.kind === 'success' && (
              <section className="space-y-1 text-xs text-muted-foreground">
                <div>
                  构建诊断：{diagnostics.length} 条（产物仍已生成）
                </div>
                <ul className="space-y-1">
                  {diagnostics.map(
                    (diagnostic, index) => (
                      <li key={`${diagnostic.code}-${index}`}>
                        [{diagnostic.code}] {diagnostic.message}
                      </li>
                    ),
                  )}
                </ul>
              </section>
            )}

          {logs.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                构建输出
              </h2>
              <pre className="max-h-40 overflow-y-auto rounded-lg bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">
                {logs.join('\n')}
              </pre>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={publishing}
            onClick={() => onOpenChange(false)}
          >
            {result ? '关闭' : '取消'}
          </Button>
          {result?.kind === 'success' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void openOutput()}
            >
              <FolderOpen />
              打开目录
            </Button>
          )}
          {result?.kind === 'error' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void publish()}
            >
              重试
            </Button>
          )}
          <Button
            type="button"
            disabled={publishing}
            onClick={() => void publish()}
          >
            {publishing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Upload />
            )}
            开始发布
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
