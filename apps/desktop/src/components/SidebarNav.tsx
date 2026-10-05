import { App as AntdApp, Menu } from "antd";
import {
  BgColorsOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FolderOutlined,
  SettingOutlined,
  TagsOutlined,
} from "@ant-design/icons";
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
  const { articles } = useSite();
  const { message } = AntdApp.useApp();
  const [location, navigate] = useLocation();

  const selectedKey =
    location.startsWith("/articles") || location.startsWith("/editor")
      ? "/articles"
      : "/";

  const items = [
    { key: "/", icon: <DashboardOutlined />, label: "仪表盘" },
    {
      key: "/articles",
      icon: <FileTextOutlined />,
      label: "文章",
      // antd v6 MenuItem 的 extra 槽：靠右对齐（对应设计稿 .nav-count）
      extra: <span {...stylex.props(styles.countPill)}>{articles.length}</span>,
    },
    { key: "/tags", icon: <TagsOutlined />, label: "标签" },
    { key: "/categories", icon: <FolderOutlined />, label: "分类" },
    { key: "/themes", icon: <BgColorsOutlined />, label: "主题" },
    { key: "/settings", icon: <SettingOutlined />, label: "设置" },
  ];

  return (
    <Menu
      mode="vertical"
      selectedKeys={[selectedKey]}
      items={items}
      onClick={({ key }) => {
        if (key === "/" || key === "/articles") {
          navigate(key);
          return;
        }
        const label = items.find((i) => i.key === key)?.label;
        message.info(`「${typeof label === "string" ? label : key}」建设中`);
      }}
    />
  );
}
