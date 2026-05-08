import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, getDocs, orderBy, query, setDoc, doc, Timestamp as ClientTimestamp } from 'firebase/firestore';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { TEST_USERS } from '../support/localTestUsers.js';
import {
  createLeadDocument,
  deleteUserArtifacts,
  findUserDocByEmail,
  getUserDoc,
} from '../support/emulatorAdmin.js';

const projectId = 'financeflow-mgmt-2026';
const authApiKey = 'fake-api-key';
const authBaseUrl = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1`;
const functionsBaseUrl = `http://127.0.0.1:5001/${projectId}/us-central1`;

let rulesEnv;
const cleanupQueue = [];

function uniqueCustomer(prefix) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    displayName: `${prefix} ${nonce}`,
    email: `${prefix}-${nonce}@example.com`.toLowerCase(),
    password: 'TracePass123@',
    phone: '+91 9988776655',
  };
}

async function emulatorSignIn({ email, password }) {
  const response = await fetch(
    `${authBaseUrl}/accounts:signInWithPassword?key=${authApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Failed to sign in against emulator.');
  }

  return payload;
}

async function callCreateUserByAdmin(actor, requestData) {
  const { idToken } = await emulatorSignIn(actor);
  const response = await fetch(`${functionsBaseUrl}/createUserByAdmin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: requestData }),
  });

  const payload = await response.json();
  if (!response.ok || payload.error) {
    const errorMessage = payload.error?.message || payload.error?.status || 'createUserByAdmin failed';
    throw new Error(errorMessage);
  }

  return payload.result;
}

async function expectCreatorMetadata({ actorRole, actorEmail, customer }) {
  const result = await callCreateUserByAdmin(TEST_USERS[actorRole], {
    email: customer.email,
    displayName: customer.displayName,
    role: 'customer',
    password: customer.password,
    phone: customer.phone,
  });

  cleanupQueue.push({ uid: result.uid, email: customer.email });
  const persisted = await getUserDoc(result.uid);
  const actorDoc = await findUserDocByEmail(actorEmail);

  expect(persisted.uid).toBe(result.uid);
  expect(persisted.createdBy).toBe(actorDoc.id);
  expect(persisted.creator.id).toBe(actorDoc.id);
  expect(persisted.creator.role).toBe(actorRole);
  expect(persisted.creator.name).toBe(actorDoc.displayName);
  expect(persisted.creator.timestamp).toBeTruthy();
  expect(persisted.createdAt).toBeTruthy();
}

beforeAll(async () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  rulesEnv = await initializeTestEnvironment({
    projectId: 'demo-financeflow-traceability',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8081,
    },
  });
});

afterAll(async () => {
  while (cleanupQueue.length > 0) {
    await deleteUserArtifacts(cleanupQueue.pop());
  }
  await rulesEnv.cleanup();
});

describe('customer activity validation', () => {
  it('stores creator metadata for admin, staff, and agent customer creation', async () => {
    await expectCreatorMetadata({
      actorRole: 'admin',
      actorEmail: TEST_USERS.admin.email,
      customer: uniqueCustomer('admin-meta'),
    });
    await expectCreatorMetadata({
      actorRole: 'staff',
      actorEmail: TEST_USERS.staff.email,
      customer: uniqueCustomer('staff-meta'),
    });
    await expectCreatorMetadata({
      actorRole: 'agent',
      actorEmail: TEST_USERS.agent.email,
      customer: uniqueCustomer('agent-meta'),
    });
  });

  it('preserves the original creator snapshot when promoting a lead without nested creator data', async () => {
    const agentDoc = await findUserDocByEmail(TEST_USERS.agent.email);
    const lead = uniqueCustomer('legacy-lead');
    const leadDocId = `legacy-lead-${Date.now()}`;

    await createLeadDocument({
      id: leadDocId,
      displayName: lead.displayName,
      email: lead.email,
      creatorUid: agentDoc.id,
      creatorRole: null,
      onboardedByAgent: agentDoc.id,
      createdAt: AdminTimestamp.now(),
    });
    cleanupQueue.push({ leadDocId });

    const result = await callCreateUserByAdmin(TEST_USERS.agent, {
      email: lead.email,
      displayName: lead.displayName,
      role: 'customer',
      password: lead.password,
      existingDocId: leadDocId,
      phone: lead.phone,
    });

    cleanupQueue.push({ uid: result.uid, email: lead.email, leadDocId });
    const persisted = await getUserDoc(result.uid);

    expect(persisted.creator.id).toBe(agentDoc.id);
    expect(persisted.creator.role).toBe('agent');
    expect(persisted.createdBy).toBe(agentDoc.id);
  });

  it('blocks staff and agents from reading the full users collection through Firestore rules', async () => {
    await rulesEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const now = ClientTimestamp.now();
      await setDoc(doc(db, 'users', 'admin-seed'), {
        displayName: 'Admin Seed',
        email: TEST_USERS.admin.email,
        role: 'admin',
        status: 'active',
        createdAt: now,
      });
      await setDoc(doc(db, 'users', 'staff-seed'), {
        displayName: 'Staff Seed',
        email: TEST_USERS.staff.email,
        role: 'staff',
        status: 'active',
        createdAt: now,
      });
      await setDoc(doc(db, 'users', 'agent-seed'), {
        displayName: 'Agent Seed',
        email: TEST_USERS.agent.email,
        role: 'agent',
        status: 'active',
        createdAt: now,
      });
      await setDoc(doc(db, 'users', 'customer-seed'), {
        displayName: 'Customer Seed',
        email: 'customer-seed@example.com',
        role: 'customer',
        status: 'active',
        createdAt: now,
        assignedStaffId: 'staff-seed',
        onboardedByAgent: 'agent-seed',
      });
    });

    const staffDb = rulesEnv.authenticatedContext('staff-seed', { role: 'staff' }).firestore();
    const agentDb = rulesEnv.authenticatedContext('agent-seed', { role: 'agent' }).firestore();

    await assertFails(getDocs(query(collection(staffDb, 'users'), orderBy('createdAt', 'desc'))));
    await assertFails(getDocs(query(collection(agentDb, 'users'), orderBy('createdAt', 'desc'))));
  });

  it('creates distinct creator mappings during simultaneous cross-role customer creation', async () => {
    const scenarios = [
      ['admin', uniqueCustomer('sim-admin')],
      ['staff', uniqueCustomer('sim-staff')],
      ['agent', uniqueCustomer('sim-agent')],
    ];

    const results = await Promise.all(
      scenarios.map(async ([role, customer]) => {
        const result = await callCreateUserByAdmin(TEST_USERS[role], {
          email: customer.email,
          displayName: customer.displayName,
          role: 'customer',
          password: customer.password,
          phone: customer.phone,
        });
        cleanupQueue.push({ uid: result.uid, email: customer.email });
        return { role, customer, uid: result.uid };
      })
    );

    for (const { role, customer, uid } of results) {
      const persisted = await getUserDoc(uid);
      expect(persisted.creator.role).toBe(role);
      expect(persisted.email).toBe(customer.email);
      expect(persisted.creator.id).toBeTruthy();
    }
  });
});
