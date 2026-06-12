'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  // Seeds profiles for quick select
  const profiles = [
    { name: "🕌 Financial Secretary (Admin)", email: "secretary@bsmc.org.uk", id: "user-sec-1", role: "ADMIN" },
    { name: "👥 Trustee Board Member (Reviewer)", email: "trustee@bsmc.org.uk", id: "user-tru-2", role: "REVIEWER" },
    { name: "🔍 External Auditor (Accountant)", email: "auditor@bsmc.org.uk", id: "user-aud-3", role: "AUDITOR" }
  ];

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');

    // Match profile
    const matchedProfile = profiles.find(p => p.email === email.trim().toLowerCase());
    
    if (!matchedProfile) {
      setError("Unknown user email. Please select a seeded profile below for simulation.");
      return;
    }

    if (password !== 'password123') {
      setError("Invalid password. Use 'password123' for simulation.");
      return;
    }

    // Set cookie session (max-age 1 day)
    document.cookie = `bsmc_session=${encodeURIComponent(JSON.stringify({
      id: matchedProfile.id,
      email: matchedProfile.email,
      role: matchedProfile.role
    }))}; path=/; max-age=86400;`;

    // Write fallback localStorage indicator
    localStorage.setItem("bsmc-role", matchedProfile.role === 'ADMIN' ? 'secretary' : matchedProfile.role === 'REVIEWER' ? 'trustee' : 'auditor');

    // Route to dashboard
    router.push('/');
    router.refresh();
  };

  const handleQuickSelect = (p) => {
    setEmail(p.email);
    setPassword('password123');
    setError('');
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: '20px'
    }}>
      <div className="glass-card" style={{ maxWidth: '440px', width: '100%', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" style={{ margin: '0 auto 16px auto', display: 'block' }}>
            <rect width="24" height="24" rx="6" fill="url(#login-grad)" />
            <path d="M12 4L4 9L12 14L20 9L12 4Z" fill="white" />
            <path d="M4 14L12 19L20 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 9V14" stroke="#4f46e5" strokeWidth="2" />
            <defs>
              <linearGradient id="login-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#10b981" />
                <stop offset="1" stopColor="#059669" />
              </linearGradient>
            </defs>
          </svg>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            BSMC Finance Portal
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Bristol South Muslim Community Ledger
          </p>
        </div>

        {error && (
          <div className="alert alert-warning" style={{ marginBottom: '20px', fontSize: '0.8rem', padding: '10px 14px' }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Email Address</label>
            <input 
              type="email" 
              placeholder="e.g. secretary@bsmc.org.uk" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '10px' }}>
            🔒 Authenticate Securely
          </button>
        </form>

        <div className="form-divider" style={{ margin: '24px 0' }}>Simulated Accounts</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {profiles.map(p => (
            <button 
              key={p.id} 
              type="button" 
              className="btn btn-secondary btn-sm btn-block" 
              onClick={() => handleQuickSelect(p)}
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 14px', fontSize: '0.8rem' }}
            >
              <div>
                <strong>{p.name}</strong>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{p.email}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
