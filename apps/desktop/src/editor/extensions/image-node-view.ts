import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";

interface Options {
  node: ProseMirrorNode;
  editor: Editor;
  getPos: () => number | undefined;
  resolveSrc?: (src: string) => string;
}

/** 图片节点视图：解析媒体 URL、按 align 对齐，并提供四角缩放手柄 */
export function createImageNodeView({
  node,
  editor,
  getPos,
  resolveSrc,
}: Options): NodeView {
  const wrapper = document.createElement("div");
  wrapper.className = "image-node-view";
  wrapper.contentEditable = "false";
  wrapper.draggable = true;

  const img = document.createElement("img");
  img.draggable = false;

  let currentNode = node;

  const apply = (current: ProseMirrorNode) => {
    const src = (current.attrs.src as string) ?? "";
    img.src = resolveSrc?.(src) ?? src;
    img.alt = (current.attrs.alt as string) ?? "";
    const width = current.attrs.width;
    wrapper.style.width =
      typeof width === "number"
        ? `${width}px`
        : typeof width === "string" && width
          ? width
          : "fit-content";
    img.style.width = "100%";
    const align = (current.attrs.align as string) ?? "center";
    wrapper.style.marginInline =
      align === "center" ? "auto" : align === "right" ? "auto 0" : "0 auto";
  };
  apply(node);

  for (const direction of ["nw", "ne", "sw", "se"] as const) {
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    handle.setAttribute("data-resize-handle", direction);
    handle.contentEditable = "false";
    handle.style.cssText = `${
      direction.includes("w") ? "left:0" : "right:0"
    };${direction.startsWith("n") ? "top:0" : "bottom:0"};cursor:${
      direction === "nw" || direction === "se" ? "nwse-resize" : "nesw-resize"
    };`;

    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = wrapper.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const width = Math.max(
          60,
          Math.round(startWidth + (direction.includes("e") ? dx : -dx)),
        );
        wrapper.style.width = `${width}px`;
        img.style.width = "100%";
      };
      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        const width = Math.round(wrapper.getBoundingClientRect().width);
        const pos = getPos();
        if (typeof pos === "number") {
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              width,
            }),
          );
        }
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });

    wrapper.append(handle);
  }

  wrapper.append(img);

  return {
    dom: wrapper,
    ignoreMutation: () => true,
    stopEvent: (event) => {
      const target = event.target as HTMLElement | null;
      return Boolean(target?.closest?.("[data-resize-handle]"));
    },
    update: (updated) => {
      if (updated.type.name !== "image") return false;
      currentNode = updated;
      apply(updated);
      return true;
    },
  };
}
