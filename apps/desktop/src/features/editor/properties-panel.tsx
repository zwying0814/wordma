import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

import type { EngineFieldDescriptor } from '@/features/engine/api';

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

import type { NoteProperties } from './frontmatter';

type FieldDescriptor = EngineFieldDescriptor;

type PropertiesPanelProps = {
  properties: NoteProperties;
  disabled?: boolean;
  onChange: (path: string[], value: unknown) => void;
};

function optionalString(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}

function optionalList(
  values: string[] | number[],
): string[] | number[] | undefined {
  return values.length > 0 ? values : undefined;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="text-xs text-destructive">{message}</p>
  );
}

function ListInput({
  id,
  values,
  item,
  disabled,
  onChange,
}: {
  id?: string;
  values: Array<string | number>;
  item: 'string' | 'number';
  disabled?: boolean;
  onChange: (values: string[] | number[]) => void;
}) {
  const [text, setText] = useState(values.join(', '));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(values.join(', '));
  }, [focused, values]);

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,，]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (item === 'number') {
      onChange(
        parts
          .map(Number)
          .filter((value) => Number.isFinite(value)),
      );
      return;
    }

    onChange(parts);
  };

  return (
    <Input
      id={id}
      value={text}
      disabled={disabled}
      placeholder={
        item === 'number' ? '1, 2, 3' : '用逗号分隔'
      }
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(values.join(', '));
      }}
      onChange={(event) => {
        setText(event.target.value);
        commit(event.target.value);
      }}
    />
  );
}

function ColorInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id?: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const validHex = /^#[0-9a-f]{6}$/i.test(value);

  return (
    <div className="flex gap-1.5">
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder="#000000"
        onChange={(event) => onChange(event.target.value)}
      />
      <input
        type="color"
        aria-label="颜色选择"
        value={validHex ? value : '#000000'}
        disabled={disabled}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ThemeField({
  descriptor,
  value,
  error,
  disabled,
  onChange,
}: {
  descriptor: FieldDescriptor;
  value: unknown;
  error?: string;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const id = `theme-field-${descriptor.key}`;
  const label = (
    <Label htmlFor={id}>
      {descriptor.label}
      {descriptor.required && (
        <span className="text-destructive">*</span>
      )}
    </Label>
  );

  let control: ReactNode;

  switch (descriptor.type) {
    case 'text':
      control = (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          placeholder={descriptor.placeholder}
          onChange={(event) =>
            onChange(optionalString(event.target.value))
          }
        />
      );
      break;

    case 'textarea':
      control = (
        <Textarea
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          rows={descriptor.rows ?? 3}
          placeholder={descriptor.placeholder}
          onChange={(event) =>
            onChange(optionalString(event.target.value))
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
          disabled={disabled}
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          placeholder={descriptor.placeholder}
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
            onCheckedChange={(checked) => onChange(checked)}
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
          onValueChange={(next) => {
            onChange(
              typeof next === 'string' ? next : undefined,
            );
          }}
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

    case 'color':
      control = (
        <ColorInput
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(next) => onChange(optionalString(next))}
        />
      );
      break;

    case 'image':
      control = (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          placeholder={
            descriptor.placeholder ?? '/images/cover.jpg'
          }
          onChange={(event) =>
            onChange(optionalString(event.target.value))
          }
        />
      );
      break;

    case 'date':
      control = (
        <Input
          id={id}
          type="date"
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(event) =>
            onChange(optionalString(event.target.value))
          }
        />
      );
      break;

    case 'list':
      control = (
        <ListInput
          id={id}
          values={
            Array.isArray(value)
              ? (value as Array<string | number>)
              : []
          }
          item={descriptor.item}
          disabled={disabled}
          onChange={(next) => onChange(optionalList(next))}
        />
      );
      break;
  }

  return (
    <div className="space-y-1.5">
      {label}
      {control}
      <FieldError message={error} />
      {!error && descriptor.help && (
        <p className="text-xs text-muted-foreground">
          {descriptor.help}
        </p>
      )}
    </div>
  );
}

function groupFields(
  fields: FieldDescriptor[],
): Array<{ name: string; fields: FieldDescriptor[] }> {
  const groups: Array<{
    name: string;
    fields: FieldDescriptor[];
  }> = [];

  for (const field of fields) {
    const name = field.group ?? '主题字段';
    const group = groups.find((item) => item.name === name);
    if (group) {
      group.fields.push(field);
    } else {
      groups.push({ name, fields: [field] });
    }
  }

  return groups;
}

export function PropertiesPanel({
  properties,
  disabled = false,
  onChange,
}: PropertiesPanelProps) {
  const { base, errors, parsed } = properties;
  const groups = groupFields(properties.fields);

  if (parsed.error) {
    return (
      <div className="space-y-3 p-3">
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">frontmatter 无法解析</div>
            <p className="mt-1 whitespace-pre-wrap text-xs">
              {parsed.error}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          请在编辑器中修正 frontmatter 后再修改属性。
        </p>
      </div>
    );
  }

  const updateBase = (key: string, value: unknown) => {
    onChange([key], value);
  };

  return (
    <div className="space-y-5 p-3">
      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          基础信息
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor="base-title">
            标题
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="base-title"
            value={base.title}
            disabled={disabled}
            onChange={(event) =>
              updateBase('title', event.target.value)
            }
          />
          <FieldError message={errors['base:title']} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="base-slug">Slug</Label>
          <Input
            id="base-slug"
            value={base.slug}
            disabled={disabled}
            placeholder="留空则自动生成"
            onChange={(event) =>
              updateBase(
                'slug',
                optionalString(event.target.value),
              )
            }
          />
          <FieldError message={errors['base:slug']} />
        </div>

        {properties.pageTypes.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="base-type">页面类型</Label>
            <Select
              value={base.type.length > 0 ? base.type : '__default__'}
              disabled={disabled}
              onValueChange={(next) =>
                updateBase(
                  'type',
                  next === '__default__'
                    ? undefined
                    : next,
                )
              }
            >
              <SelectTrigger id="base-type" className="w-full">
                <SelectValue placeholder="默认">
                  {(selected) => {
                    if (selected === '__default__') {
                      return '默认';
                    }
                    return (
                      properties.pageTypes.find(
                        (item) => item.id === selected,
                      )?.label ?? String(selected)
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">默认</SelectItem>
                {properties.pageTypes.map((pageType) => (
                  <SelectItem
                    key={pageType.id}
                    value={pageType.id}
                  >
                    {pageType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors['base:type']} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="base-date">日期</Label>
            <Input
              id="base-date"
              type="date"
              value={base.date.slice(0, 10)}
              disabled={disabled}
              onChange={(event) =>
                updateBase(
                  'date',
                  optionalString(event.target.value),
                )
              }
            />
            <FieldError message={errors['base:date']} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="base-updated">更新</Label>
            <Input
              id="base-updated"
              type="date"
              value={base.updated.slice(0, 10)}
              disabled={disabled}
              onChange={(event) =>
                updateBase(
                  'updated',
                  optionalString(event.target.value),
                )
              }
            />
            <FieldError message={errors['base:updated']} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="base-description">描述</Label>
          <Textarea
            id="base-description"
            value={base.description}
            disabled={disabled}
            rows={3}
            onChange={(event) =>
              updateBase(
                'description',
                optionalString(event.target.value),
              )
            }
          />
          <FieldError message={errors['base:description']} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="base-tags">标签</Label>
          <ListInput
            id="base-tags"
            values={base.tags}
            item="string"
            disabled={disabled}
            onChange={(values) =>
              updateBase('tags', optionalList(values))
            }
          />
          <FieldError message={errors['base:tags']} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="base-categories">分类</Label>
          <ListInput
            id="base-categories"
            values={base.categories}
            item="string"
            disabled={disabled}
            onChange={(values) =>
              updateBase('categories', optionalList(values))
            }
          />
          <FieldError message={errors['base:categories']} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="base-cover">封面</Label>
          <Input
            id="base-cover"
            value={base.cover}
            disabled={disabled}
            placeholder="/images/cover.jpg"
            onChange={(event) =>
              updateBase(
                'cover',
                optionalString(event.target.value),
              )
            }
          />
          <FieldError message={errors['base:cover']} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="base-draft">草稿</Label>
          <Switch
            id="base-draft"
            checked={base.draft}
            disabled={disabled}
            onCheckedChange={(checked) =>
              updateBase('draft', checked ? true : undefined)
            }
          />
        </div>
        <FieldError message={errors['base:draft']} />
      </section>

      {groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            主题字段
          </h2>
          {groups.map((group) => (
            <div key={group.name} className="space-y-3">
              {groups.length > 1 && (
                <h3 className="text-xs font-medium text-muted-foreground">
                  {group.name}
                </h3>
              )}
              {group.fields.map((descriptor) => (
                <ThemeField
                  key={descriptor.key}
                  descriptor={descriptor}
                  value={properties.themeValues[descriptor.key]}
                  error={errors[`theme:${descriptor.key}`]}
                  disabled={disabled}
                  onChange={(value) =>
                    onChange(
                      [
                        'theme',
                        properties.themeId,
                        descriptor.key,
                      ],
                      value,
                    )
                  }
                />
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
