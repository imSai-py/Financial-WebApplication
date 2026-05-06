/**
 * Phase 14 — Criterion 3: Firestore Security Rules Audit
 *
 * Tests 43 rule paths across 7 collections × 4 roles.
 * Uses @firebase/rules-unit-testing to simulate authenticated contexts
 * against the actual firestore.rules file WITHOUT touching production.
 *
 * Run: npx vitest run tests/integration/firestore-rules.test.js
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { setDoc, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

let testEnv;

// ── Simulated User IDs ──
const ADMIN_UID = 'admin-uid-001';
const STAFF_UID = 'staff-uid-001';
const CUSTOMER_UID = 'customer-uid-001';
const CUSTOMER2_UID = 'customer-uid-002';
const AGENT_UID = 'agent-uid-001';

// ── Auth contexts ──
function getDb(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

// ── Setup ──
beforeAll(async () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-financeflow',
    firestore: { 
      rules,
      host: '127.0.0.1',
      port: 8081
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Seed baseline data needed for READ/UPDATE/DELETE tests
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Users
    await setDoc(doc(db, 'users', ADMIN_UID), {
      displayName: 'Admin User', email: 'admin@test.com',
      role: 'admin', status: 'active',
    });
    await setDoc(doc(db, 'users', STAFF_UID), {
      displayName: 'Staff User', email: 'staff@test.com',
      role: 'staff', status: 'active',
    });
    await setDoc(doc(db, 'users', CUSTOMER_UID), {
      displayName: 'Customer User', email: 'customer@test.com',
      role: 'customer', status: 'active',
      assignedStaffId: STAFF_UID,
      onboardedByAgent: AGENT_UID,
    });
    await setDoc(doc(db, 'users', CUSTOMER2_UID), {
      displayName: 'Customer 2', email: 'customer2@test.com',
      role: 'customer', status: 'active',
      assignedStaffId: 'other-staff',
      onboardedByAgent: 'other-agent',
    });
    await setDoc(doc(db, 'users', AGENT_UID), {
      displayName: 'Agent User', email: 'agent@test.com',
      role: 'agent', status: 'active',
    });

    // Transactions
    await setDoc(doc(db, 'transactions', 'tx-001'), {
      amount: 1500000, type: 'deposit', status: 'pending',
      customerId: CUSTOMER_UID, staffId: STAFF_UID,
      assignedStaffId: STAFF_UID, agentId: AGENT_UID,
      effectiveDate: Timestamp.now(),
    });
    await setDoc(doc(db, 'transactions', 'tx-002'), {
      amount: 500000, type: 'payment', status: 'completed',
      customerId: CUSTOMER2_UID, staffId: 'other-staff',
      assignedStaffId: 'other-staff',
    });

    // Tasks
    await setDoc(doc(db, 'tasks', 'task-001'), {
      title: 'Review KYC', status: 'pending', priority: 'high',
      assignedTo: STAFF_UID, createdBy: ADMIN_UID,
    });
    await setDoc(doc(db, 'tasks', 'task-002'), {
      title: 'Agent Task', status: 'pending', priority: 'medium',
      assignedTo: AGENT_UID, createdBy: ADMIN_UID,
    });

    // Commissions
    await setDoc(doc(db, 'commissions', 'comm-001'), {
      amount: 50000, rate: 5, status: 'pending',
      agentId: AGENT_UID,
    });

    // Loans
    await setDoc(doc(db, 'loans', 'loan-001'), {
      customerId: CUSTOMER_UID, principalAmount: 10000000,
      interestRate: 12.5, status: 'active',
      assignedStaffId: STAFF_UID,
    });

    // Activity Logs
    await setDoc(doc(db, 'activityLogs', 'log-001'), {
      action: 'login', userId: ADMIN_UID, timestamp: Timestamp.now(),
    });

    // App Settings
    await setDoc(doc(db, 'appSettings', 'global'), {
      appName: 'FinanceFlow', defaultCurrency: 'INR',
    });
  });
});

// ═══════════════════════════════════════════════════════
// USERS COLLECTION
// ═══════════════════════════════════════════════════════
describe('Users Collection — Security Rules', () => {

  // --- READ ---
  it('SEC-U01: Admin can read any user', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER_UID)));
  });

  it('SEC-U02: Customer can read own profile', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER_UID)));
  });

  it('SEC-U03: Customer CANNOT read admin profile', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(getDoc(doc(db, 'users', ADMIN_UID)));
  });

  it('SEC-U04: Staff can read assigned customer', async () => {
    const db = getDb(STAFF_UID, { role: 'staff' });
    await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER_UID)));
  });

  it('SEC-U05: Staff CANNOT read unassigned customer', async () => {
    const db = getDb(STAFF_UID, { role: 'staff' });
    await assertFails(getDoc(doc(db, 'users', CUSTOMER2_UID)));
  });

  it('SEC-U06: Agent can read customer they onboarded', async () => {
    const db = getDb(AGENT_UID, { role: 'agent' });
    await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER_UID)));
  });

  it('SEC-U07: Agent CANNOT read non-onboarded customer', async () => {
    const db = getDb(AGENT_UID, { role: 'agent' });
    await assertFails(getDoc(doc(db, 'users', CUSTOMER2_UID)));
  });

  it('SEC-U08: Unauthenticated user CANNOT read any profile', async () => {
    const db = unauthDb();
    await assertFails(getDoc(doc(db, 'users', ADMIN_UID)));
  });

  // --- CREATE ---
  it('SEC-U09: Admin can create user with any role', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(setDoc(doc(db, 'users', 'new-staff-001'), {
      displayName: 'New Staff', email: 'newstaff@test.com',
      role: 'staff', status: 'active',
    }));
  });

  it('SEC-U10: Self-registration is blocked', async () => {
    const db = getDb('self-reg-uid', {});
    await assertFails(setDoc(doc(db, 'users', 'self-reg-uid'), {
      displayName: 'New User', email: 'newuser@test.com',
      role: 'customer', status: 'active',
    }));
  });

  it('SEC-U11: Self-registration CANNOT set admin role', async () => {
    const db = getDb('self-reg-uid2', {});
    await assertFails(setDoc(doc(db, 'users', 'self-reg-uid2'), {
      displayName: 'Hacker', email: 'hack@test.com',
      role: 'admin', status: 'active',
    }));
  });

  it('SEC-U12: Agent CANNOT create customer directly in Firestore', async () => {
    const db = getDb(AGENT_UID, { role: 'agent' });
    await assertFails(setDoc(doc(db, 'users', 'new-customer-001'), {
      displayName: 'Onboarded Customer', email: 'onboarded@test.com',
      role: 'customer', status: 'active',
      onboardedByAgent: AGENT_UID,
    }));
  });

  it('SEC-U13: Agent CANNOT create staff or admin', async () => {
    const db = getDb(AGENT_UID, { role: 'agent' });
    await assertFails(setDoc(doc(db, 'users', 'fake-admin'), {
      displayName: 'Fake Admin', email: 'fake@test.com',
      role: 'admin', status: 'active',
      onboardedByAgent: AGENT_UID,
    }));
  });

  it('SEC-U13B: Staff CANNOT create customer directly in Firestore', async () => {
    const db = getDb(STAFF_UID, { role: 'staff' });
    await assertFails(setDoc(doc(db, 'users', 'staff-created-customer'), {
      displayName: 'Staff Created Customer',
      email: 'staffcustomer@test.com',
      role: 'customer',
      status: 'active',
      assignedStaffId: STAFF_UID,
    }));
  });

  it('SEC-U13C: Staff CANNOT create customer assigned to another staff member', async () => {
    const db = getDb(STAFF_UID, { role: 'staff' });
    await assertFails(setDoc(doc(db, 'users', 'bad-staff-customer'), {
      displayName: 'Bad Staff Customer',
      email: 'badstaffcustomer@test.com',
      role: 'customer',
      status: 'active',
      assignedStaffId: 'other-staff',
    }));
  });

  // --- UPDATE ---
  it('SEC-U14: Owner can update own displayName', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertSucceeds(updateDoc(doc(db, 'users', CUSTOMER_UID), {
      displayName: 'Updated Name',
      role: 'customer', status: 'active', email: 'customer@test.com',
      onboardedByAgent: AGENT_UID,
    }));
  });

  it('SEC-U15: Owner CANNOT change own role', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(updateDoc(doc(db, 'users', CUSTOMER_UID), {
      role: 'admin',
    }));
  });

  // --- DELETE ---
  it('SEC-U16: Admin can delete other user', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(deleteDoc(doc(db, 'users', CUSTOMER2_UID)));
  });

  it('SEC-U17: Admin CANNOT delete self', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(deleteDoc(doc(db, 'users', ADMIN_UID)));
  });

  it('SEC-U18: Customer CANNOT delete any user', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(deleteDoc(doc(db, 'users', CUSTOMER2_UID)));
  });
});

// ═══════════════════════════════════════════════════════
// TRANSACTIONS COLLECTION
// ═══════════════════════════════════════════════════════
describe('Transactions Collection — Security Rules', () => {

  it('SEC-T01: Admin can read all transactions', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(getDoc(doc(db, 'transactions', 'tx-001')));
    await assertSucceeds(getDoc(doc(db, 'transactions', 'tx-002')));
  });

  it('SEC-T02: Customer can read own transactions', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertSucceeds(getDoc(doc(db, 'transactions', 'tx-001')));
  });

  it('SEC-T03: Customer CANNOT read other customers transactions', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(getDoc(doc(db, 'transactions', 'tx-002')));
  });

  it('SEC-T04: Staff can read transactions they processed', async () => {
    const db = getDb(STAFF_UID, { role: 'staff' });
    await assertSucceeds(getDoc(doc(db, 'transactions', 'tx-001')));
  });

  it('SEC-T05: Staff CANNOT read unrelated transactions', async () => {
    const db = getDb(STAFF_UID, { role: 'staff' });
    await assertFails(getDoc(doc(db, 'transactions', 'tx-002')));
  });

  it('SEC-T06: Admin can create any transaction', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(setDoc(doc(db, 'transactions', 'tx-new-001'), {
      amount: 100000, type: 'withdrawal', status: 'pending',
      customerId: CUSTOMER_UID,
    }));
  });

  it('SEC-T07: Agent can create deposit', async () => {
    const db = getDb(AGENT_UID, { role: 'agent' });
    await assertSucceeds(setDoc(doc(db, 'transactions', 'tx-new-002'), {
      amount: 100000, type: 'deposit', status: 'pending',
      customerId: CUSTOMER_UID, agentId: AGENT_UID,
    }));
  });

  it('SEC-T08: Agent CANNOT create withdrawal', async () => {
    const db = getDb(AGENT_UID, { role: 'agent' });
    await assertFails(setDoc(doc(db, 'transactions', 'tx-new-003'), {
      amount: 100000, type: 'withdrawal', status: 'pending',
      customerId: CUSTOMER_UID, agentId: AGENT_UID,
    }));
  });

  it('SEC-T09: Customer can create payment ≤ ₹50,000', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertSucceeds(setDoc(doc(db, 'transactions', 'tx-new-004'), {
      amount: 4000000, type: 'payment', status: 'pending',
      customerId: CUSTOMER_UID,
    }));
  });

  it('SEC-T10: Customer CANNOT create payment > ₹50,000', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(setDoc(doc(db, 'transactions', 'tx-new-005'), {
      amount: 5100000, type: 'payment', status: 'pending',
      customerId: CUSTOMER_UID,
    }));
  });

  it('SEC-T11: Customer CANNOT create withdrawal', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(setDoc(doc(db, 'transactions', 'tx-new-006'), {
      amount: 100000, type: 'withdrawal', status: 'pending',
      customerId: CUSTOMER_UID,
    }));
  });

  // --- IMMUTABILITY ---
  it('SEC-T12: Amount is IMMUTABLE after creation', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(updateDoc(doc(db, 'transactions', 'tx-001'), {
      amount: 9999999, status: 'completed', type: 'deposit',
      customerId: CUSTOMER_UID, effectiveDate: Timestamp.now(),
    }));
  });

  it('SEC-T13: Admin can update status only', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(updateDoc(doc(db, 'transactions', 'tx-001'), {
      status: 'completed',
    }));
  });

  it('SEC-T14: Transaction DELETE is ALWAYS denied', async () => {
    const adminDb = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(deleteDoc(doc(adminDb, 'transactions', 'tx-001')));

    const staffDb = getDb(STAFF_UID, { role: 'staff' });
    await assertFails(deleteDoc(doc(staffDb, 'transactions', 'tx-001')));

    const customerDb = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(deleteDoc(doc(customerDb, 'transactions', 'tx-001')));
  });

  it('SEC-T15: Unauthenticated user CANNOT access transactions', async () => {
    const db = unauthDb();
    await assertFails(getDoc(doc(db, 'transactions', 'tx-001')));
  });
});

// ═══════════════════════════════════════════════════════
// TASKS COLLECTION
// ═══════════════════════════════════════════════════════
describe('Tasks Collection — Security Rules', () => {

  it('SEC-TK01: Admin can read all tasks', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(getDoc(doc(db, 'tasks', 'task-001')));
  });

  it('SEC-TK02: Staff can read tasks assigned to them', async () => {
    const db = getDb(STAFF_UID, { role: 'staff' });
    await assertSucceeds(getDoc(doc(db, 'tasks', 'task-001')));
  });

  it('SEC-TK03: Staff CANNOT read tasks assigned to others', async () => {
    const db = getDb(STAFF_UID, { role: 'staff' });
    await assertFails(getDoc(doc(db, 'tasks', 'task-002')));
  });

  it('SEC-TK04: Admin can create task', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(setDoc(doc(db, 'tasks', 'task-new'), {
      title: 'New task', status: 'pending', priority: 'medium',
      assignedTo: STAFF_UID, createdBy: ADMIN_UID,
    }));
  });

  it('SEC-TK05: Customer CANNOT create task', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(setDoc(doc(db, 'tasks', 'task-cust'), {
      title: 'Hacker task', status: 'pending', priority: 'low',
      assignedTo: CUSTOMER_UID, createdBy: CUSTOMER_UID,
    }));
  });

  it('SEC-TK06: Admin can delete task', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(deleteDoc(doc(db, 'tasks', 'task-001')));
  });
});

// ═══════════════════════════════════════════════════════
// COMMISSIONS COLLECTION
// ═══════════════════════════════════════════════════════
describe('Commissions Collection — Security Rules', () => {

  it('SEC-CM01: Admin can read all commissions', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(getDoc(doc(db, 'commissions', 'comm-001')));
  });

  it('SEC-CM02: Agent can read own commissions', async () => {
    const db = getDb(AGENT_UID, { role: 'agent' });
    await assertSucceeds(getDoc(doc(db, 'commissions', 'comm-001')));
  });

  it('SEC-CM03: Customer CANNOT read commissions', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(getDoc(doc(db, 'commissions', 'comm-001')));
  });

  it('SEC-CM04: Commission DELETE is ALWAYS denied', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(deleteDoc(doc(db, 'commissions', 'comm-001')));
  });

  it('SEC-CM05: Commission rate is IMMUTABLE', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(updateDoc(doc(db, 'commissions', 'comm-001'), {
      rate: 99, status: 'paid', amount: 50000, agentId: AGENT_UID,
    }));
  });
});

// ═══════════════════════════════════════════════════════
// LOANS COLLECTION
// ═══════════════════════════════════════════════════════
describe('Loans Collection — Security Rules', () => {

  it('SEC-L01: Customer can read own loans', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertSucceeds(getDoc(doc(db, 'loans', 'loan-001')));
  });

  it('SEC-L02: Customer CANNOT read other customer loans', async () => {
    const db = getDb(CUSTOMER2_UID, { role: 'customer' });
    await assertFails(getDoc(doc(db, 'loans', 'loan-001')));
  });

  it('SEC-L03: Loan DELETE is ALWAYS denied', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(deleteDoc(doc(db, 'loans', 'loan-001')));
  });

  it('SEC-L04: Loan principal is IMMUTABLE', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(updateDoc(doc(db, 'loans', 'loan-001'), {
      principalAmount: 99999999, interestRate: 12.5,
      customerId: CUSTOMER_UID, status: 'active',
    }));
  });
});

// ═══════════════════════════════════════════════════════
// ACTIVITY LOGS (Append-Only)
// ═══════════════════════════════════════════════════════
describe('Activity Logs — Security Rules', () => {

  it('SEC-AL01: Admin can read activity logs', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(getDoc(doc(db, 'activityLogs', 'log-001')));
  });

  it('SEC-AL02: Customer CANNOT read activity logs', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(getDoc(doc(db, 'activityLogs', 'log-001')));
  });

  it('SEC-AL03: Activity log UPDATE is ALWAYS denied', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(updateDoc(doc(db, 'activityLogs', 'log-001'), {
      action: 'tampered',
    }));
  });

  it('SEC-AL04: Activity log DELETE is ALWAYS denied', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(deleteDoc(doc(db, 'activityLogs', 'log-001')));
  });
});

// ═══════════════════════════════════════════════════════
// APP SETTINGS
// ═══════════════════════════════════════════════════════
describe('App Settings — Security Rules', () => {

  it('SEC-AS01: Any authenticated user can read settings', async () => {
    const db = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertSucceeds(getDoc(doc(db, 'appSettings', 'global')));
  });

  it('SEC-AS02: Only admin can update settings', async () => {
    const adminDb = getDb(ADMIN_UID, { role: 'admin' });
    await assertSucceeds(updateDoc(doc(adminDb, 'appSettings', 'global'), {
      appName: 'FinanceFlow Pro',
    }));

    const customerDb = getDb(CUSTOMER_UID, { role: 'customer' });
    await assertFails(updateDoc(doc(customerDb, 'appSettings', 'global'), {
      appName: 'Hacked',
    }));
  });

  it('SEC-AS03: Settings DELETE is ALWAYS denied', async () => {
    const db = getDb(ADMIN_UID, { role: 'admin' });
    await assertFails(deleteDoc(doc(db, 'appSettings', 'global')));
  });
});
