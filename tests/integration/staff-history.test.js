import { describe, expect, it } from 'vitest';
import { selectStaffManagedCustomers } from '../../src/services/userService';
import { selectStaffHistoryTimeline } from '../../src/services/staffHistoryService';

describe('staff operations selectors', () => {
  it('deduplicates assigned and created customers while preserving management scope', () => {
    const customers = [
      {
        id: 'customer-1',
        displayName: 'Created Customer',
        role: 'customer',
        createdBy: 'staff-1',
        assignedStaffId: 'other-staff',
        createdAt: '2026-05-08T10:00:00.000Z',
      },
      {
        id: 'customer-2',
        displayName: 'Assigned Customer',
        role: 'customer',
        assignedStaffId: 'staff-1',
        createdAt: '2026-05-09T10:00:00.000Z',
      },
      {
        id: 'customer-2',
        displayName: 'Assigned Customer',
        role: 'customer',
        assignedStaffId: 'staff-1',
        createdAt: '2026-05-09T10:00:00.000Z',
      },
    ];

    const rows = selectStaffManagedCustomers(customers, 'staff-1');

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('customer-2');
    expect(rows[0].managementScope).toBe('assigned');
    expect(rows[1].managementScope).toBe('created');
  });

  it('builds a unified timeline from customers, tasks, transactions, and activity logs', () => {
    const timeline = selectStaffHistoryTimeline({
      staffProfile: { uid: 'staff-1' },
      customers: [{
        id: 'customer-1',
        displayName: 'History Customer',
        email: 'customer@test.com',
        createdBy: 'staff-1',
        createdAt: '2026-05-08T09:00:00.000Z',
      }],
      tasks: [{
        id: 'task-1',
        title: 'Verify KYC',
        createdAt: '2026-05-08T12:00:00.000Z',
        completedAt: '2026-05-08T13:00:00.000Z',
        status: 'completed',
      }],
      transactions: [{
        id: 'tx-1',
        type: 'deposit',
        status: 'completed',
        createdAt: '2026-05-08T14:00:00.000Z',
      }],
      activityLogs: [{
        id: 'log-1',
        action: 'profile.update',
        details: 'Updated profile',
        timestamp: '2026-05-08T15:00:00.000Z',
        targetType: 'user',
      }],
    });

    expect(timeline[0].title).toBe('profile.update');
    expect(timeline.some((entry) => entry.title === 'Customer created')).toBe(true);
    expect(timeline.some((entry) => entry.title === 'Task completed')).toBe(true);
    expect(timeline.some((entry) => entry.title === 'Transaction handled')).toBe(true);
  });
});
