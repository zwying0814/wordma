import * as React from 'react';

export type ToastKind = 'success' | 'error';

export type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
};

export const ToastContext = React.createContext<ToastContextValue | null>(null);

/** 读浮层提示的发送函数（须在 ToastProvider 内） */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
