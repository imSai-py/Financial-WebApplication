import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';

const projectId = 'financeflow-mgmt-2026';
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

const demoUsers = [
  {
    email: 'admin@dummy.com',
    password: 'Adminpass123@',
    displayName: 'Admin Demo',
    role: 'admin',
  },
  {
    email: 'staff@dummy.com',
    password: 'Staffpass123@',
    displayName: 'Staff Demo',
    role: 'staff',
  },
  {
    email: 'agent@dummy.com',
    password: 'Agentpass123@',
    displayName: 'Agent Demo',
    role: 'agent',
  },
];

async function ensureUser({ email, password, displayName, role }) {
  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }

    userRecord = await auth.createUser({
      email,
      password,
      displayName,
      disabled: false,
    });
  }

  await auth.setCustomUserClaims(userRecord.uid, { role });

  await db.collection('users').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email,
    displayName,
    role,
    status: 'active',
    phone: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  return { uid: userRecord.uid, email, role };
}

async function seedEmulatorUsers() {
  console.log(`Seeding Firebase emulators for project ${projectId}...`);

  for (const user of demoUsers) {
    const seeded = await ensureUser(user);
    console.log(`Seeded ${seeded.role}: ${seeded.email} (${seeded.uid})`);
  }

  console.log('Emulator user seeding complete.');
}

seedEmulatorUsers().catch((error) => {
  console.error('Failed to seed emulator users:', error);
  process.exit(1);
});
