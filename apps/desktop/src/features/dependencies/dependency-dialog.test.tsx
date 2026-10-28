import {
  act,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DependencyLogEvent,
  DependencyState,
} from './api';

vi.mock('./api', () => ({
  listDependencies: vi.fn(),
  installDependencies: vi.fn(),
  onDependencyLog: vi.fn(),
  dependencyErrorMessage: (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      return `[${String(error.code)}] ${String(error.message)}`;
    }
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return '依赖操作失败';
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  installDependencies,
  listDependencies,
  onDependencyLog,
} from './api';

import { DependencyDialog } from './dependency-dialog';

const listMock = vi.mocked(listDependencies);
const installMock = vi.mocked(installDependencies);
const logMock = vi.mocked(onDependencyLog);

let emitLog: ((event: DependencyLogEvent) => void) | null =
  null;

function dependencyState(): DependencyState {
  return {
    exists: true,
    packageJson: '/tmp/demo/package.json',
    dependencies: [
      {
        name: 'react',
        version: '^19.0.0',
        group: 'dependencies',
        installed: true,
        installedVersion: '19.0.0',
        lifecycleScripts: [],
        trusted: false,
      },
      {
        name: 'demo',
        version: '1.0.0',
        group: 'dependencies',
        installed: true,
        installedVersion: '1.0.0',
        lifecycleScripts: ['postinstall'],
        trusted: true,
      },
      {
        name: 'esbuild',
        version: '^0.20.0',
        group: 'devDependencies',
        installed: false,
        lifecycleScripts: ['postinstall'],
        trusted: false,
      },
    ],
    trustedDependencies: ['demo'],
  };
}

function successResult() {
  return {
    operationId: 'op-1',
    success: true,
    code: 0,
    stdout: 'ok',
    stderr: '',
    restartedEngine: false,
  };
}

function renderDialog() {
  const onApplied = vi.fn().mockResolvedValue(undefined);
  render(
    <DependencyDialog
      open
      onOpenChange={vi.fn()}
      workspacePath="/tmp/demo"
      onApplied={onApplied}
    />,
  );
  return onApplied;
}

beforeEach(() => {
  listMock.mockReset();
  installMock.mockReset();
  logMock.mockReset();
  emitLog = null;

  listMock.mockResolvedValue(dependencyState());
  installMock.mockResolvedValue(successResult());
  logMock.mockImplementation(async (handler) => {
    emitLog = handler;
    return () => {};
  });
});

describe('DependencyDialog', () => {
  it('分组展示依赖、安装状态与生命周期脚本', async () => {
    renderDialog();

    expect(await screen.findByText('运行依赖')).toBeInTheDocument();
    expect(
      screen.getAllByText('开发依赖').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('esbuild')).toBeInTheDocument();
    expect(screen.getAllByText('未安装').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已安装 19.0.0').length).toBe(1);
    expect(
      screen.getAllByText(/脚本：postinstall/).length,
    ).toBe(2);
    expect(
      screen.getByText(/已信任：/),
    ).toBeInTheDocument();
  });

  it('添加依赖并支持开发依赖', async () => {
    const user = userEvent.setup();
    const onApplied = renderDialog();

    const input = await screen.findByPlaceholderText(
      'react@^19.0.0, @scope/pkg',
    );
    await user.type(input, 'react@^19');
    await user.click(
      screen.getByRole('switch', { name: '开发依赖' }),
    );
    await user.click(
      screen.getByRole('button', { name: '添加' }),
    );

    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith({
        root: '/tmp/demo',
        action: 'add',
        packages: ['react@^19'],
        dev: true,
        allowTrustedScripts: false,
      }),
    );
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });

  it('可信包才允许运行安装脚本', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = await screen.findByPlaceholderText(
      'react@^19.0.0, @scope/pkg',
    );
    await user.type(input, 'demo');

    const scripts = screen.getByRole('switch', {
      name: '允许可信脚本',
    });
    await waitFor(() =>
      expect(scripts).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );
    await user.click(scripts);
    await user.click(
      screen.getByRole('button', { name: '添加' }),
    );

    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith({
        root: '/tmp/demo',
        action: 'add',
        packages: ['demo'],
        dev: false,
        allowTrustedScripts: true,
      }),
    );
  });

  it('未知包禁用可信脚本开关', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = await screen.findByPlaceholderText(
      'react@^19.0.0, @scope/pkg',
    );
    await user.type(input, 'react');

    expect(
      screen.getByRole('switch', {
        name: '允许可信脚本',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('移除与全部更新调用对应 action', async () => {
    const user = userEvent.setup();
    renderDialog();

    const row = (await screen.findByText('react')).closest(
      'li',
    );
    if (!row) throw new Error('缺少依赖行');
    await user.click(
      within(row).getByRole('button', { name: '移除' }),
    );
    const alert = await screen.findByRole('alertdialog');
    await user.click(
      within(alert).getByRole('button', { name: '移除' }),
    );

    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'remove',
          packages: ['react'],
        }),
      ),
    );

    await user.click(
      screen.getByRole('button', { name: '全部更新' }),
    );
    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          packages: [],
        }),
      ),
    );
  });

  it('安装失败显示 stderr 且不刷新工作区', async () => {
    const user = userEvent.setup();
    installMock.mockResolvedValueOnce({
      ...successResult(),
      success: false,
      code: 1,
      stderr: 'network failed',
    });
    const onApplied = renderDialog();

    await user.type(
      await screen.findByPlaceholderText(
        'react@^19.0.0, @scope/pkg',
      ),
      'react',
    );
    await user.click(
      screen.getByRole('button', { name: '添加' }),
    );

    expect(
      await screen.findByText('network failed'),
    ).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('实时显示依赖操作日志', async () => {
    renderDialog();
    await waitFor(() => expect(emitLog).not.toBeNull());

    await act(async () => {
      emitLog?.({
        operationId: 'op-1',
        stream: 'stdout',
        line: 'Resolving dependencies',
      });
    });

    expect(
      await screen.findByText(/Resolving dependencies/),
    ).toBeInTheDocument();
  });

  it('package.json 缺失时显示提示', async () => {
    listMock.mockResolvedValue({
      exists: false,
      packageJson: '/tmp/demo/package.json',
      dependencies: [],
      trustedDependencies: [],
    });
    renderDialog();

    expect(
      await screen.findByText('package.json 不存在。'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '全部更新' }),
    ).toBeDisabled();
  });
});
