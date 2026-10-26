import defaultTheme from '../../../../../themes/default/src/index.tsx';

const pageLayout = defaultTheme.layouts.page;
const indexLayout = defaultTheme.layouts.index;

export default {
  layouts: {
    ...defaultTheme.layouts,
    about: pageLayout,
    project: pageLayout,
    search: indexLayout,
  },
};
