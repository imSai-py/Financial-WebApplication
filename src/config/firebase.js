import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyCjI-i8zjrz8Be6cowhvI1NgwYemH-EzDQ",
  authDomain: "financeflow-mgmt-2026.firebaseapp.com",
  projectId: "financeflow-mgmt-2026",
  storageBucket: "financeflow-mgmt-2026.firebasestorage.app",
  messagingSenderId: "1085477669742",
  appId: "1:1085477669742:web:c941831c4049e8f42b8f7f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');
export default app;
