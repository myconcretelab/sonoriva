import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitepress';

const packageMetadata = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  lang: 'fr-FR',
  title: 'Documentation SonoRiva',
  description: 'Documentation fonctionnelle de SonoRiva : commandes, paramètres, formats et limites.',
  base: '/docs/',
  outDir: '../dist/client/docs',
  cleanUrls: false,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: '/docs/sonoriva-mark.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#09090b' }],
    ['meta', { property: 'og:locale', content: 'fr_FR' }],
  ],
  themeConfig: {
    logo: '/sonoriva-mark.svg',
    siteTitle: 'SonoRiva · Documentation',
    nav: [
      { text: 'Fonctionnement', link: '/premiers-pas/' },
      { text: 'Fonctions', link: '/guides/importer-des-sons' },
      { text: 'Dépannage', link: '/depannage/' },
      { text: 'Nouveautés', link: '/nouveautes/' },
      {
        text: `v${packageMetadata.version}`,
        items: [
          { text: 'Ouvrir SonoRiva', link: 'https://app.sonoriva.fr' },
        ],
      },
    ],
    sidebar: [
      {
        text: 'Général',
        items: [
          { text: 'Vue d’ensemble', link: '/' },
          { text: 'Fonctionnement général', link: '/premiers-pas/' },
          { text: 'Configuration d’un spectacle', link: '/premiers-pas/premier-spectacle' },
        ],
      },
      {
        text: 'Fonctions',
        items: [
          { text: 'Import des sons', link: '/guides/importer-des-sons' },
          { text: 'Organisation d’un spectacle', link: '/guides/organiser-un-spectacle' },
          { text: 'Mode hors ligne', link: '/guides/mode-hors-ligne' },
          { text: 'Télécommande', link: '/guides/telecommande' },
        ],
      },
      {
        text: 'Référence',
        items: [
          { text: 'Formats et limites', link: '/reference/formats-et-limites' },
          { text: 'Moteur et sorties audio', link: '/reference/sortie-audio' },
          { text: 'Projection vidéo', link: '/reference/video' },
          { text: 'Raccourcis et commandes', link: '/reference/raccourcis' },
        ],
      },
      {
        text: 'Assistance',
        items: [
          { text: 'Demandes de support', link: '/guides/support' },
          { text: 'Dépannage', link: '/depannage/' },
          { text: 'Notes de version', link: '/nouveautes/' },
        ],
      },
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Rechercher', buttonAriaLabel: 'Rechercher dans la documentation' },
          modal: {
            noResultsText: 'Aucun résultat pour',
            resetButtonTitle: 'Effacer la recherche',
            footer: { selectText: 'sélectionner', navigateText: 'naviguer', closeText: 'fermer' },
          },
        },
      },
    },
    outline: { level: [2, 3], label: 'Sur cette page' },
    lastUpdated: { text: 'Mis à jour le', formatOptions: { dateStyle: 'long' } },
    docFooter: { prev: 'Page précédente', next: 'Page suivante' },
    footer: {
      message: 'Documentation de SonoRiva',
      copyright: 'Documentation de SonoRiva',
    },
  },
});
