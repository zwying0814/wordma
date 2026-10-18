import * as React from 'react';

import { DeploySection } from '@/components/settings-deploy-section';
import { RoutingSection } from '@/components/settings-routing-section';
import { ThemeSection } from '@/components/settings-theme-section';
import { useSite } from '@/context/SiteContext';
import { updateSite } from '@/lib/site';
import type { Site } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// 端口范围与默认值与主进程 preview.ts 保持一致

/** 设置页 v1：站点信息 + 新建站点 + 预览端口 + 打开预览 */
export function SettingsPage() {
  const { activeSite, setActiveSite, reload } = useSite();

  const [name, setName] = React.useState(activeSite?.name ?? '');
  const [description, setDescription] = React.useState(
    activeSite?.description ?? ''
  );
  const [siteError, setSiteError] = React.useState<string | null>(null);
  const [siteSaved, setSiteSaved] = React.useState(false);

  const [port, setPort] = React.useState<string>('');
  const [portError, setPortError] = React.useState<string | null>(null);
  const [portSaved, setPortSaved] = React.useState(false);

  const [newSiteName, setNewSiteName] = React.useState('');
  const [newSiteError, setNewSiteError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (activeSite) {
      setName(activeSite.name);
      setDescription(activeSite.description ?? '');
    }
  }, [activeSite]);

  const handleSaveSite = async () => {
    if (!activeSite) return;
    setSiteError(null);
    setSiteSaved(false);
    try {
      await updateSite({
        id: activeSite.id,
        name: name.trim(),
        description: description.trim() || null,
      });
      await reload();
      setSiteSaved(true);
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSavePort = async () => {
    setPortError(null);
    setPortSaved(false);
    try {
      await window.api.invoke('set_preview_port', { port: Number(port) });
      setPortSaved(true);
    } catch (err) {
      setPortError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenPreview = async () => {
    if (!activeSite) return;
    setPortError(null);
    try {
      await window.api.invoke('open_preview', { siteId: activeSite.id });
    } catch (err) {
      setPortError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateSite = async () => {
    setNewSiteError(null);
    try {
      const site = (await window.api.invoke('create_site', {
        name: newSiteName.trim(),
      })) as Site;
      await setActiveSite(site.id);
      setNewSiteName('');
    } catch (err) {
      setNewSiteError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-8" data-testid="settings-page">
      <h1 className="font-bold text-xl tracking-tight">设置</h1>

      {/* 站点信息 */}
      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="font-semibold text-sm">站点信息</h2>
        <label className="font-medium text-sm" htmlFor="settings-name">
          站点名称
        </label>
        <Input
          className="max-w-sm"
          data-testid="settings-name"
          id="settings-name"
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          value={name}
        />
        <label className="font-medium text-sm" htmlFor="settings-desc">
          站点描述
        </label>
        <Input
          className="max-w-sm"
          data-testid="settings-desc"
          id="settings-desc"
          maxLength={100}
          onChange={(e) => setDescription(e.target.value)}
          value={description}
        />
        {siteError && (
          <p className="text-destructive text-sm" data-testid="settings-site-error">
            {siteError}
          </p>
        )}
        <div>
          <Button data-testid="settings-save-site" onClick={() => void handleSaveSite()}>
            保存站点信息
          </Button>
          {siteSaved && (
            <span className="ml-3 text-muted-foreground text-xs">已保存</span>
          )}
        </div>
      </section>

      {/* 新建站点 */}
      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="font-semibold text-sm">新建站点</h2>
        <div className="flex max-w-sm items-center gap-2">
          <Input
            className="h-9 flex-1"
            data-testid="new-site-name"
            maxLength={30}
            onChange={(e) => setNewSiteName(e.target.value)}
            placeholder="新站点名称"
            value={newSiteName}
          />
          <Button
            data-testid="new-site-create"
            disabled={!newSiteName.trim()}
            onClick={() => void handleCreateSite()}
          >
            创建并切换
          </Button>
        </div>
        {newSiteError && (
          <p className="text-destructive text-sm" data-testid="new-site-error">
            {newSiteError}
          </p>
        )}
      </section>

      {/* 预览 */}
      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="font-semibold text-sm">本地预览</h2>
        <p className="text-muted-foreground text-sm">
          将当前站点渲染为静态页面，并在本机端口预览。
        </p>
        <label className="font-medium text-sm" htmlFor="settings-port">
          预览端口（1024-65535）
        </label>
        <div className="flex max-w-sm items-center gap-2">
          <Input
            className="h-9 flex-1 font-mono text-sm"
            data-testid="settings-port"
            id="settings-port"
            onChange={(e) => setPort(e.target.value)}
            placeholder="12739"
            value={port}
          />
          <Button
            data-testid="settings-save-port"
            disabled={!port}
            onClick={() => void handleSavePort()}
          >
            保存端口
          </Button>
        </div>
        {(portError || portSaved) && (
          <p
            className={`text-sm ${portError ? 'text-destructive' : 'text-muted-foreground'}`}
            data-testid="settings-port-result"
          >
            {portError ?? '端口已更新'}
          </p>
        )}
        <div>
          <Button
            data-testid="open-preview"
            onClick={() => void handleOpenPreview()}
            variant="outline"
          >
            构建并打开预览
          </Button>
        </div>
      </section>

      {activeSite && <ThemeSection siteId={activeSite.id} />}

      {activeSite && <RoutingSection siteId={activeSite.id} />}

      {activeSite && <DeploySection siteId={activeSite.id} />}
    </div>
  );
}
