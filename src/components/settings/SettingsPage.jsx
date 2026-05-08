import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, User, Mail, Phone, MapPin, Save, CheckCircle,
  Shield, DollarSign, Sliders, ToggleLeft, ToggleRight, AlertTriangle, Moon, Sun, Monitor, History, Users, CheckSquare, ArrowLeftRight, CalendarClock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { updateUser } from '../../services/userService';
import { getSettings, saveSettings } from '../../services/settingsService';
import { logActivity } from '../../services/activityLogService';
import { getStaffHistoryBundle } from '../../services/staffHistoryService';
import { useToast } from '../../contexts/ToastContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { validators } from '../../utils/validation';
import DataTable from '../shared/DataTable';
import { formatDate, formatDateTime, timeAgo } from '../../utils/formatDate';

export default function SettingsPage() {
  const { userProfile, currentUser, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  const EMPTY_FORM = {
    displayName: '',
    email: '',
    phone: '',
    address: {
      street: '',
      city: '',
      state: '',
      zip: '',
    },
  };

  const [activeTab, setActiveTab] = useState('profile');
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // System settings (admin only)
  const [sysSettings, setSysSettings] = useState(null);
  const [sysLoading, setSysLoading] = useState(false);
  const [sysSaving, setSysSaving] = useState(false);
  const [historyBundle, setHistoryBundle] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({ startDate: '', endDate: '' });
  const isStaff = userProfile?.role === 'staff';

  // Load system settings when admin switches to that tab
  useEffect(() => {
    if (activeTab === 'system' && isAdmin && !sysSettings) {
      setSysLoading(true);
      getSettings().then(data => {
        setSysSettings(data);
        setSysLoading(false);
      }).catch(() => setSysLoading(false));
    }
  }, [activeTab, isAdmin, sysSettings]);

  useEffect(() => {
    if (!userProfile?.uid && !currentUser?.uid) return;

    setForm({
      displayName: userProfile?.displayName || currentUser?.displayName || '',
      email: userProfile?.email || currentUser?.email || '',
      phone: userProfile?.phone || '',
      address: {
        street: userProfile?.address?.street || '',
        city: userProfile?.address?.city || '',
        state: userProfile?.address?.state || '',
        zip: userProfile?.address?.zip || '',
      },
    });
    setErrors({});
  }, [currentUser?.displayName, currentUser?.email, currentUser?.uid, userProfile]);

  useEffect(() => {
    if (!isStaff || !userProfile?.uid) return;

    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const bundle = await getStaffHistoryBundle(userProfile.uid);
        setHistoryBundle(bundle);
      } catch (err) {
        console.error('Failed to load staff history:', err);
      }
      setHistoryLoading(false);
    }

    loadHistory();
  }, [isStaff, userProfile?.uid]);

  function handleChange(e) {
    const { name, value } = e.target;
    if (name.startsWith('address.')) {
      const key = name.split('.')[1];
      setForm(prev => ({ ...prev, address: { ...prev.address, [key]: value } }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
    setErrors(prev => ({ ...prev, [name]: null }));
  }

  function handleSysChange(e) {
    const { name, value, type } = e.target;
    setSysSettings(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    }));
  }

  function handleSysToggle(field) {
    setSysSettings(prev => ({ ...prev, [field]: !prev[field] }));
  }

  function validateProfileForm() {
    const nextErrors = {};
    const nameErr = validators.required(form.displayName, 'Full name');
    if (nameErr) nextErrors.displayName = nameErr;

    const emailErr = validators.email(form.email);
    if (emailErr) nextErrors.email = emailErr;

    const phoneErr = validators.phone(form.phone);
    if (phoneErr) nextErrors.phone = phoneErr;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateProfileForm()) return;
    setSaving(true);
    try {
      const updateData = {
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        address: {
          street: form.address.street.trim(),
          city: form.address.city.trim(),
          state: form.address.state.trim(),
          zip: form.address.zip.trim(),
        },
      };

      await updateUser(currentUser.uid, updateData);
      await logActivity({
        userId: currentUser.uid,
        action: 'profile.update',
        details: 'Updated personal profile details',
        resourceType: 'user',
        resourceId: currentUser.uid,
      });
      setSaved(true);
      showToast('Profile updated successfully', 'success');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      const message = err.code === 'permission-denied'
        ? 'You can only update your own profile. Please sign in again if this account was recently changed.'
        : err.message || 'Failed to update profile';
      showToast(message, 'error');
    }
    setSaving(false);
  }

  async function handleSysSubmit(e) {
    e.preventDefault();
    setSysSaving(true);
    try {
      await saveSettings(sysSettings, userProfile.uid);
      showToast('System settings saved', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save settings', 'error');
    }
    setSysSaving(false);
  }

  const labelStyle = {
    display: 'flex', alignItems: 'center', gap: '0.375rem',
    fontSize: '0.8125rem', fontWeight: 500,
    color: 'var(--color-text-secondary)', marginBottom: '0.375rem',
  };

  const sectionStyle = {
    marginBottom: '1.5rem', paddingBottom: '1.25rem',
    borderBottom: '1px solid var(--color-border)',
  };

  const filteredTimeline = (historyBundle?.timeline || []).filter((item) => {
    const timestamp = item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.timestamp || 0);
    const startDate = historyFilters.startDate ? new Date(`${historyFilters.startDate}T00:00:00`) : null;
    const endDate = historyFilters.endDate ? new Date(`${historyFilters.endDate}T23:59:59.999`) : null;
    if (startDate && timestamp < startDate) return false;
    if (endDate && timestamp > endDate) return false;
    return true;
  });

  return (
    <div className="animate-fade-in" style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <SettingsIcon size={isMobile ? 22 : 24} /> Settings
      </h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        Manage your profile and application settings.
      </p>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem' }}>
        <button
          className={`btn btn-sm ${activeTab === 'profile' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={14} /> Profile
        </button>
        {isStaff && (
          <button
            className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={14} /> History
          </button>
        )}
        {isAdmin && (
          <button
            className={`btn btn-sm ${activeTab === 'system' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('system')}
          >
            <Sliders size={14} /> System Settings
          </button>
        )}
      </div>

      {/* ── TAB 1: Profile Settings ── */}
      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Appearance Section */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Monitor size={18} /> Appearance
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Global Layout Theme</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Toggle between light and dark modes.</p>
              </div>
              <button 
                type="button"
                onClick={toggleTheme}
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '2rem' }}
              >
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} color="#f59e0b" />}
                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </button>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.5rem' }}>
            {/* Profile Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.5rem', fontWeight: 800, color: 'white',
            }}>
              {userProfile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{userProfile?.displayName}</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{userProfile?.email}</p>
              <span className="badge badge-info" style={{ marginTop: '0.25rem', textTransform: 'capitalize' }}>{userProfile?.role}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}><User size={14} /> Full Name</label>
              <input className="input" name="displayName" value={form.displayName} onChange={handleChange} />
              {errors.displayName && <p style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}>{errors.displayName}</p>}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}><Mail size={14} /> Email</label>
              <input
                className="input"
                name="email"
                type="email"
                value={form.email}
                readOnly
                aria-readonly="true"
              />
              {errors.email && <p style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}>{errors.email}</p>}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}><Phone size={14} /> Phone</label>
              <input className="input" name="phone" value={form.phone} onChange={handleChange} placeholder="Your phone number" />
              {errors.phone && <p style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}>{errors.phone}</p>}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}><MapPin size={14} /> Address</label>
              <input className="input" name="address.street" value={form.address.street} onChange={handleChange} placeholder="Street" style={{ marginBottom: '0.5rem' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <input className="input" name="address.city" value={form.address.city} onChange={handleChange} placeholder="City" />
                <input className="input" name="address.state" value={form.address.state} onChange={handleChange} placeholder="State" />
                <input className="input" name="address.zip" value={form.address.zip} onChange={handleChange} placeholder="ZIP" />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saved ? <><CheckCircle size={16} /> Saved!</> : saving ? 'Saving...' : <><Save size={16} /> Save Changes</>}
            </button>
          </form>
          </div>
        </div>
      )}

      {/* ── TAB 2: System Settings (Admin Only) ── */}
      {activeTab === 'history' && isStaff && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {historyLoading ? (
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              Loading staff history...
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                gap: '0.75rem',
              }}>
                {[
                  { label: 'Managed Customers', value: historyBundle?.summary?.managedCustomers || 0, icon: Users },
                  { label: 'Created Customers', value: historyBundle?.summary?.createdCustomers || 0, icon: Users },
                  { label: 'Tasks Completed', value: historyBundle?.summary?.tasksCompleted || 0, icon: CheckSquare },
                  { label: 'Transactions', value: historyBundle?.summary?.transactionsHandled || 0, icon: ArrowLeftRight },
                ].map((item) => (
                  <div key={item.label} className="glass-card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <item.icon size={16} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.label}</span>
                    </div>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CalendarClock size={18} /> Login and Activity Snapshot
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Profile Created</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{formatDateTime(userProfile?.createdAt)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Last Login</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      {currentUser?.metadata?.lastSignInTime
                        ? new Date(currentUser.metadata.lastSignInTime).toLocaleString('en-IN')
                        : 'Login history not available yet'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '1rem' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: '0.75rem',
                }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Start Date</span>
                    <input className="input" type="date" value={historyFilters.startDate} onChange={(e) => setHistoryFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>End Date</span>
                    <input className="input" type="date" value={historyFilters.endDate} onChange={(e) => setHistoryFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
                  </label>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Date-wise Activity Timeline</h3>
                <DataTable
                  columns={[
                    { header: 'Activity', accessor: 'title' },
                    { header: 'Details', accessor: 'description' },
                    { header: 'Category', accessor: 'category' },
                    {
                      header: 'When',
                      accessor: 'timestamp',
                      exportValue: (row) => formatDateTime(row.timestamp),
                      render: (row) => (
                        <div>
                          <p style={{ fontSize: '0.8125rem' }}>{formatDateTime(row.timestamp)}</p>
                          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{timeAgo(row.timestamp)}</p>
                        </div>
                      ),
                    },
                  ]}
                  data={filteredTimeline}
                  searchPlaceholder="Search staff history..."
                  emptyMessage="No historical activity found."
                  exportable
                  exportFormats={['csv', 'xlsx']}
                  exportFilename="staff-activity-history"
                />
              </div>

              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Customer Creation History</h3>
                <DataTable
                  columns={[
                    { header: 'Customer', accessor: 'displayName' },
                    { header: 'Email', accessor: 'email' },
                    { header: 'Ownership', accessor: 'managementScopeLabel' },
                    {
                      header: 'Created',
                      accessor: 'createdAt',
                      exportValue: (row) => formatDateTime(row.createdAt),
                      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{formatDate(row.createdAt)}</span>,
                    },
                  ]}
                  data={historyBundle?.createdCustomers || []}
                  searchPlaceholder="Search created customers..."
                  emptyMessage="No created customers found."
                  exportable
                  exportFormats={['csv', 'xlsx']}
                  exportFilename="staff-created-customers"
                />
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'system' && isAdmin && (
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          {sysLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: 'var(--color-text-muted)' }}>Loading settings...</p>
            </div>
          ) : sysSettings ? (
            <form onSubmit={handleSysSubmit}>
              {/* Branding Section */}
              <div style={sectionStyle}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                  Branding
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>App Name</label>
                    <input className="input" name="appName" value={sysSettings.appName} onChange={handleSysChange} />
                  </div>
                  <div>
                    <label style={labelStyle}>Currency</label>
                    <select className="input" name="currency" value={sysSettings.currency} onChange={handleSysChange}>
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Timezone</label>
                    <select className="input" name="timezone" value={sysSettings.timezone} onChange={handleSysChange}>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Financial Defaults Section */}
              <div style={sectionStyle}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <DollarSign size={14} /> Financial Defaults
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>Default Commission Rate (%)</label>
                    <input className="input" name="defaultCommissionRate" type="number" step="0.1" min="0" max="100" value={sysSettings.defaultCommissionRate} onChange={handleSysChange} />
                  </div>
                  <div>
                    <label style={labelStyle}>Max Commission Rate (%)</label>
                    <input className="input" name="maxCommissionRate" type="number" step="0.1" min="0" max="100" value={sysSettings.maxCommissionRate} onChange={handleSysChange} />
                  </div>
                  <div>
                    <label style={labelStyle}>Min Transaction Amount (₹)</label>
                    <input className="input" name="minTransactionAmount" type="number" min="0" value={sysSettings.minTransactionAmount} onChange={handleSysChange} />
                  </div>
                  <div>
                    <label style={labelStyle}>Max Transaction Amount (₹)</label>
                    <input className="input" name="maxTransactionAmount" type="number" min="0" value={sysSettings.maxTransactionAmount} onChange={handleSysChange} />
                  </div>
                  <div>
                    <label style={labelStyle}>Auto-Approval Threshold (₹)</label>
                    <input className="input" name="autoApprovalThreshold" type="number" min="0" value={sysSettings.autoApprovalThreshold} onChange={handleSysChange} />
                    <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      Transactions below this amount are auto-approved
                    </p>
                  </div>
                </div>
              </div>

              {/* Operational Guardrails Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Shield size={14} /> Operational Guardrails
                </h3>

                {/* Toggle switches */}
                {[
                  { field: 'maintenanceMode', label: 'Maintenance Mode', desc: 'Disable all user operations during maintenance', danger: true },
                  { field: 'requireKycForTransactions', label: 'Require KYC for Transactions', desc: 'Block transactions from users without verified KYC' },
                ].map(({ field, label, desc, danger }) => (
                  <div key={field} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.875rem 0', borderBottom: '1px solid var(--color-border)',
                  }}>
                    <div>
                      <p style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        {danger && sysSettings[field] && <AlertTriangle size={14} color="var(--color-danger)" />}
                        {label}
                      </p>
                      <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSysToggle(field)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: sysSettings[field] ? (danger ? 'var(--color-danger)' : '#10b981') : 'var(--color-text-muted)',
                      }}
                    >
                      {sysSettings[field] ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                  </div>
                ))}

                <div style={{ marginTop: '1rem' }}>
                  <label style={labelStyle}>Max Lead Age (days)</label>
                  <input className="input" name="maxLeadAgeDays" type="number" min="1" max="365" value={sysSettings.maxLeadAgeDays} onChange={handleSysChange} style={{ maxWidth: 200 }} />
                  <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                    Leads older than this are flagged as stale in Reports
                  </p>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={sysSaving}>
                {sysSaving ? 'Saving...' : <><Save size={16} /> Save System Settings</>}
              </button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}
