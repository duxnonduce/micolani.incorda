import './globals.css';
import { AppProvider } from '@/components/AppProvider';

export const metadata = {
  title: 'Micolani Incorda',
  description: 'Gestione interna delle incordature',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Incorda', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1F5136',
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
