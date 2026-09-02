import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { SignInPage } from './pages/SignInPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Routes><Route path="/" element={<Navigate to="/sign-in" replace />} /><Route path="/sign-in" element={<SignInPage />} /><Route path="/dashboard" element={<DashboardPage />} /></Routes></BrowserRouter></StrictMode>);
