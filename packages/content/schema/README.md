# Wordma site schema

`site.schema.json` 由 `@wordma/content` 的 `SiteConfigSchema` 生成，不要手工修改。

重新生成：

```bash
pnpm schema:generate
```

编辑器中使用：

```yaml
# yaml-language-server: $schema=../../packages/content/schema/site.schema.json
```

说明：

- 使用 `zod` 4 的 `z.toJSONSchema(..., { io: 'input' })`
- 带默认值的字段在 YAML 中是可选的
- zod 的 `superRefine` 跨字段校验不会被 JSON Schema 表达，构建期仍由 zod 校验
