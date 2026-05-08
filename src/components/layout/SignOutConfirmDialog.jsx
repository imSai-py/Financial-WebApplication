import ConfirmDialog from '../shared/ConfirmDialog';

export default function SignOutConfirmDialog({ isOpen, onClose, onConfirm, loading = false }) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Sign Out"
      message="Are you sure you want to sign out?"
      confirmLabel="Sign Out"
      cancelLabel="Cancel"
      confirmVariant="danger"
      loading={loading}
    />
  );
}
