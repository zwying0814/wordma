import * as stylex from "@stylexjs/stylex";

// 编辑器页外壳（对应设计稿 .editor/.editor-top/.editor-col），
// 文章编辑器与独立页面编辑器共用；meta 区为各编辑器自有。
export const editorStyles = stylex.create({
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    backgroundColor: "var(--ant-color-bg-container)",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 20px",
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
  },
  saveHint: {
    fontSize: 12,
    color: "var(--ant-color-text-tertiary)",
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    justifyContent: "center",
    overflowY: "auto",
  },
  col: {
    width: "100%",
    padding: "28px 32px 64px",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  titleInput: {
    width: "100%",
    borderStyle: "none",
    background: "transparent",
    padding: "0 0 6px",
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1.4,
    color: "var(--ant-color-text)",
    minWidth: 0,
  },
  fieldError: {
    fontSize: 12,
    color: "var(--ant-color-error)",
    marginBottom: 4,
  },
});
