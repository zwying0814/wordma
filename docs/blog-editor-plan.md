# Wordma 桌面端博客文章编辑器（Plate.js 精简版）—— 任务清单

> 参考模板：`tmp/plate-playground-template` · 目标：`apps/desktop` · 技术细节见附录 A–F
> 执行方式：按任务顺序逐个完成；每个任务的**端到端验收**全绿才算完成，再进入下一个。

## 已确认决策

- **功能范围（精简版）**：段落 / H1-H3 / 引用 / 分割线 / 代码块（高亮+语言选择）/ 列表（含缩进）/ 表格 / **图片（URL 插入 + 拖拽调整大小）** / 链接（浮动编辑）/ 对齐 / 字色+背景色+高亮 / B I U S 行内代码 kbd / emoji 选择器 / 撤销重做 / 固定+浮动工具栏 / markdown 粘贴解析。
- **排除**：AI、协作批注、评论、@提及、拖拽排序、slash 命令、callout、toggle 块、分栏、TOC、公式、音视频/文件、DOCX/PDF 导出、图片图注/浮层工具栏。
- **持久化**：暂不（内存 demo value）。

## E2E 测试基建（在 T1 中一次性建立）

- **框架**：Playwright `_electron` API。复用 electron 包内自带 Chromium，**无需** `playwright install` 下载浏览器。
- **加载方式**：测试前 `vite build`，Electron 走 `main.mjs` 的 dist 分支（无 dev server 时序问题）。electron/main.mjs 已有 dist 加载 + 错误弹窗逻辑。
- **文件布局**（apps/desktop 下）：
  - `playwright.config.ts` —— `testDir: './e2e'`，`fullyParallel: false`（共享一个应用实例策略见 helper）
  - `e2e/launch.ts` —— helper：`electron.launch({ args: ['electron/main.mjs'] })` → `firstWindow()` → 等待 `[data-slate-editor]` 出现 → 返回 `{ app, page }`；afterEach 关闭 app
  - `e2e/*.spec.ts` —— 每个任务一个 spec 文件
- **npm 脚本**：`"e2e": "vite build && playwright test"`、`"e2e:headed": "vite build && playwright test --headed"`
- **devDeps 新增**：`@playwright/test`
- **断言约定**：DOM 层断言（slate 渲染出的元素类型/样式/文本）。移植组件时按需补 `data-testid`（如浮动工具栏 `data-testid="floating-toolbar"`）。Slate contenteditable 一律用 `page.keyboard` 输入，不用 `fill()`。
- **每个任务的通用验收**：`pnpm --filter desktop exec tsc -b` 通过 + `pnpm --filter desktop run e2e` 全绿 + 全部既有 spec 无回归。

---

## 任务列表

### T1 · 测试基建 + 编辑器骨架

**改动**：安装附录 A 全部依赖 + `@playwright/test`；`index.css` 补 `--brand` token（附录 A）；新建 `playwright.config.ts` + `e2e/launch.ts`；新建 `src/components/editor/plate-editor.tsx`（先用现有 `BasicBlocksKit + BasicMarksKit + MarkdownKit` 组成过渡 kit）+ `App.tsx` 替换为 `<BlogEditor/>`（固定工具栏暂保留现有几个按钮）。

**端到端验收（`e2e/smoke.spec.ts`）**：
1. Electron 窗口启动，`[data-slate-editor]` 可见
2. 键盘输入中文/英文文本，DOM 中出现对应段落
3. Enter 换行产生新块；Backspace 删除
4. 现有按钮（H1/加粗等）点击后 DOM 生效（h1 元素 / strong）

### T2 · Base UI 原语：popover.tsx + checkbox.tsx

**改动**：新建 `src/components/ui/popover.tsx`（`@base-ui/react/popover`，导出 Popover/PopoverTrigger/PopoverContent/PopoverAnchor shim，见附录 B）、`src/components/ui/checkbox.tsx`（`@base-ui/react/checkbox` 最小版）。

**端到端验收（`e2e/regression.spec.ts`）**：smoke 全部用例回归通过（原语本身无独立 UI 入口，随 T7/T9/T10 的消费者被真实驱动）。

### T3 · 浮动工具栏

**改动**：移植 `floating-toolbar.tsx` + `floating-toolbar-buttons.tsx`（裁剪为 TurnInto 占位先略、B/I/U/S/Code、More 后置），补 `data-testid="floating-toolbar"`。详见附录 C-4a。

