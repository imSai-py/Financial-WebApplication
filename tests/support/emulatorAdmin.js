import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectId = process.env.FIREBASE_PROJECT_ID || 'financeflow-mgmt-2026';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';

process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;

function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp({ projectId });
}

export function getAdminServices() {
  const app = getAdminApp();
  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}

export async function findUserDocByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const { db } = getAdminServices();
  const snap = await db
    .collection('users')
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function getUserDoc(uid) {
  const { db } = getAdminServices();
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function createLeadDocument({
  id,
  displayName,
  email,
  creatorUid,
  creatorRole,
  assignedStaffId = null,
  onboardedByAgent = null,
  createdAt = Timestamp.now(),
}) {
  const { db } = getAdminServices();
  const leadData = {
    uid: id,
    displayName,
    email: email.trim().toLowerCase(),
    role: 'customer',
    status: 'active',
    customerStatus: 'lead',
    hasAuthAccount: false,
    createdBy: creatorUid,
    createdAt,
    updatedAt: createdAt,
    assignedStaffId,
    onboardedByAgent,
  };

  if (creatorRole) {
    leadData.creator = {
      id: creatorUid,
      name: `${creatorRole} lead creator`,
      role: creatorRole,
      timestamp: createdAt,
    };
  }

  await db.collection('users').doc(id).set(leadData);
}

export async function setUserStatus(uid, status) {
  const { db } = getAdminServices();
  await db.collection('users').doc(uid).update({
    status,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteUserArtifacts({ uid = null, email = null, leadDocId = null } = {}) {
  const { auth, db } = getAdminServices();

  let targetUid = uid;
  if (!targetUid && email) {
    try {
      const record = await auth.getUserByEmail(email.trim().toLowerCase());
      targetUid = record.uid;
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }
  }

  if (targetUid) {
    await db.collection('users').doc(targetUid).delete().catch(() => {});
    await auth.deleteUser(targetUid).catch(() => {});
  }

  if (leadDocId) {
    await db.collection('users').doc(leadDocId).delete().catch(() => {});
  }
}

export function readEmulatorLogs() {
  const rootDir = resolve(__dirname, '..', '..');
  const stdoutPath = resolve(rootDir, '.codex', 'run-logs', 'firebase-emulators.log');
  const stderrPath = resolve(rootDir, '.codex', 'run-logs', 'firebase-emulators.err.log');

  return {
    stdout: safeRead(stdoutPath),
    stderr: safeRead(stderrPath),
  };
}

function safeRead(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}
