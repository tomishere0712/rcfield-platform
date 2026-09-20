import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'RCField Docs',
  tagline: 'Tài liệu đồ án tốt nghiệp SEP490 — B2B SaaS quản lý sân xe RC',
  favicon: 'img/favicon.ico',

  future: { v4: true },

  url: 'http://localhost:3000',
  baseUrl: '/',

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'vi',
    locales: ['vi'],
  },

  markdown: {
    mermaid: true,
    format: 'detect',
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: 'docs',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'specs',
        path: '../specs',
        routeBasePath: 'specs',
        sidebarPath: './sidebars-specs.ts',
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'RCField',
      logo: {
        alt: 'RCField Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mainSidebar',
          position: 'left',
          label: 'Tài liệu',
        },
        {
          type: 'docSidebar',
          sidebarId: 'specsSidebar',
          docsPluginId: 'specs',
          position: 'left',
          label: 'Feature Specs',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `RCField — Đồ án tốt nghiệp SEP490 · ${new Date().getFullYear()}`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'sql', 'typescript', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
