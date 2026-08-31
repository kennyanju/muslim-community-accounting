import Link from 'next/link';

export const metadata = {
  title: 'Page Not Found — Masjid Accounting',
  description: 'The requested ledger page or financial record could not be found.',
};

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-primary, #0f172a)',
      padding: '24px',
      color: 'var(--text-primary, #f8fafc)',
      fontFamily: 'var(--font-body, system-ui, sans-serif)'
    }}>
      <div className="glass-card" style={{
        maxWidth: '520px',
        width: '100%',
        padding: '48px 32px',
        textAlign: 'center',
        background: 'var(--bg-secondary, #1e293b)',
        borderRadius: '20px',
        border: '1px solid var(--border-color, #334155)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          fontSize: '32px',
          marginBottom: '20px'
        }}>
          🕌
        </div>

        <h1 style={{
          fontSize: '2.8rem',
          fontWeight: 800,
          letterSpacing: '-1px',
          margin: '0 0 8px 0',
          color: 'var(--text-primary, #f8fafc)'
        }}>
          404
        </h1>

        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          margin: '0 0 12px 0',
          color: 'var(--text-primary, #f8fafc)'
        }}>
          Page or Record Not Found
        </h2>

        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-secondary, #94a3b8)',
          lineHeight: 1.6,
          margin: '0 0 28px 0'
        }}>
          The page or financial ledger section you requested does not exist or has been relocated.
        </p>

        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '28px',
          textAlign: 'left'
        }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick Navigation
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Link href="/" style={{ color: 'var(--primary, #10b981)', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 600 }}>
              📊 Financial Dashboard
            </Link>
            <Link href="/" style={{ color: 'var(--primary, #10b981)', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 600 }}>
              📑 Transaction Ledger
            </Link>
            <Link href="/" style={{ color: 'var(--primary, #10b981)', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 600 }}>
              👥 Donor Directory
            </Link>
            <Link href="/" style={{ color: 'var(--primary, #10b981)', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 600 }}>
              🧾 Official Receipts
            </Link>
          </div>
        </div>

        <Link
          href="/"
          className="btn btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: 'var(--primary, #10b981)',
            color: '#ffffff',
            padding: '12px 28px',
            borderRadius: '10px',
            fontWeight: 700,
            textDecoration: 'none',
            fontSize: '0.95rem',
            minHeight: '44px'
          }}
        >
          <span>←</span> Back to Main App
        </Link>
      </div>
    </div>
  );
}
