import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './auth';

// Route-level code splitting: each page ships as its own chunk so the initial
// bundle stays small. Lazy imports also keep page-specific deps (solana, WebRTC
// glue) out of the critical path.
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const DealCreatePage = lazy(() => import('./pages/DealCreatePage').then(m => ({ default: m.DealCreatePage })));
const LiveRoomPage = lazy(() => import('./pages/LiveRoomPage').then(m => ({ default: m.LiveRoomPage })));
const DisputePage = lazy(() => import('./pages/DisputePage').then(m => ({ default: m.DisputePage })));
const JoinDealPage = lazy(() => import('./pages/JoinDealPage').then(m => ({ default: m.JoinDealPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading page">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500"></div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <RouteFallback />;
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deals/create"
          element={
            <ProtectedRoute>
              <DealCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deals/:id/live"
          element={
            <ProtectedRoute>
              <LiveRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deals/:id/join"
          element={
            <ProtectedRoute>
              <JoinDealPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/join"
          element={
            <ProtectedRoute>
              <JoinDealPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/disputes/:dealId"
          element={
            <ProtectedRoute>
              <DisputePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
