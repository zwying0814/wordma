'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  deploySite,
  getDeployConfig,
  setDeployConfig,
  type DeployConfig,
  type DeployResult,
} from '@/lib/deploy';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/** 发布区：发布方式 + 站点地址 + 目标文件夹 + 发布按钮与结果 */
export function DeploySection({ siteId }: { siteId: number }) {
  const [config, setConfig] = React.useState<DeployConfig>({
    provider: 'local-folder',
    siteUrl: '',
    folder: '',
  });
  const [result, setResult] = React.useState<DeployResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getDeployConfig(siteId);
        if (!cancelled && stored) setConfig(stored);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const handleDeploy = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      // 先存配置（严格校验在这一步），再发布
      const saved = await setDeployConfig(siteId, config);
      setConfig(saved);
      setResult(await deploySite(siteId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex max-w-2xl flex-col gap-3" data-testid="deploy-section">
      <h2 className="font-semibold text-sm">发布</h2>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">发布方式</span>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            data-testid="deploy-provider"
            onChange={(event) =>
              setConfig((prev) => ({
                ...prev,
                provider: event.target.value as DeployConfig['provider'],
              }))
            }
            value={config.provider}
          >
            <option value="local-folder">本地文件夹</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">站点地址</span>
          <Input
            className="h-9 text-xs"
            data-testid="deploy-site-url"
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, siteUrl: event.target.value }))
            }
            placeholder="https://blog.example.com（留空表示部署在域名根目录）"
            value={config.siteUrl ?? ''}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">目标文件夹</span>
          <Input
            className="h-9 font-mono text-xs"
            data-testid="deploy-folder"
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, folder: event.target.value }))
            }
            placeholder="/Users/you/Sites/my-blog"
            value={config.folder ?? ''}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button
          data-testid="deploy-run"
          disabled={busy}
          onClick={() => void handleDeploy()}
          size="sm"
        >
          {busy ? '发布中…' : '发布站点'}
        </Button>
        {(error || result) && (
          <span
            className={cn(
              'text-sm',
              error ? 'text-destructive' : 'text-muted-foreground'
            )}
            data-testid="deploy-result"
          >
            {error ??
              `已发布 ${result?.files} 个文件到 ${result?.target}`}
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        发布产物不含草稿，资源与媒体链接使用上面的站点地址；发布构建目录与本地预览互相独立。
      </p>
    </section>
  );
}
