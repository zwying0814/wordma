# Fixtures

用于 M0–M8 的测试输入。fixtures 不加入 pnpm workspace，不会被安装。

## 目录

| Fixture | 用途 | 首次使用 |
|---|---|---|
| `minimal/` | 最小站点、文章、独立页 | M1 内容索引 |
| `islands/` | MDX 客户端组件、带 children 的组件 | M3 |
| `custom-fields/` | 主题扩展文章字段、命名空间存储 | M6 |
| `custom-pages/` | theme pageTypes、动态路由、主题页面 | M2 / M6 |
| `theme-switch/` | 两个主题字段命名空间共存 | M6 |
| `broken/bad-yaml/` | 重复 key，YAML 解析失败 | M0.4 |
| `broken/bad-theme/` | 主题缺 displayName | M0.4 |
| `broken/duplicate-slug/` | 两个文章同 slug | M1 |
| `broken/route-conflict/` | 主题页面与内容页面同路径 | M2 |
| `broken/missing-component/` | MDX 引用不存在的组件 | M3 |

每个 `broken/*` 目录都有 `expected-error.md`，说明预期错误所在的阶段。

## 校验

```bash
pnpm fixtures:validate
```

M0 阶段只校验：

- `wordma.site.yaml` 通过 `SiteConfigSchema`
- `theme.yaml` 通过 `ThemeManifestSchema`
- `content/**/*.mdx` 的 frontmatter 通过 `PageFrontmatterSchema`

`duplicate-slug`、`route-conflict`、`missing-component` 的配置和 frontmatter
本身是合法的，错误留到 M1/M2/M3 检测。

## 主题

fixture 内的主题放在各自的 `themes/<name>/` 下，目前只提供 `theme.yaml`。
安装到 fixture 的 `node_modules` 或补全主题源码在后续里程碑处理。
