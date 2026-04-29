import { useState, useEffect } from 'react';
import { ScrollText, Clock } from 'lucide-react';
import { getActivityLogs } from '../../services/activityLogService';
import DataTable from '../shared/DataTable';
import LoadingSpinner from '../shared/LoadingSpinner';
import { formatDateTime } from '../../utils/formatDate';

export default function ActivityLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getActivityLogs();
        setLogs(data);
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingSpinner text="Loading activity logs..." />;

  const columns = [
    {
      header: 'Action',
      accessor: 'action',
      render: (row) => <span style={{ fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'monospace' }}>{row.action}</span>,
    },
    { header: 'Details', accessor: 'details' },
    {
      header: 'Target',
      accessor: 'targetType',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {row.targetType} / <span style={{ fontFamily: 'monospace' }}>{row.targetId?.slice(0, 10)}...</span>
        </span>
      ),
    },
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{formatDateTime(row.timestamp)}</span>,
    },
  ];

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ScrollText size={24} /> Activity Logs
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Complete audit trail of all system activity. {logs.length} entries.</p>
      </div>

      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <DataTable columns={columns} data={logs} searchPlaceholder="Search logs..." />
      </div>
    </div>
  );
}
