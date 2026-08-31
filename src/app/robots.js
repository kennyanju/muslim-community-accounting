export default function robots() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://masjid-accounting.local';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/login', '/not-found'],
        disallow: [
          '/api/',
          '/_next/',
          '/dashboard',
          '/transactions',
          '/donors',
          '/reports',
          '/receipts',
          '/settings',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
