import { getActivityLogsByUser } from './activityLogService';
import { getTasksByAssignee } from './taskService';
import { getTransactionsForStaffHistory } from './transactionService';
import { getManagedCustomersByStaff, getUserById } from './userService';

function toMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate().getTime();
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatScopeBreakdown(customers) {
  return customers.reduce((acc, customer) => {
    const key = customer.managementScope || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function selectStaffHistoryTimeline({
  staffProfile = null,
  customers = [],
  tasks = [],
  transactions = [],
  activityLogs = [],
} = {}) {
  const customerEvents = customers
    .filter((customer) => customer.createdBy === staffProfile?.uid || customer.creator?.id === staffProfile?.uid)
    .map((customer) => ({
      id: `customer-${customer.id}`,
      timestamp: customer.creator?.timestamp || customer.createdAt,
      timestampMs: toMillis(customer.creator?.timestamp || customer.createdAt),
      category: 'customer',
      title: 'Customer created',
      description: `${customer.displayName || 'Unnamed customer'} (${customer.email || 'No email'})`,
      resourceId: customer.id,
      resourceType: 'user',
    }));

  const taskEvents = tasks.flatMap((task) => {
    const baseEvents = [{
      id: `task-created-${task.id}`,
      timestamp: task.createdAt,
      timestampMs: toMillis(task.createdAt),
      category: 'task',
      title: 'Task assigned',
      description: task.title,
      resourceId: task.id,
      resourceType: 'task',
    }];

    if (task.completedAt) {
      baseEvents.push({
        id: `task-completed-${task.id}`,
        timestamp: task.completedAt,
        timestampMs: toMillis(task.completedAt),
        category: 'task',
        title: 'Task completed',
        description: task.title,
        resourceId: task.id,
        resourceType: 'task',
      });
    }

    return baseEvents;
  });

  const transactionEvents = transactions.map((transaction) => ({
    id: `transaction-${transaction.id}`,
    timestamp: transaction.createdAt,
    timestampMs: toMillis(transaction.createdAt),
    category: 'transaction',
    title: 'Transaction handled',
    description: `${transaction.type || 'transaction'} • ${transaction.status || 'unknown'}`,
    resourceId: transaction.id,
    resourceType: 'transaction',
  }));

  const logEvents = activityLogs.map((log) => ({
    id: `log-${log.id}`,
    timestamp: log.timestamp,
    timestampMs: toMillis(log.timestamp),
    category: log.targetType || log.resourceType || 'activity',
    title: log.action,
    description: log.details || log.metadata?.details || '',
    resourceId: log.targetId || log.resourceId || log.metadata?.targetUid || log.id,
    resourceType: log.targetType || log.resourceType || '',
  }));

  return [...customerEvents, ...taskEvents, ...transactionEvents, ...logEvents]
    .filter((event) => event.timestampMs > 0)
    .sort((a, b) => b.timestampMs - a.timestampMs);
}

export async function getStaffHistoryBundle(staffId) {
  const [staffProfile, customers, tasks, transactions, activityLogs] = await Promise.all([
    getUserById(staffId),
    getManagedCustomersByStaff(staffId),
    getTasksByAssignee(staffId),
    getTransactionsForStaffHistory(staffId),
    getActivityLogsByUser(staffId, 200),
  ]);

  const createdCustomers = customers.filter(
    (customer) => customer.createdBy === staffId || customer.creator?.id === staffId
  );

  const assignedCustomers = customers.filter((customer) => customer.assignedStaffId === staffId);
  const completedTasks = tasks.filter((task) => task.status === 'completed');

  return {
    staffProfile,
    customers,
    createdCustomers,
    assignedCustomers,
    tasks,
    completedTasks,
    transactions,
    activityLogs,
    timeline: selectStaffHistoryTimeline({
      staffProfile,
      customers,
      tasks,
      transactions,
      activityLogs,
    }),
    summary: {
      managedCustomers: customers.length,
      createdCustomers: createdCustomers.length,
      assignedCustomers: assignedCustomers.length,
      tasksAssigned: tasks.length,
      tasksCompleted: completedTasks.length,
      transactionsHandled: transactions.length,
      activityEvents: activityLogs.length,
      scopeBreakdown: formatScopeBreakdown(customers),
    },
  };
}
