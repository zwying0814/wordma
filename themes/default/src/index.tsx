import { defineTheme } from '@wordma/theme';

import { IndexLayout } from './layouts/index';
import { NotFoundLayout } from './layouts/not-found';
import { PageLayout } from './layouts/page';
import { PostLayout } from './layouts/post';
import { RootLayout } from './layouts/root';

export default defineTheme({
  layouts: {
    root: RootLayout,
    index: IndexLayout,
    post: PostLayout,
    page: PageLayout,
    notFound: NotFoundLayout,
  },
  styles: ['./styles/global.css'],
});
