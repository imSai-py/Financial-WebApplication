import { useState, useEffect, useCallback } from 'react';
import {
  Briefcase, UserPlus, Eye, Phone, Mail, Calendar,
  CreditCard, MapPin, Users, Clock, ShieldCheck, Lock
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { functions } from '../../config/firebase';
import { getOnboardedCustomers } from '../../services/userService';
import DataTable from '../shared/DataTable';
import StatCard from '../shared/StatCard';
import Modal from '../shared/Modal';
import LoadingSpinner from '../shared/LoadingSpinner';
import { formatDate, timeAgo } from '../../utils/formatDate';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { validators } from '../../utils/validation';

const KYC_COLORS = {
  verified:      { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
  pending:       { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  rejected:      { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  not_submitted: { bg: 'rgba(100,116,139,0.15)', text: '#64748b' },
};

const EMPTY_FORM = {
  displayName: '', username: '', email: '', phone: '',
  password: '', confirmPassword: '',
  dateOfBirth: '', panNumber: '', aadhaarLastFour: '',
  address: { street: '', city: '', state: '', zip: '' },
};

export default function AgentPortfolio() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOnboard, setShowOnboard] = useState(false);
  const [viewCustomer, setViewCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getOnboardedCustomers(userProfile.uid);
      setCustomers(data);
    } catch (err) {
      console.error('Error loading portfolio:', err);
    }
    setLoading(false);
  }, [userProfile.uid]);

  useEffect(() => { load(); }, [load]);

  // ═══════════════════════════════════════════════════════
  // Onboarding Form Handler
  // ═══════════════════════════════════════════════════════

  async function handleOnboard(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const nameErr = validators.required(form.displayName, 'Customer name');
      if (nameErr) {
        showToast(nameErr, 'error');
        setSubmitting(false);
        return;
      }

      const emailErr = validators.optionalEmail(form.email);
      if (emailErr) {
        showToast(emailErr, 'error');
        setSubmitting(false);
        return;
      }

      const emailProvided = !!form.email.trim();
      if (!emailProvided) {
        const usernameErr = validators.username(form.username);
        if (usernameErr) {
          showToast(usernameErr, 'error');
          setSubmitting(false);
          return;
        }
      } else if (form.username.trim()) {
        const usernameErr = validators.username(form.username);
        if (usernameErr) {
          showToast(usernameErr, 'error');
          setSubmitting(false);
          return;
        }
      }

      if (!emailProvided && !form.phone.trim()) {
        showToast('Phone number is required when email is blank', 'error');
        setSubmitting(false);
        return;
      }

      const phoneErr = validators.phone(form.phone);
      if (phoneErr) {
        showToast(phoneErr, 'error');
        setSubmitting(false);
        return;
      }

      const passwordErr = validators.password(form.password);
      if (passwordErr) {
        showToast(passwordErr, 'error');
        setSubmitting(false);
        return;
      }

      if (form.password !== form.confirmPassword) {
        showToast('Passwords do not match', 'error');
        setSubmitting(false);
        return;
      }

      // Validate PAN format if provided (ABCDE1234F)
      if (form.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.panNumber.toUpperCase())) {
        showToast('Invalid PAN format. Expected: ABCDE1234F', 'error');
        setSubmitting(false);
        return;
      }

      // Validate Aadhaar last 4 if provided
      if (form.aadhaarLastFour && !/^\d{4}$/.test(form.aadhaarLastFour)) {
        showToast('Aadhaar must be exactly 4 digits', 'error');
        setSubmitting(false);
        return;
      }

      const createUserByAdmin = httpsCallable(functions, 'createUserByAdmin');
      await createUserByAdmin({
        email: form.email.trim() || undefined,
        displayName: form.displayName.trim(),
        username: form.username.trim() || undefined,
        role: 'customer',
        password: form.password,
        phone: form.phone?.trim() || null,
        panNumber: form.panNumber?.trim().toUpperCase() || null,
        aadhaarLastFour: form.aadhaarLastFour?.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        kycStatus: 'not_submitted',
        address: {
          street: form.address.street?.trim() || '',
          city: form.address.city?.trim() || '',
          state: form.address.state?.trim() || '',
          zip: form.address.zip?.trim() || '',
        },
      });

      await load();
      setShowOnboard(false);
      setForm(EMPTY_FORM);
      showToast(`${form.displayName} created successfully with a customer login.`, 'success');
    } catch (err) {
      console.error('Onboarding error:', err);
      showToast(err.message || 'Failed to onboard customer', 'error');
    }
    setSubmitting(false);
  }

  function updateAddress(field, value) {
    setForm(prev => ({
      ...prev,
      address: { ...prev.address, [field]: value },
    }));
  }

  if (loading) return <LoadingSpinner text="Loading portfolio..." />;

  // ═══════════════════════════════════════════════════════
  // Stats
  // ═══════════════════════════════════════════════════════

  const totalCustomers = customers.length;
  const leadCount = customers.filter(c => c.customerStatus === 'lead').length;
  const activeCount = customers.filter(c => c.customerStatus === 'active' && c.hasAuthAccount).length;
  const kycVerifiedCount = customers.filter(c => c.kycStatus === 'verified').length;

  // ═══════════════════════════════════════════════════════
  // Table Columns
  // ═══════════════════════════════════════════════════════

  function KycBadge({ status }) {
    const colors = KYC_COLORS[status] || KYC_COLORS.not_submitted;
    const label = (status || 'not_submitted').replace(/_/g, ' ');
    return (
      <span style={{
        display: 'inline-flex', padding: '0.2rem 0.5rem',
        borderRadius: 'var(--radius-full)', fontSize: '0.6875rem',
        fontWeight: 600, textTransform: 'capitalize',
        background: colors.bg, color: colors.text,
      }}>
        {label}
      </span>
    );
  }

  const columns = [
    {
      header: 'Customer',
      accessor: 'displayName',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: row.hasAuthAccount
              ? 'linear-gradient(135deg, rgba(16,185,129,0.4), rgba(16,185,129,0.2))'
              : 'linear-gradient(135deg, rgba(245,158,11,0.4), rgba(245,158,11,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700,
            color: row.hasAuthAccount ? '#34d399' : '#fbbf24',
            flexShrink: 0,
          }}>
            {row.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{row.displayName || 'Unnamed'}</span>
              {!row.hasAuthAccount && (
                <span style={{
                  fontSize: '0.5625rem', fontWeight: 700,
                  background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
                  padding: '0.1rem 0.375rem', borderRadius: 'var(--radius-full)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>Lead</span>
              )}
            </div>
            <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Phone',
      accessor: 'phone',
      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{row.phone || '—'}</span>,
      hideOnMobile: true,
    },
    {
      header: 'KYC',
      accessor: 'kycStatus',
      render: (row) => <KycBadge status={row.kycStatus} />,
    },
    {
      header: 'Onboarded',
      accessor: 'createdAt',
      render: (row) => (
        <div>
          <span style={{ fontSize: '0.8125rem' }}>{formatDate(row.createdAt)}</span>
          {row.createdAt && (
            <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>{timeAgo(row.createdAt)}</p>
          )}
        </div>
      ),
      hideOnMobile: true,
    },
    {
      header: '',
      render: (row) => (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setViewCustomer(row)}
          title="View details"
          style={{ padding: '0.375rem' }}
        >
          <Eye size={14} />
        </button>
      ),
    },
  ];

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between', marginBottom: '1.25rem',
        flexDirection: isMobile ? 'column' : 'row', gap: '0.75rem',
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Briefcase size={isMobile ? 22 : 24} /> My Portfolio
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            {totalCustomers} customer{totalCustomers !== 1 ? 's' : ''} · {leadCount} lead{leadCount !== 1 ? 's' : ''} · {kycVerifiedCount} KYC verified
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowOnboard(true)}
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          <UserPlus size={16} /> Create Customer
        </button>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '140px' : '180px'}, 1fr))`, gap: '0.75rem', marginBottom: '1.25rem' }}>
        <StatCard title="Total Customers" value={totalCustomers} icon={Users} color="primary" />
        <StatCard title="Active Leads" value={leadCount} icon={Clock} color="warning" />
        <StatCard title="Claimed Accounts" value={activeCount} icon={ShieldCheck} color="success" />
        <StatCard title="KYC Verified" value={kycVerifiedCount} icon={ShieldCheck} color="info" />
      </div>

      {/* Customer Table */}
      <div className="glass-card" style={{ padding: isMobile ? '0.75rem' : '1.25rem' }}>
        <DataTable
          columns={columns}
          data={customers}
          searchPlaceholder="Search portfolio..."
          emptyMessage="No customers yet. Onboard your first customer!"
        />
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* View Customer Detail Modal */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal isOpen={!!viewCustomer} onClose={() => setViewCustomer(null)} title="Customer Details">
        {viewCustomer && (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: viewCustomer.hasAuthAccount
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.4), rgba(16,185,129,0.2))'
                  : 'linear-gradient(135deg, rgba(245,158,11,0.4), rgba(245,158,11,0.15))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem', fontWeight: 700,
                color: viewCustomer.hasAuthAccount ? '#34d399' : '#fbbf24',
              }}>
                {viewCustomer.displayName?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{viewCustomer.displayName}</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{viewCustomer.email}</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.375rem' }}>
                  {!viewCustomer.hasAuthAccount && (
                    <span style={{
                      fontSize: '0.625rem', fontWeight: 700,
                      background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
                      padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)',
                      textTransform: 'uppercase',
                    }}>Lead — No Auth Account</span>
                  )}
                  <KycBadge status={viewCustomer.kycStatus} />
                </div>
              </div>
            </div>

            {/* Details Grid */}
            {[
              ['Phone', viewCustomer.phone],
              ['Date of Birth', viewCustomer.dateOfBirth],
              ['PAN Number', viewCustomer.panNumber],
              ['Aadhaar (Last 4)', viewCustomer.aadhaarLastFour],
              ['KYC Status', viewCustomer.kycStatus?.replace(/_/g, ' ')],
              ['Customer Status', viewCustomer.customerStatus],
              ['Address', [viewCustomer.address?.street, viewCustomer.address?.city, viewCustomer.address?.state, viewCustomer.address?.zip].filter(Boolean).join(', ')],
              ['Onboarded', formatDate(viewCustomer.createdAt)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{label}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500, textTransform: 'capitalize' }}>{value || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Onboard Customer Modal */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Modal isOpen={showOnboard} onClose={() => { setShowOnboard(false); setForm(EMPTY_FORM); }} title="Create Customer">
        <form onSubmit={handleOnboard}>
          {/* Section: Identity */}
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{
              fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem',
              display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}>
              <Users size={14} /> Identity Information
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                Full Name <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                className="input" required
                value={form.displayName}
                onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                placeholder="John Doe"
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                Username {form.email.trim() ? '(Optional)' : <span style={{ color: 'var(--color-danger)' }}>*</span>}
              </label>
              <input
                className="input"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="customer.username"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                  Email (Optional)
                </label>
                <input
                  className="input" type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                  Phone {!form.email.trim() ? <span style={{ color: 'var(--color-danger)' }}>*</span> : '(Optional)'}
                </label>
                <input
                  className="input" type="tel"
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                  Password <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input
                    className="input"
                    type="password"
                    required
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Set a strong password"
                    style={{ paddingLeft: 38 }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                  Confirm Password <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input
                    className="input"
                    type="password"
                    required
                    value={form.confirmPassword}
                    onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Confirm password"
                    style={{ paddingLeft: 38 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: KYC Details */}
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{
              fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-warning)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem',
              display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}>
              <CreditCard size={14} /> KYC Details
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Date of Birth</label>
                <input
                  className="input" type="date"
                  value={form.dateOfBirth}
                  onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>PAN Number</label>
                <input
                  className="input"
                  value={form.panNumber}
                  onChange={e => setForm(p => ({ ...p, panNumber: e.target.value }))}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Aadhaar (Last 4)</label>
                <input
                  className="input"
                  value={form.aadhaarLastFour}
                  onChange={e => setForm(p => ({ ...p, aadhaarLastFour: e.target.value }))}
                  placeholder="1234"
                  maxLength={4}
                  pattern="\d{4}"
                />
              </div>
            </div>
          </div>

          {/* Section: Address */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{
              fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-success)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem',
              display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}>
              <MapPin size={14} /> Address
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Street</label>
              <input
                className="input"
                value={form.address.street}
                onChange={e => updateAddress('street', e.target.value)}
                placeholder="123 Main Street"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>City</label>
                <input
                  className="input"
                  value={form.address.city}
                  onChange={e => updateAddress('city', e.target.value)}
                  placeholder="Mumbai"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>State</label>
                <input
                  className="input"
                  value={form.address.state}
                  onChange={e => updateAddress('state', e.target.value)}
                  placeholder="Maharashtra"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>PIN Code</label>
                <input
                  className="input"
                  value={form.address.zip}
                  onChange={e => updateAddress('zip', e.target.value)}
                  placeholder="400001"
                  maxLength={6}
                />
              </div>
            </div>
          </div>

          {/* Info banner */}
          <div style={{
            padding: '0.75rem', borderRadius: 'var(--radius-md)',
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            marginBottom: '1.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)',
            lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--color-primary)' }}>Note:</strong> This creates a customer account with an immediate login.
            Share the password securely and have the customer change it after first use.
            {!form.email.trim() && ' Without an email, username and phone become the customer login identifiers.'}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowOnboard(false); setForm(EMPTY_FORM); }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
