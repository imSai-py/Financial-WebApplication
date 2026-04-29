# Financial System User Guide

## 1. Project Overview
Welcome to the Financial Web Application system documentation. This platform is a comprehensive management tool designed to streamline financial operations, improve customer tracking, and manage agent workflows securely. 

**Purpose & Key Features**
- **Unified Management**: Centralized dashboard to view analytics, transactions, and business metrics.
- **Secure Access Control**: Granular Role-Based Access Control (RBAC) ensuring data isolation and privacy.
- **Data & Task Tracking**: End-to-end tracking of assigned tasks, customer portfolios, loan statuses, and agent workflows.

**Target Users**
- **Admin**: Full control over the system, roles, application settings, and comprehensive system monitoring.
- **Staff**: Operational role handling customer accounts, transactions, reports, and basic tasks.
- **Agent**: Field or sales representatives focused on managing their assigned customer portfolio and tracking their commissions.
- **Customer**: End-users accessing their personal dashboard to track their loan statuses, profile, and individual transactions.

---

## 2. Tech Stack
The platform leverages a modern, serverless architecture that ensures scalability, speed, and real-time data sync.

- **Frontend Core**: **React 19** & **Vite** — Provides a blazing fast, dynamic, and responsive user interface.
- **Styling**: **TailwindCSS** — Utility-first CSS framework for a consistent, modern, and mobile-friendly design.
- **Backend & Database**: **Firebase Cloud Firestore** — A highly scalable NoSQL cloud database configured with strict security rules to keep your data safe.
- **Authentication**: **Firebase Authentication** — Secure login and session management handling different user roles smoothly.
- **Data Visualization**: **Recharts** — For generating interactive and insightful business reports and dashboard charts.

---

## 3. Getting Started

### Accessing the System
1. Open your web browser and navigate to the deployment URL (e.g., `https://your-app-domain.com`).
2. You will be greeted by the Login page. 

### Logging In
- Enter your registered email address and password.
- Click **Login**.
- Depending on your assigned role, you will be automatically redirected to your specific **Dashboard**.

*(Note for initial setup: The first Admin account is typically created directly within the Firebase Console or via an initialization script. Please refer to your setup credentials provided by your development team.)*

### Basic Navigation Overview
- **Sidebar Menu**: On the left-hand side, you'll find navigation links corresponding to your role's permissions (e.g., Dashboard, Users, Customers, Transactions, Tasks, Settings).
- **Top Bar**: Contains your user profile, quick account settings, notification alerts, and the logout button.
- **Dashboard Hub**: Your home page showing at-a-glance metrics and quick-action buttons.

---

## 4. User Role Management

### Admin
**Accessing the Admin Panel**
- Navigate to the **Users** tab from the main menu.
**Managing System Settings**
- Click on the **Settings** menu. Here you can configure global application preferences, security properties, and themes.
**Monitoring the System**
- Use the **Activity** log page to monitor critical system events and user actions in real-time.
- Access global **Reports** to understand business health.

### Staff / Workers
**Creating and Managing Accounts**
- As an Admin, go to **Users**, click **"Add New User"**, and select the role `Staff`.
- As a Staff member, you cannot create staff, but you have oversight over Customers.
**Responsibilities**
- Reviewing flagged accounts, managing day-to-day customer issues, generating reports, and tracking general tasks.

### Customers
**Adding and Managing Customers**
- Admins and Staff can navigate to the **Customers** menu and click **"New Customer"** to register a client.
**Actions Performed for Customers**
- Admins/Staff can update KYC details, assign loans, log customer-specific transactions, and link them to specific Agents.
- Customers themselves only see a restricted view of their own **Loans** and **Transactions**.

### Agents
**Creating and Managing Agents**
- Admins can create Agents via the **Users** menu by assigning the `Agent` role.
**Agent Role and Usage**
- Agents use the **Portfolio** menu to view customers explicitly tied to them.
- They track ongoing deals/loans via the **Tasks** page and view their calculated earnings on the **Commissions** page.

---

## 5. Core Features Usage

### 1. Dashboard
- **Usage**: Upon login, view your role-based widgets.
- **Outcome**: A quick summary of daily metrics, pending tasks, or recent transactions.

