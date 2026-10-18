import * as React from 'react';

import { DeploySection } from '@/components/settings-deploy-section';
import { RoutingSection } from '@/components/settings-routing-section';
import { useSite } from '@/context/SiteContext';
import {
  createSite,
  deleteSite,
  selectDirectory,
  updateSite,
} from '@/lib/site';
import type { Site } from '@/types/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
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
  const [newSiteDir, setNewSiteDir] = React.useState('');
  const [newSiteError, setNewSiteError] = React.useState<string | null>(null);

  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

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
      const site = (await createSite({
        name: newSiteName.trim(),
        dir: newSiteDir.trim(),
      })) as Site;
      await setActiveSite(site.id);
      await reload();
      setNewSiteName('');
      setNewSiteDir('');
    } catch (err) {
      setNewSiteError(err instanceof Error ? err.message : String(err));
    }
  };

  /** 移除站点登记：磁盘目录保留，之后选同一目录即可重开 */
  const handleRemoveSite = async () => {
    if (!activeSite) return;
    setRemoving(true);
    try {
      await deleteSite(activeSite.id);
      setConfirmRemove(false);
      await reload();
      window.location.hash = '#/welcome';
    } finally {
      setRemoving(false);
    }
  };

  const handleChooseNewSiteDir = async () => {
    const picked = await selectDirectory();
    if (picked) {
      setNewSiteDir(picked);
      setNewSiteError(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-9" data-testid="settings-page">
      <PageHeader
        subtitle={`当前站点：${activeSite?.name ?? ''} · 数据目录：${activeSite?.dir ?? ''}`}
        title="设置"
      />

      <div className="flex max-w-2xl flex-col gap-4">
        {/* 站点信息 */}
        <Card>
          <CardHeader>
            <CardTitle>站点信息</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
              <label className="font-semibold text-xs" htmlFor="settings-name">
                站点名称
              </label>
              <Input
                data-testid="settings-name"
                id="settings-name"
                maxLength={30}
                onChange={(e) => setName(e.target.value)}
                value={name}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
              <label className="font-semibold text-xs" htmlFor="settings-desc">
                站点描述
              </label>
              <Input
                data-testid="settings-desc"
                id="settings-desc"
                maxLength={100}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="一句话介绍这个站点"
                value={description}
              />
            </div>
          </CardBody>
          {siteError && (
            <p
              className="px-5 pb-2 text-destructive text-sm"
              data-testid="settings-site-error"
            >
              {siteError}
            </p>
          )}
          <CardFooter>
            {siteSaved && (
              <span className="text-muted-foreground text-xs">已保存</span>
            )}
            <Button
              data-testid="settings-save-site"
              onClick={() => void handleSaveSite()}
            >
              保存更改
            </Button>
          </CardFooter>
        </Card>

        {/* 新建站点 */}
        <Card>
          <CardHeader>
            <CardTitle>新建站点</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="font-semibold text-xs" htmlFor="new-site-name">
                站点名称
              </label>
              <Input
                data-testid="new-site-name"
                id="new-site-name"
                maxLength={30}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="例如：旅行随笔"
                value={newSiteName}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="font-semibold text-xs" htmlFor="new-site-dir">
                数据目录
              </label>
              <div className="flex items-center gap-2">
                <Input
                  className="font-mono text-xs"
                  data-testid="new-site-dir"
                  id="new-site-dir"
                  readOnly
                  placeholder="文章、媒体、主题都会放进这个目录"
                  value={newSiteDir}
                />
                <Button
                  className="shrink-0"
                  data-testid="new-site-choose-dir"
                  onClick={() => void handleChooseNewSiteDir()}
                  variant="outline"
                >
                  选择…
                </Button>
              </div>
              <span className="text-muted-foreground text-xs">
                每个站点拥有独立目录与数据库，数据互不干扰；选已有 Wordma
                目录即重新打开该站点。
              </span>
            </div>
          </CardBody>
          {newSiteError && (
            <p
              className="px-5 pb-2 text-destructive text-sm"
              data-testid="new-site-error"
            >
              {newSiteError}
            </p>
          )}
          <CardFooter>
            <Button
              data-testid="new-site-create"
              disabled={!newSiteName.trim() || !newSiteDir.trim()}
              onClick={() => void handleCreateSite()}
            >
              创建并切换
            </Button>
          </CardFooter>
        </Card>

        {/* 本地预览 */}
        <Card>
          <CardHeader>
            <CardTitle>本地预览</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
              <label className="font-semibold text-xs" htmlFor="settings-port">
                预览端口（1024-65535）
              </label>
              <Input
                className="font-mono"
                data-testid="settings-port"
                id="settings-port"
                onChange={(e) => setPort(e.target.value)}
                placeholder="12739"
                value={port}
              />
            </div>
            <div className="col-span-2 flex flex-col justify-end gap-1.5 lg:col-span-1">
              <span className="text-muted-foreground text-xs">
                将当前站点渲染为静态页面，在本机端口预览。
              </span>
              {(portError || portSaved) && (
                <span
                  className={
                    portError ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
                  }
                  data-testid="settings-port-result"
                >
                  {portError ?? '端口已更新'}
                </span>
              )}
            </div>
          </CardBody>
          <CardFooter>
            <Button
              data-testid="settings-save-port"
              disabled={!port}
              onClick={() => void handleSavePort()}
              variant="outline"
            >
              保存端口
            </Button>
            <Button
              data-testid="open-preview"
              onClick={() => void handleOpenPreview()}
            >
              构建并打开预览
            </Button>
          </CardFooter>
        </Card>

        {activeSite && (
          <Card className="border-destructive/30" data-testid="danger-zone">
            <CardHeader className="border-destructive/30">
              <CardTitle className="text-destructive">危险操作</CardTitle>
            </CardHeader>
            <div className="flex items-center gap-3.5 px-5 py-4">
              <span className="min-w-0 flex-1 text-muted-foreground text-xs">
                从 Wordma 移除「{activeSite?.name}」的登记。
                <b className="text-foreground">磁盘目录不会被删除</b>
                ，之后选择同一目录即可重新打开。
              </span>
              <Button
                data-testid="settings-remove-site"
                onClick={() => setConfirmRemove(true)}
                variant="destructiveGhost"
              >
                移除站点
              </Button>
            </div>
          </Card>
        )}

        {activeSite && <RoutingSection siteId={activeSite.id} />}

        {activeSite && <DeploySection siteId={activeSite.id} />}
      </div>

      <Dialog onOpenChange={setConfirmRemove} open={confirmRemove}>
        <DialogContent className="max-w-[420px] sm:max-w-[420px]">
          <DialogTitle>移除站点</DialogTitle>
          <DialogDescription>
            确认从 Wordma 移除「{activeSite?.name}」？站点数据仍保留在
            {activeSite?.dir}，之后选择该目录即可重新打开。
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setConfirmRemove(false)} variant="outline">
              取消
            </Button>
            <Button
              data-testid="settings-remove-site-confirm"
              disabled={removing}
              onClick={() => void handleRemoveSite()}
              variant="destructive"
            >
              {removing ? '移除中…' : '移除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
