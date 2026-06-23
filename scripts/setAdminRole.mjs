// Set an existing Firestore user document to admin using Firebase Admin SDK.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'finance-flow-825fd';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@financeflow.com';

// Uses application default credentials or GOOGLE_APPLICATION_CREDENTIALS when available.
const app = initializeApp({ projectId });
const db = getFirestore(app);

async function setAdmin() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', adminEmail).get();

  if (snapshot.empty) {
    const allUsers = await usersRef.get();
    console.log(`No user found with email ${adminEmail} in project ${projectId}. Total users: ${allUsers.size}`);
    allUsers.forEach((doc) => {
      console.log(`  - ${doc.id}: ${JSON.stringify(doc.data())}`);
    });
    process.exit(1);
  }

  for (const doc of snapshot.docs) {
    console.log(`Found user: ${doc.id} - ${doc.data().email} (role: ${doc.data().role})`);
    await doc.ref.update({ role: 'admin' });
    console.log('Role updated to admin.');
  }

  process.exit(0);
}

setAdmin().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
