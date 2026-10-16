import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { SignInPage } from './pages/SignInPage';
import { AppShell } from './components/AppShell';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AssessmentPage } from './pages/AssessmentPage';
import { ResultsPage } from './pages/ResultsPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { StakeholdersPage } from './pages/StakeholdersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SignUpPage } from './pages/SignUpPage';
import { AuthProvider } from './auth/AuthProvider';
import { RequireRole } from './components/RequireRole';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import './styles.css';
import './assessment.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><BrowserRouter><Routes>
  <Route path="/" element={<Navigate to="/sign-in" replace />} />
  <Route path="/sign-in" element={<SignInPage />} />
  <Route path="/sign-up" element={<SignUpPage />} />
  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
  <Route path="/reset-password" element={<ResetPasswordPage />} />
  <Route element={<RequireRole role="stakeholder"><AppShell /></RequireRole>}>
    <Route path="/dashboard" element={<DashboardPage />} />
  </Route>
  <Route element={<RequireRole><AppShell /></RequireRole>}>
    <Route path="/assessment" element={<AssessmentPage />} />
    <Route path="/results" element={<ResultsPage />} />
  </Route>
  <Route element={<RequireRole role="admin"><AppShell /></RequireRole>}>
    <Route path="/admin" element={<AdminDashboardPage />} />
    <Route path="/stakeholders" element={<StakeholdersPage />} />
    <Route path="/recommendations" element={<RecommendationsPage />} />
    <Route path="/reports" element={<ReportsPage />} />
    <Route path="/settings" element={<AccountSettingsPage />} />
  </Route>
</Routes></BrowserRouter></AuthProvider></StrictMode>);
