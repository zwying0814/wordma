import * as React from 'react';

import { Image, useMediaState } from '@platejs/media/react';
import { ResizableProvider, useResizableStore } from '@platejs/resizable';
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
    const [maxWidth] = React.useState<number | undefined>(700);
    const { editor, element } = props;

    /** 拖拽结束后恢复图片选中态（选区在拖拽中会被浏览器重置） */
    const restoreSelection = React.useCallback(() => {
      try {
        const path = editor.api.findPath(element);
        if (path) editor.tf.select(path);
      } catch {
        /* 元素可能已卸载 */
      }
    }, [editor, element]);

    // resizable store 的 onResize：无论释放位置在哪，缩放完成即恢复选中
    const resizableStore = useResizableStore();
    React.useEffect(() => {
      resizableStore.set.onResize?.((state: { finished: boolean }) => {
        if (state.finished) restoreSelection();
      });
    }, [resizableStore, restoreSelection]);

    const elementRef = React.useRef<HTMLElement | null>(null);



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
        >
          <Resizable
            align={align}
            data-testid="image-resizable"
            options={{ align, readOnly, maxWidth }}
          >
            <ResizeHandle
              className={mediaResizeHandleVariants({ direction: 'left' })}
              data-testid="image-resize-handle-left"
              onMouseDownCapture={(e) => e.preventDefault()}
              onPointerUp={restoreSelection}
              options={{
                direction: 'left',
                onResize: ({ finished }: { finished: boolean }) => {
                  if (finished) restoreSelection();
                },
              }}
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
              options={{ direction: 'right' }}
            />
          </Resizable>

          {props.children}
        </figure>
      </PlateElement>
    );
  }
);
