import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { TrendingUp, Mail, Lock, User, Phone, Eye, EyeOff, ArrowRight, ShieldAlert } from 'lucide-react';

export default function RegisterForm() {
  const [formData, setFormData] = useState({
    displayName: '', email: '', phone: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  function handleChange(e) {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      return setError('Passwords do not match.');
    }
    if (formData.password.length < 6) {
      return setError('Password must be at least 6 characters.');
    }

    setLoading(true);
    try {
      await register(formData.email, formData.password, {
        displayName: formData.displayName,
        phone: formData.phone,
        role: 'customer', // Default role for self-registration
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const map = {
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password is too weak.',
      };
      setError(map[err.code] || err.message || 'Registration failed.');
    }
    setLoading(false);
  }

  const fields = [
    { name: 'displayName', label: 'Full Name', type: 'text', icon: User, placeholder: 'John Doe', required: true },
    { name: 'email', label: 'Email Address', type: 'email', icon: Mail, placeholder: 'you@example.com', required: true },
    { name: 'phone', label: 'Phone Number', type: 'tel', icon: Phone, placeholder: '+91 98765 43210' },
  ];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'var(--color-bg-primary)',
    }}>
      {/* Left panel */}
      <div className="register-brand-panel" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', padding: '3rem',
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 30%, #047857 60%, #1e293b 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.15), transparent)',
          top: -50, right: -50, animation: 'pulse-glow 4s ease-in-out infinite',
        }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--color-accent-500), var(--color-accent-400))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', boxShadow: '0 8px 32px rgba(16,185,129,0.3)',
          }}>
            <TrendingUp size={36} color="white" />
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', marginBottom: '0.75rem' }}>
            Join {settings?.appName || 'FinanceFlow'}
          </h1>
          <p style={{ fontSize: '1.0625rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
            Create your account and start managing your finances today
          </p>
        </div>
      </div>

      {/* Right panel - Form */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }} className="animate-fade-in">
          <h2 style={{ fontSize: '1.625rem', fontWeight: 700, marginBottom: '0.375rem' }}>Create account</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', fontSize: '0.9375rem' }}>
            Fill in your details to get started
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

          {settings && !settings.allowNewRegistrations ? (
            <div style={{
              padding: '2rem', borderRadius: 'var(--radius-lg)',
              background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
              textAlign: 'center',
            }}>
              <ShieldAlert size={48} color="#ef4444" style={{ margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
                Registrations Disabled
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>
                The administrator has temporarily disabled self-registration. Please contact support or try again later.
              </p>
              <Link to="/login" className="btn btn-primary" style={{ width: '100%', display: 'inline-flex', justifyContent: 'center' }}>
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {fields.map(field => {
              const Icon = field.icon;
              return (
                <div key={field.name} style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                    {field.label}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Icon size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input
                      type={field.type} name={field.name} value={formData[field.name]}
                      onChange={handleChange} className="input"
                      id={`register-${field.name}`}
                      required={field.required} placeholder={field.placeholder}
                      style={{ paddingLeft: 38 }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Password */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'} name="password"
                  value={formData.password} onChange={handleChange}
                  className="input" id="register-password" required
                  placeholder="Create a password"
                  style={{ paddingLeft: 38, paddingRight: 42 }}
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  type="password" name="confirmPassword"
                  value={formData.confirmPassword} onChange={handleChange}
                  className="input" id="register-confirm-password" required
                  placeholder="Confirm your password"
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="btn btn-primary btn-lg"
              id="register-submit"
              style={{ width: '100%', fontSize: '0.9375rem' }}
            >
              {loading ? (
                <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <>Create Account <ArrowRight size={18} /></>
              )}
            </button>
          </form>
          )}

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--color-primary-400)', textDecoration: 'none', fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .register-brand-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}
