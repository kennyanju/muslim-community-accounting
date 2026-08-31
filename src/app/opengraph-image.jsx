import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Masjid Accounting — Islamic Financial Management System';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #09101e 0%, #0f172a 50%, #064e3b 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 80px',
          fontFamily: 'sans-serif',
          color: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '90px',
            height: '90px',
            borderRadius: '24px',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '2px solid #10b981',
            fontSize: '48px',
            marginBottom: '32px',
          }}
        >
          🕌
        </div>

        <div
          style={{
            fontSize: '56px',
            fontWeight: 800,
            letterSpacing: '-1px',
            textAlign: 'center',
            marginBottom: '16px',
            color: '#f8fafc',
          }}
        >
          Masjid Accounting
        </div>

        <div
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: '#10b981',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            marginBottom: '20px',
          }}
        >
          Islamic Financial Management &amp; Multi-Fund Ledger
        </div>

        <div
          style={{
            fontSize: '20px',
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: '850px',
            lineHeight: 1.5,
          }}
        >
          Shariah-Compliant Fund Segregation • HMRC Gift Aid Claims • Dual-Witness Jummah Cash • Audit Trails
        </div>

        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginTop: '36px',
          }}
        >
          <div
            style={{
              padding: '8px 20px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.1)',
              fontSize: '16px',
              fontWeight: 600,
              color: '#f8fafc',
            }}
          >
            Zakat &amp; Fitrana Wallets
          </div>
          <div
            style={{
              padding: '8px 20px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.1)',
              fontSize: '16px',
              fontWeight: 600,
              color: '#f8fafc',
            }}
          >
            UK Charity Commission
          </div>
          <div
            style={{
              padding: '8px 20px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.1)',
              fontSize: '16px',
              fontWeight: 600,
              color: '#f8fafc',
            }}
          >
            Role-Based Access
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
