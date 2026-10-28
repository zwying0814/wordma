import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  MissingImportHint,
  packageNameFromModule,
} from './missing-import-hint';

describe('packageNameFromModule', () => {
  it('提取普通包、scoped 包与子路径', () => {
    expect(packageNameFromModule('lucide-react')).toBe(
      'lucide-react',
    );
    expect(packageNameFromModule('lucide-react/icons')).toBe(
      'lucide-react',
    );
    expect(packageNameFromModule('@scope/pkg')).toBe(
      '@scope/pkg',
    );
    expect(packageNameFromModule('@scope/pkg/sub')).toBe(
      '@scope/pkg',
    );
  });

  it('相对路径、别名与内置模块不视为依赖', () => {
    expect(
      packageNameFromModule('./components/Missing'),
    ).toBeNull();
    expect(packageNameFromModule('../Missing')).toBeNull();
    expect(packageNameFromModule('@/components/Missing')).toBeNull();
    expect(packageNameFromModule('node:fs')).toBeNull();
    expect(packageNameFromModule('bun:test')).toBeNull();
  });
});

describe('MissingImportHint', () => {
  it('裸包显示安装按钮并回调包名', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(
      <MissingImportHint
        module="lucide-react/icons"
        installingPackage={null}
        onInstall={onInstall}
      />,
    );

    expect(screen.getByText('lucide-react')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: '安装依赖' }),
    );
    expect(onInstall).toHaveBeenCalledWith('lucide-react');
  });

  it('相对路径提示创建组件且不显示安装按钮', () => {
    render(
      <MissingImportHint
        module="./components/Missing"
        installingPackage={null}
        onInstall={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/组件文件不存在/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '安装依赖' }),
    ).not.toBeInTheDocument();
  });

  it('安装中禁用按钮', () => {
    render(
      <MissingImportHint
        module="lucide-react"
        installingPackage="lucide-react"
        onInstall={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '安装依赖' }),
    ).toBeDisabled();
  });
});
