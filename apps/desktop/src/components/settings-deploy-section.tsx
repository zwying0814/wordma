'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/lib/use-toast';
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
  const { toast } = useToast();
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
      const deployed = await deploySite(siteId);
      setResult(deployed);
      toast(`已发布 ${deployed.files} 个文件`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="deploy-section">
      <CardHeader>
        <CardTitle>发布</CardTitle>
        <span className="ml-auto text-muted-foreground text-xs">
          产物不含草稿
        </span>
      </CardHeader>

      <CardBody className="grid-cols-1 gap-2.5">
        <label className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 font-semibold text-xs">发布方式</span>
          <select
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
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
          <span className="w-24 shrink-0 font-semibold text-xs">站点地址</span>
          <Input
            className="text-xs"
            data-testid="deploy-site-url"
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, siteUrl: event.target.value }))
            }
            placeholder="https://blog.example.com（留空表示部署在域名根目录）"
            value={config.siteUrl ?? ''}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 font-semibold text-xs">目标文件夹</span>
          <Input
            className="font-mono text-xs"
            data-testid="deploy-folder"
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, folder: event.target.value }))
            }
            placeholder="/Users/you/Sites/my-blog"
            value={config.folder ?? ''}
          />
        </label>
      </CardBody>

      <CardFooter className="justify-between">
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
          {(error || result) && (
            <span
              className={cn(error ? 'text-destructive' : 'text-muted-foreground')}
              data-testid="deploy-result"
            >
              {error ?? `已发布 ${result?.files} 个文件到 ${result?.target}`}
            </span>
          )}
          {!error && !result && '资源与媒体链接使用上面的站点地址。'}
        </span>
        <Button
          data-testid="deploy-run"
          disabled={busy}
          onClick={() => void handleDeploy()}
        >
          {busy ? '发布中…' : '发布站点'}
        </Button>
      </CardFooter>
    </Card>
  );
}
