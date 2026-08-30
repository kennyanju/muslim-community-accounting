'use client';

import React, { Component } from 'react';
import { reportClientError } from '@/lib/errorReporting';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    reportClientError(error, {
      component: this.props.componentName || 'UnknownComponent',
      componentStack: errorInfo?.componentStack
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="glass-card error-boundary-container" role="alert" style={{
          padding: '32px',
          margin: '20px 0',
          textAlign: 'center',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '16px',
          background: 'var(--bg-secondary)'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--danger-light)',
            color: 'var(--danger)',
            fontSize: '24px',
            marginBottom: '16px'
          }}>
            ⚠️
          </div>

          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '1.25rem' }}>
            {this.props.fallbackTitle || 'Section Unavailable'}
          </h3>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 20px auto' }}>
            {this.props.fallbackMessage || 'An unexpected rendering error occurred in this component. Other areas of the application are unaffected.'}
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={this.handleReset}
            >
              🔄 Reload Section
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
            >
              {this.state.showDetails ? 'Hide Error Details' : 'Show Error Details'}
            </button>
          </div>

          {this.state.showDetails && (
            <div style={{
              marginTop: '20px',
              padding: '16px',
              backgroundColor: 'rgba(0,0,0,0.06)',
              borderRadius: '8px',
              textAlign: 'left',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.75rem',
              color: 'var(--danger)',
              overflowX: 'auto'
            }}>
              <strong>Error:</strong> {this.state.error?.toString()}
              {this.state.errorInfo?.componentStack && (
                <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
