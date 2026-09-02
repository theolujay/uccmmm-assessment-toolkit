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
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Routes><Route path="/" element={<Navigate to="/sign-in" replace />} /><Route path="/sign-in" element={<SignInPage />} /><Route path="/sign-up" element={<SignUpPage />} /><Route element={<AppShell />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/assessment" element={<AssessmentPage />} /><Route path="/results" element={<ResultsPage />} /><Route path="/recommendations" element={<RecommendationsPage />} /><Route path="/reports" element={<ReportsPage />} /></Route><Route element={<AppShell role="admin" />}><Route path="/admin" element={<AdminDashboardPage />} /><Route path="/stakeholders" element={<StakeholdersPage />} /><Route path="/admin/reports" element={<ReportsPage />} /></Route></Routes></BrowserRouter></StrictMode>);
