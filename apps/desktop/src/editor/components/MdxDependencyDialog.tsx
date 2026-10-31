import { useCallback, useEffect, useState } from "react";
import { Package, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { InlineAlert } from "@/components/common/inline-alert";
import {
  addMdxDependency,
  installMdxDeps,
  listMdxDeps,
  removeMdxDependency,
  type MdxDepsReport,
} from "@/lib/mdx";

export function MdxDependencyDialog({
  siteId,
  open,
  onOpenChange,
  onInstalled,
}: {
  siteId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: () => void;
}) {
  const [report, setReport] = useState<MdxDepsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");

  const refresh = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setReport(await listMdxDeps(siteId));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const apply = async (label: string, action: () => Promise<MdxDepsReport>) => {
    setBusy(label);
    setError(null);
    try {
      const next = await action();
      setReport(next);
      toast.success(label === "add" ? "依赖已安装" : "依赖已更新");
      onInstalled?.();
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleAdd = async () => {
    const packageName = name.trim();
    if (!packageName) {
      setError("请输入包名");
      return;
    }
    const ok = await apply("add", () =>
      addMdxDependency(siteId, packageName, version),
    );
    if (ok) {
      setName("");
      setVersion("");
    }
  };

  const handleRemove = async (packageName: string) => {
    await apply(`remove:${packageName}`, () =>
      removeMdxDependency(siteId, packageName),
    );
  };

  const handleInstallAll = async () => {
    await apply("install", () => installMdxDeps(siteId));
  };

  const dependencies = report?.dependencies ?? [];
  const disabled = busy !== null || loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-mdx-ui>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-4" />
            MDX 依赖
          </DialogTitle>
          <DialogDescription>
            第三方包只安装到当前站点；安装使用
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
              --ignore-scripts
            </code>
            ，不会执行包的 lifecycle 脚本。React / ReactDOM 由 MDX
            运行时提供，无需安装。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {report?.installed ? "依赖已安装" : "尚未安装依赖"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={() => void handleInstallAll()}
            >
              {busy === "install" ? (
                <Spinner className="size-3" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              重新安装
            </Button>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {loading && !report ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                <Spinner className="size-3" />
                读取依赖…
              </div>
            ) : dependencies.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                还没有站点依赖。下面的输入框可以添加 npm 包。
              </div>
            ) : (
              dependencies.map((dependency) => (
                <div
                  key={dependency.name}
                  className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">
                      {dependency.name}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {dependency.version
                        ? `已安装 ${dependency.version}`
                        : "未安装"}
                      <span className="mx-1">·</span>
                      {dependency.spec}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={`移除 ${dependency.name}`}
                    aria-label={`移除 ${dependency.name}`}
                    disabled={disabled}
                    onClick={() => void handleRemove(dependency.name)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {busy === `remove:${dependency.name}` ? (
                      <Spinner className="size-3" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>

          <form
            className="flex flex-col gap-2 border-t border-border pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAdd();
            }}
          >
            <span className="text-xs font-medium">添加依赖</span>
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="包名，如 nanoid 或 @scope/pkg"
                aria-label="包名"
                spellCheck={false}
                disabled={disabled}
              />
              <Input
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="版本（可选）"
                aria-label="版本"
                spellCheck={false}
                disabled={disabled}
                className="w-28 shrink-0"
              />
              <Button
                type="submit"
                size="sm"
                disabled={disabled || !name.trim()}
              >
                {busy === "add" ? (
                  <Spinner className="size-3" />
                ) : (
                  <Plus className="size-3" />
                )}
                添加
              </Button>
            </div>
          </form>

          {error ? <InlineAlert>{error}</InlineAlert> : null}

          {report?.output ? (
            <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px]">
              <summary className="cursor-pointer text-muted-foreground">
                安装输出
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-muted-foreground">
                {report.output}
              </pre>
            </details>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
