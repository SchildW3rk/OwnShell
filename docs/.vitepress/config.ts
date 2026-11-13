import { defineConfig, type DefaultTheme } from 'vitepress';

const GITHUB_URL = 'https://github.com/SchildW3rk/OwnShell';

function sidebar(prefix: string, t: Record<string, string>): DefaultTheme.SidebarItem[] {
  return [
    {
      text: t.start,
      items: [
        { text: t.gettingStarted, link: `${prefix}/getting-started` },
        { text: t.privacy, link: `${prefix}/privacy` },
      ],
    },
    {
      text: t.features,
      items: [
        { text: t.ssh, link: `${prefix}/features/ssh` },
        { text: t.files, link: `${prefix}/features/files` },
        { text: 'Docker', link: `${prefix}/features/docker` },
        { text: t.databases, link: `${prefix}/features/databases` },
        { text: t.vault, link: `${prefix}/features/vault` },
        { text: t.apiClient, link: `${prefix}/features/api-client` },
        { text: t.projects, link: `${prefix}/features/projects` },
      ],
    },
    {
      text: t.more,
      items: [
        { text: t.backup, link: `${prefix}/advanced/backup-restore` },
        { text: t.shortcuts, link: `${prefix}/advanced/keyboard-shortcuts` },
        { text: 'FAQ', link: `${prefix}/faq` },
      ],
    },
  ];
}

const en = {
  start: 'Getting Started',
  gettingStarted: 'Install & first launch',
  privacy: 'Privacy & network',
  features: 'Features',
  ssh: 'Terminals & SSH',
  files: 'Files: SFTP & S3',
  databases: 'Databases',
  vault: 'Vault & environments',
  apiClient: 'API client',
  projects: 'Projects & Git',
  more: 'Reference',
  backup: 'Backup & restore',
  shortcuts: 'Keyboard shortcuts',
};

const de = {
  start: 'Erste Schritte',
  gettingStarted: 'Installation & erster Start',
  privacy: 'Datenschutz & Netzwerk',
  features: 'Funktionen',
  ssh: 'Terminals & SSH',
  files: 'Dateien: SFTP & S3',
  databases: 'Datenbanken',
  vault: 'Vault & Umgebungen',
  apiClient: 'API-Client',
  projects: 'Projekte & Git',
  more: 'Referenz',
  backup: 'Backup & Wiederherstellung',
  shortcuts: 'Tastenkürzel',
};

export default defineConfig({
  base: '/docs/',
  title: 'OwnShell Docs',
  description: 'Your servers, databases and APIs. One local workspace.',
  cleanUrls: true,
  lastUpdated: true,
  // Keeps the page hash map out of inline <script> tags so the CSP only needs hashes for VitePress' tiny inline scripts.
  metaChunk: true,
  head: [['link', { rel: 'icon', type: 'image/png', href: '/docs/favicon.png' }]],

  themeConfig: {
    logo: '/logo.svg',
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: GITHUB_URL }],
    footer: {
      message: `Free software under the <a href="${GITHUB_URL}/blob/main/LICENSE">GNU GPL v3.0</a>.`,
      copyright: '© 2026 OwnShell',
    },
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/getting-started' },
          { text: 'API client', link: '/features/api-client' },
          { text: 'FAQ', link: '/faq' },
          { text: 'ownshell.app', link: 'https://ownshell.app/' },
        ],
        sidebar: sidebar('', en),
        editLink: { pattern: `${GITHUB_URL}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
      },
    },
    de: {
      label: 'Deutsch',
      lang: 'de',
      link: '/de/',
      description: 'Deine Server, Datenbanken und APIs. Ein lokaler Workspace.',
      themeConfig: {
        nav: [
          { text: 'Handbuch', link: '/de/getting-started' },
          { text: 'API-Client', link: '/de/features/api-client' },
          { text: 'FAQ', link: '/de/faq' },
          { text: 'ownshell.app', link: 'https://ownshell.app/' },
        ],
        sidebar: sidebar('/de', de),
        editLink: { pattern: `${GITHUB_URL}/edit/main/docs/:path`, text: 'Diese Seite auf GitHub bearbeiten' },
        footer: {
          message: `Freie Software unter der <a href="${GITHUB_URL}/blob/main/LICENSE">GNU GPL v3.0</a>.`,
          copyright: '© 2026 OwnShell',
        },
        outline: { label: 'Auf dieser Seite' },
        docFooter: { prev: 'Vorherige Seite', next: 'Nächste Seite' },
        lastUpdated: { text: 'Zuletzt aktualisiert' },
        returnToTopLabel: 'Nach oben',
        sidebarMenuLabel: 'Menü',
        darkModeSwitchLabel: 'Darstellung',
        langMenuLabel: 'Sprache ändern',
      },
    },
  },
});
