import { afterAll, describe, expect, it } from 'vitest';
import { TEST_USERS } from '../support/localTestUsers.js';
import { deleteUserArtifacts, getAdminServices, getUserDoc } from '../support/emulatorAdmin.js';

const projectId = 'financeflow-mgmt-2026';
const authApiKey = 'fake-api-key';
const authBaseUrl = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const functionsBaseUrl = `http://127.0.0.1:5001/${projectId}/us-central1`;
const cleanupQueue = [];

function uniqueUser(prefix) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    displayName: `${prefix} ${nonce}`,
    email: `${prefix}-${nonce}@example.com`.toLowerCase(),
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

async function callSetManagedUserPassword(actor, requestData) {
  const { idToken } = await emulatorSignIn(actor);
  const response = await fetch(`${functionsBaseUrl}/setManagedUserPassword`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: requestData }),
  });

  const payload = await response.json();
  if (!response.ok || payload.error) {
    const errorMessage = payload.error?.message || payload.error?.status || 'setManagedUserPassword failed';
    throw new Error(errorMessage);
  }

  return payload.result;
}

async function signInWithCredentials(email, password) {
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

afterAll(async () => {
  while (cleanupQueue.length > 0) {
    await deleteUserArtifacts(cleanupQueue.pop());
  }
});

describe('role-based account creation', () => {
  it('allows admins to create staff, agent, and admin accounts with matching role claims', async () => {
    const { auth } = getAdminServices();

    for (const role of ['staff', 'agent', 'admin']) {
      const user = uniqueUser(role);
      const password = `${role[0].toUpperCase()}${role.slice(1)}Pass123@`;
      const result = await callCreateUserByAdmin(TEST_USERS.admin, {
        email: user.email,
        displayName: user.displayName,
        role,
        phone: user.phone,
        password,
      });

      cleanupQueue.push({ uid: result.uid, email: user.email });
      const persisted = await getUserDoc(result.uid);
      const authUser = await auth.getUser(result.uid);

      expect(persisted.role).toBe(role);
      expect(persisted.email).toBe(user.email);
      expect(persisted.authEmail).toBe(user.email);
      expect(authUser.email).toBe(user.email);
      expect(authUser.customClaims?.role).toBe(role);
      if (['staff', 'agent'].includes(role)) {
        const login = await signInWithCredentials(user.email, password);
        expect(login.registered).toBe(true);
      }
      expect(persisted).not.toHaveProperty('customerStatus');
      expect(persisted).not.toHaveProperty('referralPath');
      expect(persisted).not.toHaveProperty('referrerId');
    }
  });

  it('rejects non-customer role creation for non-admin callers', async () => {
    const staffCandidate = uniqueUser('staff-denied');
    const agentCandidate = uniqueUser('agent-denied');

    await expect(
      callCreateUserByAdmin(TEST_USERS.staff, {
        email: staffCandidate.email,
        displayName: staffCandidate.displayName,
        role: 'staff',
        phone: staffCandidate.phone,
      })
    ).rejects.toThrow('Only admins can create non-customer users.');

    await expect(
      callCreateUserByAdmin(TEST_USERS.agent, {
        email: agentCandidate.email,
        displayName: agentCandidate.displayName,
        role: 'agent',
        phone: agentCandidate.phone,
      })
    ).rejects.toThrow('Only admins can create non-customer users.');
  });

  it('requires email for non-customer user creation', async () => {
    await expect(
      callCreateUserByAdmin(TEST_USERS.admin, {
        displayName: 'Missing Email Staff',
        role: 'staff',
        phone: '+91 9988776655',
      })
    ).rejects.toThrow('Valid email is required.');
  });

  it('still enforces customer-only password validation for customer creation', async () => {
    const user = uniqueUser('customer-password');

    await expect(
      callCreateUserByAdmin(TEST_USERS.admin, {
        email: user.email,
        displayName: user.displayName,
        role: 'customer',
        phone: user.phone,
      })
    ).rejects.toThrow('Password is required.');
  });

  it('rejects weak passwords for staff and agent creation', async () => {
    const weakStaff = uniqueUser('weak-staff');
    const weakAgent = uniqueUser('weak-agent');

    await expect(
      callCreateUserByAdmin(TEST_USERS.admin, {
        email: weakStaff.email,
        displayName: weakStaff.displayName,
        role: 'staff',
        phone: weakStaff.phone,
        password: 'weak',
      })
    ).rejects.toThrow('At least 8 characters required');

    await expect(
      callCreateUserByAdmin(TEST_USERS.admin, {
        email: weakAgent.email,
        displayName: weakAgent.displayName,
        role: 'agent',
        phone: weakAgent.phone,
        password: 'weak',
      })
    ).rejects.toThrow('At least 8 characters required');
  });

  it('allows admins to reset passwords for staff and agent users only', async () => {
    const role = 'staff';
    const user = uniqueUser('reset-staff');
    const originalPassword = 'OriginalPass123@';
    const newPassword = 'UpdatedPass123@';

    const result = await callCreateUserByAdmin(TEST_USERS.admin, {
      email: user.email,
      displayName: user.displayName,
      role,
      phone: user.phone,
      password: originalPassword,
    });

    cleanupQueue.push({ uid: result.uid, email: user.email });

    const initialLogin = await signInWithCredentials(user.email, originalPassword);
    expect(initialLogin.registered).toBe(true);

    await callSetManagedUserPassword(TEST_USERS.admin, {
      targetUid: result.uid,
      newPassword,
    });

    await expect(signInWithCredentials(user.email, originalPassword)).rejects.toThrow();
    const updatedLogin = await signInWithCredentials(user.email, newPassword);
    expect(updatedLogin.registered).toBe(true);
  });

  it('denies password resets to non-admin callers', async () => {
    await expect(
      callSetManagedUserPassword(TEST_USERS.staff, {
        targetUid: 'some-user',
        newPassword: 'UpdatedPass123@',
      })
    ).rejects.toThrow('Only admins can manage passwords.');
  });

  it('rejects password resets for customer and admin targets', async () => {
    const customer = uniqueUser('reset-customer');
    const adminUser = uniqueUser('reset-admin');

    const customerResult = await callCreateUserByAdmin(TEST_USERS.admin, {
      email: customer.email,
      displayName: customer.displayName,
      role: 'customer',
      phone: customer.phone,
      password: 'CustomerPass123@',
    });

    const adminResult = await callCreateUserByAdmin(TEST_USERS.admin, {
      email: adminUser.email,
      displayName: adminUser.displayName,
      role: 'admin',
      phone: adminUser.phone,
      password: 'AdminPass123@',
    });

    cleanupQueue.push({ uid: customerResult.uid, email: customer.email });
    cleanupQueue.push({ uid: adminResult.uid, email: adminUser.email });

    await expect(
      callSetManagedUserPassword(TEST_USERS.admin, {
        targetUid: customerResult.uid,
        newPassword: 'UpdatedPass123@',
      })
    ).rejects.toThrow('Passwords can only be managed for staff and agent accounts.');

    await expect(
      callSetManagedUserPassword(TEST_USERS.admin, {
        targetUid: adminResult.uid,
        newPassword: 'UpdatedPass123@',
      })
    ).rejects.toThrow('Passwords can only be managed for staff and agent accounts.');
  });
});
