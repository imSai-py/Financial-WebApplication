// Set admin role using Firebase Admin SDK (bypasses security rules)
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Use application default credentials (from gcloud or firebase login)
const app = initializeApp({ projectId: 'financeflow-mgmt-2026' });
const db = getFirestore(app);

async function setAdmin() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', 'admin@financeflow.com').get();
  
  if (snapshot.empty) {
    // Try listing all users
    const allUsers = await usersRef.get();
    console.log(`No user found with that email. Total users: ${allUsers.size}`);
    allUsers.forEach(doc => {
      console.log(`  - ${doc.id}: ${JSON.stringify(doc.data())}`);
    });
    process.exit(1);
  }
  
  for (const doc of snapshot.docs) {
    console.log(`Found user: ${doc.id} - ${doc.data().email} (role: ${doc.data().role})`);
    await doc.ref.update({ role: 'admin' });
    console.log('✅ Role updated to admin!');
  }
  
  process.exit(0);
}

setAdmin().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
