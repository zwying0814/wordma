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
import { Chip } from '@/components/ui/chip';
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
import { errorMessage } from '@/lib/errors';
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
      setError(errorMessage(err))
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
      setError(errorMessage(err));
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
      setError(errorMessage(err));
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
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setValue = (key: string, value: unknown) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card data-testid="theme-section">
      <CardHeader>
        <CardTitle>主题</CardTitle>
        <span className="ml-auto text-muted-foreground text-xs">
          装在站点目录的 themes/ 下
        </span>
      </CardHeader>

      <div className="flex flex-wrap gap-3 p-5">
        {themes.map((theme) => (
          <div
            className={cn(
              'flex w-56 flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow',
              theme.active && 'border-primary/45 shadow-pop'
            )}
            data-testid="theme-card"
            key={theme.name}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-bold text-sm">
                {theme.displayName}
              </span>
              {theme.active && (
                <Chip data-testid="theme-card-active" variant="accent">
                  使用中
                </Chip>
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
            <div className="mt-auto flex gap-2 pt-2">
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
                variant="destructiveGhost"
              >
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>

      {settings && settings.schema.length > 0 && (
        <>
          <CardHeader className="border-t border-border">
            <CardTitle>主题设置 · {settings.themeName}</CardTitle>
          </CardHeader>
          <CardBody className="grid-cols-1 gap-3 lg:grid-cols-2">
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
            {(error || saved) && (
              <span
                className={cn(
                  'text-xs',
                  error ? 'text-destructive' : 'text-muted-foreground'
                )}
                data-testid="theme-settings-result"
              >
                {error ?? '已保存'}
              </span>
            )}
            <Button
              data-testid="theme-settings-save"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              保存主题设置
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
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
