import type { ReactNode } from 'react';

export default function Note({ children }: { children?: ReactNode }) {
  return <aside className="wordma-note">{children}</aside>;
}
