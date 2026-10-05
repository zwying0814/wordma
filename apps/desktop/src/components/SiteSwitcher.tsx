import { useState, type CSSProperties } from "react";
import { Avatar, Dropdown } from "antd";
import { CheckOutlined, DownOutlined, PlusOutlined } from "@ant-design/icons";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import type { Site } from "../lib/site";

interface Props {
  sites: Site[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
}

// 触发器带 hover/active 状态，atoms 表达不了伪类，这里用 create；
// 也因此不套 antd Button——避免和它的内部样式打优先级。
const styles = stylex.create({
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    borderStyle: "none",
    cursor: "pointer",
    textAlign: "left",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--ant-color-fill-tertiary)",
      ":active": "var(--ant-color-fill-secondary)",
    },
  },
  avatar: {
    flexShrink: 0,
  },
  info: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--ant-color-text)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  sub: {
    fontSize: 11,
    color: "var(--ant-color-text-tertiary)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  chevron: {
    flexShrink: 0,
    fontSize: 10,
    color: "var(--ant-color-text-tertiary)",
    transition: "transform 0.2s ease-out",
  },
  chevronOpen: {
    transform: "rotate(180deg)",
  },
  itemLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  itemInfo: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  itemName: {
    fontSize: 13,
    fontWeight: 500,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  itemDesc: {
    fontSize: 11,
    color: "var(--ant-color-text-tertiary)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  itemCheck: {
    flexShrink: 0,
    color: "var(--ant-color-primary)",
  },
});

interface SiteAvatarProps {
  site: Site;
  size: number;
  className?: string;
  style?: CSSProperties;
}

function SiteAvatar({ site, size, className, style }: SiteAvatarProps) {
  const sx = stylex.props(styles.avatar);
  return (
    <Avatar
      shape="square"
      size={size}
      {...sx}
      // antd MenuItem 经 cloneElement 把 ant-menu-item-icon 类合并进传入的
      // className；不透传的话图标与文字的默认间距（相邻选择器）会丢失
      className={className ?? sx.className}
      // antd Avatar 自带背景色（未分层样式）盖过 StyleX，颜色走它的 style 入口
      style={{
        ...style,
        backgroundColor: "var(--ant-color-primary-bg)",
        color: "var(--ant-color-primary)",
      }}
    >
      {site.name.slice(0, 1)}
    </Avatar>
  );
}

export default function SiteSwitcher({ sites, activeId, onSelect, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const active = sites.find((s) => s.id === activeId) ?? sites[0] ?? null;

  if (!active) {
    return null;
  }

  const menuItems = [
    ...sites.map((s) => ({
      key: String(s.id),
      icon: <SiteAvatar site={s} size={24} />,
      label: (
        <span {...stylex.props(styles.itemLabel)}>
          <span {...stylex.props(styles.itemInfo)}>
            <span {...stylex.props(styles.itemName)}>{s.name}</span>
            <span {...stylex.props(styles.itemDesc)}>{s.description || "暂无介绍"}</span>
          </span>
          {s.id === active.id && (
            <CheckOutlined {...stylex.props(styles.itemCheck)} />
          )}
        </span>
      ),
    })),
    { type: "divider" as const },
    {
      key: "create",
      icon: <PlusOutlined />,
      label: (
        <span {...stylex.props(styles.itemInfo)}>
          <span {...stylex.props(styles.itemName)}>新建站点</span>
          <span {...stylex.props(styles.itemDesc)}>独立的内容空间</span>
        </span>
      ),
    },
  ];

  return (
    <div {...stylex.props(x.marginBottom._12px)}>
      <Dropdown
        menu={{
          items: menuItems,
          selectable: false,
          onClick: ({ key }) => {
            if (key === "create") {
              onCreate();
            } else {
              onSelect(Number(key));
            }
          },
        }}
        trigger={["click"]}
        onOpenChange={setOpen}
      >
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          {...stylex.props(styles.trigger)}
        >
          <SiteAvatar site={active} size={30} />
          <span {...stylex.props(styles.info)}>
            <span {...stylex.props(styles.name)}>{active.name}</span>
            <span {...stylex.props(styles.sub)}>{active.description || "暂无介绍"}</span>
          </span>
          <DownOutlined
            {...stylex.props(styles.chevron, open && styles.chevronOpen)}
          />
        </div>
      </Dropdown>
    </div>
  );
}
