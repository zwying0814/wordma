import * as React from 'react';

import { useSite } from '@/context/SiteContext';
import { createSite } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** 无站点时的引导页：创建第一个站点 */
export function WelcomePage() {
  const { setActiveSite } = useSite();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const site = await createSite({
        name: name.trim(),
        description: description.trim() || null,
      });
      await setActiveSite(site.id);
      window.location.hash = '#/articles';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex w-[420px] flex-col gap-5 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-bold text-2xl tracking-tight">欢迎使用 Wordma</h1>
          <p className="text-muted-foreground text-sm">
            创建你的第一个站点，开始写作之旅。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-medium text-sm" htmlFor="site-name">
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
          <label className="mt-2 font-medium text-sm" htmlFor="site-desc">
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
          {error && (
            <p className="text-destructive text-sm" data-testid="welcome-error">
              {error}
            </p>
          )}
        </div>

        <Button
          data-testid="welcome-create"
          disabled={creating || name.trim().length === 0}
          onClick={handleCreate}
        >
          {creating ? '创建中…' : '创建站点'}
        </Button>
      </div>
    </div>
  );
}
