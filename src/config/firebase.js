import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

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

const shouldUseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const isLocalhost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

if (shouldUseEmulators) {
  const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  const authPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099);
  const firestorePort = Number(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8081);
  const functionsPort = Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);

  connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, firestorePort);
  connectFunctionsEmulator(functions, emulatorHost, functionsPort);

  if (import.meta.env.DEV) {
    console.info(
      `[Firebase] Using emulators on ${emulatorHost} (auth:${authPort}, firestore:${firestorePort}, functions:${functionsPort}).`
    );
  }
} else if (import.meta.env.DEV && isLocalhost) {
  console.warn(
    '[Firebase] Using deployed Firebase services from localhost. Set VITE_USE_FIREBASE_EMULATORS=true in .env and restart Vite to use local Auth/Firestore/Functions emulators.'
  );
}

export default app;
