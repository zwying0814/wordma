import * as React from 'react';

import { Image, useMediaState } from '@platejs/media/react';
import { ResizableProvider, useResizableValue } from '@platejs/resizable';
import type { TImageElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';
import { PlateElement, withHOC } from 'platejs/react';

import { cn } from '@/lib/utils';

import {
  mediaResizeHandleVariants,
  Resizable,
  ResizeHandle,
} from './resize-handle';

export const ImageElement = withHOC(
  ResizableProvider,
  function ImageElement(props: PlateElementProps<TImageElement>) {
    const { align = 'center', focused, readOnly, selected } = useMediaState();
    const width = useResizableValue('width');
    const { editor, element } = props;

    // 可用最大宽度 = 所在内容列宽度（Resizable 默认按自身宽度钳制，
    // 不传显式 maxWidth 时图片只能缩小无法放大）
    const [maxWidth, setMaxWidth] = React.useState<number | undefined>(
      undefined
    );
    const elementRef = React.useRef<HTMLElement | null>(null);

    /** 拖拽结束后恢复图片选中态（选区在拖拽中会被浏览器重置） */
    const restoreSelection = React.useCallback(() => {
      try {
        const path = editor.api.findPath(element);
        if (path) editor.tf.select(path);
      } catch {
        /* 元素可能已卸载 */
      }
    }, [editor, element]);

    React.useEffect(() => {
      let node: HTMLElement | null = null;
      try {
        node = editor.api.toDOMNode(element) as HTMLElement;
      } catch {
        return;
      }
      if (!node) return;
      elementRef.current = node;

      const update = () => setMaxWidth(node.clientWidth);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(node);
      return () => ro.disconnect();
    }, [editor, element]);

    return (
      <PlateElement
        {...props}
        ref={elementRef}
        className="py-2.5"
      >
        <figure
          className="group relative m-0"
          contentEditable={false}
          data-testid="image-figure"
          style={{ width }}
        >
          <Resizable
            align={align}
            data-testid="image-resizable"
            options={{
              align,
              readOnly,
              maxWidth,
            }}
          >
            <ResizeHandle
              className={mediaResizeHandleVariants({ direction: 'left' })}
              data-testid="image-resize-handle-left"
              onMouseDownCapture={(e) => e.preventDefault()}
              onPointerUp={restoreSelection}
              options={{ direction: 'left' }}
            />
            <div>
              <Image
                alt={props.attributes.alt as string | undefined}
                className={cn(
                  'block w-full max-w-full cursor-pointer object-cover px-0',
                  'rounded-sm',
                  focused && selected && 'ring-2 ring-ring ring-offset-2'
                )}
              />
            </div>
            <ResizeHandle
              className={mediaResizeHandleVariants({
                direction: 'right',
              })}
              data-testid="image-resize-handle-right"
              onMouseDownCapture={(e) => e.preventDefault()}
              onPointerUp={restoreSelection}
              options={{ direction: 'right' }}
            />
          </Resizable>

          {props.children}
        </figure>
      </PlateElement>
    );
  }
);
