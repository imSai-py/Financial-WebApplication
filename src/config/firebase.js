import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

function readRequiredFirebaseEnv(name) {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${name}`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: readRequiredFirebaseEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readRequiredFirebaseEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readRequiredFirebaseEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readRequiredFirebaseEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readRequiredFirebaseEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readRequiredFirebaseEnv('VITE_FIREBASE_APP_ID'),
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);

const shouldUseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const isLocalhost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

if (shouldUseEmulators) {
  const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  const authPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099);
  const firestorePort = Number(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8081);
  const functionsPort = Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);
  const storagePort = Number(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT || 9199);

  connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, firestorePort);
  connectFunctionsEmulator(functions, emulatorHost, functionsPort);
  connectStorageEmulator(storage, emulatorHost, storagePort);

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
