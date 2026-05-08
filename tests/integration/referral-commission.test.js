import { afterAll, describe, expect, it } from 'vitest';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { TEST_USERS } from '../support/localTestUsers.js';
import {
  createLeadDocument,
  deleteUserArtifacts,
  findUserDocByEmail,
  getAdminServices,
  getUserDoc,
} from '../support/emulatorAdmin.js';

const projectId = 'financeflow-mgmt-2026';
const authApiKey = 'fake-api-key';
const authBaseUrl = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1`;
const functionsBaseUrl = `http://127.0.0.1:5001/${projectId}/us-central1`;
const cleanupQueue = [];

function uniqueCustomer(prefix) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    displayName: `${prefix} ${nonce}`,
    email: `${prefix}-${nonce}@example.com`.toLowerCase(),
    password: 'ReferralPass123@',
    phone: '+91 9988776655',
  };
}

async function emulatorSignIn({ email, password }) {
  const response = await fetch(
    `${authBaseUrl}/accounts:signInWithPassword?key=${authApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
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

async function getReferralCommissionsForCustomer(customerId) {
  const { db } = getAdminServices();
  const snap = await db
    .collection('commissions')
    .where('type', '==', 'customer_referral_commission')
    .where('sourceCustomerId', '==', customerId)
    .get();

  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

afterAll(async () => {
  while (cleanupQueue.length > 0) {
    await deleteUserArtifacts(cleanupQueue.pop());
  }
});

describe('referral commission engine', () => {
  it('creates a direct level-1 commission for an agent referrer', async () => {
    const agentDoc = await findUserDocByEmail(TEST_USERS.agent.email);
    const customer = uniqueCustomer('direct-ref');

    const result = await callCreateUserByAdmin(TEST_USERS.admin, {
      email: customer.email,
      displayName: customer.displayName,
      role: 'customer',
      password: customer.password,
      phone: customer.phone,
      directReferrerId: agentDoc.id,
    });

    cleanupQueue.push({ uid: result.uid, email: customer.email });
    const persisted = await getUserDoc(result.uid);
    const commissions = await getReferralCommissionsForCustomer(result.uid);

    expect(persisted.referrerId).toBe(agentDoc.id);
    expect(persisted.referralDepth).toBe(1);
    expect(commissions).toHaveLength(1);
    expect(commissions[0].beneficiaryId).toBe(agentDoc.id);
    expect(commissions[0].level).toBe(1);
    expect(commissions[0].amount).toBe(500);
  });

  it('creates multi-level commissions up to the 5-level cap', async () => {
    const agentDoc = await findUserDocByEmail(TEST_USERS.agent.email);
    let parentReferrerId = agentDoc.id;
    let deepestCustomer = null;

    for (let level = 1; level <= 6; level += 1) {
      const customer = uniqueCustomer(`chain-level-${level}`);
      const result = await callCreateUserByAdmin(TEST_USERS.admin, {
        email: customer.email,
        displayName: customer.displayName,
        role: 'customer',
        password: customer.password,
        phone: customer.phone,
        directReferrerId: parentReferrerId,
      });

      cleanupQueue.push({ uid: result.uid, email: customer.email });
      parentReferrerId = result.uid;
      deepestCustomer = result.uid;
    }

    const persisted = await getUserDoc(deepestCustomer);
    const commissions = await getReferralCommissionsForCustomer(deepestCustomer);
    const levels = commissions.map((commission) => commission.level).sort((a, b) => a - b);

    expect(persisted.referralDepth).toBe(5);
    expect(persisted.referralPath).toHaveLength(5);
    expect(levels).toEqual([1, 2, 3, 4, 5]);
    expect(commissions.find((commission) => commission.level === 1)?.amount).toBe(500);
    expect(commissions.find((commission) => commission.level === 5)?.amount).toBe(50);
  });

  it('preserves referral data from a promoted lead and does not pay duplicates', async () => {
    const agentDoc = await findUserDocByEmail(TEST_USERS.agent.email);
    const customer = uniqueCustomer('lead-ref');
    const leadDocId = `ref-lead-${Date.now()}`;

    await createLeadDocument({
      id: leadDocId,
      displayName: customer.displayName,
      email: customer.email,
      creatorUid: agentDoc.id,
      creatorRole: 'agent',
      onboardedByAgent: agentDoc.id,
      createdAt: AdminTimestamp.now(),
    });

    const { db } = getAdminServices();
    await db.collection('users').doc(leadDocId).update({
      referrerId: agentDoc.id,
      referrerRole: 'agent',
      referralRootId: agentDoc.id,
      referralDepth: 1,
      referralPath: [{ id: agentDoc.id, name: agentDoc.displayName, role: 'agent' }],
    });

    cleanupQueue.push({ leadDocId });

    const result = await callCreateUserByAdmin(TEST_USERS.agent, {
      email: customer.email,
      displayName: customer.displayName,
      role: 'customer',
      password: customer.password,
      phone: customer.phone,
      existingDocId: leadDocId,
    });

    cleanupQueue.push({ uid: result.uid, email: customer.email, leadDocId });
    const commissions = await getReferralCommissionsForCustomer(result.uid);
    const eventKeys = new Set(commissions.map((commission) => commission.eventKey));

    expect(commissions).toHaveLength(1);
    expect(eventKeys.size).toBe(commissions.length);
  });
});
