'use client';

import {
  KeyboardIcon,
  MoreHorizontalIcon,
  SubscriptIcon,
  SuperscriptIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorRef } from 'platejs/react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ToolbarButton } from './toolbar';

export function MoreToolbarButton({
  children,
  ...props
}: { children?: React.ReactNode } & React.ComponentProps<typeof DropdownMenu>) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open} {...props}>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            aria-label="More"
            isDropdown
            pressed={open}
            tooltip="More"
          >
            <MoreHorizontalIcon />
          </ToolbarButton>
        }
      />

      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar flex max-h-[500px] min-w-[180px] flex-col overflow-y-auto"
      >
        {children && (
          <div className="flex flex-col gap-1 py-1" data-testid="more-extra">
            {children}
          </div>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              editor.tf.toggleMark(KEYS.kbd);
              editor.tf.collapse({ edge: 'end' });
              editor.tf.focus();
            }}
          >
            <KeyboardIcon />
            Keyboard input
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => {
              editor.tf.toggleMark(KEYS.sup, {
                remove: KEYS.sub,
              });
              editor.tf.focus();
            }}
          >
            <SuperscriptIcon />
            Superscript
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              editor.tf.toggleMark(KEYS.sub, {
                remove: KEYS.sup,
              });
              editor.tf.focus();
            }}
          >
            <SubscriptIcon />
            Subscript
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
