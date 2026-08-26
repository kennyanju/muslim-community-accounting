import { Inter, Outfit } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-heading',
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#10b981',
};

export const metadata = {
  title: 'Masjid Accounting — Islamic Financial Management System',
  description: 'Islamic compliance, multi-fund segregation, and audit-safe accounting ledger with UK Charity Commission and HMRC Gift Aid integration.',
  keywords: ['Masjid Accounting', 'Islamic Finance', 'Zakat', 'Fitrana', 'Lillah', 'Gift Aid', 'Mosque Ledger', 'Charity Commission'],
  authors: [{ name: 'Masjid Finance' }],
  openGraph: {
    title: 'Masjid Accounting — Islamic Financial Management System',
    description: 'Compliant multi-fund accounting ledger for Mosques and Islamic Charities.',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Masjid Accounting — Islamic Financial Management System',
    description: 'Compliant multi-fund accounting ledger for Mosques and Islamic Charities.',
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`} data-theme="system">
      <head>
        <meta name="color-scheme" content="light dark" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem("masjid-theme") || localStorage.getItem("bsmc-theme") || "system";
                document.documentElement.setAttribute('data-theme', savedTheme);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
