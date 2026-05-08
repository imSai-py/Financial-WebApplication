import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, UserRound, Lock, ArrowRight, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSettings } from '../../contexts/SettingsContext';
import { validateForm, validators } from '../../utils/validation';
import PasswordField from '../shared/PasswordField';

export default function LoginForm({ mode = 'general' }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { login, logout } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const isCustomerMode = mode === 'customer';

  const pageTitle = isCustomerMode ? 'Customer login' : 'Welcome back';
  const pageSubtitle = isCustomerMode
    ? 'Sign in with your customer credentials to continue'
    : 'Sign in to your account to continue';
  const brandCopy = isCustomerMode
    ? 'Secure customer access for viewing and managing your financial relationship'
    : 'Secure financial management platform for your business operations';
  const submitLabel = isCustomerMode ? 'Customer Sign In' : 'Sign In';
  const helperText = 'Self-sign up is disabled. Customer accounts are created by authorized administrators, staff members, or agents, who provide login credentials directly.';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const normalizedIdentifier = identifier.trim();
    const errors = validateForm(
      { identifier: normalizedIdentifier, password },
      {
        identifier: [(value) => validators.required(value, 'Email, username, or phone')],
        password: [(value) => validators.required(value, 'Password')],
      }
    );

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const profile = await login(normalizedIdentifier, password);

      if (isCustomerMode && profile.role !== 'customer') {
        await logout();
        setError('This customer login is only for customer accounts. Staff, agents, and admins should use the main login page.');
        setFieldErrors({});
        return;
      }

      const name = profile.displayName || 'User';
      const role = profile.role?.charAt(0).toUpperCase() + profile.role?.slice(1);
      showToast(`Welcome back, ${name}! Signed in as ${role}.`, 'success');

      navigate('/dashboard', { replace: true });
    } catch (err) {
      const map = {
        'auth/user-not-found': 'No account found with those credentials.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/missing-identifier': 'Email, username, or phone is required.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/missing-password': 'Password is required.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/invalid-credential': 'Invalid login credentials.',
        'auth/invalid-login-identifier': 'Invalid login credentials.',
      };
      setError(map[err.code] || err.message || 'Login failed.');
      setFieldErrors({});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'var(--color-bg-primary)',
    }}>
      <div className="login-brand-panel" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', padding: '3rem',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #3730a3 60%, #1e293b 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent)',
          top: -50, right: -50, animation: 'pulse-glow 4s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.1), transparent)',
          bottom: -30, left: -30, animation: 'pulse-glow 5s ease-in-out infinite 1s',
        }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-400))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', boxShadow: '0 8px 32px rgba(99,102,241,0.3)',
          }}>
            <TrendingUp size={36} color="white" />
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', marginBottom: '0.75rem' }}>
            {settings?.appName || 'FinanceFlow'}
          </h1>
          <p style={{ fontSize: '1.0625rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
            {brandCopy}
          </p>
        </div>
      </div>

      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }} className="animate-fade-in">
          <div className="mobile-brand-header" style={{ display: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              marginBottom: '2rem', justifyContent: 'center',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-400))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
              }}>
                <TrendingUp size={24} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.2 }}>FinanceFlow</h1>
                <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Management</span>
              </div>
            </div>
          </div>

          {isCustomerMode && (
            <div style={{ marginBottom: '1rem' }}>
              <Link
                to="/login"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  color: 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                }}
              >
                <ChevronLeft size={16} />
                Back to main login
              </Link>
            </div>
          )}

          <h2 style={{ fontSize: '1.625rem', fontWeight: 700, marginBottom: '0.375rem' }}>{pageTitle}</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', fontSize: '0.9375rem' }}>
            {pageSubtitle}
          </p>

          {error && (
            <div style={{
              padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171', fontSize: '0.8125rem', marginBottom: '1.25rem',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                Email / Username / Phone
              </label>
              <div style={{ position: 'relative' }}>
                <UserRound size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  type="text" value={identifier} onChange={e => {
                    setIdentifier(e.target.value);
                    if (fieldErrors.identifier) {
                      setFieldErrors((prev) => ({ ...prev, identifier: undefined }));
                    }
                  }}
                  className="input" id="login-email"
                  placeholder="Enter email, username, or phone"
                  aria-invalid={fieldErrors.identifier ? 'true' : 'false'}
                  style={{
                    paddingLeft: 38,
                    borderColor: fieldErrors.identifier ? 'var(--color-danger)' : undefined,
                  }}
                />
              </div>
              {fieldErrors.identifier && (
                <p style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}>
                  {fieldErrors.identifier}
                </p>
              )}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                  Password
                </label>
              </div>
              <PasswordField
                id="login-password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                placeholder="Enter your password"
                aria-invalid={fieldErrors.password ? 'true' : 'false'}
                leftIcon={Lock}
                style={{
                  borderColor: fieldErrors.password ? 'var(--color-danger)' : undefined,
                }}
              />
              {fieldErrors.password && (
                <p style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}>
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit" disabled={loading}
              className="btn btn-primary btn-lg"
              id="login-submit"
              style={{ width: '100%', fontSize: '0.9375rem' }}
            >
              {loading ? (
                <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <>{submitLabel} <ArrowRight size={18} /></>
              )}
            </button>

            {!isCustomerMode && (
              <Link
                to="/customer-login"
                className="btn btn-secondary btn-lg"
                id="customer-login-link"
                style={{
                  width: '100%',
                  fontSize: '0.9375rem',
                  marginTop: '0.75rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Are you a customer? Login here
              </Link>
            )}
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {helperText}
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-brand-panel { display: none !important; }
          .mobile-brand-header { display: block !important; }
        }
      `}</style>
    </div>
  );
}
