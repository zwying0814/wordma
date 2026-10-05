import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { Menu } from "antd";
import * as stylex from "@stylexjs/stylex";
import type { SlashMenuItem } from "../extensions/SlashCommand";

export interface SlashMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface Props {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
}

const styles = stylex.create({
  popup: {
    minWidth: 240,
    backgroundColor: "var(--ant-color-bg-elevated)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--ant-color-border-secondary)",
    borderRadius: 10,
    boxShadow: "var(--ant-box-shadow-secondary)",
    overflow: "hidden",
  },
  empty: {
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--ant-color-text-tertiary)",
  },
  itemDesc: {
    fontSize: 12,
    opacity: 0.65,
  },
});

/** "/" 斜杠命令菜单：键盘上下选择、回车执行，点击亦可 */
export const SlashMenu = forwardRef<SlashMenuHandle, Props>(
  function SlashMenu({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    // 过滤结果变化时重置选中项
    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown({ event }: SuggestionKeyDownProps) {
          if (items.length === 0) return false;
          if (event.key === "ArrowDown") {
            setSelected((s) => (s + 1) % items.length);
            return true;
          }
          if (event.key === "ArrowUp") {
            setSelected((s) => (s - 1 + items.length) % items.length);
            return true;
          }
          if (event.key === "Enter") {
            const item = items[selected];
            if (item) {
              command(item);
              return true;
            }
          }
          return false;
        },
      }),
      [items, selected, command],
    );

    if (items.length === 0) {
      return <div {...stylex.props(styles.empty)}>没有匹配的命令</div>;
    }

    return (
      <div {...stylex.props(styles.popup)}>
        <Menu
          selectable
          selectedKeys={[String(selected)]}
          onClick={({ key }) => {
            const item = items.find((i) => i.key === key);
            if (item) command(item);
          }}
          items={items.map((item) => ({
            key: item.key,
            icon: <item.icon size={14} />,
            label: (
              <span>
                {item.label}
                {item.desc && (
                  <span {...stylex.props(styles.itemDesc)}>
                    {" "}
                    · {item.desc}
                  </span>
                )}
              </span>
            ),
          }))}
        />
      </div>
    );
  },
);
