import { FileWarning, Loader2, PackagePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';

type MissingImportHintProps = {
  module: string;
  installingPackage: string | null;
  onInstall: (packageName: string) => void;
};

/**
 * 从 import 源提取需要安装的包名；相对路径/别名返回 null。
 */
export function packageNameFromModule(
  module: string,
): string | null {
  const source = module.trim();

  if (
    !source ||
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('@/') ||
    source.startsWith('node:') ||
    source.startsWith('bun:')
  ) {
    return null;
  }

  if (source.startsWith('@')) {
    const [scope, name] = source.split('/');
    return scope && name ? `${scope}/${name}` : null;
  }

  return source.split('/')[0] || null;
}

export function MissingImportHint({
  module,
  installingPackage,
  onInstall,
}: MissingImportHintProps) {
  const packageName = packageNameFromModule(module);

  if (!packageName) {
    return (
      <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <FileWarning className="mt-0.5 size-3 shrink-0" />
        <span>
          组件文件不存在：<code>{module}</code>
          。请检查相对路径，或在 workspace 中创建该组件。
        </span>
      </div>
    );
  }

  const installing = installingPackage === packageName;

  return (
    <div className="mt-2 space-y-1.5 rounded-md bg-muted/60 p-2">
      <div className="text-[11px] text-muted-foreground">
        缺失依赖：<code>{packageName}</code>
      </div>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={installingPackage !== null}
        onClick={() => onInstall(packageName)}
      >
        {installing ? (
          <Loader2 className="animate-spin" />
        ) : (
          <PackagePlus />
        )}
        安装依赖
      </Button>
    </div>
  );
}
