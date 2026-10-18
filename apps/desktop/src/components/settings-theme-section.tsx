'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { cn } from '@/lib/utils';

/** 主题区：主题卡片列表 + 按 theme.yaml 的 settings schema 渲染的设置表单 */
export function ThemeSection({ siteId }: { siteId: number }) {
  const [themes, setThemes] = React.useState<ThemeMeta[]>([]);
  const [settings, setSettings] = React.useState<ThemeSettings | null>(null);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
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
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, [reload]);

  const handleActivate = async (name: string) => {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await setActiveTheme({ siteId, name });
      // 切换主题后表单跟随新主题的 schema
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name: string) => {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await deleteTheme(name);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const next = await setThemeSettings({
        siteId,
        themeName: settings.themeName,
        values,
      });
      setValues({ ...next });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const setValue = (key: string, value: unknown) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="flex flex-col gap-3" data-testid="theme-section">
      <h2 className="font-semibold text-sm">主题</h2>

      <div className="flex flex-wrap gap-3">
        {themes.map((theme) => (
          <div
            className={cn(
              'flex w-52 flex-col gap-2 rounded-lg border p-3',
              theme.active && 'border-primary'
            )}
            data-testid="theme-card"
            key={theme.name}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-sm">
                {theme.displayName}
              </span>
              {theme.active && (
                <span
                  className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-primary-foreground text-xs"
                  data-testid="theme-card-active"
                >
                  使用中
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-xs">
              {theme.name} · v{theme.version}
            </span>
            {theme.invalidMessage && (
              <span className="text-destructive text-xs">
                {theme.invalidMessage}
              </span>
            )}
            <div className="mt-auto flex gap-2">
              <Button
                data-testid={`theme-activate-${theme.name}`}
                disabled={busy || theme.active}
                onClick={() => void handleActivate(theme.name)}
                size="sm"
                variant="outline"
              >
                {theme.active ? '使用中' : '启用'}
              </Button>
              <Button
                data-testid={`theme-delete-${theme.name}`}
                disabled={busy || theme.active}
                onClick={() => void handleDelete(theme.name)}
                size="sm"
                variant="ghost"
              >
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>

      {settings && settings.schema.length > 0 && (
        <div className="flex max-w-xl flex-col gap-3 rounded-lg border p-3">
          <span className="font-medium text-sm">
            主题设置 · {settings.themeName}
          </span>

          {settings.schema.map((setting) => (
            <ThemeSettingField
              key={`${settings.themeName}:${setting.key}`}
              onChange={(value) => setValue(setting.key, value)}
              setting={setting}
              value={values[setting.key]}
            />
          ))}

          <div className="flex items-center gap-3">
            <Button
              data-testid="theme-settings-save"
              disabled={busy}
              onClick={() => void handleSave()}
              size="sm"
            >
              保存主题设置
            </Button>
            {(error || saved) && (
              <span
                className={cn(
                  'text-sm',
                  error ? 'text-destructive' : 'text-muted-foreground'
                )}
                data-testid="theme-settings-result"
              >
                {error ?? '已保存'}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
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
    <label className="flex flex-col gap-1 text-sm" key={setting.key}>
      <span className="text-muted-foreground">{setting.label || setting.key}</span>
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
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
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
          className="h-9 w-24 p-1"
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={typeof value === 'string' ? value : '#000000'}
        />
      );
    case 'textarea':
      return (
        <textarea
          className="min-h-20 rounded-md border border-input bg-transparent p-2 text-sm"
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
