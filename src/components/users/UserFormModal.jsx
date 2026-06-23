import { useState, useEffect } from 'react';
import { User, Mail, Phone, Shield, CreditCard, Calendar, Hash, Lock, Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import Modal from '../shared/Modal';
import PasswordField from '../shared/PasswordField';
import { useAuth } from '../../contexts/AuthContext';
import { functions } from '../../config/firebase';
import { createUserByAdmin, getReferralEligibleUsers, setManagedUserPassword, updateUser } from '../../services/userService';
import { logActivity } from '../../services/activityLogService';
import { getCallableErrorMessage } from '../../utils/callableError';
import { validators } from '../../utils/validation';
import { useToast } from '../../contexts/ToastContext';
import AutocompleteInput from '../shared/AutocompleteInput';
import { INDIAN_STATES, MAJOR_INDIAN_CITIES } from '../../utils/indianAddressData';
import { lookupPincode } from '../../utils/pincodeLookup';

const ROLES = ['admin', 'staff', 'customer', 'agent'];
const KYC_STATUSES = ['not_submitted', 'pending', 'verified', 'rejected'];

function buildInitialForm(defaultRole = 'customer') {
  return {
    displayName: '',
    username: '',
    email: '',
    phone: '',
    role: defaultRole,
    directReferrerId: '',
    password: '',
    confirmPassword: '',
    panNumber: '',
    aadhaarLastFour: '',
    dateOfBirth: '',
    kycStatus: 'not_submitted',
    address: { street: '', city: '', state: '', zip: '' },
  };
}

function buildFormFromUserRecord(source, fallbackRole = 'customer') {
  if (!source) {
    return buildInitialForm(fallbackRole);
  }

  return {
    displayName: source.displayName || '',
    username: source.username || '',
    email: source.email || '',
    phone: source.phone || '',
    role: source.role || fallbackRole,
    directReferrerId: source.referrerId || '',
    password: '',
    confirmPassword: '',
    panNumber: source.panNumber || '',
    aadhaarLastFour: source.aadhaarLastFour || '',
    dateOfBirth: source.dateOfBirth || '',
    kycStatus: source.kycStatus || 'not_submitted',
    address: {
      street: source.address?.street || '',
      city: source.address?.city || '',
      state: source.address?.state || '',
      zip: source.address?.zip || '',
    },
  };
}

export default function UserFormModal({ isOpen, onClose, user, leadSource = null, onSuccess, allowedRoles = ROLES, title }) {
  const { userProfile, refreshClaims } = useAuth();
  const { showToast } = useToast();
  const isEdit = !!user;
  const isLeadPromotion = !!leadSource && !isEdit;
  const canManageRoles = userProfile?.role === 'admin';
  const canSelectReferrer = userProfile?.role === 'admin';
  const createRoleOptions = allowedRoles.length > 0 ? allowedRoles : ['customer'];
  const defaultCreateRole = createRoleOptions.includes('customer') ? 'customer' : createRoleOptions[0];
  const [form, setForm] = useState(() => {
    if (user) {
      return buildFormFromUserRecord(user, 'customer');
    }

    if (leadSource) {
      return buildFormFromUserRecord({ ...leadSource, role: 'customer' }, 'customer');
    }

    return buildInitialForm(defaultCreateRole);
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [referralOptions, setReferralOptions] = useState([]);
  const [loadingPincode, setLoadingPincode] = useState(false);

  useEffect(() => {
    const pin = form.address.zip?.trim();
    if (pin && /^\d{6}$/.test(pin)) {
      let active = true;
      async function triggerLookup() {
        setLoadingPincode(true);
        try {
          const result = await lookupPincode(pin);
          if (active && result) {
            setForm(prev => ({
              ...prev,
              address: {
                ...prev.address,
                city: result.city || prev.address.city,
                state: result.state || prev.address.state
              }
            }));
            showToast('Address auto-filled from PIN code!', 'success');
          }
        } catch (err) {
          console.error('Pincode lookup error:', err);
        } finally {
          if (active) setLoadingPincode(false);
        }
      }
      triggerLookup();
      return () => {
        active = false;
      };
    }
  }, [form.address.zip, showToast]);
  const isCustomerCreateRole = form.role === 'customer';
  const isManagedPasswordRole = ['staff', 'agent'].includes(form.role);
  const canManagePassword = canManageRoles && isManagedPasswordRole;
  const shouldShowPasswordFields = !isEdit
    ? (isCustomerCreateRole || isManagedPasswordRole)
    : canManagePassword;

  useEffect(() => {
    if (!isOpen || isEdit || form.role !== 'customer' || !canSelectReferrer) return;

    async function loadReferralOptions() {
      try {
        const options = await getReferralEligibleUsers();
        setReferralOptions(options);
      } catch (err) {
        console.error('Failed to load referral options:', err);
      }
    }

    loadReferralOptions();
  }, [canSelectReferrer, form.role, isEdit, isOpen]);

  function handleChange(e) {
    const { name, value } = e.target;

    if (name.startsWith('address.')) {
      const key = name.split('.')[1];
      setForm((prev) => ({ ...prev, address: { ...prev.address, [key]: value } }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  }

  function validate() {
    const errs = {};
    const emailProvided = !!form.email.trim();
    const isEditingManagedPassword = isEdit && canManagePassword && !!(form.password || form.confirmPassword);
    const nameErr = validators.required(form.displayName, 'Full name');
    if (nameErr) errs.displayName = nameErr;

    if (emailProvided) {
      const emailErr = validators.optionalEmail(form.email);
      if (emailErr) errs.email = emailErr;
    }

    if (!isEdit) {
      const usernameErr = validators.username(form.username);
      if (usernameErr) errs.username = usernameErr;

      const requiredPhoneErr = validators.required(form.phone, 'Phone number');
      if (requiredPhoneErr) {
        errs.phone = requiredPhoneErr;
      } else {
        const phoneErr = validators.phone(form.phone);
        if (phoneErr) errs.phone = phoneErr;
      }
    } else {
      const phoneErr = validators.phone(form.phone);
      if (phoneErr) errs.phone = phoneErr;
    }

    const panErr = validators.panNumber(form.panNumber);
    if (panErr) errs.panNumber = panErr;

    const aadhaarErr = validators.aadhaarLastFour(form.aadhaarLastFour);
    if (aadhaarErr) errs.aadhaarLastFour = aadhaarErr;

    const dobErr = validators.dateOfBirth(form.dateOfBirth);
    if (dobErr) errs.dateOfBirth = dobErr;

    if (!isEdit && !createRoleOptions.includes(form.role)) {
      errs.role = 'You do not have permission to create that user type';
    }

    if ((!isEdit && (isCustomerCreateRole || isManagedPasswordRole)) || isEditingManagedPassword) {
      const passwordErr = validators.password(form.password);
      if (passwordErr) errs.password = passwordErr;

      if (!form.confirmPassword) {
        errs.confirmPassword = 'Confirm password is required';
      } else if (form.password !== form.confirmPassword) {
        errs.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    try {
      if (isEdit) {
        const updateData = {
          displayName: form.displayName.trim(),
          phone: form.phone?.trim() || null,
          panNumber: form.panNumber?.trim().toUpperCase() || null,
          aadhaarLastFour: form.aadhaarLastFour?.trim() || null,
          dateOfBirth: form.dateOfBirth || null,
          kycStatus: form.kycStatus,
          address: {
            street: form.address.street?.trim() || '',
            city: form.address.city?.trim() || '',
            state: form.address.state?.trim() || '',
            zip: form.address.zip?.trim() || '',
          },
        };

        if (form.kycStatus === 'verified' && user.kycStatus !== 'verified') {
          updateData.markKycVerified = true;
        }

        await updateUser(user.id, updateData);

        if (canManagePassword && form.password) {
          await setManagedUserPassword(user.id, form.password);
        }

        await logActivity({
          userId: userProfile.uid,
          action: 'customer.update',
          details: `Updated profile for "${form.displayName}"`,
          resourceType: 'user',
          resourceId: user.id,
        });

        if (form.role !== user.role) {
          const setUserRole = httpsCallable(functions, 'setUserRole');
          await setUserRole({ targetUid: user.id, newRole: form.role });
        }

      } else {
        await refreshClaims();
        await createUserByAdmin({
          email: form.email.trim() || undefined,
          displayName: form.displayName.trim(),
          username: form.username.trim() || undefined,
          role: form.role,
          existingDocId: leadSource?.id || undefined,
          password: shouldShowPasswordFields ? form.password : undefined,
          directReferrerId: canSelectReferrer && form.role === 'customer' ? (form.directReferrerId || undefined) : undefined,
          phone: form.phone?.trim() || null,
          panNumber: form.panNumber?.trim().toUpperCase() || null,
          aadhaarLastFour: form.aadhaarLastFour?.trim() || null,
          dateOfBirth: form.dateOfBirth || null,
          kycStatus: form.kycStatus,
          address: {
            street: form.address.street?.trim() || '',
            city: form.address.city?.trim() || '',
            state: form.address.state?.trim() || '',
            zip: form.address.zip?.trim() || '',
          },
        });

        showToast(
          isCustomerCreateRole
            ? `${leadSource ? 'Activated' : 'Created'} customer "${form.displayName}" with a login account`
            : `Created ${form.role} "${form.displayName}" successfully`,
          'success'
        );
      }

      if (isEdit && canManagePassword && form.password) {
        showToast(`Updated ${form.role} "${form.displayName}" and set a new password`, 'success');
      } else if (isEdit) {
        showToast(`Updated ${form.displayName} successfully`, 'success');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('UserFormModal error:', err);
      const fallbackMessage = isEdit
        ? 'Failed to update user account'
        : isCustomerCreateRole
          ? 'Failed to create customer account'
          : `Failed to create ${form.role} account`;
      const msg = getCallableErrorMessage(err, fallbackMessage);
      showToast(msg, 'error');
    }

    setSaving(false);
  }

  const inputStyle = { marginBottom: '1rem' };
  const labelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: '0.375rem',
  };
  const errorStyle = {
    fontSize: '0.75rem',
    color: 'var(--color-danger)',
    marginTop: '0.25rem',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title || (isEdit ? 'Edit User' : leadSource ? 'Activate Customer' : 'Create User')} maxWidth={580}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Identity
          </h4>

          <div style={inputStyle}>
            <label style={labelStyle}><User size={14} /> Full Name *</label>
            <input className="input" name="displayName" value={form.displayName} onChange={handleChange} placeholder="Full legal name" />
            {errors.displayName && <p style={errorStyle}>{errors.displayName}</p>}
          </div>

          {!isEdit && (
            <div style={inputStyle}>
              <label style={labelStyle}><User size={14} /> Username *</label>
              <input className="input" name="username" value={form.username} onChange={handleChange} placeholder="username" />
              {errors.username && <p style={errorStyle}>{errors.username}</p>}
            </div>
          )}

          <div style={inputStyle}>
            <label style={labelStyle}>
              <Mail size={14} /> Email (Optional)
            </label>
            <input className="input" name="email" value={form.email} onChange={handleChange} placeholder="user@example.com" disabled={isEdit} style={isEdit ? { opacity: 0.6 } : {}} />
            {errors.email && <p style={errorStyle}>{errors.email}</p>}
          </div>

          <div style={inputStyle}>
            <label style={labelStyle}><Phone size={14} /> Phone Number {!isEdit ? '*' : '(Optional)'}</label>
            <input className="input" name="phone" value={form.phone} onChange={handleChange} placeholder="+91 98765 43210" />
            {errors.phone && <p style={errorStyle}>{errors.phone}</p>}
          </div>

          <div style={inputStyle}>
            <label style={labelStyle}><Shield size={14} /> Role</label>
            {isEdit && !canManageRoles ? (
              <input
                className="input"
                value={form.role.charAt(0).toUpperCase() + form.role.slice(1)}
                readOnly
                aria-readonly="true"
              />
            ) : isEdit || (!isLeadPromotion && createRoleOptions.length > 1) ? (
              <select className="input" name="role" value={form.role} onChange={handleChange} disabled={isEdit && user?.id === userProfile?.uid}>
                {(isEdit ? ROLES : createRoleOptions).map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={createRoleOptions[0].charAt(0).toUpperCase() + createRoleOptions[0].slice(1)}
                readOnly
                aria-readonly="true"
              />
            )}
            {errors.role && <p style={errorStyle}>{errors.role}</p>}
            {isEdit && user?.id === userProfile?.uid && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                You cannot change your own role
              </p>
            )}
          </div>

          {!isEdit && canSelectReferrer && isCustomerCreateRole && (
            <div style={inputStyle}>
              <label style={labelStyle}><User size={14} /> Direct Referrer</label>
              <select className="input" name="directReferrerId" value={form.directReferrerId} onChange={handleChange}>
                <option value="">No referral</option>
                {referralOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {(option.displayName || option.email || option.id)} ({option.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {shouldShowPasswordFields && (
            <>
              <div style={inputStyle}>
                <label style={labelStyle}>
                  <Lock size={14} /> {!isEdit ? 'Password *' : 'Set New Password'}
                </label>
                <PasswordField
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder={!isEdit ? 'Set a strong password' : 'Enter a new strong password'}
                />
                {errors.password && <p style={errorStyle}>{errors.password}</p>}
              </div>

              <div style={inputStyle}>
                <label style={labelStyle}>
                  <Lock size={14} /> {!isEdit ? 'Confirm Password *' : 'Confirm New Password'}
                </label>
                <PasswordField
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder={!isEdit ? 'Confirm the password' : 'Confirm the new password'}
                />
                {errors.confirmPassword && <p style={errorStyle}>{errors.confirmPassword}</p>}
              </div>
            </>
          )}
        </div>

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
                {KYC_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Address
          </h4>
          <input className="input" name="address.street" value={form.address.street} onChange={handleChange} placeholder="Street address" style={{ marginBottom: '0.5rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', alignItems: 'start' }}>
            <div style={{ position: 'relative' }}>
              <AutocompleteInput
                name="address.city"
                value={form.address.city}
                onChange={handleChange}
                suggestions={MAJOR_INDIAN_CITIES}
                placeholder="City"
                disabled={loadingPincode}
              />
              {loadingPincode && (
                <Loader2
                  size={14}
                  className="animate-spin"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '12px',
                    color: 'var(--color-primary-500)',
                  }}
                />
              )}
            </div>
            <AutocompleteInput
              name="address.state"
              value={form.address.state}
              onChange={handleChange}
              suggestions={INDIAN_STATES}
              placeholder="State"
              disabled={loadingPincode}
            />
            <input
              className="input"
              name="address.zip"
              value={form.address.zip}
              onChange={handleChange}
              placeholder="PIN"
              maxLength={6}
            />
          </div>
        </div>

        {!isEdit && isCustomerCreateRole && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
            marginBottom: '1.25rem',
            fontSize: '0.8125rem',
            color: 'var(--color-text-secondary)',
          }}>
            <strong style={{ color: 'var(--color-primary)' }}>Managed Access:</strong> This customer will receive a login account immediately. Share the password securely and ask them to change it after first use.
            {!form.email.trim() && (
              <span> Because email is blank, username and phone are required for sign-in support.</span>
            )}
          </div>
        )}

        {isEdit && canManagePassword && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
            marginBottom: '1.25rem',
            fontSize: '0.8125rem',
            color: 'var(--color-text-secondary)',
          }}>
            <strong style={{ color: 'var(--color-primary)' }}>Admin-only:</strong> Set a new password for this {form.role} account to replace the current login credentials.
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : isLeadPromotion ? 'Activate Customer' : isCustomerCreateRole ? 'Create Customer' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
