import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';
import {
  loadWorkspaces,
  openWorkspace,
  pickWorkspaceFolder,
  removeRecentWorkspace,
  setAutoOpenLast as persistAutoOpenLast,
  type RecentWorkspace,
  type WorkspaceInfo,
} from '@/features/workspace/api';
import { WelcomeScreen } from '@/features/workspace/welcome-screen';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
import { stopPreview } from '@/features/preview/api';

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '发生未知错误';
}

async function setWindowTitle(workspaceName: string | null): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().setTitle(
    workspaceName ? `Wordma — ${workspaceName}` : 'Wordma',
  );
}

type PersistedState = {
  workspaces: RecentWorkspace[];
  autoOpenLast: boolean;
};

function App() {
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<RecentWorkspace[]>([]);
  const [autoOpenLast, setAutoOpenLast] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const initialized = useRef(false);

  const applyState = useCallback((state: PersistedState) => {
    setWorkspaces(state.workspaces);
    setAutoOpenLast(state.autoOpenLast);
  }, []);

  const open = useCallback(
    async (path: string) => {
      setOpeningPath(path);
      try {
        const info = await openWorkspace(path);
        setWorkspace(info);
      } catch (error) {
        toast.error(errorMessage(error));
        try {
          applyState(await loadWorkspaces());
        } catch {
          // 刷新失败时保留当前列表，错误已经通过 toast 暴露
        }
      } finally {
        setOpeningPath(null);
      }
    },
    [applyState],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (!isTauri()) {
      setLoading(false);
      toast.error('请在 Tauri 中运行：pnpm tauri dev');
      return;
    }

    void (async () => {
      try {
        const state = await loadWorkspaces();
        applyState(state);
        if (state.autoOpenLast && state.workspaces[0]?.exists) {
          await open(state.workspaces[0].path);
        }
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [applyState, open]);

  useEffect(() => {
    void setWindowTitle(workspace?.name ?? null).catch(() => {
      // 标题设置失败不影响主流程
    });
  }, [workspace]);

  const handleOpenFolder = useCallback(async () => {
    if (picking || openingPath) return;

    setPicking(true);
    try {
      const path = await pickWorkspaceFolder();
      if (path) await open(path);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPicking(false);
    }
  }, [open, openingPath, picking]);

  const handleRemove = useCallback(
    async (path: string) => {
      try {
        applyState(await removeRecentWorkspace(path));
        toast.success('已从列表移除');
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [applyState],
  );

  const handleReveal = useCallback(async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  const handleAutoOpenChange = useCallback(async (enabled: boolean) => {
    setAutoOpenLast(enabled);
    try {
      await persistAutoOpenLast(enabled);
    } catch (error) {
      setAutoOpenLast(!enabled);
      toast.error(errorMessage(error));
    }
  }, []);

  const handleSwitch = useCallback(async () => {
    try {
      await stopPreview();
    } catch {
      // 没有运行中的预览或 engine 时忽略
    }
    setWorkspace(null);
    try {
      applyState(await loadWorkspaces());
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [applyState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void handleOpenFolder();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleOpenFolder]);

  const busy = picking || openingPath !== null;

  return (
    <>
      {workspace ? (
        <WorkspaceShell workspace={workspace} onSwitch={handleSwitch} />
      ) : (
        <WelcomeScreen
          workspaces={workspaces}
          loading={loading}
          busy={busy}
          openingPath={openingPath}
          autoOpenLast={autoOpenLast}
          onOpenFolder={handleOpenFolder}
          onOpenWorkspace={open}
          onRemoveWorkspace={handleRemove}
          onRevealWorkspace={handleReveal}
          onAutoOpenLastChange={handleAutoOpenChange}
        />
      )}
      <Toaster />
    </>
  );
}

export default App;
