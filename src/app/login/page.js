'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { validateClientLogin } from '@/lib/clientValidation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [org, setOrg] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cachedOrg = localStorage.getItem('masjid_org_profile');
        if (cachedOrg) {
          const parsed = JSON.parse(cachedOrg);
          if (parsed && parsed.name) return parsed;
        }
      } catch (e) {}
    }
    return {
      name: 'Masjid Accounting',
      short_name: 'Masjid',
      tagline: 'Islamic Financial Management System'
    };
  });

  useEffect(() => {
    // Fetch from server to get edge cookie or latest DB config
    fetch('/api/organisation')
      .then(res => res.json())
      .then(body => {
        const data = body.data || body;
        if (data && data.name) {
          setOrg(data);
          try {
            localStorage.setItem('masjid_org_profile', JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    // Client-side schema validation
    const { isValid, errors: validationErrors } = validateClientLogin({ email: email.trim(), password });
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const body = await res.json();

      if (!res.ok) {
        const errMsg = body?.error?.message || body?.error || 'Authentication failed. Please check your credentials.';
        throw new Error(errMsg);
      }

      const data = body.data || body;
      if (data && data.organisation && data.organisation.name) {
        try {
          localStorage.setItem('masjid_org_profile', JSON.stringify(data.organisation));
        } catch (e) {}
      }

      // Check for redirect query param
      const urlParams = new URLSearchParams(window.location.search);
      const redirectPath = urlParams.get('redirect');
      const targetUrl = redirectPath && redirectPath.startsWith('/') ? redirectPath : '/';

      router.push(targetUrl);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: '24px'
    }}>
      <div className="glass-card" style={{ maxWidth: '440px', width: '100%', padding: '40px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 8px 24px -4px rgba(16, 185, 129, 0.4)', marginBottom: '16px' }}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
              <path d="M12 3L3 8.5L12 14L21 8.5L12 3Z" fill="white" />
              <path d="M3 13.5L12 19L21 13.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 8.5V14" stroke="#047857" strokeWidth="2" />
            </svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0 }}>
            {org.name}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {org.tagline || 'Financial Management System'}
          </p>
        </div>

        {error && (
          <div className="alert alert-warning" role="alert" style={{ marginBottom: '20px', fontSize: '0.85rem', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} noValidate>
          <div className="form-group" style={{ marginBottom: '18px' }}>
            <label htmlFor="login-email" style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Email Address
            </label>
            <input 
              id="login-email"
              name="email"
              type="email" 
              autoComplete="email"
              placeholder="e.g. secretary@yourmasjid.org.uk" 
              value={email} 
              onChange={e => {
                setEmail(e.target.value);
                if (errors.email) setErrors(prev => ({ ...prev, email: null }));
              }} 
              required 
              autoFocus
              style={{ width: '100%' }}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group" style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label htmlFor="login-password" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Password
              </label>
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input 
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"} 
              autoComplete="current-password"
              placeholder="Enter your password" 
              value={password} 
              onChange={e => {
                setPassword(e.target.value);
                if (errors.password) setErrors(prev => ({ ...prev, password: null }));
              }} 
              required 
              style={{ width: '100%' }}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-block" 
            disabled={loading}
            style={{ minHeight: '44px', padding: '12px', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            id="btn-login-submit"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span aria-hidden="true">🔒</span>
                <span>Sign In Securely</span>
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '24px', padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>🛡️ Self-Hosted Security</strong>
          All ledger sessions are protected via cryptographically signed tokens and strict server-side permissions. Initial admin: <code style={{ color: 'var(--primary)' }}>secretary@bsmc.org.uk</code>
        </div>
      </div>
    </div>
  );
}
