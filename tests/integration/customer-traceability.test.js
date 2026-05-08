import { describe, expect, it } from 'vitest';
import { selectAdminCustomerTraceability } from '../../src/services/userService';

function timestampFromIso(iso) {
  const date = new Date(iso);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

describe('selectAdminCustomerTraceability', () => {
  it('uses the nested creator snapshot when present', () => {
    const rows = selectAdminCustomerTraceability([
      {
        id: 'admin-1',
        uid: 'admin-1',
        role: 'admin',
        displayName: 'Admin User',
      },
      {
        id: 'customer-1',
        uid: 'customer-1',
        role: 'customer',
        displayName: 'Customer One',
        email: 'customer1@test.com',
        createdAt: timestampFromIso('2026-05-07T10:00:00.000Z'),
        createdBy: 'admin-1',
        creator: {
          id: 'admin-1',
          name: 'Admin User',
          role: 'admin',
          timestamp: timestampFromIso('2026-05-07T10:00:00.000Z'),
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].creatorName).toBe('Admin User');
    expect(rows[0].creatorRole).toBe('admin');
    expect(rows[0].creatorId).toBe('admin-1');
  });

  it('falls back to createdBy and linked ownership for legacy records', () => {
    const rows = selectAdminCustomerTraceability([
      {
        id: 'agent-1',
        uid: 'agent-1',
        role: 'agent',
        displayName: 'Agent Smith',
      },
      {
        id: 'staff-1',
        uid: 'staff-1',
        role: 'staff',
        displayName: 'Staff Jane',
      },
      {
        id: 'customer-legacy',
        uid: 'customer-legacy',
        role: 'customer',
        displayName: 'Legacy Lead',
        email: 'legacy@test.com',
        createdAt: timestampFromIso('2026-05-06T08:30:00.000Z'),
        createdBy: 'agent-1',
        onboardedByAgent: 'agent-1',
        assignedStaffId: 'staff-1',
      },
    ]);

    expect(rows[0].creatorName).toBe('Agent Smith');
    expect(rows[0].creatorRole).toBe('agent');
    expect(rows[0].linkedAgentName).toBe('Agent Smith');
    expect(rows[0].linkedStaffName).toBe('Staff Jane');
  });

  it('sorts newest customers first by created timestamp', () => {
    const rows = selectAdminCustomerTraceability([
      {
        id: 'customer-older',
        uid: 'customer-older',
        role: 'customer',
        displayName: 'Older Customer',
        createdAt: timestampFromIso('2026-05-01T08:00:00.000Z'),
      },
      {
        id: 'customer-newer',
        uid: 'customer-newer',
        role: 'customer',
        displayName: 'Newer Customer',
        createdAt: timestampFromIso('2026-05-08T08:00:00.000Z'),
      },
    ]);

    expect(rows.map((row) => row.customerId)).toEqual(['customer-newer', 'customer-older']);
  });
});
