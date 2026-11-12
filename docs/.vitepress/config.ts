import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'OwnShell Docs',
  description: 'The All-in-One DevOps Platform',

  themeConfig: {
    logo: '/logo.svg',

    socialLinks: [{ icon: 'github', link: 'https://github.com/SchildW3rk/OwnShell' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 OwnShell',
    },
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      description: 'The All-in-One DevOps Platform',

      themeConfig: {
        nav: [
          { text: 'Guide', link: '/quickstart' },
          { text: 'Features', link: '/features/vault' },
          { text: 'FAQ', link: '/faq' },
        ],

        sidebar: [
          {
            text: 'Getting Started',
            items: [{ text: 'Quickstart', link: '/quickstart' }],
          },
          {
            text: 'Core Features',
            items: [
              { text: 'Smart Admin Vault', link: '/features/vault' },
              { text: 'Database Client', link: '/features/databases' },
              { text: 'Docker Management', link: '/features/docker' },
              { text: 'SFTP & S3 Browser', link: '/features/sftp-s3' },
            ],
          },
          {
            text: 'Advanced',
            items: [
              { text: 'SSH Tunneling', link: '/features/tunneling' },
              { text: 'Jump Hosts', link: '/features/jump-hosts' },
              { text: 'ENV Injection', link: '/advanced/env-injection' },
              { text: 'Backup & Restore', link: '/advanced/backup-restore' },
              { text: 'Keyboard Shortcuts', link: '/advanced/keyboard-shortcuts' },
              { text: 'Performance Baseline', link: '/advanced/performance-baseline' },
            ],
          },
          {
            text: 'Help',
            items: [{ text: 'FAQ', link: '/faq' }],
          },
        ],
      },
    },

    de: {
      label: 'Deutsch',
      lang: 'de',
      link: '/de/',
      description: 'Die All-in-One DevOps Plattform',

      themeConfig: {
        nav: [
          { text: 'Handbuch', link: '/de/quickstart' },
          { text: 'Funktionen', link: '/de/features/vault' },
          { text: 'FAQ', link: '/de/faq' },
        ],

        sidebar: [
          {
            text: 'Erste Schritte',
            items: [{ text: 'Schnellstart', link: '/de/quickstart' }],
          },
          {
            text: 'Hauptfunktionen',
            items: [
              { text: 'Smart Admin Vault', link: '/de/features/vault' },
              { text: 'Datenbank-Client', link: '/de/features/databases' },
              { text: 'Docker-Verwaltung', link: '/de/features/docker' },
              { text: 'SFTP & S3 Browser', link: '/de/features/sftp-s3' },
            ],
          },
          {
            text: 'Erweitert',
            items: [
              { text: 'SSH Tunneling', link: '/de/features/tunneling' },
              { text: 'Jump Hosts', link: '/de/features/jump-hosts' },
              { text: 'ENV Injection', link: '/de/advanced/env-injection' },
              { text: 'Backup & Restore', link: '/de/advanced/backup-restore' },
              { text: 'Tastaturkürzel', link: '/de/advanced/keyboard-shortcuts' },
            ],
          },
          {
            text: 'Hilfe',
            items: [{ text: 'FAQ', link: '/de/faq' }],
          },
        ],
      },
    },
  },
});
