import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EngineInspectResult } from '@/features/engine/api';
import type { WorkspaceInfo } from '@/features/workspace/api';

vi.mock('@/features/engine/api', () => ({
  inspectWithEngine: vi.fn(),
  listThemesWithEngine: vi.fn(),
  applyThemeWithEngine: vi.fn(),
  applyThemeSettingsWithEngine: vi.fn(),
  buildWithEngine: vi.fn(),
  onEngineLog: vi.fn(),
}));

vi.mock('@/features/workspace/files', () => ({
  readNote: vi.fn(),
  writeNote: vi.fn(),
  createNote: vi.fn(),
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

vi.mock('@/features/dependencies/api', () => ({
  listDependencies: vi.fn(),
  installDependencies: vi.fn(),
  onDependencyLog: vi.fn(),
  dependencyErrorMessage: (error: unknown) =>
    String(error),
}));

vi.mock('@/features/preview/api', () => ({
  startPreview: vi.fn(),
  stopPreview: vi.fn(),
  getPreviewStatus: vi.fn(),
  onPreviewState: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
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

import { inspectWithEngine, listThemesWithEngine } from '@/features/engine/api';
import {
  installDependencies,
  listDependencies,
  onDependencyLog,
} from '@/features/dependencies/api';
import {
  getPreviewStatus,
  onPreviewState,
  startPreview,
  stopPreview,
} from '@/features/preview/api';
import type { PreviewState } from '@/features/preview/api';
import {
  createNote,
  readNote,
  writeNote,
} from '@/features/workspace/files';
import { WorkspaceShell } from './workspace-shell';

const inspectMock = vi.mocked(inspectWithEngine);
const listThemesMock = vi.mocked(listThemesWithEngine);
const listDependenciesMock = vi.mocked(listDependencies);
const installDependenciesMock = vi.mocked(
  installDependencies,
);
const onDependencyLogMock = vi.mocked(onDependencyLog);
const startPreviewMock = vi.mocked(startPreview);
const stopPreviewMock = vi.mocked(stopPreview);
const getPreviewStatusMock = vi.mocked(getPreviewStatus);
const onPreviewStateMock = vi.mocked(onPreviewState);
let emitPreviewState:
  | ((state: PreviewState) => void)
  | null = null;
const readNoteMock = vi.mocked(readNote);
const writeNoteMock = vi.mocked(writeNote);
const createNoteMock = vi.mocked(createNote);

const workspace: WorkspaceInfo = {
  path: '/tmp/demo',
  name: 'Demo',
};

const oneSource = `---
# keep this comment
title: One
customKey: keep
theme:
  wordma-theme-default:
    heroStyle: wide
---

# One`;

const twoSource = `---
title: Two
---

# Two`;

function inspectResult(): EngineInspectResult {
  return {
    workspace: '/tmp/demo',
    themeId: 'wordma-theme-default',
    site: {
      title: 'Demo',
      language: 'zh-CN',
      basePath: '',
    },
    theme: {
      id: 'wordma-theme-default',
      displayName: 'Default',
      version: '0.1.0',
      path: '/tmp/demo/themes/default',
    },
    postFields: [
      {
        key: 'heroStyle',
        label: '封面样式',
        type: 'select',
        options: [
          { label: '宽图', value: 'wide' },
          { label: '卡片', value: 'card' },
        ],
        default: 'wide',
      },
      {
        key: 'featured',
        label: '推荐',
        type: 'switch',
        default: false,
      },
    ],
    pageFields: [],
    pageTypes: [
      {
        id: 'project',
        label: '项目',
        route: '/projects/[slug]',
        layout: 'project',
        collection: 'projects',
        fields: [
          {
            key: 'repo',
            label: '仓库地址',
            type: 'text',
          },
        ],
      },
    ],
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
      { name: 'projects', kind: 'page', count: 0 },
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
  createNoteMock.mockReset();
  listThemesMock.mockReset();
  listThemesMock.mockResolvedValue([]);
  listDependenciesMock.mockReset();
  listDependenciesMock.mockResolvedValue({
    exists: false,
    dependencies: [],
    trustedDependencies: [],
  });
  onDependencyLogMock.mockReset();
  onDependencyLogMock.mockResolvedValue(() => {});
  installDependenciesMock.mockReset();
  installDependenciesMock.mockResolvedValue({
    operationId: 'op-test',
    success: true,
    code: 0,
    stdout: '',
    stderr: '',
    restartedEngine: false,
  });
  emitPreviewState = null;
  startPreviewMock.mockReset();
  startPreviewMock.mockResolvedValue({
    open: true,
    url: 'http://127.0.0.1:4321/',
  });
  stopPreviewMock.mockReset();
  stopPreviewMock.mockResolvedValue();
  getPreviewStatusMock.mockReset();
  getPreviewStatusMock.mockResolvedValue({ open: false });
  onPreviewStateMock.mockReset();
  onPreviewStateMock.mockImplementation(async (handler) => {
    emitPreviewState = handler;
    return () => {};
  });

  inspectMock.mockResolvedValue(inspectResult());
  readNoteMock.mockImplementation((_root, path) =>
    Promise.resolve(
      path.endsWith('one.mdx') ? oneSource : twoSource,
    ),
  );
  writeNoteMock.mockResolvedValue();
});

describe('WorkspaceShell', () => {
  it('分组展示笔记并自动打开第一篇', async () => {
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const editor = await screen.findByLabelText('MDX 编辑器');
    expect(editor).toHaveValue(oneSource);
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
    const edited = oneSource.replace('# One', '# One edited');
    fireEvent.change(editor, {
      target: { value: edited },
    });

    expect(screen.getByText('未保存')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: '保存' }),
    );

    await waitFor(() =>
      expect(writeNoteMock).toHaveBeenCalledWith(
        '/tmp/demo',
        'content/posts/one.mdx',
        edited,
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
    const shortcut = oneSource.replace('# One', '# Shortcut');
    fireEvent.change(editor, {
      target: { value: shortcut },
    });
    fireEvent.keyDown(window, { key: 's', metaKey: true });

    await waitFor(() =>
      expect(writeNoteMock).toHaveBeenCalledWith(
        '/tmp/demo',
        'content/posts/one.mdx',
        shortcut,
      ),
    );
  });

  it('未保存时切换文件需要确认', async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const editor = await screen.findByLabelText('MDX 编辑器');
    const unsaved = oneSource.replace('# One', '# Unsaved');
    fireEvent.change(editor, {
      target: { value: unsaved },
    });

    await user.click(
      screen.getByRole('button', { name: /One/ }),
    );
    expect(editor).toHaveValue(unsaved);
    expect(readNoteMock).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: /Two/ }),
    );
    expect(
      await screen.findByText('放弃未保存修改？'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: '取消' }),
    );
    expect(editor).toHaveValue(unsaved);
    expect(readNoteMock).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: /Two/ }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: '放弃并切换',
      }),
    );

    await waitFor(async () =>
      expect(
        await screen.findByLabelText('MDX 编辑器'),
      ).toHaveValue(twoSource),
    );
    expect(readNoteMock).toHaveBeenLastCalledWith(
      '/tmp/demo',
      'content/pages/two.mdx',
    );
  });

  it('未保存时切换空间需要确认', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(
      <WorkspaceShell
        workspace={workspace}
        onSwitch={onSwitch}
      />,
    );

    const editor = await screen.findByLabelText('MDX 编辑器');
    fireEvent.change(editor, {
      target: {
        value: oneSource.replace('# One', '# Dirty'),
      },
    });

    await user.click(
      screen.getByRole('button', { name: '切换空间' }),
    );
    expect(
      await screen.findByText('放弃未保存修改？'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: '取消' }),
    );
    expect(onSwitch).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: '切换空间' }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: '放弃并切换',
      }),
    );
    expect(onSwitch).toHaveBeenCalledTimes(1);
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
    const broken = oneSource.replace('# One', '# Broken');
    fireEvent.change(editor, {
      target: { value: broken },
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
    const saved = oneSource.replace('# One', '# Saved');
    fireEvent.change(editor, {
      target: { value: saved },
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

  it('属性面板修改标题会更新 YAML 并保留注释', async () => {
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const title = await screen.findByLabelText(/^标题/);
    fireEvent.change(title, {
      target: { value: 'Renamed' },
    });

    const editor =
      (await screen.findByLabelText(
        'MDX 编辑器',
      )) as HTMLTextAreaElement;
    expect(editor.value).toContain('title: Renamed');
    expect(editor.value).toContain('# keep this comment');
    expect(editor.value).toContain('customKey: keep');

    fireEvent.click(
      screen.getByRole('button', { name: '保存' }),
    );

    await waitFor(() =>
      expect(writeNoteMock).toHaveBeenCalledTimes(1),
    );
    const written = writeNoteMock.mock.calls[0]?.[2];
    expect(written).toContain('title: Renamed');
    expect(written).toContain('# keep this comment');
    expect(written).toContain('# One');
  });

  it('主题字段默认值可见并可写回当前 namespace', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    expect(await screen.findByText('宽图')).toBeInTheDocument();
    const featured = await screen.findByRole('switch', {
      name: '推荐',
    });
    expect(featured).not.toBeChecked();

    await user.click(featured);
    const editor =
      (await screen.findByLabelText(
        'MDX 编辑器',
      )) as HTMLTextAreaElement;
    expect(editor.value).toContain('featured: true');

    fireEvent.click(
      screen.getByRole('button', { name: '保存' }),
    );

    await waitFor(() =>
      expect(writeNoteMock).toHaveBeenCalledTimes(1),
    );
    const written = writeNoteMock.mock.calls[0]?.[2];
    expect(written).toContain('featured: true');
    expect(written).toContain('heroStyle: wide');
  });

  it('显示 frontmatter 中已有的主题布尔值', async () => {
    readNoteMock.mockResolvedValue(
      oneSource.replace(
        '    heroStyle: wide',
        '    heroStyle: wide\n    featured: true',
      ),
    );

    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    expect(
      await screen.findByRole('switch', { name: '推荐' }),
    ).toBeChecked();
  });

  it('属性校验失败时阻止保存', async () => {
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    const title = await screen.findByLabelText(/^标题/);
    fireEvent.change(title, {
      target: { value: '' },
    });

    expect(
      await screen.findByText('标题不能为空'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '保存' }),
    );

    await waitFor(() =>
      expect(writeNoteMock).not.toHaveBeenCalled(),
    );
  });

  it('工具栏打开主题与设置弹窗', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    await screen.findByLabelText('MDX 编辑器');
    await user.click(
      screen.getByRole('button', { name: '主题与设置' }),
    );

    expect(
      await screen.findByRole('dialog'),
    ).toBeInTheDocument();
    expect(listThemesMock).toHaveBeenCalledWith('/tmp/demo');
    expect(
      screen.getByText(
        '切换主题或调整当前主题的站点设置。内容文件不会自动改写。',
      ),
    ).toBeInTheDocument();
  });

  it('工具栏打开依赖弹窗', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    await screen.findByLabelText('MDX 编辑器');
    await user.click(
      screen.getByRole('button', { name: '依赖' }),
    );

    expect(
      await screen.findByText('工作区依赖'),
    ).toBeInTheDocument();
    expect(listDependenciesMock).toHaveBeenCalledWith(
      '/tmp/demo',
    );
  });

  it('新建页面后刷新列表并打开新笔记', async () => {
    const user = userEvent.setup();
    const after = inspectResult();
    after.entries.push({
      id: 'projects/new-page',
      collection: 'projects',
      kind: 'page',
      type: 'project',
      title: 'New Page',
      slug: 'new-page',
      relativePath: 'content/projects/new-page.mdx',
      draft: false,
    });
    const projects = after.collections.find(
      (collection) => collection.name === 'projects',
    );
    if (projects) projects.count = 1;

    inspectMock.mockReset();
    inspectMock
      .mockResolvedValueOnce(inspectResult())
      .mockResolvedValueOnce(after);
    createNoteMock.mockResolvedValue({
      path: 'content/projects/new-page.mdx',
    });
    const createdSource = `---
title: New Page
type: project
---

# New Page`;
    readNoteMock.mockImplementation((_root, path) => {
      if (path === 'content/projects/new-page.mdx') {
        return Promise.resolve(createdSource);
      }
      return Promise.resolve(
        path.endsWith('one.mdx') ? oneSource : twoSource,
      );
    });

    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    await screen.findByLabelText('MDX 编辑器');
    await user.click(
      screen.getByRole('button', { name: '新建页面' }),
    );

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/^标题/),
      'New Page',
    );
    expect(
      within(dialog).getByLabelText(/^Slug/),
    ).toHaveValue('new-page');
    await user.click(
      within(dialog).getByRole('button', {
        name: '创建并打开',
      }),
    );

    await waitFor(() =>
      expect(createNoteMock).toHaveBeenCalledWith({
        root: '/tmp/demo',
        collection: 'projects',
        slug: 'new-page',
        title: 'New Page',
        pageType: 'project',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog'),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByLabelText('MDX 编辑器'),
    ).toHaveValue(createdSource);
    expect(screen.getByText('New Page')).toBeInTheDocument();
  });

  it('缺失 import 提供安装建议并在安装后刷新诊断', async () => {
    const user = userEvent.setup();
    const relative = {
      code: 'MISSING_COMPONENT_SOURCE',
      severity: 'error' as const,
      source: 'mdx',
      message: '找不到组件文件：./components/Missing',
      file: '/tmp/demo/content/posts/one.mdx',
      line: 4,
      column: 1,
      module: './components/Missing',
    };
    const bare = {
      code: 'MISSING_COMPONENT_SOURCE',
      severity: 'error' as const,
      source: 'mdx',
      message: '无法解析依赖：lucide-react',
      file: '/tmp/demo/content/posts/one.mdx',
      line: 5,
      column: 1,
      module: 'lucide-react',
    };
    const initial = inspectResult();
    initial.diagnostics = [relative, bare];
    const fixed = inspectResult();
    fixed.diagnostics = [relative];

    inspectMock.mockReset();
    inspectMock
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(fixed);

    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    expect(
      await screen.findByText(/缺失依赖：/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/组件文件不存在/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: '安装依赖' }),
    );

    await waitFor(() =>
      expect(installDependenciesMock).toHaveBeenCalledWith({
        root: '/tmp/demo',
        action: 'add',
        packages: ['lucide-react'],
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/缺失依赖：/),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/组件文件不存在/),
    ).toBeInTheDocument();
    expect(inspectMock).toHaveBeenCalledTimes(2);
  });

  it('打开和停止隔离预览', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    await screen.findByLabelText('MDX 编辑器');
    await user.click(
      screen.getByRole('button', { name: '预览' }),
    );

    await waitFor(() =>
      expect(startPreviewMock).toHaveBeenCalledWith(
        '/tmp/demo',
      ),
    );
    expect(
      await screen.findByRole('button', {
        name: '停止预览',
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: '停止预览' }),
    );
    await waitFor(() =>
      expect(stopPreviewMock).toHaveBeenCalledTimes(1),
    );
    expect(
      await screen.findByRole('button', { name: '预览' }),
    ).toBeInTheDocument();
  });

  it('预览窗口关闭事件同步主窗口状态', async () => {
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    await screen.findByLabelText('MDX 编辑器');
    await waitFor(() =>
      expect(emitPreviewState).not.toBeNull(),
    );

    act(() => {
      emitPreviewState?.({ open: true });
    });
    expect(
      await screen.findByRole('button', {
        name: '停止预览',
      }),
    ).toBeInTheDocument();

    act(() => {
      emitPreviewState?.({ open: false });
    });
    expect(
      await screen.findByRole('button', { name: '预览' }),
    ).toBeInTheDocument();
  });

  it('工具栏打开发布弹窗', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell workspace={workspace} onSwitch={vi.fn()} />,
    );

    await screen.findByLabelText('MDX 编辑器');
    await user.click(
      screen.getByRole('button', { name: '发布' }),
    );

    expect(
      await screen.findByText('发布站点'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('输出目录')).toHaveValue(
      '/tmp/demo/.wordma/dist',
    );
  });
});
