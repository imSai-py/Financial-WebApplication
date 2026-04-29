# 💰 FinanceFlow — Financial Management Web Application

A **secure, role-based financial management platform** built with React, Vite, TailwindCSS, and Firebase. FinanceFlow enables organizations to manage customers, transactions, loans, commissions, tasks, and activity logs — all with granular role-based access control (RBAC).

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Vite](https://img.shields.io/badge/Vite-8-purple?logo=vite)
![Firebase](https://img.shields.io/badge/Firebase-12-orange?logo=firebase)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-cyan?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [Firebase Setup](#-firebase-setup)
- [Running the App](#-running-the-app)
- [Available Scripts](#-available-scripts)
- [Role-Based Access Control](#-role-based-access-control)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Environment Variables](#-environment-variables)
- [Contributing](#-contributing)

---

## ✨ Features

| Module | Description |
|--------|-------------|
| **Authentication** | Email/password sign-up, login, and forgot-password flows via Firebase Auth |
| **Role-Based Dashboards** | Unique dashboards for Admin, Staff, Agent, and Customer roles |
| **User Management** | Admin panel to create, edit, and assign roles to users |
| **Customer Management** | Full CRUD for customer records with search and filtering |
| **Transactions** | Record, view, and manage financial transactions with audit trails |
| **Loan Tracking** | Customers can view active loan statuses and history |
| **Commissions** | Agents and admins can track and manage commission records |
| **Task Management** | Create and assign tasks to staff and agents |
| **Reports & Analytics** | Visual reports with charts (Recharts) for admin and staff |
| **Activity Logs** | Immutable audit logs for all security-sensitive actions |
| **Agent Portfolio** | Agents can view their onboarded customers |
| **Settings** | Theme toggling (light/dark mode) and user preferences |
| **Security** | Firestore Security Rules with comprehensive RBAC enforcement |
| **Responsive Design** | Fully responsive UI with mobile-friendly layouts |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, React Router 7, Recharts, Lucide Icons |
| **Styling** | TailwindCSS 4, Custom CSS |
| **Build Tool** | Vite 8 |
| **Backend / BaaS** | Firebase (Auth, Firestore, Cloud Functions, Hosting) |
| **Cloud Functions** | Node.js 20, Firebase Admin SDK |
| **Testing** | Playwright (E2E), Vitest (Integration), Firebase Rules Unit Testing |
| **Linting** | ESLint 9 |

---

## 📁 Project Structure

```
Financial-WebApplication/
├── public/                     # Static assets (favicon, icons)
├── functions/                  # Firebase Cloud Functions (RBAC)
│   ├── index.js                # Cloud Functions entry point
│   └── package.json            # Functions dependencies
├── scripts/                    # Admin utility scripts
│   ├── setAdminRole.mjs        # Set admin role via Firebase Admin SDK
│   ├── seed-admin.mjs          # Seed admin user
│   └── check-claims.mjs       # Check user custom claims
├── src/
│   ├── components/             # React UI components
│   │   ├── activity/           # Activity log components
│   │   ├── auth/               # Login, Register, Forgot Password
│   │   ├── commissions/        # Commission management
│   │   ├── customers/          # Customer list & agent portfolio
│   │   ├── dashboard/          # Role-specific dashboards
│   │   ├── layout/             # App layout, sidebar, protected routes
│   │   ├── loans/              # Loan status tracking
│   │   ├── payments/           # Payment components
│   │   ├── reports/            # Report & analytics views
│   │   ├── settings/           # App settings
│   │   ├── shared/             # Reusable UI components
│   │   ├── tasks/              # Task management
│   │   ├── transactions/       # Transaction management
│   │   └── users/              # User management (admin)
│   ├── config/
│   │   └── firebase.js         # Firebase client configuration
│   ├── contexts/               # React Context providers
│   │   ├── AuthContext.jsx     # Authentication state management
│   │   ├── SettingsContext.jsx  # Application settings
│   │   ├── ThemeContext.jsx     # Dark/light theme toggle
│   │   └── ToastContext.jsx     # Toast notification system
│   ├── hooks/                  # Custom React hooks
│   │   ├── useMediaQuery.js    # Responsive breakpoint hook
│   │   ├── useNetworkStatus.js # Online/offline detection
│   │   ├── usePageTitle.js     # Dynamic page titles
│   │   └── usePermission.js    # Role-based permission check
│   ├── services/               # Firebase service layer
│   │   ├── activityLogService.js
│   │   ├── commissionService.js
│   │   ├── loanService.js
│   │   ├── notificationService.js
│   │   ├── reportService.js
│   │   ├── searchService.js
│   │   ├── settingsService.js
│   │   ├── taskService.js
│   │   ├── transactionService.js
│   │   └── userService.js
│   ├── utils/                  # Utility functions
│   │   ├── formatCurrency.js
│   │   ├── formatDate.js
│   │   ├── rolePermissions.js  # RBAC permission matrix
│   │   └── validation.js
│   ├── App.jsx                 # Root application component
│   ├── main.jsx                # React entry point
│   └── index.css               # Global styles
├── tests/                      # Test suites
├── .env.example                # Environment variable template
├── .gitignore                  # Git ignore rules
├── firebase.json               # Firebase project configuration
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Firestore composite indexes
├── index.html                  # HTML entry point
├── package.json                # Project dependencies & scripts
├── vite.config.js              # Vite build configuration
├── vitest.config.js            # Vitest test configuration
├── eslint.config.js            # ESLint configuration
└── playwright.config.js        # Playwright E2E test configuration
```

---

## 📦 Prerequisites

Make sure you have the following installed on your machine:

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| **Node.js** | v20 or higher | `node --version` |
| **npm** | v10 or higher | `npm --version` |
| **Git** | Latest | `git --version` |
| **Firebase CLI** | Latest | `firebase --version` |

Install the Firebase CLI globally if you don't have it:

```bash
npm install -g firebase-tools
```

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/imSai-py/Financial-WebApplication.git
cd Financial-WebApplication
```

### 2. Install Dependencies

Install the root project dependencies:

```bash
npm install
```

Install the Cloud Functions dependencies:

```bash
cd functions
npm install
cd ..
```

### 3. Firebase Project Setup

> **Important:** This app connects to a Firebase project. You will need access to the Firebase project **or** create your own.

#### Option A: Use the Existing Firebase Project

If you have been granted access to the `financeflow-mgmt-2026` Firebase project:

```bash
firebase login
firebase use financeflow-mgmt-2026
```

#### Option B: Create Your Own Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project.

2. Enable the following services:
   - **Authentication** → Email/Password provider
   - **Cloud Firestore** → Create database (start in test mode, then apply rules)
   - **Hosting** → Set up hosting

3. Update the Firebase config in `src/config/firebase.js` with your project's credentials:

   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT.firebasestorage.app",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

4. Update `.firebaserc` with your project ID:

   ```json
   {
     "projects": {
       "default": "your-project-id"
     }
   }
   ```

5. Deploy Firestore Rules and Indexes:

   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```

### 4. Run the Development Server

```bash
npm run dev
```

The app will start at **http://localhost:5173** (default Vite port).

---

## 🔥 Firebase Setup

### Firestore Security Rules

The project includes comprehensive Firestore security rules in `firestore.rules` that enforce role-based access control. Deploy them with:

```bash
firebase deploy --only firestore:rules
```

### Firestore Indexes

Composite indexes required for queries are defined in `firestore.indexes.json`. Deploy them with:

```bash
firebase deploy --only firestore:indexes
```

### Cloud Functions

The `functions/` directory contains Cloud Functions for managing custom claims (RBAC). Deploy them with:

```bash
firebase deploy --only functions
```

> **Note:** Cloud Functions require the **Firebase Blaze (pay-as-you-go)** plan.

### Setting Up Admin User

After creating your first user account, you can assign the admin role using:

```bash
# Authenticate with Firebase first
firebase login

# Run the admin script (requires Application Default Credentials)
node scripts/setAdminRole.mjs
```

---

## 🏃 Running the App

```bash
# Start the development server
npm run dev

# Build for production
npm run build

# Preview the production build
npm run preview
```

### Using Firebase Emulators (for local development)

```bash
firebase emulators:start
```

This starts local emulators for Firestore (port 8080), Auth (port 9099), and the Emulator UI (port 4000).

---

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint on the codebase |
| `npm run test:e2e` | Run all Playwright E2E tests |
| `npm run test:auth` | Run authentication E2E tests |
| `npm run test:ui` | Run UI E2E tests |
| `npm run test:rules` | Run Firestore security rules tests |
| `npm run test:all` | Run all test suites |

---

## 🔐 Role-Based Access Control

FinanceFlow implements four user roles with different access levels:

| Feature | Admin | Staff | Agent | Customer |
|---------|:-----:|:-----:|:-----:|:--------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| User Management | ✅ | ❌ | ❌ | ❌ |
| Customer Management | ✅ | ✅ | ❌ | ❌ |
| Agent Portfolio | ❌ | ❌ | ✅ | ❌ |
| Transactions | ✅ | ✅ | ✅ | ✅ |
| Loan Status | ❌ | ❌ | ❌ | ✅ |
| Tasks | ✅ | ✅ | ✅ | ❌ |
| Commissions | ✅ | ❌ | ✅ | ❌ |
| Activity Logs | ✅ | ❌ | ❌ | ❌ |
| Reports | ✅ | ✅ | ❌ | ❌ |
| Settings | ✅ | ✅ | ✅ | ✅ |

### Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@financeflow.com` | *(contact project owner)* |
| Staff | `staff@financeflow.com` | *(contact project owner)* |
| Agent | `agentsmith@financeflow.com` | *(contact project owner)* |

---

## 🚢 Deployment

### Deploy to Firebase Hosting

```bash
# Build the project
npm run build

# Deploy everything (hosting + rules + indexes + functions)
firebase deploy

# Or deploy only hosting
firebase deploy --only hosting
```

The app will be available at: `https://YOUR_PROJECT_ID.web.app`

---

## 🧪 Testing

### E2E Tests (Playwright)

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run all E2E tests
npm run test:e2e
```

### Integration Tests (Vitest)

```bash
# Run Firestore security rules tests
npm run test:rules
```

---

## 🔧 Environment Variables

See [`.env.example`](.env.example) for the full template.

The Firebase client configuration is currently hardcoded in `src/config/firebase.js`. If you are connecting to a different Firebase project, update the config values in that file.

For admin scripts in `/scripts`, you need Firebase Application Default Credentials:

```bash
firebase login
# OR set GOOGLE_APPLICATION_CREDENTIALS to your service account key path
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

<p align="center">
  Built with ❤️ using React + Firebase
</p>
