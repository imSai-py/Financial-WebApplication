import { useState, useEffect } from 'react';
import { CheckSquare, Plus, Clock, AlertTriangle, LayoutList, LayoutGrid, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTasks, getTasksByAssignee, createTask, updateTask } from '../../services/taskService';
import { getAllUsers } from '../../services/userService';
import { logActivity } from '../../services/activityLogService';
import { getStaffHistoryBundle } from '../../services/staffHistoryService';
import DataTable from '../shared/DataTable';
import StatusBadge from '../shared/StatusBadge';
import Modal from '../shared/Modal';
import LoadingSpinner from '../shared/LoadingSpinner';
import { formatDate, timeAgo } from '../../utils/formatDate';
import { useIsMobile } from '../../hooks/useMediaQuery';

const KANBAN_COLUMNS = [
  { key: 'pending',     label: 'Pending',     color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  { key: 'in_progress', label: 'In Progress', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  { key: 'completed',   label: 'Completed',   color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
];

const PRIORITY_COLORS = {
  urgent: { border: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  high:   { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  medium: { border: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  low:    { border: '#64748b', bg: 'rgba(100,116,139,0.08)' },
};

export default function TaskList() {
  const { userProfile, isAdmin } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'board'
  const [newTask, setNewTask] = useState({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '' });
  const [creating, setCreating] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [recentWorkActivity, setRecentWorkActivity] = useState([]);
  const isMobile = useIsMobile();
  const isStaff = userProfile?.role === 'staff';

  useEffect(() => {
    async function load() {
      try {
        const data = isAdmin ? await getTasks(userProfile) : await getTasksByAssignee(userProfile.uid);
        setTasks(data);
        if (isAdmin) {
          const users = await getAllUsers();
          setAssignableUsers(users.filter(u => u.role !== 'customer'));
        } else if (userProfile?.role === 'staff') {
          const history = await getStaffHistoryBundle(userProfile.uid);
          setRecentWorkActivity(history.timeline.filter((item) => ['task', 'transaction'].includes(item.category)).slice(0, 12));
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
  }, [userProfile.uid, userProfile?.role, isAdmin]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const task = await createTask({ ...newTask, assignedBy: userProfile.uid }, userProfile);
      setTasks(prev => [task, ...prev]);
      await logActivity({
        userId: userProfile.uid,
        action: 'task.create',
        details: `Created task "${newTask.title}"`,
        resourceType: 'task',
        resourceId: task.id,
      });
      setShowCreate(false);
      setNewTask({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '' });
    } catch (err) { console.error(err); }
    setCreating(false);
  }

  async function handleStatusChange(taskId, newStatus) {
    try {
      const updateData = { status: newStatus };
      // Track completion timestamp
      if (newStatus === 'completed') {
        updateData.completedAt = new Date().toISOString();
      }
      await updateTask(taskId, updateData);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updateData } : t));
      await logActivity({
        userId: userProfile.uid,
        action: 'task.status_update',
        details: `Updated task status to ${newStatus}`,
        resourceType: 'task',
        resourceId: taskId,
      });
    } catch (err) { console.error(err); }
  }

  if (loading) return <LoadingSpinner text="Loading tasks..." />;

  const priorityIcon = {
    urgent: <AlertTriangle size={14} color="var(--color-danger)" />,
    high: <AlertTriangle size={14} color="var(--color-warning)" />,
  };

  // ═══════════════════════════════════════════════════════
  // Table View Columns
  // ═══════════════════════════════════════════════════════
  const columns = [
    {
      header: 'Task',
      accessor: 'title',
      render: (row) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            {priorityIcon[row.priority]}
            <span style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{row.title}</span>
          </div>
          {row.description && (
            <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
              {row.description.length > 60 ? row.description.substring(0, 60) + '...' : row.description}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Priority',
      accessor: 'priority',
      render: (row) => {
        const colors = { urgent: 'danger', high: 'warning', medium: 'info', low: 'neutral' };
        return <span className={`badge badge-${colors[row.priority] || 'neutral'}`}>{row.priority}</span>;
      },
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusBadge status={row.status} />
          {row.status !== 'completed' && row.status !== 'cancelled' && (
            <select
              value={row.status}
              onChange={e => handleStatusChange(row.id, e.target.value)}
              style={{
                background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)',
                fontSize: '0.6875rem', padding: '0.125rem 0.25rem', cursor: 'pointer',
              }}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}
        </div>
      ),
    },
    {
      header: 'Due Date',
      accessor: 'dueDate',
      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{formatDate(row.dueDate)}</span>,
      hideOnMobile: true,
    },
  ];

  // ═══════════════════════════════════════════════════════
  // Kanban Board View
  // ═══════════════════════════════════════════════════════
  function KanbanBoard() {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: '1rem',
      }}>
        {KANBAN_COLUMNS.map(column => {
          const columnTasks = tasks.filter(t => t.status === column.key);
          return (
            <div key={column.key} style={{
              background: column.bg,
              borderRadius: 'var(--radius-lg)',
              padding: '1rem',
              minHeight: isMobile ? 'auto' : '400px',
              border: '1px solid var(--color-border)',
            }}>
              {/* Column Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '1rem', paddingBottom: '0.75rem',
                borderBottom: `2px solid ${column.color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: column.color,
                  }} />
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {column.label}
                  </span>
                </div>
                <span style={{
                  background: 'var(--color-bg-secondary)',
                  padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)',
                  fontSize: '0.6875rem', fontWeight: 600, color: column.color,
                }}>
                  {columnTasks.length}
                </span>
              </div>

              {/* Task Cards */}
              {columnTasks.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '2rem 1rem',
                  color: 'var(--color-text-muted)', fontSize: '0.8125rem',
                }}>
                  No tasks
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {columnTasks.map(task => (
                    <KanbanCard key={task.id} task={task} columnKey={column.key} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function KanbanCard({ task, columnKey }) {
    const pColors = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
    const nextStatus = {
      pending: 'in_progress',
      in_progress: 'completed',
    };

    return (
      <div style={{
        background: 'var(--color-bg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: '0.875rem',
        borderLeft: `3px solid ${pColors.border}`,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        cursor: 'default',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        {/* Title & Priority */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flex: 1 }}>
            {priorityIcon[task.priority]}
            <span style={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.3 }}>{task.title}</span>
          </div>
          <span className={`badge badge-${({ urgent: 'danger', high: 'warning', medium: 'info', low: 'neutral' })[task.priority] || 'neutral'}`}
            style={{ fontSize: '0.5625rem', flexShrink: 0 }}
          >
            {task.priority}
          </span>
        </div>

        {/* Description preview */}
        {task.description && (
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.625rem', lineHeight: 1.4 }}>
            {task.description.length > 80 ? task.description.substring(0, 80) + '...' : task.description}
          </p>
        )}

        {/* Footer: Due date + Move button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            {task.dueDate && (
              <>
                <Clock size={11} color="var(--color-text-muted)" />
                <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>{task.dueDate}</span>
              </>
            )}
          </div>

          {/* Move to next status */}
          {nextStatus[columnKey] && (
            <button
              onClick={() => handleStatusChange(task.id, nextStatus[columnKey])}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.5rem',
                fontSize: '0.625rem', fontWeight: 600, color: 'var(--color-text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            >
              Move <ChevronRight size={10} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // Page Header + Content
  // ═══════════════════════════════════════════════════════
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;

  return (
    <div className="animate-fade-in">
      <div style={{
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between', marginBottom: '1.5rem',
        flexDirection: isMobile ? 'column' : 'row', gap: '0.75rem',
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckSquare size={isMobile ? 22 : 24} /> Tasks
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            {tasks.length} total · {pendingCount} pending · {inProgressCount} in progress
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* View Toggle */}
          <div style={{
            display: 'flex', background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-md)', padding: '0.2rem',
            border: '1px solid var(--color-border)',
          }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.375rem 0.625rem', borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none',
                background: viewMode === 'list' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'list' ? '#fff' : 'var(--color-text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              <LayoutList size={14} /> List
            </button>
            <button
              onClick={() => setViewMode('board')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.375rem 0.625rem', borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none',
                background: viewMode === 'board' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'board' ? '#fff' : 'var(--color-text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              <LayoutGrid size={14} /> Board
            </button>
          </div>

          {/* Create Task — Admin only */}
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Create Task
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="glass-card" style={{ padding: isMobile ? '0.75rem' : '1.25rem' }}>
          <DataTable
            columns={columns}
            data={tasks}
            searchPlaceholder="Search tasks..."
            exportable
            exportFormats={['csv', 'xlsx']}
            exportFilename={isAdmin ? 'tasks' : 'staff-tasks'}
          />
        </div>
      ) : (
        <KanbanBoard />
      )}

      {isStaff && (
        <div className="glass-card" style={{ padding: isMobile ? '0.75rem' : '1.25rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>
            Recent Work Activity
          </h3>
          <DataTable
            columns={[
              { header: 'Activity', accessor: 'title' },
              { header: 'Details', accessor: 'description' },
              { header: 'Type', accessor: 'category' },
              {
                header: 'When',
                accessor: 'timestamp',
                exportValue: (row) => formatDate(row.timestamp),
                render: (row) => <span style={{ fontSize: '0.8125rem' }}>{timeAgo(row.timestamp)}</span>,
              },
            ]}
            data={recentWorkActivity}
            searchPlaceholder="Search work history..."
            emptyMessage="No work activity available yet."
            exportable
            exportFormats={['csv', 'xlsx']}
            exportFilename="staff-work-history"
          />
        </div>
      )}

      {/* Create Task Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Task">
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Title</label>
            <input className="input" required value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Task title" />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Description</label>
            <textarea className="input" rows={3} value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder="Describe the task..." style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Assign To</label>
              <select 
                className="input" 
                required 
                value={newTask.assignedTo} 
                onChange={e => setNewTask(p => ({ ...p, assignedTo: e.target.value }))}
                style={{ background: 'var(--color-bg-primary)' }}
              >
                <option value="">-- Select User --</option>
                {assignableUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.name || u.email} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Priority</label>
              <select className="input" value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}>
                {['low', 'medium', 'high', 'urgent'].map(p => (
                  <option key={p} value={p} style={{ background: 'var(--color-bg-primary)' }}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Due Date</label>
            <input className="input" type="date" value={newTask.dueDate} onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating...' : 'Create Task'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
