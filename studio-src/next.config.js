/** @type {import('next').NextConfig} */

// The studio deploys as static files at <site>/studio/ on GitHub Pages
// (aphelps099.github.io/zebs/studio/). Change BASE if the site moves to a
// custom domain root (e.g. '/studio'), then run `npm run deploy` again.
const BASE = '/zebs/studio';

module.exports = {
  output: 'export',
  basePath: BASE,
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE,
  },
};
