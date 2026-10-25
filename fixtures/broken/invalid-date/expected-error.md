# 预期错误

M1 内容索引应检测到 `date: 2026-02-31` 不是合法日期。

- 错误层级：内容索引
- diagnostic code：`INVALID_DATE`
- frontmatter 本身通过基础 schema，错误由日期解析阶段产生