**端到端验收（`e2e/floating-toolbar.spec.ts`）**：
1. 选中一段文本（shift+方向键/双击）→ 浮动工具栏出现
2. 点击浮动栏的 B → 文本加粗（strong）；点 I/U/S 同理
3. 取消选择 → 工具栏消失

### T4 · 链接（插入 + 浮动编辑 + autolink）

**改动**：`@platejs/link` 依赖；`link-kit.tsx`、`link-node.tsx`、`link-toolbar.tsx`、`link-toolbar-button.tsx`；`transforms.ts`（link 部分）；浮动工具栏按钮组加入 Link。见附录 C。

**端到端验收（`e2e/link.spec.ts`）**：
1. 选中文字 → 点 Link → 输入 URL 回车 → 编辑器出现 `a[href]` 且文本不变
2. 点击链接 → 浮动链接条出现（Edit/Open/Unlink）；Unlink 后 `a` 消失
3. 输入 `https://platejs.org` + 空格 → 自动变成链接（autolink）
4. 粘贴含 markdown 链接的文本 → 解析为 a 节点

### T5 · 代码块

**改动**：`@platejs/code-block` + lowlight 依赖；`code-block-kit.tsx`、`code-block-node.tsx`（语言选择器：Popover + 过滤 input + 列表，cmdk 自实现替代）；固定工具栏加入代码块按钮（或 Insert 菜单先行版本）。

**端到端验收（`e2e/code-block.spec.ts`）**：
1. 输入三个反引号 + 回车 → `pre`/code_block 块出现
2. 工具栏按钮插入代码块；语言下拉可搜索、切换语言后高亮 class 变化
3. 复制按钮输出剪贴板内容（断言 clipboard 权限内可简化为按钮存在 + 不抛错）
4. 块内多行输入（Enter 软换行）正常

### T6 · 表格

**改动**：`@platejs/table` 依赖；`table-kit.tsx`、`table-node.tsx`（最重移植，附录 C 注明裁剪点）、`table-icons.tsx`、`table-toolbar-button.tsx`；固定工具栏加入表格按钮。

**端到端验收（`e2e/table.spec.ts`）**：
1. 表格按钮 → 网格选择 3×3 → `table/tr/th|td` DOM 出现
2. 单元格输入文字正常
3. 单元格浮动工具栏：下方加行 / 右侧加列 → 行列数 +1
4. 删除行/列 → 行列数 -1；表头切换
5. 列宽拖拽手柄拖动后 `col` 宽度变化
6. 表格后 Enter 可跳出表格（TrailingBlock 之前先验证能退出）

### T7 · 图片（URL 插入 + 拖拽调整大小）

**改动**：`@platejs/media` + `@platejs/resizable` 依赖；`image-node.tsx`（`withHOC(ResizableProvider)` + `<Resizable>` + 左右 `<ResizeHandle>`，模板原实现）、`resize-handle.tsx`（88 行原样移植，零 Radix）、`image-toolbar-button.tsx`（新写：Popover + URL input）、media-kit.tsx。

**端到端验收（`e2e/image.spec.ts`）**：
1. 图片按钮 → Popover 输入 URL → 插入 → `img[src]` 出现于编辑器
2. hover 图片两侧出现拖拽条；`mouse.down/move/up` 拖拽后 figure 宽度 style 变化
3. 对齐按钮作用于图片（左/居中/右，Resizable mx-auto 等类变化）
4. 点击图片出现选中 ring；Delete 删除图片
5. 插入非法 URL（非 http）被拒绝（按钮校验 isUrl）

### T8 · 列表 + 缩进

**改动**：`@platejs/list` + `@platejs/indent` 依赖；`list-kit.tsx`（含 IndentKit）、`block-list.tsx`、`list-toolbar-button.tsx`（3 个按钮）、`indent-toolbar-button.tsx`；固定工具栏加入。

**端到端验收（`e2e/list.spec.ts`）**：
1. 行首输入 `- ` → `ul/li`；`1. ` → `ol`；`[] ` → todo（checkbox 出现）
2. todo 点击勾选 → checked 状态变化
3. 列表内 Tab 缩进 / Shift+Tab 反缩进（indent 值变化）；工具栏缩进按钮同效
4. 三种列表的工具栏按钮可切换/取消
5. 列表项 Enter 连续创建，空项 Enter 退出列表

### T9 · 对齐 + 字色/背景色

**改动**：`@platejs/basic-styles` 依赖；`align-kit.tsx`、`font-kit.tsx`、`align-toolbar-button.tsx`、`font-color-toolbar-button.tsx`；固定/浮动工具栏加入。

