'use client';

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

    return (
      <PlateElement {...props} className="py-2.5">
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
            }}
          >
            <ResizeHandle
              className={mediaResizeHandleVariants({ direction: 'left' })}
              data-testid="image-resize-handle-left"
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
              options={{ direction: 'right' }}
            />
          </Resizable>

          {props.children}
        </figure>
      </PlateElement>
    );
  }
);
