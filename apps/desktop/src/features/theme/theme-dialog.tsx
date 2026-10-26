import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Loader2, Palette } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  applyThemeSettingsWithEngine,
  applyThemeWithEngine,
  listThemesWithEngine,
  type EngineInspectResult,
  type EngineSettingDescriptor,
  type EngineThemeListItem,
} from '@/features/engine/api';

type ThemeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspacePath: string;
  inspect: EngineInspectResult | null;
  onApplied: () => Promise<void>;
};

const SOURCE_LABELS: Record<
  EngineThemeListItem['source'],
  string
> = {
  workspace: '工作区',
  dependency: '依赖',
  builtin: '内置',
};

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '主题操作失败';
}

function settingError(
  descriptor: EngineSettingDescriptor,
  value: unknown,
): string | undefined {
  if (
    descriptor.required &&
    (value === undefined ||
      (typeof value === 'string' &&
        value.trim().length === 0))
  ) {
    return '此项必填';
  }

  if (descriptor.type === 'number' && value !== undefined) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      return '必须是数字';
    }
    if (
      descriptor.min !== undefined &&
      value < descriptor.min
    ) {
      return `不能小于 ${descriptor.min}`;
    }
    if (
      descriptor.max !== undefined &&
      value > descriptor.max
    ) {
      return `不能大于 ${descriptor.max}`;
    }
  }

  if (
    (descriptor.type === 'color' ||
      descriptor.type === 'image') &&
    typeof value === 'string' &&
    value.trim().length === 0
  ) {
    return '必须是非空字符串';
  }

  return undefined;
}

function sameValue(a: unknown, b: unknown): boolean {
  return Object.is(a, b);
}

