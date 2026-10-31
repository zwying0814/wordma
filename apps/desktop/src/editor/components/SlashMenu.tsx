import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import type { SlashMenuItem } from "../extensions/SlashCommand";

export interface SlashMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface Props {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
}

const popupClass =
  "min-w-[240px] overflow-hidden rounded-lg border border-border bg-popover shadow-pop";
const emptyClass = "px-3.5 py-2.5 text-[13px] text-muted-foreground";
const itemClass =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted";
const itemSelectedClass = "bg-accent text-accent-foreground hover:bg-accent";
const itemDescClass = "text-xs opacity-65";

/** "/" 斜杠命令菜单：键盘上下选择、回车执行，点击亦可 */
export const SlashMenu = forwardRef<SlashMenuHandle, Props>(
  function SlashMenu({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

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
      return <div className={emptyClass}>没有匹配的命令</div>;
    }

    return (
      <div className={popupClass}>
        <div role="listbox" aria-label="插入命令">
          {items.map((item, index) => {
            const active = index === selected;
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setSelected(index)}
                onClick={() => command(item)}
                className={active ? `${itemClass} ${itemSelectedClass}` : itemClass}
              >
                <item.icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {item.label}
                  {item.desc ? (
                    <span className={itemDescClass}> · {item.desc}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
