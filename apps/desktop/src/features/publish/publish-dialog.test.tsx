import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/engine/api', () => ({
  buildWithEngine: vi.fn(),
  onEngineLog: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import {
  buildWithEngine,
  onEngineLog,
} from '@/features/engine/api';

import { PublishDialog } from './publish-dialog';

const buildMock = vi.mocked(buildWithEngine);
const logMock = vi.mocked(onEngineLog);
const openDialogMock = vi.mocked(openDialog);
const openPathMock = vi.mocked(openPath);

function successResult() {
  return {
    code: 0,
    event: {
      v: 1,
      type: 'build-success',
      durationMs: 120,
      routes: 17,
      compiledEntries: 4,
      islands: 0,
      diagnostics: [],
    },
    stderr: '',
  };
}

function failureResult() {
  return {
    code: 1,
    event: {
      v: 1,
      type: 'build-error',
      durationMs: 0,
      diagnostics: [
        {
          code: 'MDX_PARSE_ERROR',
          severity: 'error',
          source: 'mdx',
          message: 'bad mdx',
          file: '/tmp/demo/content/posts/a.mdx',
          line: 3,
        },
      ],
    },
    stderr: '',
  };
}

function renderDialog() {
  const onOpenChange = vi.fn();
  render(
    <PublishDialog
      open
      onOpenChange={onOpenChange}
      workspacePath="/tmp/demo"
    />,
  );
  return onOpenChange;
}

beforeEach(() => {
  buildMock.mockReset();
  logMock.mockReset();
  openDialogMock.mockReset();
  openPathMock.mockReset();
  logMock.mockResolvedValue(() => {});
  openPathMock.mockResolvedValue();
});

describe('PublishDialog', () => {
  it('使用默认目录构建成功并可打开产物', async () => {
    const user = userEvent.setup();
    let resolveBuild:
      | ((value: ReturnType<typeof successResult>) => void)
      | undefined;
    buildMock.mockReturnValue(
      new Promise((resolve) => {
        resolveBuild = resolve;
      }),
    );
    let emitLog: ((event: {
      stream: string;
      line: string;
    }) => void) | undefined;
    logMock.mockImplementation(async (handler) => {
      emitLog = handler as typeof emitLog;
      return () => {};
    });

    renderDialog();

    expect(
      screen.getByLabelText('输出目录'),
    ).toHaveValue('/tmp/demo/.wordma/dist');

    await user.click(
      screen.getByRole('button', { name: '开始发布' }),
    );
    expect(
      await screen.findByText('正在构建静态站点…'),
    ).toBeInTheDocument();
    await waitFor(() => expect(emitLog).toBeDefined());

    act(() => {
      emitLog?.({
        stream: 'stderr',
        line: 'building pages',
      });
    });
    expect(
      await screen.findByText(/building pages/),
    ).toBeInTheDocument();

    act(() => {
      resolveBuild?.(successResult());
    });

    expect(
      await screen.findByText('发布完成'),
    ).toBeInTheDocument();
    expect(screen.getByText('17 个路由')).toBeInTheDocument();
    expect(buildMock).toHaveBeenCalledWith(
      '/tmp/demo',
      undefined,
    );

    await user.click(
      screen.getByRole('button', { name: '打开目录' }),
    );
    expect(openPathMock).toHaveBeenCalledWith(
      '/tmp/demo/.wordma/dist',
    );
  });

  it('可选择目录并在失败后重试', async () => {
    const user = userEvent.setup();
    openDialogMock.mockResolvedValue('/tmp/output');
    buildMock.mockResolvedValue(failureResult());
    renderDialog();

    await user.click(
      screen.getByRole('button', { name: '选择' }),
    );
    expect(
      screen.getByLabelText('输出目录'),
    ).toHaveValue('/tmp/output');

    await user.click(
      screen.getByRole('button', { name: '开始发布' }),
    );

    expect(
      await screen.findByText('发布失败'),
    ).toBeInTheDocument();
    expect(screen.getByText('bad mdx')).toBeInTheDocument();
    expect(buildMock).toHaveBeenCalledWith(
      '/tmp/demo',
      '/tmp/output',
    );

    await user.click(
      screen.getByRole('button', { name: '重试' }),
    );
    await waitFor(() =>
      expect(buildMock).toHaveBeenCalledTimes(2),
    );
  });

  it('输出目录校验失败时显示错误', async () => {
    const user = userEvent.setup();
    buildMock.mockRejectedValue(
      '发布目录非空且不是 Wordma 产物：/tmp/output',
    );
    renderDialog();

    await user.click(
      screen.getByRole('button', { name: '开始发布' }),
    );

    expect(
      await screen.findByText(
        '发布目录非空且不是 Wordma 产物：/tmp/output',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('发布失败')).toBeInTheDocument();
  });

  it('构建前可以取消', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderDialog();

    await user.click(
      screen.getByRole('button', { name: '取消' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(buildMock).not.toHaveBeenCalled();
  });
});
