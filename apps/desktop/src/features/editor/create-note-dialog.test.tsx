import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EngineInspectResult } from '@/features/engine/api';

vi.mock('@/features/workspace/files', () => ({
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

import { createNote } from '@/features/workspace/files';

import { CreateNoteDialog } from './create-note-dialog';

const createMock = vi.mocked(createNote);

function inspectResult(): EngineInspectResult {
  return {
    workspace: '/tmp/demo',
    themeId: 'theme-x',
    site: {
      title: 'Demo',
      language: 'zh-CN',
      basePath: '',
    },
    theme: {
      id: 'theme-x',
      displayName: 'Theme',
      version: '1.0.0',
      path: 'themes/x',
    },
    postFields: [],
    pageFields: [],
    pageTypes: [
      {
        id: 'about',
        label: '关于页',
        route: '/about',
        layout: 'about',
        fields: [
          {
            key: 'subtitle',
            label: '副标题',
            type: 'text',
          },
        ],
      },
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
      {
        id: 'docs',
        label: '文档',
        route: '/docs/[slug]',
        layout: 'docs',
        collection: 'docs',
        fields: [],
      },
    ],
    pages: [],
    settings: [],
    settingsDefaults: {},
    settingsValues: {},
    entries: [
      {
        id: 'pages/about',
        collection: 'pages',
        kind: 'page',
        type: 'about',
        title: 'About',
        slug: 'about',
        relativePath: 'content/pages/about.mdx',
        draft: false,
      },
      {
        id: 'projects/demo',
        collection: 'projects',
        kind: 'page',
        type: 'project',
        title: 'Demo',
        slug: 'demo',
        relativePath: 'content/projects/demo.mdx',
        draft: false,
      },
    ],
    collections: [
      { name: 'pages', kind: 'page', count: 1 },
      { name: 'projects', kind: 'page', count: 1 },
    ],
    tags: [],
    categories: [],
    diagnostics: [],
  };
}

function renderDialog() {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn().mockResolvedValue(undefined);

  render(
    <CreateNoteDialog
      open
      onOpenChange={onOpenChange}
      workspacePath="/tmp/demo"
      inspect={inspectResult()}
      onCreated={onCreated}
    />,
  );

  return { onOpenChange, onCreated };
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({
    path: 'content/projects/new-page.mdx',
  });
});

describe('CreateNoteDialog', () => {
  it('展示 pageType、collection、layout 与字段，并禁用缺失 collection', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText('关于页')).toBeInTheDocument();
    expect(screen.getByText('文档')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /文档/ }),
    ).toBeDisabled();
    expect(
      screen.getAllByText('collection: pages').length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole('button', { name: /项目/ }),
    );

    expect(
      screen.getAllByText('collection: projects').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('layout: project'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/仓库地址 \(repo\)/),
    ).toBeInTheDocument();
  });

  it('自动生成 slug 并创建后打开', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onCreated } = renderDialog();

    await user.click(
      screen.getByRole('button', { name: /项目/ }),
    );
    await user.type(
      screen.getByLabelText(/^标题/),
      'My Project',
    );

    expect(screen.getByLabelText(/^Slug/)).toHaveValue(
      'my-project',
    );
    await user.click(
      screen.getByRole('button', {
        name: '创建并打开',
      }),
    );

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        root: '/tmp/demo',
        collection: 'projects',
        slug: 'my-project',
        title: 'My Project',
        pageType: 'project',
      }),
    );
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        'content/projects/new-page.mdx',
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('阻止已有 slug 与静态 pageType 路由冲突', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole('button', { name: /项目/ }),
    );
    fireEvent.change(screen.getByLabelText(/^Slug/), {
      target: { value: 'demo' },
    });

    expect(
      screen.getByText(
        'slug 已存在：content/projects/demo.mdx',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '创建并打开',
      }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: /关于页/ }),
    );
    fireEvent.change(screen.getByLabelText(/^Slug/), {
      target: { value: 'about-us' },
    });

    expect(
      screen.getByText(
        '页面类型 关于页 的路由已被“About”占用',
      ),
    ).toBeInTheDocument();
  });

  it('创建失败时显示错误并保留弹窗', async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValueOnce({
      code: 'WRITE_FAILED',
      message: '磁盘只读',
    });
    const { onOpenChange, onCreated } = renderDialog();

    await user.click(
      screen.getByRole('button', { name: /项目/ }),
    );
    await user.type(
      screen.getByLabelText(/^标题/),
      'Read Only',
    );
    await user.click(
      screen.getByRole('button', {
        name: '创建并打开',
      }),
    );

    expect(
      await screen.findByText('[WRITE_FAILED] 磁盘只读'),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('主题没有 pageTypes 时禁用创建', () => {
    const inspect = inspectResult();
    inspect.pageTypes = [];
    render(
      <CreateNoteDialog
        open
        onOpenChange={vi.fn()}
        workspacePath="/tmp/demo"
        inspect={inspect}
        onCreated={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        '当前主题没有声明 pageTypes，无法新建页面。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '创建并打开',
      }),
    ).toBeDisabled();
  });
});
