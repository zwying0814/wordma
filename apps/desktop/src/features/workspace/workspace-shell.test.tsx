import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EngineInspectResult } from '@/features/engine/api';
import type { WorkspaceInfo } from '@/features/workspace/api';

vi.mock('@/features/engine/api', () => ({
  inspectWithEngine: vi.fn(),
}));

vi.mock('@/features/workspace/files', () => ({
  readNote: vi.fn(),
  writeNote: vi.fn(),
  workspaceErrorMessage: (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      return `[${String(error.code)}] ${String(error.message)}`;
    }
    if (error instanceof Error) return error.message;
    return String(error);
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/editor/mdx-editor', () => ({
  MdxEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="MDX 编辑器"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import { inspectWithEngine } from '@/features/engine/api';
import {
  readNote,
  writeNote,
} from '@/features/workspace/files';
import { WorkspaceShell } from './workspace-shell';

const inspectMock = vi.mocked(inspectWithEngine);
const readNoteMock = vi.mocked(readNote);
const writeNoteMock = vi.mocked(writeNote);

const workspace: WorkspaceInfo = {
  path: '/tmp/demo',
  name: 'Demo',
};

function inspectResult(): EngineInspectResult {
  return {
    workspace: '/tmp/demo',
    themeId: 'default',
    site: {
      title: 'Demo',
      language: 'zh-CN',
      basePath: '',
    },
    theme: {
      id: 'default',
      displayName: 'Default',
      version: '0.1.0',
      path: '/tmp/demo/themes/default',
    },
    postFields: [],
    pageFields: [],
    pageTypes: [],
    pages: [],
    settings: [],
    settingsDefaults: {},
    settingsValues: {},
    entries: [
      {
        id: 'posts/one',
        collection: 'posts',
        kind: 'post',
        title: 'One',
        slug: 'one',
        relativePath: 'content/posts/one.mdx',
        draft: false,
      },
      {
        id: 'pages/two',
        collection: 'pages',
        kind: 'page',
        title: 'Two',
        slug: 'two',
        relativePath: 'content/pages/two.mdx',
        draft: true,
      },
    ],
    collections: [
      { name: 'posts', kind: 'post', count: 1 },
      { name: 'pages', kind: 'page', count: 1 },
    ],
    tags: [],
    categories: [],
    diagnostics: [],
  };
}

beforeEach(() => {
  inspectMock.mockReset();
  readNoteMock.mockReset();
  writeNoteMock.mockReset();

  inspectMock.mockResolvedValue(inspectResult());
  readNoteMock.mockImplementation((_root, path) =>
    Promise.resolve(path.endsWith('one.mdx') ? '# One' : '# Two'),
  );
  writeNoteMock.mockResolvedValue();
});

describe('WorkspaceShell', () => {
  it('分组展示笔记并自动打开第一篇', async () => {
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const editor = await screen.findByLabelText('MDX 编辑器');
    expect(editor).toHaveValue('# One');
    expect(
      screen.getByRole('heading', { name: '文章' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '页面' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Two/ }),
    ).toHaveTextContent('草稿');
    expect(readNoteMock).toHaveBeenCalledWith(
      '/tmp/demo',
      'content/posts/one.mdx',
    );
  });

  it('编辑后显示未保存并通过按钮保存', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const editor = await screen.findByLabelText('MDX 编辑器');
    fireEvent.change(editor, {
      target: { value: '# One edited' },
    });

    expect(screen.getByText('未保存')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: '保存' }),
    );

    await waitFor(() =>
      expect(writeNoteMock).toHaveBeenCalledWith(
        '/tmp/demo',
        'content/posts/one.mdx',
        '# One edited',
      ),
    );
    await waitFor(() =>
      expect(screen.getByText('已保存')).toBeInTheDocument(),
    );
    expect(inspectMock).toHaveBeenCalledTimes(2);
  });

  it('Cmd/Ctrl+S 触发保存', async () => {
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const editor = await screen.findByLabelText('MDX 编辑器');
    fireEvent.change(editor, {
      target: { value: '# Shortcut' },
    });
    fireEvent.keyDown(window, { key: 's', metaKey: true });

    await waitFor(() =>
      expect(writeNoteMock).toHaveBeenCalledWith(
        '/tmp/demo',
        'content/posts/one.mdx',
        '# Shortcut',
      ),
    );
  });

  it('未保存时切换文件需要确认', async () => {
    const user = userEvent.setup();
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValue(false);

    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const editor = await screen.findByLabelText('MDX 编辑器');
    fireEvent.change(editor, {
      target: { value: '# Unsaved' },
    });

    await user.click(
      screen.getByRole('button', { name: /One/ }),
    );
    expect(editor).toHaveValue('# Unsaved');
    expect(readNoteMock).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: /Two/ }),
    );
    expect(confirm).toHaveBeenCalledWith(
      '当前笔记有未保存修改，确定放弃并切换？',
    );
    expect(editor).toHaveValue('# Unsaved');
    expect(readNoteMock).toHaveBeenCalledTimes(1);

    confirm.mockReturnValue(true);
    await user.click(
      screen.getByRole('button', { name: /Two/ }),
    );

    await waitFor(async () =>
      expect(
        await screen.findByLabelText('MDX 编辑器'),
      ).toHaveValue('# Two'),
    );
    expect(readNoteMock).toHaveBeenLastCalledWith(
      '/tmp/demo',
      'content/pages/two.mdx',
    );
  });

  it('展示 inspect 诊断和保存错误', async () => {
    const result = inspectResult();
    result.diagnostics = [
      {
        code: 'MISSING_TITLE',
        severity: 'warning',
        source: 'content',
        message: '缺少标题',
        file: 'content/posts/one.mdx',
        line: 3,
        column: 1,
      },
    ];
    inspectMock.mockResolvedValue(result);
    writeNoteMock.mockRejectedValueOnce({
      code: 'WRITE_FAILED',
      message: '磁盘只读',
    });

    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    expect(await screen.findByText('[MISSING_TITLE]')).toBeInTheDocument();
    expect(screen.getByText('缺少标题')).toBeInTheDocument();
    expect(
      screen.getByText('content/posts/one.mdx:3:1'),
    ).toBeInTheDocument();

    const editor = await screen.findByLabelText('MDX 编辑器');
    fireEvent.change(editor, {
      target: { value: '# Broken' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: '保存' }),
    );

    expect(
      await screen.findByText('[WRITE_FAILED] 磁盘只读'),
    ).toBeInTheDocument();
    expect(screen.getByText('未保存')).toBeInTheDocument();
  });

  it('保存成功但诊断刷新失败时保留已保存状态', async () => {
    inspectMock
      .mockResolvedValueOnce(inspectResult())
      .mockRejectedValueOnce('engine inspect 失败');

    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const editor = await screen.findByLabelText('MDX 编辑器');
    fireEvent.change(editor, {
      target: { value: '# Saved' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: '保存' }),
    );

    expect(
      await screen.findByText('[EDITOR_ERROR]'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '保存成功，但刷新诊断失败：engine inspect 失败',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('已保存')).toBeInTheDocument();
  });
});
