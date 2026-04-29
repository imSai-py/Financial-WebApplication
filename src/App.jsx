import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SettingsProvider } from './contexts/SettingsContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PublicOnlyRoute from './components/layout/PublicOnlyRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import ForgotPassword from './components/auth/ForgotPassword';
import DashboardRouter from './components/dashboard/DashboardRouter';
import UserManagement from './components/users/UserManagement';
import CustomerList from './components/customers/CustomerList';
import TransactionList from './components/transactions/TransactionList';
import TaskList from './components/tasks/TaskList';
import CommissionList from './components/commissions/CommissionList';
import SettingsPage from './components/settings/SettingsPage';
import ActivityLogPage from './components/activity/ActivityLogPage';
import ReportsPage from './components/reports/ReportsPage';
import LoanStatus from './components/loans/LoanStatus';
import AgentPortfolio from './components/customers/AgentPortfolio';

function App() {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <ToastProvider>
        <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public-only routes — redirect authenticated users to /dashboard */}
            <Route path="/login" element={
              <PublicOnlyRoute><LoginForm /></PublicOnlyRoute>
            } />
            <Route path="/register" element={
              <PublicOnlyRoute><RegisterForm /></PublicOnlyRoute>
            } />
            <Route path="/forgot-password" element={
              <PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>
            } />

            {/* Protected routes inside DashboardLayout */}
            <Route path="/" element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardRouter />} />
              <Route path="users" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <UserManagement />
                </ProtectedRoute>
              } />
              <Route path="customers" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <CustomerList />
                </ProtectedRoute>
              } />
              <Route path="portfolio" element={
                <ProtectedRoute allowedRoles={['agent']}>
                  <AgentPortfolio />
                </ProtectedRoute>
              } />
              <Route path="transactions" element={<TransactionList />} />
              <Route path="loans" element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <LoanStatus />
                </ProtectedRoute>
              } />
              <Route path="tasks" element={
                <ProtectedRoute allowedRoles={['admin', 'staff', 'agent']}>
                  <TaskList />
                </ProtectedRoute>
              } />
              <Route path="commissions" element={
                <ProtectedRoute allowedRoles={['admin', 'agent']}>
                  <CommissionList />
                </ProtectedRoute>
              } />
              <Route path="activity" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ActivityLogPage />
                </ProtectedRoute>
              } />
              <Route path="reports" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <ReportsPage />
                </ProtectedRoute>
              } />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
    </SettingsProvider>
  );
}

export default App;
