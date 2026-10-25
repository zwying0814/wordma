import type {
  ArrayExpression,
  Expression,
  ObjectExpression,
  Program,
  UnaryExpression,
} from 'estree-jsx';
import type { Position } from 'unist';

import { MdxError } from '../errors';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type AttributeValueExpression = {
  type: 'mdxJsxAttributeValueExpression';
  value: string;
  position?: Position;
  data?: {
    estree?: Program | null;
  };
};

type JsxAttribute = {
  type: string;
  name?: string;
  value?: string | null | AttributeValueExpression;
  position?: Position;
};

export type JsxAttributesResult = {
  props: Record<string, JsonValue>;
};

const MAX_PROPS_BYTES = 32 * 1024;
const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

type Context = {
  filePath?: string;
  node?: { position?: Position };
  attributeName?: string;
};

function propsError(
  code: string,
  message: string,
  context: Context,
  attribute?: JsxAttribute,
): MdxError {
  const position =
    attribute?.position ?? context.node?.position;

  return new MdxError(code, message, {
    file: context.filePath,
    line: position?.start?.line,
    column: position?.start?.column,
  });
}

function invalid(
  message: string,
  context: Context,
  attribute?: JsxAttribute,
): MdxError {
  return propsError(
    'INVALID_ISLAND_PROPS',
    message,
    context,
    attribute,
  );
}

function evaluateExpression(
  node: Expression,
  context: Context,
  attribute: JsxAttribute,
): JsonValue {
  switch (node.type) {
    case 'Literal': {
      const { value } = node;

      if (value === null) return null;
      if (typeof value === 'string') return value;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          throw invalid(
            'props 不支持非有限数字',
            context,
            attribute,
          );
        }
        return value;
      }

      throw invalid(
        `props 不支持字面量类型 ${typeof value}`,
        context,
        attribute,
      );
    }

    case 'TemplateLiteral': {
      if (node.expressions.length > 0) {
        throw invalid(
          'props 不支持模板插值',
          context,
          attribute,
        );
      }

      const value = node.quasis
        .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
        .join('');

      return value;
    }

    case 'UnaryExpression': {
      const unary = node as UnaryExpression;
      if (unary.operator !== '-' && unary.operator !== '+') {
        throw invalid(
          `props 不支持一元运算符 ${unary.operator}`,
          context,
          attribute,
        );
      }

      const value = evaluateExpression(
        unary.argument,
        context,
        attribute,
      );
      if (typeof value !== 'number') {
        throw invalid(
          '一元运算符只能用于数字',
          context,
          attribute,
        );
      }

      return unary.operator === '-' ? -value : value;
    }

    case 'ArrayExpression': {
      const array = node as ArrayExpression;
      const values: JsonValue[] = [];

      for (const element of array.elements) {
        if (!element || element.type === 'SpreadElement') {
          throw invalid(
            'props 数组不支持空位或展开',
            context,
            attribute,
          );
        }

        values.push(
          evaluateExpression(element, context, attribute),
        );
      }

      return values;
    }

    case 'ObjectExpression': {
      const object = node as ObjectExpression;
      const result: Record<string, JsonValue> = {};

      for (const property of object.properties) {
        if (
          property.type !== 'Property' ||
          property.kind !== 'init' ||
          property.computed
        ) {
          throw invalid(
            'props 对象只支持静态键值',
            context,
            attribute,
          );
        }

        let key: string;

        if (property.key.type === 'Identifier') {
          key = property.key.name;
        } else if (
          property.key.type === 'Literal' &&
          (typeof property.key.value === 'string' ||
            typeof property.key.value === 'number')
        ) {
          key = String(property.key.value);
        } else {
          throw invalid(
            'props 对象键必须是字符串或数字',
            context,
            attribute,
          );
        }

        if (FORBIDDEN_KEYS.has(key)) {
          throw invalid(
            `props 不允许键 ${key}`,
            context,
            attribute,
          );
        }

        result[key] = evaluateExpression(
          property.value as Expression,
          context,
          attribute,
        );
      }

      return result;
    }

    default:
      throw invalid(
        `props 只支持静态字面量，不支持 ${node.type}`,
        context,
        attribute,
      );
  }
}

function evaluateAttributeValue(
  attribute: JsxAttribute,
  context: Context,
): JsonValue {
  if (attribute.value === null || attribute.value === undefined) {
    return true;
  }

  if (typeof attribute.value === 'string') {
    return attribute.value;
  }

  const program = attribute.value.data?.estree;
  const statement = program?.body[0];

  if (
    !program ||
    program.body.length !== 1 ||
    statement?.type !== 'ExpressionStatement'
  ) {
    throw invalid(
      'props 表达式无法解析',
      context,
      attribute,
    );
  }

  return evaluateExpression(
    statement.expression,
    context,
    attribute,
  );
}

function assertJsonValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  context: Context,
): asserts value is JsonValue {
  if (value === null) return;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (!Number.isFinite(value)) {
        throw invalid(
          `props.${path} 不是有限数字`,
          context,
        );
      }
      return;
    case 'object':
      break;
    default:
      throw invalid(
        `props.${path} 不可序列化`,
        context,
      );
  }

  if (seen.has(value)) {
    throw invalid(
      `props.${path} 存在循环引用`,
      context,
    );
  }

  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertJsonValue(
        item,
        `${path}[${index}]`,
        seen,
        context,
      );
    });
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw invalid(
        `props 不允许键 ${key}`,
        context,
      );
    }

    assertJsonValue(
      item,
      path ? `${path}.${key}` : key,
      seen,
      context,
    );
  }
}

/**
 * 求值 JSX 属性中的静态字面量。
 *
 * 任何函数、调用、标识符或展开都会被拒绝。
 */
export function evaluateJsxAttributes(
  attributes: unknown[],
  context: Context = {},
): JsxAttributesResult {
  const props: Record<string, JsonValue> = {};

  for (const raw of attributes) {
    const attribute = raw as JsxAttribute;

    if (attribute.type === 'mdxJsxExpressionAttribute') {
      throw invalid(
        '不支持展开属性 {...props}',
        context,
        attribute,
      );
    }

    if (
      attribute.type !== 'mdxJsxAttribute' ||
      typeof attribute.name !== 'string'
    ) {
      throw invalid(
        '无法识别的 JSX 属性',
        context,
        attribute,
      );
    }

    props[attribute.name] = evaluateAttributeValue(
      attribute,
      {
        ...context,
        attributeName: attribute.name,
      },
    );
  }

  return { props };
}

function escapeJsonForHtml(json: string): string {
  return json.replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character
        .charCodeAt(0)
        .toString(16)
        .padStart(4, '0')}`,
  );
}

/**
 * 序列化为 JSON，并检查可序列化性与大小。
 *
 * `<`、`>`、`&` 与行分隔符使用 JSON Unicode 转义，
 * 引号与属性值再由 hast 序列化器转义。
 */
export function serializeIslandProps(
  props: Record<string, JsonValue>,
  context: Context = {},
): string {
  assertJsonValue(props, '', new WeakSet(), context);

  const json = escapeJsonForHtml(
    JSON.stringify(props),
  );
  const bytes = new TextEncoder().encode(json).length;

  if (bytes > MAX_PROPS_BYTES) {
    throw propsError(
      'PROPS_TOO_LARGE',
      `岛屿 props 超过 ${MAX_PROPS_BYTES} 字节`,
      context,
    );
  }

  return json;
}