function SettingsField({
  descriptor,
  value,
  error,
  disabled,
  onChange,
}: {
  descriptor: EngineSettingDescriptor;
  value: unknown;
  error?: string;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const id = `setting-${descriptor.key}`;
  let control: ReactNode;

  switch (descriptor.type) {
    case 'text':
      control = (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />
      );
      break;

    case 'textarea':
      control = (
        <Textarea
          id={id}
          value={typeof value === 'string' ? value : ''}
          rows={descriptor.rows ?? 3}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />
      );
      break;

    case 'number':
      control = (
        <Input
          id={id}
          type="number"
          value={
            typeof value === 'number' ? String(value) : ''
          }
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              event.target.value === ''
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      );
      break;

    case 'switch':
      control = (
        <div className="flex h-8 items-center">
          <Switch
            id={id}
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(checked)
            }
          />
        </div>
      );
      break;

    case 'select': {
      const current =
        typeof value === 'string'
          ? value
          : descriptor.default;
      control = (
        <Select
          value={current ?? null}
          disabled={disabled}
          onValueChange={(next) =>
            onChange(
              typeof next === 'string' ? next : undefined,
            )
          }
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="选择…">
              {(selected) =>
                descriptor.options.find(
                  (option) => option.value === selected,
                )?.label ?? '选择…'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {descriptor.options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    }

    case 'color': {
      const text =
        typeof value === 'string' ? value : '';
      const validHex = /^#[0-9a-f]{6}$/i.test(text);
      control = (
        <div className="flex gap-1.5">
          <Input
            id={id}
            value={text}
            disabled={disabled}
            placeholder="#000000"
            onChange={(event) =>
              onChange(event.target.value)
            }
          />
          <input
            type="color"
            aria-label="颜色选择"
            value={validHex ? text : '#000000'}
            disabled={disabled}
            className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
            onChange={(event) =>
              onChange(event.target.value)
            }
          />
        </div>
      );
      break;
    }

    case 'image':
      control = (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          placeholder="/images/cover.jpg"
          onChange={(event) =>
            onChange(event.target.value)
          }
        />
      );
      break;
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {descriptor.label}
        {descriptor.required && (
          <span className="text-destructive">*</span>
        )}
      </Label>
      {control}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        descriptor.help && (
          <p className="text-xs text-muted-foreground">
            {descriptor.help}
          </p>
        )
      )}
    </div>
  );
}

export function ThemeDialog({
  open,
  onOpenChange,
  workspacePath,
  inspect,
  onApplied,
}: ThemeDialogProps) {
  const [themes, setThemes] = useState<
    EngineThemeListItem[]
  >([]);
  const [loadingThemes, setLoadingThemes] =
    useState(false);
  const [themeError, setThemeError] = useState<
    string | null
  >(null);
  const [selectedId, setSelectedId] = useState<
    string | null
  >(null);
  const [switching, setSwitching] = useState(false);
  const [pendingTheme, setPendingTheme] =
    useState<EngineThemeListItem | null>(null);
  const [settingsValues, setSettingsValues] = useState<
    Record<string, unknown>
  >({});
  const [savingSettings, setSavingSettings] =
    useState(false);
  const [settingsError, setSettingsError] = useState<
    string | null
  >(null);

  const currentThemeId = inspect?.themeId ?? '';
  const currentTheme = themes.find(
    (theme) => theme.id === currentThemeId,
  );
  const selectedTheme = themes.find(
    (theme) => theme.id === selectedId,
  );

  useEffect(() => {
    if (!open) return;
    setSelectedId(currentThemeId || null);
  }, [currentThemeId, open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingThemes(true);
    setThemeError(null);

    void listThemesWithEngine(workspacePath)
      .then((items) => {
        if (!cancelled) setThemes(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setThemeError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingThemes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, workspacePath]);

  useEffect(() => {
    if (!open || !inspect) return;

    const values: Record<string, unknown> = {};
    for (const descriptor of inspect.settings) {
      values[descriptor.key] =
        descriptor.key in inspect.settingsValues
          ? inspect.settingsValues[descriptor.key]
          : descriptor.default;
    }
    setSettingsValues(values);
    setSettingsError(null);
  }, [inspect, open]);

  const settingsErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!inspect) return errors;

    for (const descriptor of inspect.settings) {
      const error = settingError(
        descriptor,
        settingsValues[descriptor.key],
      );
      if (error) errors[descriptor.key] = error;
    }

    return errors;
  }, [inspect, settingsValues]);

  const unknownSettings = useMemo(
    () =>
      (inspect?.diagnostics ?? []).filter(
        (diagnostic) =>
          diagnostic.code === 'UNKNOWN_THEME_SETTING',
      ),
    [inspect],
  );

  const handleSwitchTheme = async () => {
    const target = pendingTheme;
    if (
      !target ||
      target.id === currentThemeId ||
      !target.compatible
    ) {
      setPendingTheme(null);
      return;
    }

    setPendingTheme(null);
    setSwitching(true);
    setThemeError(null);

    try {
      await applyThemeWithEngine(
        workspacePath,
        target.id,
        true,
      );
      toast.success(
        `已切换到 ${target.displayName}`,
      );
      await onApplied();
    } catch (error) {
      const message = errorMessage(error);
      setThemeError(message);
      toast.error(message);
    } finally {
      setSwitching(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!inspect) return;

    const overrides: Record<string, unknown> = {};
    for (const descriptor of inspect.settings) {
      const value = settingsValues[descriptor.key];
      if (value === undefined) continue;

      const fallback =
        inspect.settingsDefaults[descriptor.key];
      if (
        fallback !== undefined &&
        sameValue(value, fallback)
      ) {
        continue;
      }

      overrides[descriptor.key] = value;
    }

    setSavingSettings(true);
    setSettingsError(null);

    try {
      const result = await applyThemeSettingsWithEngine(
        workspacePath,
        overrides,
      );
      const warnings = result.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === 'warning',
      );
      toast.success(
        warnings.length > 0
          ? '设置已保存，但存在警告'
          : '设置已保存',
      );
      await onApplied();
    } catch (error) {
      const message = errorMessage(error);
      setSettingsError(message);
      toast.error(message);
    } finally {
      setSavingSettings(false);
    }
  };

  const switchDisabled =
    switching ||
    savingSettings ||
    !selectedTheme ||
    selectedTheme.id === currentThemeId ||
    !selectedTheme.compatible;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="size-4" />
            主题与设置
          </DialogTitle>
          <DialogDescription>
            切换主题或调整当前主题的站点设置。内容文件不会自动改写。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(85vh-9rem)] space-y-6 overflow-y-auto pr-1">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                主题
              </h2>
              <span className="text-xs text-muted-foreground">
                当前：{currentTheme?.displayName ?? currentThemeId}
              </span>
            </div>

            {loadingThemes ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在读取主题…
              </div>
            ) : themes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                没有可用主题。
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {themes.map((theme) => {
                  const isCurrent =
                    theme.id === currentThemeId;
                  const isSelected =
                    theme.id === selectedId;

                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() =>
                        setSelectedId(theme.id)
                      }
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? 'border-primary bg-muted/60'
                          : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {theme.displayName}
                        </span>
                        {isCurrent && (
                          <Badge variant="secondary">
                            <Check />
                            当前
                          </Badge>
                        )}
                        {!theme.compatible && (
                          <Badge variant="destructive">
                            不兼容
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {theme.id} · v{theme.version}
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <Badge variant="outline">
                          {SOURCE_LABELS[theme.source]}
                        </Badge>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {theme.path}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedTheme &&
              selectedTheme.diagnostics.length > 0 && (
                <ul className="space-y-1 rounded-lg border p-2 text-xs">
                  {selectedTheme.diagnostics.map(
                    (diagnostic, index) => (
                      <li
                        key={`${diagnostic.code}-${index}`}
                        className={
                          diagnostic.severity === 'error'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        }
                      >
                        [{diagnostic.code}] {diagnostic.message}
                      </li>
                    ),
                  )}
                </ul>
              )}

            {selectedTheme &&
              selectedTheme.id !== currentThemeId && (
                <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  旧主题字段会保留在笔记 frontmatter 中。新主题只显示自己的字段，切换不会自动迁移或删除旧 namespace。
                </p>
              )}

            {themeError && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {themeError}
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              disabled={switchDisabled}
              onClick={() => {
                if (selectedTheme) {
                  setPendingTheme(selectedTheme);
                }
              }}
            >
              {switching && (
                <Loader2 className="animate-spin" />
              )}
              切换主题
            </Button>
          </section>

          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                站点设置
              </h2>
              {unknownSettings.length > 0 && (
                <Badge variant="secondary">
                  {unknownSettings.length} 个未知项
                </Badge>
              )}
            </div>

            {unknownSettings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                {unknownSettings.map(
                  (diagnostic, index) => (
                    <li key={`${diagnostic.code}-${index}`}>
                      {diagnostic.message}
                    </li>
                  ),
                )}
              </ul>
            )}

            {!inspect || inspect.settings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                当前主题没有可配置项。
              </p>
            ) : (
              <div className="space-y-3">
                {inspect.settings.map((descriptor) => (
                  <SettingsField
                    key={descriptor.key}
                    descriptor={descriptor}
                    value={
                      settingsValues[descriptor.key]
                    }
                    error={settingsErrors[descriptor.key]}
                    disabled={savingSettings || switching}
                    onChange={(value) =>
                      setSettingsValues((current) => ({
                        ...current,
                        [descriptor.key]: value,
                      }))
                    }
                  />
                ))}
              </div>
            )}

            {settingsError && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {settingsError}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
          <Button
            type="button"
            disabled={
              !inspect ||
              inspect.settings.length === 0 ||
              savingSettings ||
              switching ||
              Object.keys(settingsErrors).length > 0
            }
            onClick={() => void handleSaveSettings()}
          >
            {savingSettings && (
              <Loader2 className="animate-spin" />
            )}
            保存设置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <ConfirmDialog
        open={pendingTheme !== null}
        title="切换主题？"
        description="旧主题字段会保留在笔记 frontmatter 中，但新主题只会显示自己的字段，且不会自动迁移。主题设置会重置为默认值。"
        confirmLabel="切换主题"
        onConfirm={() => void handleSwitchTheme()}
        onOpenChange={(next) => {
          if (!next) setPendingTheme(null);
        }}
      />
    </>
  );
}
