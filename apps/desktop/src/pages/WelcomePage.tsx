import * as React from 'react';

import { useSite } from '@/context/SiteContext';
import { createSite, selectDirectory } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** 无站点时的引导页：选数据目录 + 创建第一个站点 */
export function WelcomePage() {
  const { setActiveSite } = useSite();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [dir, setDir] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const handleChooseDir = async () => {
    const picked = await selectDirectory();
    if (picked) {
      setDir(picked);
      setError(null);
    }
  };

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const site = await createSite({
        name: name.trim(),
        description: description.trim() || null,
        dir: dir.trim(),
      });
      await setActiveSite(site.id);
      window.location.hash = '#/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const canCreate = !creating && name.trim().length > 0 && dir.trim().length > 0;

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="flex w-[480px] flex-col gap-6 rounded-2xl border border-border bg-card p-8 shadow-pop">
        <div className="flex flex-col gap-1.5">
          <span className="mb-1 grid size-11 place-items-center rounded-xl bg-primary/10 font-bold text-lg text-primary">
            W
          </span>
          <h1 className="font-bold text-2xl tracking-tight">欢迎使用 Wordma</h1>
          <p className="text-muted-foreground text-sm">
            选择一个本地目录存放站点数据（文章、媒体、主题），创建你的第一个站点。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-semibold text-xs" htmlFor="site-name">
            站点名称
          </label>
          <Input
            id="site-name"
            data-testid="welcome-site-name"
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：我的博客"
            value={name}
          />
          <label className="mt-2 font-semibold text-xs" htmlFor="site-desc">
            站点描述（可选）
          </label>
          <Input
            id="site-desc"
            data-testid="welcome-site-desc"
            maxLength={100}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="一句话介绍你的站点"
            value={description}
          />
          <label className="mt-2 font-semibold text-xs" htmlFor="site-dir">
            数据目录
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="site-dir"
              className="font-mono text-xs"
              data-testid="welcome-site-dir"
              readOnly
              placeholder="尚未选择（文章、媒体、主题都会放进这里）"
              value={dir}
            />
            <Button
              className="shrink-0"
              data-testid="welcome-choose-dir"
              onClick={() => void handleChooseDir()}
              variant="outline"
            >
              选择…
            </Button>
          </div>
          <span className="text-muted-foreground text-xs">
            数据完全存在你选的目录里：拷走目录即完整备份，换电脑拷回来即可继续写。
          </span>
          {error && (
            <p className="text-destructive text-sm" data-testid="welcome-error">
              {error}
            </p>
          )}
        </div>

        <Button
          data-testid="welcome-create"
          disabled={!canCreate}
          onClick={handleCreate}
        >
          {creating ? '创建中…' : '创建站点'}
        </Button>
      </div>
    </div>
  );
}
