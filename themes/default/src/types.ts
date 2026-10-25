import type { PageContext } from '@wordma/theme';

export type DefaultThemeSettings = {
  accent?: string;
  showDescription?: boolean;
};

export type DefaultPageContext = PageContext<DefaultThemeSettings>;
