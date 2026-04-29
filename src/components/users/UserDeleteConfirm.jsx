import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../shared/Modal';
import { deleteUser } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

/**
 * UserDeleteConfirm — Destructive action confirmation.
 * Requires typing user's name to confirm (enterprise pattern).
 * Prevents admin self-deletion (enforced client + server).
 */
export default function UserDeleteConfirm({ isOpen, onClose, user, onSuccess }) {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isSelf = user?.id === userProfile?.uid;
  const canDelete = confirmText.trim().toLowerCase() === (user?.displayName || '').toLowerCase();

  async function handleDelete() {
    if (!canDelete || isSelf) return;
    setDeleting(true);
    try {
      await deleteUser(user.id);
      showToast(`Deleted "${user.displayName}" successfully`, 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Delete error:', err);
      showToast(err.message || 'Failed to delete user', 'error');
    }
    setDeleting(false);
    setConfirmText('');
  }

  function handleClose() {
    setConfirmText('');
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Delete User" maxWidth={460}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem',
        }}>
          <AlertTriangle size={28} color="var(--color-danger)" />
        </div>

        {isSelf ? (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--color-danger)' }}>
              Cannot Delete Your Own Account
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              Administrators cannot delete their own account. Contact another administrator for this action.
            </p>
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Delete "{user?.displayName}"?
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              This action is <strong style={{ color: 'var(--color-danger)' }}>permanent and cannot be undone</strong>.
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Role: <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{user?.role}</span> · {user?.email}
            </p>
          </div>
        )}
      </div>

      {!isSelf && (
        <>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              fontSize: '0.8125rem', fontWeight: 500,
              color: 'var(--color-text-secondary)', marginBottom: '0.375rem', display: 'block',
            }}>
              Type <strong>"{user?.displayName}"</strong> to confirm
            </label>
            <input
              className="input"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={user?.displayName}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={handleClose} disabled={deleting}>Cancel</button>
            <button
              className="btn"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              style={{
                background: canDelete ? 'var(--color-danger)' : 'var(--color-bg-tertiary)',
                color: canDelete ? 'white' : 'var(--color-text-muted)',
                cursor: canDelete ? 'pointer' : 'not-allowed',
              }}
            >
              {deleting ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </>
      )}

      {isSelf && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={handleClose}>Close</button>
        </div>
      )}
    </Modal>
  );
}
