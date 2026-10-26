import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  FolderOpen,
  Loader2,
  Palette,
  Play,
  Save,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { MdxEditor } from '@/features/editor/mdx-editor';
import {
  inspectWithEngine,
  type EngineDiagnostic,
  type EngineInspectEntry,
  type EngineInspectResult,
} from '@/features/engine/api';
import {
  readNote,
  writeNote,
  workspaceErrorMessage,
} from '@/features/workspace/files';

import type { WorkspaceInfo } from './api';

type WorkspaceShellProps = {
  workspace: WorkspaceInfo;
  onSwitch: () => void;
};

const COLLECTION_LABELS: Record<string, string> = {
  posts: '文章',
  pages: '页面',
};

function collectionLabel(name: string): string {
  return COLLECTION_LABELS[name] ?? name;
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

type NoteGroup = {
  collection: string;
  entries: EngineInspectEntry[];
};

function groupEntries(
  entries: EngineInspectEntry[],
): NoteGroup[] {
  const groups = new Map<string, EngineInspectEntry[]>();

  for (const entry of entries) {
    const list = groups.get(entry.collection) ?? [];
    list.push(entry);
    groups.set(entry.collection, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([collection, items]) => ({
      collection,
      entries: items,
    }));
}

export function WorkspaceShell({
  workspace,
  onSwitch,
}: WorkspaceShellProps) {
  const [inspect, setInspect] =
    useState<EngineInspectResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(
    null,
  );
  const [selectedPath, setSelectedPath] = useState<
    string | null
  >(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<
    string | null
  >(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const loadGeneration = useRef(0);
  const dirty = content !== savedContent;

  const note = inspect?.entries.find(
    (entry) => entry.relativePath === selectedPath,
  );
  const groups = groupEntries(inspect?.entries ?? []);
  const diagnostics = [
    ...(inspect?.diagnostics ?? []),
    ...(editorError
      ? [
          {
            code: 'EDITOR_ERROR',
            severity: 'error' as const,
            source: 'editor',
            message: editorError,
          },
        ]
      : []),
  ];

  const loadNote = useCallback(
    async (entry: EngineInspectEntry, force = false) => {
      if (!force && entry.relativePath === selectedPath) {
        return;
      }

      if (
        !force &&
        dirty &&
        selectedPath !== entry.relativePath
      ) {
        const confirmed = window.confirm(
          '当前笔记有未保存修改，确定放弃并切换？',
        );
        if (!confirmed) return;
      }

      const generation = ++loadGeneration.current;
      setSelectedPath(entry.relativePath);
      setReading(true);
      setEditorError(null);
      setContent('');

      try {
        const text = await readNote(
          workspace.path,
          entry.relativePath,
        );
        if (generation !== loadGeneration.current) return;
        setContent(text);
        setSavedContent(text);
      } catch (error) {
        if (generation !== loadGeneration.current) return;
        const message = workspaceErrorMessage(error);
        setContent('');
        setSavedContent('');
        setEditorError(message);
        toast.error(message);
      } finally {
        if (generation === loadGeneration.current) {
          setReading(false);
        }
      }
    },
    [dirty, selectedPath, workspace.path],
  );

  const refreshInspect = useCallback(async () => {
    const result = await inspectWithEngine(workspace.path);
    setInspect(result);
    return result;
  }, [workspace.path]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSelectedPath(null);
    setContent('');
    setSavedContent('');
    setEditorError(null);

    void (async () => {
      try {
        const result = await inspectWithEngine(
          workspace.path,
        );
        if (cancelled) return;

        setInspect(result);
        const first = result.entries[0];

        if (first) {
          setSelectedPath(first.relativePath);
          setReading(true);
          try {
            const text = await readNote(
              workspace.path,
              first.relativePath,
            );
            if (cancelled) return;
            setContent(text);
            setSavedContent(text);
          } catch (error) {
            if (cancelled) return;
            setEditorError(workspaceErrorMessage(error));
          } finally {
            if (!cancelled) setReading(false);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(workspaceErrorMessage(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace.path]);

  const save = useCallback(async () => {
    if (
      !selectedPath ||
      !dirty ||
      saving ||
      reading
    ) {
      return;
    }

    setSaving(true);
    setEditorError(null);

    try {
      await writeNote(
        workspace.path,
        selectedPath,
        content,
      );
      setSavedContent(content);
      toast.success('已保存');

      try {
        await refreshInspect();
      } catch (error) {
        setEditorError(
          `保存成功，但刷新诊断失败：${workspaceErrorMessage(error)}`,
        );
      }
    } catch (error) {
      const message = workspaceErrorMessage(error);
      setEditorError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [
    content,
    dirty,
    reading,
    refreshInspect,
    saving,
    selectedPath,
    workspace.path,
  ]);

  saveRef.current = save;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault();
        void saveRef.current();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () =>
      window.removeEventListener('keydown', onKeyDown);
  }, []);

  const requestSwitch = () => {
    if (
      dirty &&
      !window.confirm(
        '当前笔记有未保存修改，确定切换空间？',
      )
    ) {
      return;
    }

    onSwitch();
  };

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          正在读取工作区…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="sm" onClick={requestSwitch}>
          <ArrowLeft />
          切换空间
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {workspace.name}
          </span>
          <span className="hidden truncate text-xs text-muted-foreground lg:inline">
            {workspace.path}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!dirty || saving || reading}
          >
            {saving ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Save />
            )}
            保存
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled
            title="预览将在 M7.10 接入"
          >
            <Play />
            预览
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled
            title="发布将在 M7.11 接入"
          >
            <Upload />
            发布
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled
            title="主题设置将在 M7.6 接入"
          >
            <Palette />
          </Button>
        </div>
      </header>

      {loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <AlertTriangle className="size-8 text-destructive" />
          <p className="max-w-lg text-center text-sm text-muted-foreground">
            {loadError}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              void refreshInspect()
                .catch((error) => {
                  setLoadError(
                    workspaceErrorMessage(error),
                  );
                })
                .finally(() => setLoading(false));
            }}
          >
            重试
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-60 shrink-0 flex-col border-r">
            <div className="flex h-10 items-center px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              笔记
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {groups.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  还没有笔记。
                </p>
              ) : (
                groups.map((group) => (
                  <section
                    key={group.collection}
                    className="mb-3"
                  >
                    <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {collectionLabel(group.collection)}
                    </h2>
                    <ul>
                      {group.entries.map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() =>
                              void loadNote(entry)
                            }
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                              entry.relativePath ===
                              selectedPath
                                ? 'bg-muted font-medium'
                                : 'hover:bg-muted/60'
                            }`}
                          >
                            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">
                              {entry.title}
                            </span>
                            {entry.draft && (
                              <Badge
                                variant="outline"
                                className="ml-auto text-[10px]"
                              >
                                草稿
                              </Badge>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
              <span className="truncate">
                {note?.relativePath ?? '未选择笔记'}
              </span>
              <span className="ml-auto shrink-0">
                {reading
                  ? '读取中…'
                  : saving
                    ? '保存中…'
                    : dirty
                      ? '未保存'
                      : '已保存'}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              {selectedPath ? (
                reading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    正在读取笔记…
                  </div>
                ) : (
                  <MdxEditor
                    key={selectedPath}
                    value={content}
                    readOnly={saving}
                    onChange={setContent}
                    onSave={() => void save()}
                  />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  选择左侧笔记开始编辑
                </div>
              )}
            </div>
          </main>

          <aside className="hidden w-72 shrink-0 flex-col border-l lg:flex">
            <div className="flex h-10 items-center px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              属性
            </div>
            <div className="space-y-3 border-b px-3 pb-4 text-sm">
              {note ? (
                <>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      标题
                    </div>
                    <div className="font-medium">{note.title}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">
                        类型
                      </div>
                      <div>{note.type ?? note.kind}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">
                        Slug
                      </div>
                      <div className="truncate">{note.slug}</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    完整字段编辑将在 M7.5 接入。
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  未选择笔记
                </p>
              )}
            </div>

            <div className="flex h-10 items-center gap-2 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              诊断
              {diagnostics.length > 0 && (
                <Badge variant="secondary">
                  {diagnostics.length}
                </Badge>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              {diagnostics.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  没有问题
                </p>
              ) : (
                <ul className="space-y-2">
                  {diagnostics.map((diagnostic, index) => (
                    <li
                      key={`${diagnostic.code}-${index}`}
                      className="rounded-md border p-2 text-xs"
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
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