### 2. User Management (Admin Only)
- **Usage**: Go to **Users**. Click on a user row to edit their role, reset their password, or deactivate their account.
- **Outcome**: Seamless control over who has access to the platform and what they can do.

### 3. Customer & Agent Portfolio Management
- **Usage**: (Staff/Admin) Go to **Customers** to see a full list. (Agents) Go to **Portfolio** to see your assigned clients.
- **Outcome**: Centralized location to review client history, edit demographic details, and track interactions.

### 4. Transactions & Loans
- **Usage**: Navigate to **Transactions** to log payments, funds transfers, or fees. Navigate to **Loans** to update loan statuses (Pending, Approved, Rejected, Completed).
- **Outcome**: Financial records remain accurate, auditable, and transparent for clients.

### 5. Tasks System
- **Usage**: Under **Tasks**, create reminders or follow-ups and assign them to Staff or Agents. Mark checkboxes as tasks progress.
- **Outcome**: Increased productivity and accountability across the team.

### 6. Commissions (Agent & Admin)
- **Usage**: Automatically tracked based on closed loans or transactions. View the **Commissions** tab for payout calculations.
- **Outcome**: Minimizes manual accounting errors and keeps Agents motivated.

### 7. Reports & Activity Logging (Admin & Staff)
- **Usage**: Select date ranges in the **Reports** tab to generate charts. Review the **Activity** tab for system audit trails.
- **Outcome**: Enables data-driven decision-making and strict system governance.

---

## 6. System Management

### Updating System Settings
- Go to the **Settings** page (usually Admin access). 
- Update configurations such as Company Name, System Email Addresses, UI Theme (Light/Dark mode), and Global Policies. Click **Save Changes** to apply immediately.

### Handling Notifications
- Look for the bell icon in the top navigation bar. Click on it to expand recent alerts regarding tasks, application approvals, or system warnings. 
- You can mark them as read or click to navigate to the relevant asset.

### Data Management
- **Edit/Delete**: For almost all records (Customers, Users, Tasks), use the options menu (typically represented by three dots `⋮` on a table row) to securely Edit details or Delete/Archive records. 

---

## 7. Best Practices

- **Role Assignment**: Always follow the principle of least privilege. Give users only the role they absolutely need to perform their duties. Don't assign 'Admin' to standard workers.
- **Daily Reviews**: Staff should make a habit of checking their **Tasks** and **Dashboard** notifications at the beginning of their shift.
- **Data Accuracy**: When logging new transactions or creating customers, double-check numerical entries before saving to maintain clean database records.
- **Customer Privacy**: Never share screenshots of the system or customer details externally.

---

## 8. Troubleshooting

**Common Issues and Solutions**
- **Cannot Log In**
  - *Solution:* Verify that your email is typed correctly without trailing spaces. Make sure caps lock is off. If forgotten, use the "Forgot Password" link on the login page to receive a secure reset email.
- **Access Denied / Insufficient Permissions**
  - *Solution:* You are trying to view a page restricted to a higher role (e.g., trying to access Activity logs as a Customer). Return to the dashboard. If you believe this is an error, contact your Admin.
- **Data Not Loading or Saving**
  - *Solution:* Check your internet connection. Since the system uses real-time databases, a stable connection is required. If the issue persists, refresh the page (F5) or clear your browser cache.
- **Incorrect Commission Numbers**
  - *Solution:* Ensure that all relevant transactions and loan statuses are properly marked as "Completed". The system only calculates fully realized benchmarks.

**What to do if something fundamentally breaks:**
- Take a screenshot of the error message.
- Make a note of what you were trying to do exactly.
- Forward the screenshot and description to the technical support or your system administrator.

---

## 9. Deployment Note (For System Administrators)
- **Environment Targeting**: Before going live, ensure the Firebase environment pointing to `production` is correctly set up. Verify that the current `firestore.rules` (Security Rules) are deployed securely to prevent unauthorized data access.
- **Monitoring**: It is recommended to use Firebase Crashlytics or Playwright test logs from your CI/CD pipeline to periodically confirm system health after any updates.
