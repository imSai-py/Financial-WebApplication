# FinanceFlow Collaborator Setup Guide

This guide shows how to set up the project on a new laptop from scratch so it behaves the same way as the current working local environment.

Use this if you want to:

- clone the repository
- install all required tools
- run the app locally
- use Firebase emulators
- log in with working local test accounts
- avoid the most common setup issues

## 1. Prerequisites

Install the following software first.

### Required software

- Node.js `20.x LTS` recommended
- npm `10+`
- Git
- Java `17+` or newer, available on your system `PATH`
- Firebase CLI

### Why these are needed

- Node.js and npm are required for the React app and Firebase Functions dependencies.
- Git is required to clone and update the repository.
- Java is required for Firebase emulators, especially Firestore.
- Firebase CLI is required to run emulators and Firebase project commands.

### Check installed versions

Run these commands:

```powershell
node --version
npm --version
git --version
java --version
npx firebase --version
```

### Recommended installs

If something is missing:

```powershell
npm install -g firebase-tools
```

Windows note:

- If PowerShell blocks `firebase`, use `npx firebase ...` or `firebase.cmd ...`.

## 2. Clone the Project

```powershell
git clone https://github.com/imSai-py/Financial-WebApplication.git
cd Financial-WebApplication
```

## 3. Install Dependencies

Install the frontend/root dependencies:

```powershell
npm install
```

Install the Firebase Functions dependencies:

```powershell
cd functions
npm install
cd ..
```

## 4. Environment Setup

Create a local `.env` file from the example file:

```powershell
Copy-Item .env.example .env
```

Update `.env` so the frontend uses local Firebase emulators:

```env
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_AUTH_EMULATOR_PORT=9099
VITE_FIREBASE_FIRESTORE_EMULATOR_PORT=8081
VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT=5001
```

Important:

- The Firebase web app config is currently hardcoded in `src/config/firebase.js`.
- If you are using the same shared Firebase project as the rest of the team, do not change that file.
- If you are using a different Firebase project, the Firebase config and some scripts must be updated.

## 5. Firebase Project Setup

There are two valid ways to work with this repo.

### Option A: Use the shared Firebase project

If the project owner has already granted you access:

```powershell
npx firebase login
npx firebase use --add
```

When prompted, select the correct Firebase project.

### Option B: Use your own Firebase project

If you are not using the shared project:

1. Create a Firebase project in the Firebase Console.
2. Enable Email/Password Authentication.
3. Create a Firestore database.
4. Enable Firebase Hosting if needed.
5. Update `src/config/firebase.js` with your own project config.
6. Update project IDs inside these scripts if needed:

- `scripts/seed-emulator-users.mjs`
- `scripts/seed-admin.mjs`
- `scripts/setAdminRole.mjs`

7. Optionally set the local Firebase project:

```powershell
npx firebase login
npx firebase use --add
```

## 6. Emulator Setup

This project expects these local emulator ports:

- Auth: `9099`
- Firestore: `8081`
- Functions: `5001`
- Emulator UI: `4000`
- Hosting emulator: `5000`

These values are defined in `firebase.json` and should match your `.env`.

### Start the emulators

Open Terminal 1 and run:

```powershell
npx firebase emulators:start
```

Wait until you see a message similar to:

```text
All emulators ready! It is now safe to connect your app.
```

### Emulator URLs

- Emulator UI: `http://127.0.0.1:4000`
- Hosting emulator: `http://127.0.0.1:5000`

## 7. Seed Local Emulator Users

The Firebase emulators start empty. You must seed users before logging in locally.

Open Terminal 2 and run:

```powershell
npm run seed:emulators
```

This creates these local test users:

- `admin@dummy.com` / `Adminpass123@`
- `staff@dummy.com` / `Staffpass123@`
- `agent@dummy.com` / `Agentpass123@`

It also creates matching Firestore user profiles and sets the correct custom claims.

## 8. Run the Frontend

Open Terminal 3 and run:

```powershell
npm run dev -- --host 127.0.0.1
```

Expected frontend URL:

```text
http://127.0.0.1:5173
```

## 9. Complete Local Startup Flow

Use this exact startup order on a fresh machine:

### Terminal 1

```powershell
npx firebase emulators:start
```

### Terminal 2

```powershell
npm run seed:emulators
```

### Terminal 3

```powershell
npm run dev -- --host 127.0.0.1
```

## 10. Verify the Setup Worked

Run through this checklist:

1. Open `http://127.0.0.1:5173`
2. Open `http://127.0.0.1:4000`
3. Confirm Auth, Firestore, and Functions emulators are running
4. Log in with:

- Email: `staff@dummy.com`
- Password: `Staffpass123@`

5. Confirm the dashboard loads
6. Try a feature that uses the Functions backend, such as creating a customer

If all of that works, the local setup matches the expected development environment.

## 11. Authentication and Permissions

### For local emulator development

- Full Firebase production access is not strictly required.
- The app can run locally with emulators and seeded test accounts.

### For shared project access

Ask the project owner to add you to the Firebase or Google Cloud project if you need to:

- inspect production/staging data
- deploy rules
- deploy functions
- deploy hosting

### Helpful commands

```powershell
npx firebase login
npx firebase projects:list
npx firebase use --add
```

## 12. Useful Commands

### Development

```powershell
npm run dev
npm run build
npm run preview
```

### Emulator seeding

```powershell
npm run seed:emulators
```

### Tests

```powershell
npx playwright install
npm run test:rules
npm run test:e2e
```

## 13. Troubleshooting

### Problem: `firebase` command does not run in PowerShell

Use:

```powershell
npx firebase emulators:start
```

or:

```powershell
firebase.cmd emulators:start
```

### Problem: `Could not spawn java -version`

Fix:

- Install Java
- Reopen the terminal
- Run `java --version`
- Start emulators again

### Problem: Emulator ports are already in use

Check which ports are occupied:

```powershell
netstat -ano | findstr ":4000 :5000 :5001 :8081 :9099"
```

Then stop the blocking process or change ports in `firebase.json` and `.env`.

### Problem: App starts but still connects to production Firebase

Fix:

1. Confirm `.env` contains:

```env
VITE_USE_FIREBASE_EMULATORS=true
```

2. Stop the Vite dev server
3. Start it again with:

```powershell
npm run dev -- --host 127.0.0.1
```

### Problem: `functions/not-found` for `createUserByAdmin`

Fix:

```powershell
cd functions
npm install
cd ..
npx firebase emulators:start
```

If emulators were already running, stop and restart them after reinstalling.

### Problem: `auth/user-not-found` when using local demo accounts

Fix:

```powershell
npm run seed:emulators
```

### Problem: Firestore or Functions emulator starts partially

Common causes:

- Java is missing
- ports are already in use
- `functions/node_modules` was not installed

Fix:

```powershell
cd functions
npm install
cd ..
```

Then restart the emulators.

### Problem: Vite or local tooling fails on Windows

Try:

- closing and reopening the terminal
- using a normal terminal session instead of a locked-down shell
- rerunning `npm install`

Also make sure Node.js is installed correctly and available on `PATH`.

## 14. Summary

If you follow this guide, you should be able to:

- clone the repository
- install all required tools and dependencies
- start Firebase emulators
- seed working local users
- start the frontend
- log in and use the app locally
- reproduce the same local workflow as the current working machine