**端到端验收（`e2e/align-color.spec.ts`）**：
1. 选中段落点居中 → 块元素 `style.textAlign="center"`；左/右/两端同效
2. 选中文字 → 字色 → 选色板色块 → 包裹 span 的 `style.color` 变化
3. 背景色同理（backgroundColor）；自定义 hex 输入生效
4. 清除颜色后样式移除

### T10 · Emoji

**改动**：`@platejs/emoji` + `@emoji-mart/data` 依赖；`emoji-kit.tsx`、`emoji-toolbar-button.tsx`（Radix Popover→新 popover parts 适配）。

**端到端验收（`e2e/emoji.spec.ts`）**：
1. 点 Emoji 按钮 → 选择器弹出（搜索框/分类导航可见）
2. 搜索 "tada" → 点击 → 光标处插入 🎉 字符
3. 分类切换正常；关闭后焦点回编辑器
4. 粘贴含 `:tada:` 的 markdown → 转为 emoji 字符

### T11 · 输入增强：autoformat + exit-break + trailing block

**改动**：`autoformat-kit.tsx`（智能引号/箭头等文本替换；`==` 与高亮规则冲突则删 equalityRule）、`exit-break-kit.tsx`、`TrailingBlockPlugin` 加入聚合 kit。

**端到端验收（`e2e/input-enhance.spec.ts`）**：
1. 输入 `"` `->` 等触发替换 → 变为智能引号/→
2. 输入 `==高亮==` → 高亮 mark（若被 autoformat 抢占，按附录 E-5 删规则后复测）
3. mod+enter 在块中部 → 下方插入空段；表格/hr 后始终存在尾块
4. markdown 粘贴回归（标题/列表/表格/代码围栏）

### T12 · 固定工具栏完整化

**改动**：`fixed-toolbar-buttons.tsx` 完整版；`history-toolbar-button.tsx`、`turn-into-toolbar-button.tsx`、`insert-toolbar-button.tsx`、`more-toolbar-button.tsx`、`mark-toolbar-button` 复用、`transforms.ts` 完整版；`plate-editor.tsx` 切换为最终 `BlogEditorKit` 聚合（附录 D）。

**端到端验收（`e2e/toolbar-full.spec.ts`）**：
1. Undo/Redo：输入→撤销→文本消失→重做→恢复
2. Turn into：段落转 H1/H2/列表/引用/代码块，DOM 类型相应变化
3. Insert 菜单逐项插入成功（与 T5/T6/T7 的独立 spec 互为回归）
4. More 菜单：kbd/上标/下标生效
5. 浮动工具栏与固定工具栏互不干扰（选区操作后工具栏状态正确）

### T13 · 终验：全量回归 + 打包

**改动**：无新功能；修 T1–T12 遗留问题。

**端到端验收**：
1. `pnpm --filter desktop exec tsc -b && pnpm --filter desktop build` 通过
2. `pnpm --filter desktop run e2e` 全部 spec 通过
3. 残留检查清零：`grep -rnE "@radix-ui|asChild|onSelect=|@ariakit|cmdk|lodash|@udecode/cn|@platejs/(dnd|selection|caption)" apps/desktop/src`
4. 手动走查附录 F 完整清单（含滚动吸顶、窗口缩放、中文输入法连续输入）

---

## 附录 A · 依赖

repo 根目录执行：

```bash
pnpm --filter desktop add \
  @platejs/basic-styles@^53.0.0 @platejs/code-block@^53.0.0 @platejs/emoji@^53.1.7 \
  @platejs/floating@^53.0.0 @platejs/indent@^53.0.0 @platejs/link@^53.3.5 \
  @platejs/list@^53.3.13 @platejs/media@^53.1.4 @platejs/resizable@^53.0.0 \
  @platejs/table@^53.0.9 lowlight@^3.3.0 @emoji-mart/data@1.2.1
pnpm --filter desktop add -D @playwright/test
```

明确不加：@platejs/caption、dnd、selection、combobox；@ariakit/react、cmdk、lodash、sonner、use-file-picker。

`index.css` 补 brand token：`@theme inline` 加 `--color-brand: var(--brand);`；`:root` 加 `--brand: oklch(0.623 0.214 259.815);`；`.dark` 加 `--brand: oklch(0.707 0.165 254.624);`

已验证的关键结论：① 不能用 `shadcn add @plate/*`（注册表返回 Radix 组件）；② desktop `cn` 包 = `twMerge(clsx())` 等价实现（读源码确认）；③ 工具栏用纯 JSX 渲染在 `<Plate>` 内，不移植 toolbar-kit；④ emoji `insertEmoji` 只插纯文本，可跳过 EmojiInputPlugin/inline-combobox（避开 ariakit）；⑤ `useComposedRef`/`withHOC` 由 `platejs/react` 直接导出。

