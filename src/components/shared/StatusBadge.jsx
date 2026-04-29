const STATUS_MAP = {
  active: 'success', completed: 'success', paid: 'success',
  pending: 'warning', in_progress: 'info',
  inactive: 'neutral', cancelled: 'neutral',
  suspended: 'danger', failed: 'danger',
};

export default function StatusBadge({ status }) {
  const type = STATUS_MAP[status] || 'neutral';
  return (
    <span className={`badge badge-${type}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}
