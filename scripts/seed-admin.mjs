import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';

const app = initializeApp({ projectId: 'financeflow-mgmt-2026' });
const auth = getAuth(app);
const db = getFirestore(app);

async function seedAdmins() {
  try {
    const listUsersResult = await auth.listUsers(1000);
    const users = listUsersResult.users;
    
    console.log(`Found ${users.length} users in Firebase Auth emulator.`);
    
    for (const u of users) {
      console.log(`Seeding Firestore for user ${u.email} (${u.uid})...`);
      
      const docRef = db.collection('users').doc(u.uid);
      const docSnap = await docRef.get();
      
      if (!docSnap.exists) {
        await docRef.set({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || 'Admin User',
          role: 'admin',
          status: 'active',
          createdAt: new Date().toISOString()
        });
        console.log(`[Success] Created completely new admin document for ${u.email}`);
      } else {
        await docRef.update({
          role: 'admin',
          status: 'active'
        });
        console.log(`[Success] Updated existing document to admin for ${u.email}`);
      }
      
      // Also set the custom custom claim to bypass DB limits in firestore rules
      await auth.setCustomUserClaims(u.uid, { role: 'admin' });
      console.log(`[Success] Assigned admin Custom Claims to ${u.email}`);
    }
    
    console.log('Seeding procedure entirely complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding process failed:', error);
    process.exit(1);
  }
}

seedAdmins();
