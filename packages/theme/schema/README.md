# Wordma theme schema

`theme.schema.json` 由 `@wordma/content` 的 `ThemeManifestSchema` 生成，不要手工修改。

重新生成：

```bash
pnpm schema:generate
```

编辑器中使用：

```yaml
# yaml-language-server: $schema=../../packages/theme/schema/theme.schema.json
```

说明：

- 使用 `zod` 4 的 `z.toJSONSchema(..., { io: 'input' })`
- 带默认值的字段在 YAML 中是可选的
- 重复 key、字段 key 冲突等跨字段规则由 zod 在构建期校验，JSON Schema 只负责结构
