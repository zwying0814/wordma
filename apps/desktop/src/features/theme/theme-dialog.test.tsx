import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EngineInspectResult,
  EngineThemeListItem,
} from '@/features/engine/api';

vi.mock('@/features/engine/api', () => ({
  listThemesWithEngine: vi.fn(),
  applyThemeWithEngine: vi.fn(),
  applyThemeSettingsWithEngine: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  applyThemeSettingsWithEngine,
  applyThemeWithEngine,
  listThemesWithEngine,
} from '@/features/engine/api';

import { ThemeDialog } from './theme-dialog';

const listMock = vi.mocked(listThemesWithEngine);
const applyMock = vi.mocked(applyThemeWithEngine);
const settingsMock = vi.mocked(applyThemeSettingsWithEngine);

const themes: EngineThemeListItem[] = [
  {
    id: 'wordma-theme-journal',
    displayName: 'Journal',
    version: '1.0.0',
    path: 'themes/journal',
    source: 'workspace',
    compatible: true,
    diagnostics: [],
  },
  {
    id: 'wordma-theme-minimal',
    displayName: 'Minimal',
    version: '1.0.0',
    path: 'themes/minimal',
    source: 'workspace',
    compatible: true,
    diagnostics: [],
  },
  {
    id: 'wordma-theme-future',
    displayName: 'Future',
    version: '2.0.0',
    path: 'themes/future',
    source: 'dependency',
    compatible: false,
    diagnostics: [
      {
        code: 'ENGINE_VERSION_MISMATCH',
        severity: 'error',
        source: 'theme',
        message: '主题要求 Wordma >=99.0.0',
      },
    ],
  },
  {
    id: 'wordma-theme-default',
    displayName: 'Default',
    version: '0.0.0',
    path: '../../themes/default',
    source: 'builtin',
    compatible: true,
    diagnostics: [],
  },
];

function inspectResult(): EngineInspectResult {
  return {
    workspace: '/tmp/demo',
    themeId: 'wordma-theme-journal',
    site: {
      title: 'Demo',
      language: 'zh-CN',
      basePath: '',
    },
    theme: {
      id: 'wordma-theme-journal',
      displayName: 'Journal',
      version: '1.0.0',
      path: 'themes/journal',
    },
    postFields: [],
    pageFields: [],
    pageTypes: [],
    pages: [],
    settings: [
      {
        key: 'title',
        label: '站点标题',
        type: 'text',
        default: 'Default',
      },
      {
        key: 'count',
        label: '数量',
        type: 'number',
        default: 2,
        min: 1,
        max: 5,
      },
      {
        key: 'enabled',
        label: '开关',
        type: 'switch',
        default: true,
      },
      {
        key: 'mode',
        label: '模式',
        type: 'select',
        options: [
          { label: '甲', value: 'a' },
          { label: '乙', value: 'b' },
        ],
        default: 'a',
      },
      {
        key: 'accent',
        label: '强调色',
        type: 'color',
        default: '#000000',
      },
    ],
    settingsDefaults: {
      title: 'Default',
      count: 2,
      enabled: true,
      mode: 'a',
      accent: '#000000',
    },
    settingsValues: {
      title: 'Hello',
      count: 2,
      enabled: true,
      mode: 'a',
      accent: '#000000',
    },
    entries: [],
    collections: [],
    tags: [],
    categories: [],
    diagnostics: [],
  };
}

function renderDialog(
  inspect = inspectResult(),
  onApplied = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <ThemeDialog
      open
      onOpenChange={vi.fn()}
      workspacePath="/tmp/demo"
      inspect={inspect}
      onApplied={onApplied}
    />,
  );

  return onApplied;
}

beforeEach(() => {
  listMock.mockReset();
  applyMock.mockReset();
  settingsMock.mockReset();
  listMock.mockResolvedValue(themes);
  applyMock.mockResolvedValue({
    themeId: 'wordma-theme-minimal',
    diagnostics: [],
  });
  settingsMock.mockResolvedValue({
    themeId: 'wordma-theme-journal',
    diagnostics: [],
  });
});

describe('ThemeDialog', () => {
  it('列出主题并通过确认切换', async () => {
    const user = userEvent.setup();
    const onApplied = renderDialog();

    expect(await screen.findByText('Journal')).toBeInTheDocument();
    expect(
      screen.getByText('当前：Journal'),
    ).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('不兼容')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Minimal/ }),
    );
    const switchButton = screen.getByRole('button', {
      name: '切换主题',
    });
    expect(switchButton).toBeEnabled();

    await user.click(switchButton);

    expect(
      await screen.findByText('切换主题？'),
    ).toBeInTheDocument();
    const alert = screen.getByRole('alertdialog');
    expect(
      within(alert).getByText(/旧主题字段会保留/),
    ).toBeInTheDocument();
    await user.click(
      within(alert).getByRole('button', {
        name: '切换主题',
      }),
    );

    await waitFor(() =>
      expect(applyMock).toHaveBeenCalledWith(
        '/tmp/demo',
        'wordma-theme-minimal',
        true,
      ),
    );
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });

  it('不兼容主题禁用切换', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Future');
    await user.click(
      screen.getByRole('button', { name: /Future/ }),
    );

    expect(
      screen.getByText(/主题要求 Wordma >=99\.0\.0/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '切换主题' }),
    ).toBeDisabled();
  });

  it('切换失败时保留当前主题且不刷新', async () => {
    const user = userEvent.setup();
    applyMock.mockRejectedValueOnce('engine inspect 失败');
    const onApplied = renderDialog();

    await screen.findByText('Minimal');
    await user.click(
      screen.getByRole('button', { name: /Minimal/ }),
    );
    await user.click(
      screen.getByRole('button', { name: '切换主题' }),
    );
    const alert = await screen.findByRole('alertdialog');
    await user.click(
      within(alert).getByRole('button', {
        name: '切换主题',
      }),
    );

    expect(
      await screen.findByText('engine inspect 失败'),
    ).toBeInTheDocument();
    expect(screen.getByText('当前：Journal')).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('settings 只提交覆盖值并显示未知项警告', async () => {
    const user = userEvent.setup();
    const inspect = inspectResult();
    inspect.diagnostics = [
      {
        code: 'UNKNOWN_THEME_SETTING',
        severity: 'warning',
        source: 'theme',
        message: '未知主题设置：futureOption',
        field: 'futureOption',
      },
    ];
    const onApplied = renderDialog(inspect);

    expect(
      await screen.findByText('未知主题设置：futureOption'),
    ).toBeInTheDocument();
    const title = await screen.findByLabelText('站点标题');
    expect(title).toHaveValue('Hello');

    fireEvent.change(title, {
      target: { value: 'New' },
    });
    await user.click(
      screen.getByRole('switch', { name: '开关' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: '保存设置' }),
    );

    await waitFor(() =>
      expect(settingsMock).toHaveBeenCalledWith('/tmp/demo', {
        title: 'New',
        enabled: false,
      }),
    );
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });

  it('settings 本地校验失败时禁用保存', () => {
    renderDialog();

    const count = screen.getByLabelText('数量');
    fireEvent.change(count, {
      target: { value: '99' },
    });

    expect(
      screen.getByText('不能大于 5'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '保存设置' }),
    ).toBeDisabled();
  });
});
