import { useState, useEffect } from 'react';
import { User, Mail, Phone, MapPin, Shield, CreditCard, Calendar, Hash } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import Modal from '../shared/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { functions } from '../../config/firebase';
import { createUser, updateUser } from '../../services/userService';
import { validators } from '../../utils/validation';
import { useToast } from '../../contexts/ToastContext';
import { serverTimestamp } from 'firebase/firestore';

const ROLES = ['admin', 'staff', 'customer', 'agent'];
const KYC_STATUSES = ['not_submitted', 'pending', 'verified', 'rejected'];

const INITIAL_FORM = {
  displayName: '',
  email: '',
  phone: '',
  role: 'customer',
  panNumber: '',
  aadhaarLastFour: '',
  dateOfBirth: '',
  kycStatus: 'not_submitted',
  address: { street: '', city: '', state: '', zip: '' },
};

/**
 * UserFormModal — Create or Edit a user.
 *
 * Create mode (user === null):
 *   - Customer role → Firestore-only "lead" (no Auth account)
 *   - Admin/Staff/Agent role → calls createUserByAdmin Cloud Function
 *
 * Edit mode (user !== null):
 *   - Updates Firestore doc via updateUser()
 *   - If role changed → calls setUserRole Cloud Function
 */
export default function UserFormModal({ isOpen, onClose, user, onSuccess }) {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const isEdit = !!user;

  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (user) {
      setForm({
        displayName: user.displayName || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || 'customer',
        panNumber: user.panNumber || '',
        aadhaarLastFour: user.aadhaarLastFour || '',
        dateOfBirth: user.dateOfBirth || '',
        kycStatus: user.kycStatus || 'not_submitted',
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          zip: user.address?.zip || '',
        },
      });
    } else {
      setForm(INITIAL_FORM);
    }
    setErrors({});
  }, [user, isOpen]);

  function handleChange(e) {
    const { name, value } = e.target;
    if (name.startsWith('address.')) {
      const key = name.split('.')[1];
      setForm(prev => ({ ...prev, address: { ...prev.address, [key]: value } }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
    // Clear error on change
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  }

  function validate() {
    const errs = {};
    const nameErr = validators.required(form.displayName, 'Full name');
    if (nameErr) errs.displayName = nameErr;

    const emailErr = validators.email(form.email);
    if (emailErr) errs.email = emailErr;

    const phoneErr = validators.phone(form.phone);
    if (phoneErr) errs.phone = phoneErr;

    const panErr = validators.panNumber(form.panNumber);
    if (panErr) errs.panNumber = panErr;

    const aadhaarErr = validators.aadhaarLastFour(form.aadhaarLastFour);
    if (aadhaarErr) errs.aadhaarLastFour = aadhaarErr;

    const dobErr = validators.dateOfBirth(form.dateOfBirth);
    if (dobErr) errs.dateOfBirth = dobErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    try {
      if (isEdit) {
        // ── EDIT MODE ──
        const updateData = {
          displayName: form.displayName,
          phone: form.phone,
          panNumber: form.panNumber || null,
          aadhaarLastFour: form.aadhaarLastFour || null,
          dateOfBirth: form.dateOfBirth || null,
          kycStatus: form.kycStatus,
          address: form.address,
        };

        // If admin changed KYC to verified, stamp it
        if (form.kycStatus === 'verified' && user.kycStatus !== 'verified') {
          updateData.kycVerifiedAt = serverTimestamp();
          updateData.kycVerifiedBy = userProfile.uid;
        }

        await updateUser(user.id, updateData);

        // If role changed, call Cloud Function
        if (form.role !== user.role) {
          const setUserRole = httpsCallable(functions, 'setUserRole');
          await setUserRole({ targetUid: user.id, newRole: form.role });
        }

        showToast(`Updated ${form.displayName} successfully`, 'success');
      } else {
        // ── CREATE MODE ──
        if (form.role === 'customer') {
          // Create as Firestore-only "lead" — no Auth account
          const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await createUser(leadId, {
            displayName: form.displayName,
            email: form.email,
            phone: form.phone,
            role: 'customer',
            panNumber: form.panNumber || null,
            aadhaarLastFour: form.aadhaarLastFour || null,
            dateOfBirth: form.dateOfBirth || null,
            kycStatus: form.kycStatus,
            address: form.address,
            customerStatus: 'lead',
            hasAuthAccount: false,
            promotedAt: null,
            promotedBy: null,
            createdBy: userProfile.uid,
          });
          showToast(`Created lead "${form.displayName}" successfully`, 'success');
        } else {
          // Admin/Staff/Agent — needs Auth account immediately
          const createUserByAdmin = httpsCallable(functions, 'createUserByAdmin');
          await createUserByAdmin({
            email: form.email,
            displayName: form.displayName,
            role: form.role,
            phone: form.phone || null,
            panNumber: form.panNumber || null,
            aadhaarLastFour: form.aadhaarLastFour || null,
            dateOfBirth: form.dateOfBirth || null,
            kycStatus: form.kycStatus,
            address: form.address,
          });
          showToast(`Created ${form.role} "${form.displayName}" — password reset email sent`, 'success');
        }
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('UserFormModal error:', err);
      const msg = err?.message || err?.details?.message || 'Operation failed';
      showToast(msg, 'error');
    }
    setSaving(false);
  }

  const inputStyle = { marginBottom: '1rem' };
  const labelStyle = {
    display: 'flex', alignItems: 'center', gap: '0.375rem',
    fontSize: '0.8125rem', fontWeight: 500,
    color: 'var(--color-text-secondary)', marginBottom: '0.375rem',
  };
  const errorStyle = {
    fontSize: '0.75rem', color: 'var(--color-danger)',
    marginTop: '0.25rem',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit User' : 'Create User'} maxWidth={580}>
      <form onSubmit={handleSubmit}>
        {/* ── Identity Section ── */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Identity
          </h4>

          <div style={inputStyle}>
            <label style={labelStyle}><User size={14} /> Full Name *</label>
            <input className="input" name="displayName" value={form.displayName} onChange={handleChange} placeholder="Full legal name" />
            {errors.displayName && <p style={errorStyle}>{errors.displayName}</p>}
          </div>

          <div style={inputStyle}>
            <label style={labelStyle}><Mail size={14} /> Email *</label>
            <input className="input" name="email" value={form.email} onChange={handleChange} placeholder="user@example.com" disabled={isEdit} style={isEdit ? { opacity: 0.6 } : {}} />
            {errors.email && <p style={errorStyle}>{errors.email}</p>}
          </div>

          <div style={inputStyle}>
            <label style={labelStyle}><Phone size={14} /> Phone</label>
            <input className="input" name="phone" value={form.phone} onChange={handleChange} placeholder="+91 98765 43210" />
            {errors.phone && <p style={errorStyle}>{errors.phone}</p>}
          </div>

          <div style={inputStyle}>
            <label style={labelStyle}><Shield size={14} /> Role</label>
            <select className="input" name="role" value={form.role} onChange={handleChange} disabled={isEdit && user?.id === userProfile?.uid}>
              {ROLES.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
            {isEdit && user?.id === userProfile?.uid && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                You cannot change your own role
              </p>
            )}
          </div>
        </div>

        {/* ── KYC / Compliance Section ── */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Compliance (KYC)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}><CreditCard size={14} /> PAN Number</label>
              <input className="input" name="panNumber" value={form.panNumber} onChange={handleChange} placeholder="ABCDE1234F" style={{ textTransform: 'uppercase' }} />
              {errors.panNumber && <p style={errorStyle}>{errors.panNumber}</p>}
            </div>
            <div>
              <label style={labelStyle}><Hash size={14} /> Aadhaar (Last 4)</label>
              <input className="input" name="aadhaarLastFour" value={form.aadhaarLastFour} onChange={handleChange} placeholder="1234" maxLength={4} />
              {errors.aadhaarLastFour && <p style={errorStyle}>{errors.aadhaarLastFour}</p>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div>
              <label style={labelStyle}><Calendar size={14} /> Date of Birth</label>
              <input className="input" name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} />
              {errors.dateOfBirth && <p style={errorStyle}>{errors.dateOfBirth}</p>}
            </div>
            <div>
              <label style={labelStyle}><Shield size={14} /> KYC Status</label>
              <select className="input" name="kycStatus" value={form.kycStatus} onChange={handleChange}>
                {KYC_STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Address Section ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Address
          </h4>
          <input className="input" name="address.street" value={form.address.street} onChange={handleChange} placeholder="Street address" style={{ marginBottom: '0.5rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <input className="input" name="address.city" value={form.address.city} onChange={handleChange} placeholder="City" />
            <input className="input" name="address.state" value={form.address.state} onChange={handleChange} placeholder="State" />
            <input className="input" name="address.zip" value={form.address.zip} onChange={handleChange} placeholder="PIN" />
          </div>
        </div>

        {/* ── Lead Notice ── */}
        {!isEdit && form.role === 'customer' && (
          <div style={{
            padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
            marginBottom: '1.25rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
          }}>
            <strong style={{ color: '#f59e0b' }}>Lead Pipeline:</strong> This customer will be created as a data-only lead (no login account). You can promote them later from the Manage Users page.
          </div>
        )}

        {/* ── Submit ── */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : form.role === 'customer' ? 'Create Lead' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
