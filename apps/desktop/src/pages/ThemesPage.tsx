import * as React from 'react';

import { Palette } from 'lucide-react';

import { useSite } from '@/context/SiteContext';
import {
  deleteTheme,
  getThemeSettings,
  listThemes,
  setActiveTheme,
  setThemeSettings,
  type ThemeMeta,
  type ThemeSettingSchema,
  type ThemeSettings,
} from '@/lib/theme';
import { countWordsInHtml } from '@/lib/words';
import { errorMessage } from '@/lib/errors';
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
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Switch } from '@/components/ui/switch';
import {
  ThemeCard,
  ThemePreviewDialog,
} from '@/components/theme-card';
import { cn } from '@/lib/utils';

/** 主题页：/themes —— 主题卡片网格 + 预览弹窗 + 当前主题的设置表单 */
export function ThemesPage() {
  const { activeSite, articles } = useSite();
  const siteId = activeSite?.id ?? null;

  const [themes, setThemes] = React.useState<ThemeMeta[]>([]);
  const [settings, setSettings] = React.useState<ThemeSettings | null>(null);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [previewing, setPreviewing] = React.useState<ThemeMeta | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ThemeMeta | null>(null);

  const reload = React.useCallback(async () => {
    if (siteId === null) {
      setThemes([]);
      setSettings(null);
      return;
    }
    const [list, current] = await Promise.all([
      listThemes(siteId),
      getThemeSettings({ siteId }),
    ]);
    setThemes(list);
    setSettings(current);
    setValues({ ...current.values });
  }, [siteId]);

  React.useEffect(() => {
    setError(null);
    setSaved(false);
    void reload().catch((err) => setError(errorMessage(err)));
  }, [reload]);

  const activeTheme = themes.find((theme) => theme.active) ?? null;

  const handleActivate = async (name: string) => {
    if (siteId === null) return;
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await setActiveTheme({ siteId, name });
      // 切换主题后设置表单跟随新主题的 schema
      await reload();
      setPreviewing(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteTheme(pendingDelete.name);
      setPendingDelete(null);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    if (siteId === null || !settings) return;
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await setThemeSettings({
        siteId,
        themeName: settings.themeName,
        values,
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setValue = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const previewPosts = [...articles]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3)
    .map((article) => ({
      id: article.id,
      title: article.title || '（无标题）',
      meta: `${new Date(article.createdAt).toLocaleDateString('zh-CN')} · 约 ${countWordsInHtml(article.content).toLocaleString('zh-CN')} 字`,
    }));

  return (
    <div className="flex flex-col p-9" data-testid="themes-page">
      <PageHeader
        subtitle={`当前站点「${activeSite?.name ?? ''}」· 已启用 ${activeTheme?.displayName ?? '默认主题'}`}
        title="主题"
      />

      {error && (
        <p className="mb-3 text-destructive text-sm" data-testid="theme-section-error">
          {error}
        </p>
      )}

      {themes.length === 0 ? (
        <Card>
          <EmptyState
            description="主题是站点目录 themes/ 下的一个文件夹，内含 theme.yaml 与 EJS 模板。"
            icon={Palette}
            title="还没有主题"
          />
        </Card>
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4"
          data-testid="theme-section"
        >
          {themes.map((theme) => (
            <ThemeCard
              busy={busy}
              key={theme.name}
              onActivate={() => void handleActivate(theme.name)}
              onDelete={() => setPendingDelete(theme)}
              onPreview={() => setPreviewing(theme)}
              theme={theme}
            />
          ))}
        </div>
      )}

      {settings && settings.schema.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>主题设置 · {settings.themeName}</CardTitle>
            <span className="ml-auto text-muted-foreground text-xs">
              来自主题的 theme.yaml
            </span>
          </CardHeader>
          <CardBody>
            {settings.schema.map((setting) => (
              <ThemeSettingField
                key={`${settings.themeName}:${setting.key}`}
                onChange={(value) => setValue(setting.key, value)}
                setting={setting}
                value={values[setting.key]}
              />
            ))}
          </CardBody>
          <CardFooter>
            {saved && (
              <span className="text-muted-foreground text-xs">已保存</span>
            )}
            <Button
              data-testid="theme-settings-save"
              disabled={busy}
              onClick={() => void handleSaveSettings()}
            >
              保存主题设置
            </Button>
          </CardFooter>
        </Card>
      )}

      {settings && (
        <p className="mt-4 text-muted-foreground text-xs">
          {(error || saved) && (
            <span
              className={cn(error ? 'text-destructive' : 'text-muted-foreground')}
              data-testid="theme-settings-result"
            >
              {error ?? '已保存'}
            </span>
          )}
        </p>
      )}

      <ThemePreviewDialog
        onActivate={() => previewing && void handleActivate(previewing.name)}
        onOpenChange={(open) => {
          if (!open) setPreviewing(null);
        }}
        open={previewing !== null}
        posts={previewPosts}
        site={{
          name: activeSite?.name ?? '',
          description: activeSite?.description ?? null,
        }}
        theme={previewing}
      />

      <Dialog
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
      >
        <DialogContent className="max-w-[420px] sm:max-w-[420px]">
          <DialogTitle>删除主题</DialogTitle>
          <DialogDescription>
            确认删除主题「{pendingDelete?.displayName}」？该主题的文件会从站点目录的
            themes/ 下移除，此操作不可撤销。
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setPendingDelete(null)} variant="outline">
              取消
            </Button>
            <Button
              data-testid="theme-delete-confirm"
              disabled={busy}
              onClick={() => void handleDelete()}
              variant="destructive"
            >
              {busy ? '删除中…' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ThemeSettingField({
  onChange,
  setting,
  value,
}: {
  onChange: (value: unknown) => void;
  setting: ThemeSettingSchema;
  value: unknown;
}) {
  const testId = `theme-setting-${setting.key}`;

  return (
    <label className="flex flex-col gap-1.5 text-sm" key={setting.key}>
      <span className="font-semibold text-xs">{setting.label || setting.key}</span>
      <ThemeSettingControl
        onChange={onChange}
        setting={setting}
        testId={testId}
        value={value}
      />
    </label>
  );
}

function ThemeSettingControl({
  onChange,
  setting,
  testId,
  value,
}: {
  onChange: (value: unknown) => void;
  setting: ThemeSettingSchema;
  testId: string;
  value: unknown;
}) {
  switch (setting.type) {
    case 'switch':
      return (
        <Switch
          checked={value === true || value === 'true'}
          data-testid={testId}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      );
    case 'select':
      return (
        <select
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
          value={typeof value === 'string' ? value : ''}
        >
          {(setting.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case 'color':
      return (
        <Input
          className="w-24 p-1"
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={typeof value === 'string' ? value : '#000000'}
        />
      );
    case 'textarea':
      return (
        <textarea
          className="min-h-20 rounded-lg border border-input bg-card p-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
          value={typeof value === 'string' ? value : ''}
        />
      );
    case 'number':
      // 故意用 text：让非法输入能被提交到主进程校验（而不是被浏览器拦住）
      return (
        <Input
          data-testid={testId}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value)}
          value={value === undefined || value === null ? '' : String(value)}
        />
      );
    case 'text':
    default:
      return (
        <Input
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
          value={typeof value === 'string' ? value : ''}
        />
      );
  }
}