## 附录 B · Radix→Base UI 转换规则（每个移植文件套用）

| Radix（模板） | Base UI（desktop） |
|---|---|
| `<X asChild><Y/></X>` | `<X render={<Y/>} />`；render 到 `<span>` 加 `nativeButton={false}` |
| `DropdownMenuItem onSelect` | `onClick`（漏改会静默失效） |
| `onCloseAutoFocus={…focus()}` | 菜单根 `onOpenChangeComplete={(open)=>{!open && editor.tf.focus()}}` |
| `onOpenAutoFocus preventDefault` | `PopoverContent` 上 `initialFocus={false}` |
| `TooltipTrigger asChild` | `render=`；`TooltipProvider delayDuration` → `delay` |
| `usePluginOption(comment/suggestion/aiChat…)` | 删除（插件不存在） |
| `useComposedRef`（@udecode/cn） | 从 `platejs/react` 导入 |

popover.tsx 要点：Base UI 无 Anchor part → `PopoverAnchor` 用 `render={<span className="contents"/>}` 的 trigger shim（表格浮动工具栏用）；Popup 基类只留 `z-50 outline-none`，视觉由调用方传。严格 TS：`import type`、删净未用导入、每任务跑 `tsc -b`。

## 附录 C · 文件移植清单

缩写：`TPL` = `tmp/plate-playground-template/src`，`DST` = `apps/desktop/src`。

**C-4a 基础设施**
| 目标 | 来源 | 要点 |
|---|---|---|
| DST/components/editor/transforms.ts | TPL/editor/transforms.ts | 保留 insertBlock/setBlockType/insertList/setList/getBlockType/insertInlineElement；裁剪为 ul/ol/listTodo/codeBlock/table/link；去掉 SuggestionPlugin 包装 |
| DST/components/ui/floating-toolbar.tsx | TPL 同名 | useComposedRef 改 platejs/react；删 aiChat usePluginOption；hideToolbar 只留 isFloatingLinkOpen；加 data-testid="floating-toolbar" |
| DST/components/ui/fixed-toolbar-buttons.tsx | TPL 同名 | 重写裁剪（T12 完整化）：Undo/Redo、Insert+TurnInto、marks、字色/背景/高亮、对齐+列表、Link/Table/Image/Emoji、缩进、More |
| DST/components/ui/floating-toolbar-buttons.tsx | TPL 同名 | 裁剪为 B/I/U/S/Code、Link、More |

**C-4b 工具栏按钮**（DST/components/ui/）
| 目标 | 来源 | 要点 |
|---|---|---|
| history-toolbar-button.tsx | TPL 同名 | 原样 |
| turn-into-toolbar-button.tsx | TPL 同名 | 裁到 Text/H1-3/三种列表/Code/Quote |
| insert-toolbar-button.tsx | TPL 同名 | 分组裁到基础块/列表/Inline(link) |
| more-toolbar-button.tsx | TPL 同名 | kbd/上标/下标 |
| font-color-toolbar-button.tsx | TPL 同名 | 全保留（table-node 引用其导出）；lodash debounce→直接调用 |
| align-toolbar-button.tsx | TPL 同名 | render=、onValueChange |
| list-toolbar-button.tsx | TPL 同名 | split 次按钮 `nativeButton={false} render=` |
| indent-toolbar-button.tsx | TPL 同名 | 原样 |
| link-toolbar-button.tsx / link-toolbar.tsx / link-node.tsx | TPL 同名 | 删 comment/suggestion usePluginOption / inlineSuggestionVariants |
| table-toolbar-button.tsx | TPL 同名 | 保留 Sub 菜单与 TablePicker 网格 |
| emoji-toolbar-button.tsx | TPL 同名 | Radix Popover→新 popover parts |
| image-toolbar-button.tsx | **新写** | Popover + URL input + isUrl 校验 + `editor.tf.insertNodes({type:KEYS.img,url},{select:true})` |

