import { z } from 'zod';

import {
  PAGE_FIELD_KEY_PATTERN,
  SETTING_KEY_PATTERN,
  isReservedPageField,
} from '../theme-fields';
import { ThemeOptionSchema } from './common';

export const ThemeFieldKeySchema = z
  .string()
  .regex(
    PAGE_FIELD_KEY_PATTERN,
    '字段 key 必须以小写字母开头，只能包含字母、数字和下划线',
  )
  .refine(
    (key) => !isReservedPageField(key),
    '字段 key 不能与基础字段或 theme 命名空间冲突',
  );

export const ThemeSettingKeySchema = z
  .string()
  .regex(
    SETTING_KEY_PATTERN,
    '设置 key 必须以字母开头，只能包含字母、数字和下划线',
  );

const fieldBase = {
  key: ThemeFieldKeySchema,
  label: z.string().min(1),
  help: z.string().optional(),
  group: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
};

export const TextFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('text'),
  default: z.string().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
});

export const TextareaFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('textarea'),
  default: z.string().optional(),
  rows: z.number().int().positive().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
});

export const NumberFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('number'),
  default: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
});

export const SwitchFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('switch'),
  default: z.boolean().optional(),
});

export const SelectFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('select'),
  options: z.array(ThemeOptionSchema).min(1),
  default: z.string().optional(),
});

export const ColorFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('color'),
  default: z.string().optional(),
});

export const ImageFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('image'),
  default: z.string().optional(),
});

export const DateFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('date'),
  default: z.string().optional(),
});

export const ListFieldSchema = z.strictObject({
  ...fieldBase,
  type: z.literal('list'),
  item: z.enum(['string', 'number']),
  default: z.union([z.array(z.string()), z.array(z.number())]).optional(),
  minItems: z.number().int().nonnegative().optional(),
  maxItems: z.number().int().positive().optional(),
});

const FieldDescriptorUnion = z.discriminatedUnion('type', [
  TextFieldSchema,
  TextareaFieldSchema,
  NumberFieldSchema,
  SwitchFieldSchema,
  SelectFieldSchema,
  ColorFieldSchema,
  ImageFieldSchema,
  DateFieldSchema,
  ListFieldSchema,
]);

export const FieldDescriptorSchema = FieldDescriptorUnion.superRefine(
  (field, ctx) => {
    if (field.type === 'text' || field.type === 'textarea') {
      if (
        field.minLength !== undefined &&
        field.maxLength !== undefined &&
        field.minLength > field.maxLength
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'minLength 不能大于 maxLength',
          path: ['minLength'],
        });
      }
    }

    if (field.type === 'number') {
      if (
        field.min !== undefined &&
        field.max !== undefined &&
        field.min > field.max
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'min 不能大于 max',
          path: ['min'],
        });
      }
    }

    if (field.type === 'select') {
      const values = new Set<string>();
      field.options.forEach((option, index) => {
        if (values.has(option.value)) {
          ctx.addIssue({
            code: 'custom',
            message: `选项 value 重复：${option.value}`,
            path: ['options', index],
          });
        }
        values.add(option.value);
      });

      if (field.default !== undefined && !values.has(field.default)) {
        ctx.addIssue({
          code: 'custom',
          message: '默认值必须是选项之一',
          path: ['default'],
        });
      }
    }

    if (field.type === 'list') {
      if (
        field.minItems !== undefined &&
        field.maxItems !== undefined &&
        field.minItems > field.maxItems
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'minItems 不能大于 maxItems',
          path: ['minItems'],
        });
      }

      if (field.default !== undefined) {
        const valid =
          field.item === 'string'
            ? field.default.every((value) => typeof value === 'string')
            : field.default.every((value) => typeof value === 'number');

        if (!valid) {
          ctx.addIssue({
            code: 'custom',
            message: `列表默认值必须是 ${field.item} 数组`,
            path: ['default'],
          });
        }
      }
    }
  },
);

export const ThemeFieldListSchema = z.array(FieldDescriptorSchema);

const settingBase = {
  key: ThemeSettingKeySchema,
  label: z.string().min(1),
  help: z.string().optional(),
  required: z.boolean().optional(),
};

export const TextSettingSchema = z.strictObject({
  ...settingBase,
  type: z.literal('text'),
  default: z.string().optional(),
});

export const TextareaSettingSchema = z.strictObject({
  ...settingBase,
  type: z.literal('textarea'),
  default: z.string().optional(),
  rows: z.number().int().positive().optional(),
});

export const NumberSettingSchema = z.strictObject({
  ...settingBase,
  type: z.literal('number'),
  default: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
});

export const SwitchSettingSchema = z.strictObject({
  ...settingBase,
  type: z.literal('switch'),
  default: z.boolean().optional(),
});

export const SelectSettingSchema = z.strictObject({
  ...settingBase,
  type: z.literal('select'),
  options: z.array(ThemeOptionSchema).min(1),
  default: z.string().optional(),
});

export const ColorSettingSchema = z.strictObject({
  ...settingBase,
  type: z.literal('color'),
  default: z.string().optional(),
});

export const ImageSettingSchema = z.strictObject({
  ...settingBase,
  type: z.literal('image'),
  default: z.string().optional(),
});

const ThemeSettingDescriptorUnion = z.discriminatedUnion('type', [
  TextSettingSchema,
  TextareaSettingSchema,
  NumberSettingSchema,
  SwitchSettingSchema,
  SelectSettingSchema,
  ColorSettingSchema,
  ImageSettingSchema,
]);

export const ThemeSettingDescriptorSchema =
  ThemeSettingDescriptorUnion.superRefine((setting, ctx) => {
    if (setting.type === 'number') {
      if (
        setting.min !== undefined &&
        setting.max !== undefined &&
        setting.min > setting.max
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'min 不能大于 max',
          path: ['min'],
        });
      }
    }

    if (setting.type === 'select') {
      const values = new Set<string>();
      setting.options.forEach((option, index) => {
        if (values.has(option.value)) {
          ctx.addIssue({
            code: 'custom',
            message: `选项 value 重复：${option.value}`,
            path: ['options', index],
          });
        }
        values.add(option.value);
      });

      if (setting.default !== undefined && !values.has(setting.default)) {
        ctx.addIssue({
          code: 'custom',
          message: '默认值必须是选项之一',
          path: ['default'],
        });
      }
    }
  });

export const ThemeSettingListSchema = z.array(ThemeSettingDescriptorSchema);
