import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getManagedCustomersByStaff } from './userService';

/**
 * Report Service — Client-side aggregation for admin analytics.
 * 
 * Strategy: Fetch all relevant docs, aggregate in JS.
 * Suitable for current dataset size. Migrate to Cloud Functions
 * or BigQuery if data exceeds 10K documents.
 */

/**
 * Generate comprehensive admin report metrics.
 * Returns Risk, Revenue, and Performance metrics.
 */
export async function generateReport() {
  // Fetch all data in parallel
  const [usersSnap, txSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'))),
  ]);

  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── User Metrics ──
  const customers = users.filter(u => u.role === 'customer');
  const agents = users.filter(u => u.role === 'agent');
  const leads = users.filter(u => u.customerStatus === 'lead');
  const promotedLeads = customers.filter(u => u.hasAuthAccount && u.promotedAt);
  const verifiedKyc = customers.filter(u => u.kycStatus === 'verified');
  const suspendedUsers = users.filter(u => u.status === 'suspended');

  // Stale leads (older than 90 days)
  const staleLeads = leads.filter(u => {
    const created = u.createdAt?.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
    const age = (now - created) / (1000 * 60 * 60 * 24);
    return age > 90;
  });

  // New customers (last 30 days)
  const newCustomers30d = customers.filter(u => {
    const created = u.createdAt?.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
    return created >= thirtyDaysAgo;
  });

  // ── Transaction Metrics ──
  const completedTx = transactions.filter(t => t.status === 'completed');
  const failedTx = transactions.filter(t => t.status === 'failed');
  const pendingTx = transactions.filter(t => t.status === 'pending');

  // Amount calculations (integers in paise → convert to rupees for display)
  const totalRevenue = completedTx.reduce((sum, t) => sum + (t.amount || 0), 0);
  const pendingRevenue = pendingTx.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Monthly revenue
  const thisMonthTx = completedTx.filter(t => {
    const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const revenueThisMonth = thisMonthTx.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Average transaction value
  const avgTxValue = completedTx.length > 0 ? totalRevenue / completedTx.length : 0;

  // Failed TX rate
  const totalTxCount = transactions.length;
  const failedTxRate = totalTxCount > 0 ? (failedTx.length / totalTxCount) * 100 : 0;

  // ── Agent Performance ──
  const agentStats = {};
  agents.forEach(a => {
    agentStats[a.id] = { name: a.displayName, txCount: 0, volume: 0 };
  });
  transactions.forEach(t => {
    if (t.agentId && agentStats[t.agentId]) {
      agentStats[t.agentId].txCount++;
      if (t.status === 'completed') {
        agentStats[t.agentId].volume += (t.amount || 0);
      }
    }
  });
  const agentLeaderboard = Object.values(agentStats)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  // ── Transaction distribution by type ──
  const txByType = {};
  transactions.forEach(t => {
    const type = t.type || 'other';
    txByType[type] = (txByType[type] || 0) + 1;
  });

  // ── Transaction distribution by status ──
  const txByStatus = {
    completed: completedTx.length,
    pending: pendingTx.length,
    failed: failedTx.length,
    cancelled: transactions.filter(t => t.status === 'cancelled').length,
  };

  return {
    // Risk Metrics
    risk: {
      failedTxRate: Math.round(failedTxRate * 10) / 10,
      failedTxCount: failedTx.length,
      kycComplianceRate: customers.length > 0
        ? Math.round((verifiedKyc.length / customers.length) * 100 * 10) / 10
        : 0,
      staleLeadCount: staleLeads.length,
      suspendedCount: suspendedUsers.length,
    },

    // Revenue Metrics
    revenue: {
      totalRevenue,
      revenueThisMonth,
      pendingRevenue,
      avgTxValue: Math.round(avgTxValue),
      totalTransactions: totalTxCount,
      completedTransactions: completedTx.length,
    },

    // Performance Metrics
    performance: {
      agentLeaderboard,
      leadConversionRate: leads.length + promotedLeads.length > 0
        ? Math.round((promotedLeads.length / (leads.length + promotedLeads.length)) * 100 * 10) / 10
        : 0,
      newCustomers30d: newCustomers30d.length,
      totalCustomers: customers.length,
      totalLeads: leads.length,
      totalAgents: agents.length,
    },

    // Chart Data
    charts: {
      txByType,
      txByStatus,
    },

  // Totals
    totals: {
      users: users.length,
      customers: customers.length,
      agents: agents.length,
      leads: leads.length,
    },
  };
}

/**
 * Generate staff-scoped report metrics (Phase 6.2).
 * 
 * Uses the SAME scoped queries that Firestore rules enforce:
 *   - Customers: assignedStaffId == staffId
 *   - Transactions: staffId == uid OR assignedStaffId == uid
 *   - Tasks: assignedTo == uid
 * 
 * A staff member CANNOT compute global metrics — they don't have read access.
 */
export async function getStaffMetrics(staffId) {
  const txCol = collection(db, 'transactions');
  const tasksCol = collection(db, 'tasks');

  // Parallel scoped queries
  const [customers, txProcessedSnap, txAssignedSnap, tasksSnap] = await Promise.all([
    getManagedCustomersByStaff(staffId),
    getDocs(query(txCol, where('staffId', '==', staffId), orderBy('createdAt', 'desc'))),
    getDocs(query(txCol, where('assignedStaffId', '==', staffId), orderBy('createdAt', 'desc'))),
    getDocs(query(tasksCol, where('assignedTo', '==', staffId), orderBy('createdAt', 'desc'))),
  ]);

  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Merge & deduplicate transactions (same pattern as transactionService)
  const seen = new Set();
  const transactions = [];
  for (const d of txProcessedSnap.docs) {
    if (!seen.has(d.id)) { seen.add(d.id); transactions.push({ id: d.id, ...d.data() }); }
  }
  for (const d of txAssignedSnap.docs) {
    if (!seen.has(d.id)) { seen.add(d.id); transactions.push({ id: d.id, ...d.data() }); }
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── Transaction Metrics ──
  const completedTx = transactions.filter(t => t.status === 'completed');
  const failedTx = transactions.filter(t => t.status === 'failed');
  const pendingTx = transactions.filter(t => t.status === 'pending');
  const totalRevenue = completedTx.reduce((sum, t) => sum + (t.amount || 0), 0);
  const pendingRevenue = pendingTx.reduce((sum, t) => sum + (t.amount || 0), 0);

  const thisMonthTx = completedTx.filter(t => {
    const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const revenueThisMonth = thisMonthTx.reduce((sum, t) => sum + (t.amount || 0), 0);
  const avgTxValue = completedTx.length > 0 ? Math.round(totalRevenue / completedTx.length) : 0;
  const failedTxRate = transactions.length > 0 ? Math.round((failedTx.length / transactions.length) * 1000) / 10 : 0;
  const successRate = transactions.length > 0 ? Math.round((completedTx.length / transactions.length) * 1000) / 10 : 0;

  // ── Task Metrics ──
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate || t.status === 'completed' || t.status === 'cancelled') return false;
    return new Date(t.dueDate) < now;
  });
  const taskCompletionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  // ── Customer Metrics ──
  const verifiedKyc = customers.filter(c => c.kycStatus === 'verified');
  const kycRate = customers.length > 0 ? Math.round((verifiedKyc.length / customers.length) * 100) : 0;
  const newCustomers30d = customers.filter(c => {
    const created = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
    return created >= thirtyDaysAgo;
  });

  // ── TX by status ──
  const txByStatus = {
    completed: completedTx.length,
    pending: pendingTx.length,
    failed: failedTx.length,
    cancelled: transactions.filter(t => t.status === 'cancelled').length,
  };

  return {
    customers: {
      assigned: customers.length,
      kycCompliance: kycRate,
      verifiedCount: verifiedKyc.length,
      newLast30d: newCustomers30d.length,
    },
    transactions: {
      total: transactions.length,
      completed: completedTx.length,
      pending: pendingTx.length,
      failed: failedTx.length,
      totalRevenue,
      revenueThisMonth,
      pendingRevenue,
      avgTxValue,
      failedTxRate,
      successRate,
    },
    tasks: {
      total: tasks.length,
      completed: completedTasks.length,
      pending: pendingTasks.length,
      overdue: overdueTasks.length,
      completionRate: taskCompletionRate,
    },
    charts: {
      txByStatus,
    },
  };
}
