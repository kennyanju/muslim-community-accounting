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
        maxWidth: '480px',
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
          fontSize: '2.4rem',
          fontWeight: 800,
          letterSpacing: '-1px',
          margin: '0 0 8px 0',
          color: 'var(--text-primary, #f8fafc)'
        }}>
          404
        </h1>

        <h2 style={{
          fontSize: '1.2rem',
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
          The page or financial ledger section you are looking for has been moved, archived, or does not exist.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: '#10b981',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '10px',
            fontWeight: 700,
            textDecoration: 'none',
            fontSize: '0.95rem',
            transition: 'background 0.2s'
          }}
        >
          <span>←</span> Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
