import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import {
  Code2,
  Columns2,
  Eye,
  Package,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_MDX_SOURCE } from "@wordma/editor-schema";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSite } from "@/context/SiteContext";
import { compileMdx, type MdxCompileError, type MdxCompileResult } from "@/lib/mdx";
import { cn } from "@/lib/utils";
import { MdxDependencyDialog } from "../components/MdxDependencyDialog";

const MdxSourceEditor = lazy(() =>
  import("../components/MdxSourceEditor").then((module) => ({
    default: module.MdxSourceEditor,
  })),
);

type ViewMode = "preview" | "source" | "split";

const VIEWS: { mode: ViewMode; label: string; icon: LucideIcon }[] = [
  { mode: "preview", label: "预览", icon: Eye },
  { mode: "source", label: "源码", icon: Code2 },
  { mode: "split", label: "分栏", icon: Columns2 },
];

function ViewButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "text-muted-foreground",
        active && "bg-accent text-accent-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}

function ErrorPanel({
  error,
  onShowSource,
  onManageDeps,
}: {
  error: MdxCompileError;
  onShowSource: () => void;
  onManageDeps: () => void;
}) {
  return (
    <div className="flex min-h-[160px] flex-col gap-2 bg-destructive/5 p-3 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-destructive">
        <TriangleAlert className="size-3.5" />
        MDX 编译失败
        {error.line ? (
          <span className="font-normal text-muted-foreground">
            第 {error.line} 行
            {error.column ? `，第 ${error.column} 列` : ""}
          </span>
        ) : null}
      </div>
      <div className="whitespace-pre-wrap text-foreground/90">{error.message}</div>
      {error.frame ? (
        <pre className="max-h-40 overflow-auto rounded bg-muted/60 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {error.frame}
        </pre>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="xs" onClick={onShowSource}>
          查看源码
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onManageDeps}
          className="text-muted-foreground"
        >
          <Package className="size-3" />
          管理依赖
        </Button>
      </div>
    </div>
  );
}

/** 编辑器内 MDX 块：预览 / 源码 / 分栏 */
export function MdxBlockView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: ReactNodeViewProps) {
  const { activeSite } = useSite();
  const siteId = activeSite?.id ?? 0;
  const blockId =
    typeof node.attrs.blockId === "string" && node.attrs.blockId
      ? node.attrs.blockId
      : "mdx";
  const source =
    typeof node.attrs.source === "string" ? node.attrs.source : "";

  const [view, setView] = useState<ViewMode>("preview");
  const [draft, setDraft] = useState(source);
  const [compiled, setCompiled] = useState<MdxCompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<MdxCompileError | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [depsOpen, setDepsOpen] = useState(false);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const focusedRef = useRef(false);
  const lastSourceRef = useRef(source);
  const lastCompiledRef = useRef<string | null>(null);
  const compileTokenRef = useRef(0);
  const commitTimerRef = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 外部来源变化（撤销、重新加载）同步到本地草稿；编辑中不打断光标
  useEffect(() => {
    if (focusedRef.current) return;
    if (source === lastSourceRef.current) return;
    lastSourceRef.current = source;
    setDraft(source);
  }, [source]);

  const commit = useCallback(
    (next: string) => {
      if (next === lastSourceRef.current) return;
      lastSourceRef.current = next;
      updateAttributes({ source: next });
    },
    [updateAttributes],
  );

  const scheduleCommit = useCallback(
    (next: string) => {
      if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = window.setTimeout(() => commit(next), 450);
    },
    [commit],
  );

  useEffect(
    () => () => {
      if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const runCompile = useCallback(
    async (next: string) => {
      if (!siteId) return;
      if (!next.trim()) {
        setError(null);
        setCompiled(null);
        lastCompiledRef.current = null;
        return;
      }
      const token = ++compileTokenRef.current;
      setCompiling(true);
      setRuntimeError(null);
      try {
        const result = await compileMdx(siteId, blockId, next);
        if (token !== compileTokenRef.current) return;
        if (!result.ok) {
          setError(result.error ?? { message: "MDX 编译失败" });
          setCompiled(null);
          lastCompiledRef.current = null;
        } else {
          setError(null);
          setCompiled(result);
          lastCompiledRef.current = next;
        }
      } catch (cause) {
        if (token !== compileTokenRef.current) return;
        setError({ message: String(cause) });
      } finally {
        if (token === compileTokenRef.current) setCompiling(false);
      }
    },
    [siteId, blockId],
  );

  // 草稿变化后防抖编译；源码视图只在切换/手动刷新时编译
  useEffect(() => {
    if (view === "source") return;
    if (!draft.trim()) {
      setCompiled(null);
      setError(null);
      lastCompiledRef.current = null;
      return;
    }
    if (lastCompiledRef.current === draft && compiled?.url) return;
    const timer = window.setTimeout(() => {
      void runCompile(draft);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, view, compiled?.url, runCompile]);

  // 沙箱预览通过 postMessage 报运行时错误
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; message?: unknown } | null;
      if (data?.type === "wordma-mdx-error") {
        setRuntimeError(String(data.message ?? "MDX 运行失败"));
      } else if (data?.type === "wordma-mdx-ready") {
        setRuntimeError(null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleSourceChange = (next: string) => {
    setDraft(next);
    scheduleCommit(next);
  };

  const handleSourceBlur = () => {
    focusedRef.current = false;
    commit(draftRef.current);
  };

  const handleEscape = () => {
    commit(draftRef.current);
    focusedRef.current = false;
    const pos = getPos();
    if (typeof pos === "number") {
      editor.chain().focus().setNodeSelection(pos).run();
    }
  };

  const handleRun = () => {
    commit(draftRef.current);
    void runCompile(draftRef.current);
  };

  const handleRefresh = () => {
    commit(draftRef.current);
    void runCompile(draftRef.current);
  };

  const useSample = () => {
    setDraft(DEFAULT_MDX_SOURCE);
    commit(DEFAULT_MDX_SOURCE);
    void runCompile(DEFAULT_MDX_SOURCE);
  };

  const showSource = () => setView("source");
  const shortId = blockId.replace(/^mdx_/, "").slice(0, 8);
  // 12739 预览与 Tauri 应用不同源；开 allow-same-origin 才能加载 ESM，
  // 但父窗口仍被跨源隔离。若意外同源则退回不开放的沙箱。
  const previewOrigin = (() => {
    if (!compiled?.url) return null;
    try {
      return new URL(compiled.url).origin;
    } catch {
      return null;
    }
  })();
  const sandbox = `allow-scripts${
    previewOrigin && previewOrigin !== window.location.origin
      ? " allow-same-origin"
      : ""
  }`;

  const sourcePane = (
    <div
      className="h-[320px] min-w-0 bg-muted/20"
      data-mdx-ui
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            加载源码编辑器…
          </div>
        }
      >
        <MdxSourceEditor
          value={draft}
          onChange={handleSourceChange}
          onRun={handleRun}
          onEscape={handleEscape}
          onFocusChange={(focused) => {
            focusedRef.current = focused;
            if (!focused) handleSourceBlur();
          }}
          className="h-full"
        />
      </Suspense>
    </div>
  );

  const previewPane = error ? (
    <div data-mdx-ui>
      <ErrorPanel
        error={error}
        onShowSource={showSource}
        onManageDeps={() => setDepsOpen(true)}
      />
    </div>
  ) : (
    <div className="relative h-[320px] bg-white">
      {compiled?.url ? (
        <iframe
          ref={iframeRef}
          key={compiled.url}
          src={compiled.url}
          title="MDX 预览"
          sandbox={sandbox}
          className="h-full w-full border-0"
        />
      ) : compiling ? (
        <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          正在编译…
        </div>
      ) : !draft.trim() ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>这个 MDX 块还没有内容。</span>
          <Button type="button" variant="outline" size="xs" onClick={useSample}>
            <Sparkles className="size-3" />
            填入示例
          </Button>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          等待编译…
        </div>
      )}
      {compiling && compiled?.url ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-background/90 px-1.5 py-1 text-[10px] text-muted-foreground shadow-sm">
          <Spinner className="size-2.5" />
          编译中
        </div>
      ) : null}
      {runtimeError ? (
        <div className="absolute inset-x-0 bottom-0 border-t border-destructive/30 bg-destructive/95 px-3 py-2 text-[11px] text-destructive-foreground">
          运行错误：{runtimeError}
        </div>
      ) : null}
    </div>
  );

  return (
    <NodeViewWrapper
      className={cn(
        "mdx-block my-3 overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        selected && "ring-2 ring-primary/30",
      )}
      contentEditable={false}
      data-mdx-block={blockId}
    >
      <div
        className="flex flex-wrap items-center gap-1.5 border-b border-border px-2.5 py-1.5"
        data-mdx-ui
      >
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">
          MDX
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {shortId}
        </span>
        {compiling ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Spinner className="size-3" />
            编译中
          </span>
        ) : error ? (
          <span className="text-[11px] text-destructive">编译失败</span>
        ) : runtimeError ? (
          <span className="text-[11px] text-destructive">运行错误</span>
        ) : compiled ? (
          <span className="text-[11px] text-muted-foreground">已编译</span>
        ) : null}
        <div className="flex-1" />
        {VIEWS.map(({ mode, label, icon }) => (
          <ViewButton
            key={mode}
            active={view === mode}
            label={label}
            icon={icon}
            onClick={() => setView(mode)}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="MDX 依赖"
          aria-label="MDX 依赖"
          onClick={() => setDepsOpen(true)}
          className="text-muted-foreground"
        >
          <Package className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="重新编译"
          aria-label="重新编译"
          onClick={handleRefresh}
          className="text-muted-foreground"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      {view === "source" ? (
        sourcePane
      ) : view === "split" ? (
        <div className="mdx-block-split">{sourcePane}{previewPane}</div>
      ) : (
        previewPane
      )}
      <MdxDependencyDialog
        siteId={siteId}
        open={depsOpen}
        onOpenChange={setDepsOpen}
        onInstalled={() => {
          lastCompiledRef.current = null;
          void runCompile(draftRef.current);
        }}
      />
    </NodeViewWrapper>
  );
}
