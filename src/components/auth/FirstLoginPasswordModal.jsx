import { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useToast } from '../../contexts/ToastContext';
import { validators } from '../../utils/validation';
import Modal from '../shared/Modal';
import PasswordField from '../shared/PasswordField';

export default function FirstLoginPasswordModal({ isOpen, currentUser }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const passwordError = validators.password(form.password);
    if (passwordError) {
      showToast(passwordError, 'error');
      return;
    }
    if (form.password !== form.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setSaving(true);
    try {
      await updatePassword(currentUser, form.password);
      const completeFirstLoginPasswordChange = httpsCallable(functions, 'completeFirstLoginPasswordChange');
      await completeFirstLoginPasswordChange({});
      showToast('Password changed successfully', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to change password', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Create New Password" maxWidth={440}>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <PasswordField
          value={form.password}
          onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          placeholder="New password"
        />
        <PasswordField
          value={form.confirmPassword}
          onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
          placeholder="Confirm new password"
        />
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Password'}
        </button>
      </form>
    </Modal>
  );
}
