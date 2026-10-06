import { App as AntdApp, Menu } from "antd";
import {
  FileText,
  FileStack,
  Folder,
  Image as ImageIcon,
  LayoutDashboard,
  Palette,
  Settings,
  Tags,
} from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { useLocation } from "wouter";
import { useSite } from "../context/SiteContext";

const styles = stylex.create({
  countPill: {
    fontSize: 11,
    lineHeight: "18px",
    padding: "0 7px",
    borderRadius: 999,
    color: "var(--ant-color-text-tertiary)",
    backgroundColor: "var(--ant-color-fill-secondary)",
  },
});

export default function SidebarNav() {
  const { articles, tags, categories, media } = useSite();
  const { message } = AntdApp.useApp();
  const [location, navigate] = useLocation();

  const selectedKey = location.startsWith("/articles") || location.startsWith("/editor")
    ? "/articles"
    : location.startsWith("/media")
      ? "/media"
      : location.startsWith("/pages")
      ? "/pages"
      : location.startsWith("/themes")
        ? "/themes"
        : location.startsWith("/settings")
          ? "/settings"
          : "/";

  const items = [
    { key: "/", icon: <LayoutDashboard size={16} />, label: "仪表盘" },
    {
      key: "/articles",
      icon: <FileText size={16} />,
      label: "文章",
      // antd v6 MenuItem 的 extra 槽：靠右对齐（对应设计稿 .nav-count）
      extra: <span {...stylex.props(styles.countPill)}>{articles.length}</span>,
    },
    {
      key: "/tags",
      icon: <Tags size={16} />,
      label: "标签",
      extra: <span {...stylex.props(styles.countPill)}>{tags.length}</span>,
    },
    {
      key: "/categories",
      icon: <Folder size={16} />,
      label: "分类",
      extra: <span {...stylex.props(styles.countPill)}>{categories.length}</span>,
    },
    {
      key: "/media",
      icon: <ImageIcon size={16} />,
      label: "媒体库",
      extra: <span {...stylex.props(styles.countPill)}>{media.length}</span>,
    },
    { key: "/pages", icon: <FileStack size={16} />, label: "页面" },
    { key: "/themes", icon: <Palette size={16} />, label: "主题" },
    { key: "/settings", icon: <Settings size={16} />, label: "设置" },
  ];

  return (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={items}
      onClick={({ key }) => {
        if (
          key === "/" ||
          key === "/articles" ||
          key === "/tags" ||
          key === "/categories" ||
          key === "/media" ||
          key === "/pages" ||
          key === "/themes" ||
          key === "/settings"
        ) {
          navigate(key);
          return;
        }
        const label = items.find((i) => i.key === key)?.label;
        message.info(`「${typeof label === "string" ? label : key}」建设中`);
      }}
    />
  );
}
