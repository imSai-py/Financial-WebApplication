# Firebase Admin & Role Management Guide

This guide is for system owners to understand how to correctly and safely manage system users (Admins, Staff/Workers, Agents, and Customers) directly through the Firebase Console.

---

## 1. Firebase Access & Login

**How to log in:**
1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Log in using the Google Account that was granted ownership or editing rights to your project.
3. Click on your specific project card (e.g., "Financial Web Application" or similar) on the welcome screen.

**Basic Dashboard Overview:**
Once inside, look at the **Left-Hand Menu** under the **Build** dropdown. You will primarily use two sections:
- **Authentication**: Where emails and passwords to log in are stored.
- **Firestore Database**: The structured data storage where user details (like names and roles) are saved.

---

## 2. Recommended Workflow (Important!)

**Should I create users in Firebase?**
Generally, **NO**. 

For day-to-day operations, you should **always use the application's built-in Admin Panel** (found under the 'Users' tab inside the web app). 
- Using the app's UI automatically creates the login credentials AND sets up the database profile simultaneously without the risk of typos.
- **Only use the Firebase Console manually in three scenarios:**
  1. Setting up the very first "Admin" account.
  2. If the web app is temporarily down.
  3. For emergency account recovery.

If you must manage users manually in Firebase, proceed to the steps below.

---

## 3. Adding Users Manually (Step-by-Step)

Creating a complete user via Firebase requires two steps: enabling their login, and defining who they are.

### Step A: Create the Login Credentials
1. Go to **Build** > **Authentication** from the left menu.
2. Select the **Users** tab.
3. Click the **Add user** button.
4. Enter the user’s **Email** and a secure **Password**. Click **Add user**.
5. Once created, hover over the user's row and look for the **User UID** (a long string of random letters and numbers). **Copy this UID**. 

### Step B: Store the User Profile and Role
1. Go to **Build** > **Firestore Database**.
2. Look for the collection named **`users`** in the first column and click it.
3. Click **Add document** to create their profile.
4. For the **Document ID**, paste the **User UID** you copied in Step A. *(This securely links their login to their profile)*.
5. Add the following fields to the document:
   - **Field name:** `email` | **Type:** `string` | **Value:** (Type their email)
   - **Field name:** `name` | **Type:** `string` | **Value:** (Type their full name)
   - **Field name:** `role` | **Type:** `string` | **Value:** (Type `admin`, `staff`, `agent`, or `customer` — *must be completely lowercase*)
6. Click **Save**. The user can now log into the web app with the correct permissions.

---

## 4. Role Management

**How roles are structured**
Roles dictate what pages and data a user can see inside your web app. They are securely verified via Firestore rules. The standard roles are:
- `admin`: Full system access.
- `staff`: Can manage customers and tasks, generate reports.
- `agent`: Can only access their assigned portfolio and commissions.
- `customer`: Limited to viewing their own personal loans and transactions.

**How to change a role later:**
1. Open the **Firestore Database** and select the **`users`** collection.
2. Find the document matching the user's email or UID.
3. Click on the document to view its fields in the middle column.
4. Locate the `role` field.
5. Click the small **pencil icon** next to the role.
6. Delete the old role, type the new one (e.g., change `staff` to `admin`), and click **Update**. The change takes effect the next time they refresh their page.

---

## 5. Admin Access Setup

**How to make yourself or someone else an Admin:**
1. Follow the "Change a role later" instructions above.
2. Ensure the `role` field is set exactly to the word: `admin`.

**Precautions for Admin Setup:**
- Only grand Admin access to trusted business partners or IT managers. Admins have the power to view sensitive financial data, manage roles, and delete records.
- **Never** share a single Admin account across multiple people. Always create individual accounts, so activity stays accountable to one person.

---

## 6. Best Practices & Security Tips

**DO's:**
- **Do use the "Disable" feature:** If an employee leaves your company, go to **Authentication**, find their account, click the three dots (`⋮`) on the right, and select **Disable Account**. This stops them from logging in immediately.
- **Do use lowercase:** Always type roles in fully lowercase (`admin`, not `Admin`) to ensure they match internal security codes perfectly.
- **Do double-check fields:** A single typo in an email field will prevent a user from connecting their login to their database profile.

**DON'Ts:**
- **Don't delete Firebase profiles (unless necessary):** Instead of deleting a former worker's profile in Firestore Database, just disable their login in the Authentication tab. Deleting their database profile might create broken links in old tasks or transactions they previously handled.
- **Don't touch internal collections manually:** Never arbitrarily modify collections like `transactions` or `commissions` directly in the Firebase Console unless guided by a developer. These are connected securely in the background, and manual editing can break calculations in the app.
