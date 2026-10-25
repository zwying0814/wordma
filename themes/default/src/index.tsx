import { defineTheme } from '@wordma/theme';

import { ArchiveLayout } from './layouts/archive';
import { IndexLayout } from './layouts/index';
import { NotFoundLayout } from './layouts/not-found';
import { PageLayout } from './layouts/page';
import { PostLayout } from './layouts/post';
import { RootLayout } from './layouts/root';
import { TaxonomyLayout } from './layouts/taxonomy';

export default defineTheme({
  layouts: {
    root: RootLayout,
    index: IndexLayout,
    post: PostLayout,
    page: PageLayout,
    archive: ArchiveLayout,
    taxonomy: TaxonomyLayout,
    notFound: NotFoundLayout,
  },
  styles: {
    tokens: ['./styles/tokens.css'],
    global: ['./styles/global.css'],
    prose: ['./styles/prose.css'],
  },
});
