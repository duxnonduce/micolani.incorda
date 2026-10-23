export default function manifest() {
  return {
    name: 'Micolani Incorda',
    short_name: 'Incorda',
    description: 'Gestione interna delle incordature',
    start_url: '/',
    display: 'standalone',
    background_color: '#F3F4EF',
    theme_color: '#1F5136',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
