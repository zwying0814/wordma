import * as stylex from "@stylexjs/stylex";

// 页面骨架与卡片行列表的共享样式（对应设计稿 .view/.page-head/.card/.rowitem），
// 文章页、标签页、分类页共用；行是否可点击由 rowClickable 区分。
export const pageStyles = stylex.create({
  view: {
    height: "100%",
    overflowY: "auto",
    padding: "28px 36px 48px",
  },
  pageHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--ant-color-text)",
  },
  pageSub: {
    fontSize: 13,
    marginTop: 2,
    color: "var(--ant-color-text-tertiary)",
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  searchBox: {
    width: 220,
    maxWidth: "44%",
    marginLeft: "auto",
  },
  card: {
    backgroundColor: "var(--ant-color-bg-container)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--ant-color-border-secondary)",
    borderRadius: 10,
    overflow: "hidden",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "13px 18px",
    textAlign: "left",
  },
  rowClickable: {
    cursor: "pointer",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--ant-color-fill-quaternary)",
    },
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--ant-color-text)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  rowMeta: {
    fontSize: 12,
    marginTop: 3,
    color: "var(--ant-color-text-tertiary)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  rowSide: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  emptyBox: {
    padding: "48px 0",
  },
});