**C-4c 节点组件**（DST/components/ui/）
| 目标 | 来源 | 要点 |
|---|---|---|
| table-icons.tsx | TPL 同名 | 原样 |
| table-node.tsx | TPL 同名（~900 行，最重） | 删 dnd/selection/resizable 相关（拖拽手柄 td、useBlockSelected 覆盖层、resizeLengthClampStatic→本地 clamp）；isSelectionAreaVisible 硬编码 false；controlColumnWidth=0；TableFloatingToolbar 用 Popover+PopoverAnchor shim（initialFocus={false}） |
| code-block-node.tsx | TPL 同名 | cmdk→Popover+过滤 input+按钮列表自实现 |
| resize-handle.tsx | TPL 同名 | **原样（88 行，零 Radix）**：mediaResizeHandleVariants/ResizeHandle/Resizable |
| image-node.tsx | TPL/ui/media-image-node.tsx 裁剪 | 保留缩放：withHOC(ResizableProvider)+Resizable+左右 ResizeHandle；裁掉 useDraggable/Caption/MediaToolbar |
| block-list.tsx | TPL 同名 | 原样（TodoMarker/TodoLi） |
| checkbox.tsx | **新写** | @base-ui/react/checkbox 最小版 |
| media-preview-dialog.tsx | TPL 同名（可选） | 图片点击放大；render.afterEditable 挂载 |

不移植：所有 *-static.tsx、toolbar.tsx、caption、media-toolbar(-button)、inline-combobox、block-selection、两个 toolbar-kit、select/command/dialog。

## 附录 D · 插件 kits（DST/components/editor/plugins/）

- `align-kit.tsx`：TextAlignPlugin（targetPlugins: headings/p/img）
- `font-kit.tsx`：FontColorPlugin(defaultNodeValue 'black') + FontBackgroundColorPlugin（+FontSize/FontFamily 留作 markdown 往返）
- `code-block-kit.tsx`：createLowlight(all)；CodeBlockPlugin(markdown input rule, mod+alt+8, lowlight) + CodeLine/CodeSyntax withComponent
- `link-kit.tsx`：LinkPlugin（markdown+3 种 autolink 规则；render.node=LinkElement, afterEditable=LinkFloatingToolbar）
- `indent-kit.tsx`：IndentPlugin(offset 24)
- `list-kit.tsx`：[...IndentKit, ListPlugin（6 条 markdown 规则 + nodeProps 注入 + render.belowNodes=BlockList）]
- `media-kit.tsx`：[ImagePlugin（disableUploadInsert:true; render.node=ImageElement, afterEditable=MediaPreviewDialog）]
- `table-kit.tsx`：Table/TableRow/TableCell/TableCellHeader withComponent
- `emoji-kit.tsx`：[EmojiPlugin(options.data=emojiMartData)]
- `exit-break-kit.tsx`：mod+enter / mod+shift+enter
- `autoformat-kit.tsx`：智能引号/箭头/分数文本替换规则
- `blog-editor-kit.tsx`（聚合）：`[...BasicBlocksKit, ...CodeBlockKit, ...TableKit, ...MediaKit, ...LinkKit, ...BasicMarksKit, ...FontKit, ...ListKit, ...AlignKit, ...AutoformatKit, ...EmojiKit, ...ExitBreakKit, TrailingBlockPlugin, ...MarkdownKit]`

plate-editor.tsx 组合：`usePlateEditor({plugins: BlogEditorKit, value: 博客风 demo value})`；JSX：`<EditorContainer className="h-[calc(100vh-3rem)] max-w-4xl">` 内 `<FixedToolbar><FixedToolbarButtons/></FixedToolbar>` + `<Editor variant="demo"/>` + `<FloatingToolbar><FloatingToolbarButtons/></FloatingToolbar>`。

## 附录 E · 风险

1. 表格浮动工具栏 PopoverAnchor shim 定位异常 → 改用 useFloatingToolbar 机制
2. 漏改 asChild/onSelect → 每任务 grep 检查（T13 终验清零）
3. table-node 自研指针 resize 控制器风险最高 → 必要时先删 TableCellResizeControls 降级
4. lowlight 全语法 ~1MB、@emoji-mart/data ~600KB —— Electron 可接受；后续可换 lowlight common 子集
5. `==` autoformat 与高亮输入规则冲突 → 删 equalityRule
6. E2E 特有：Slate contenteditable 对 `fill()` 不友好（只用键盘事件）；中文输入法组合输入在 Playwright 下需 `keyboard.insertText` 模拟

## 附录 F · 手动终验清单（T13）

1. 输入规则全量：`# `/`- `/`1. `/`[] `/`> `/代码围栏；mod+alt+1..3
2. 中文输入法连续输入、组词回删不丢字
3. 固定工具栏滚动吸顶；窗口缩放布局不破
4. 浮动工具栏随选区出现、链接条打开时隐藏
5. 粘贴富文本/markdown 混合内容
6. 全部按钮逐一走查（对照 T4–T12 的 e2e 场景人工复核一遍）
