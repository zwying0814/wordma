import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "./common/empty-state";
import { Field } from "./common/field";
import {
  getThemeSettings,
  setThemeSettings,
  type ThemeMeta,
  type ThemeSetting,
  type ThemeSettingsPayload,
} from "../lib/theme";

// 镜像后端 builtin_number_range（改后端必须同步）
const NUMBER_BOUNDS: Record<string, { min: number; max: number }> = {
  postsPerPage: { min: 1, max: 100 },
};

interface Props {
  siteId: number;
  theme: ThemeMeta | null;
  onClose: () => void;
}

function ColorField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (value: string) => void;
}) {
  const text = typeof value === "string" ? value : "";
  const valid = /^#[0-9a-f]{6}$/i.test(text);
  return (
    <div className="flex gap-1.5">
      <Input
        id={id}
        value={text}
        placeholder="#000000"
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="color"
        aria-label="颜色选择"
        value={valid ? text : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
      />
    </div>
  );
}

function SettingControl({
  setting,
  value,
  onChange,
}: {
  setting: ThemeSetting;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `theme-setting-${setting.key}`;

  switch (setting.type) {
    case "textarea":
      return (
        <Textarea
          id={id}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <Input
          id={id}
          type="number"
          step={1}
          min={NUMBER_BOUNDS[setting.key]?.min}
          max={NUMBER_BOUNDS[setting.key]?.max}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
      );
    case "switch":
      return (
        <div className="flex h-8 items-center">
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );
    case "select":
      return (
        <Select
          value={typeof value === "string" ? value : null}
          onValueChange={(next) =>
            onChange(typeof next === "string" ? next : undefined)
          }
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="选择…">
              {(selected) => (typeof selected === "string" ? selected : "选择…")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {setting.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "color":
      return <ColorField id={id} value={value} onChange={onChange} />;
    default:
      return (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** 主题设置弹窗：按 theme.yaml 的 settings schema 生成表单 */
export default function ThemeSettingsModal({ siteId, theme, onClose }: Props) {
  const [payload, setPayload] = useState<ThemeSettingsPayload | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const themeName = theme?.name ?? "";

  useEffect(() => {
    if (!theme) return;
    setLoading(true);
    setPayload(null);
    getThemeSettings(siteId, theme.name)
      .then((result) => {
        setPayload(result);
        setValues(result.values);
      })
      .catch((e) => {
        toast.error(String(e));
        onClose();
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeName, siteId]);

  if (!theme) {
    return null;
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await setThemeSettings(siteId, theme.name, values);
      toast.success("主题设置已保存，点「生成预览」查看效果");
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!saving}
        className="sm:max-w-[520px]"
      >
        <DialogHeader>
          <DialogTitle>主题设置 · {theme.displayName}</DialogTitle>
          <DialogDescription>
            配置会写入站点设置，保存后重新生成预览即可看到效果。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-8">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : payload && payload.schema.length === 0 ? (
          <EmptyState
            title="该主题没有可配置的设置项"
            description="主题作者未在 theme.yaml 中声明 settings。"
          />
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3.5 overflow-y-auto pr-1">
            {(payload?.schema ?? []).map((setting) => {
              const bounds = NUMBER_BOUNDS[setting.key];
              const value = values[setting.key] ?? setting.default;
              return (
                <Field
                  key={setting.key}
                  label={setting.label}
                  htmlFor={`theme-setting-${setting.key}`}
                  hint={
                    setting.type === "number" && bounds
                      ? `范围 ${bounds.min} - ${bounds.max}`
                      : undefined
                  }
                >
                  <SettingControl
                    setting={setting}
                    value={value}
                    onChange={(next) =>
                      setValues((prev) => ({
                        ...prev,
                        [setting.key]: next,
                      }))
                    }
                  />
                </Field>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={saving || loading || payload?.schema.length === 0}
            onClick={handleSave}
          >
            {saving ? <Spinner className="size-4" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
