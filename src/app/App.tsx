import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { installGlobalErrorCapture } from '../features/diagnostics/errorLog';

installGlobalErrorCapture();

const DisplayPage = lazy(() => import('../pages/display/DisplayPage').then((module) => ({ default: module.DisplayPage })));
const AdminDashboardPage = lazy(() =>
  import('../pages/admin/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage })),
);
const AdminDiagnosticsPage = lazy(() =>
  import('../pages/admin/AdminDiagnosticsPage').then((module) => ({ default: module.AdminDiagnosticsPage })),
);
const AdminEventPage = lazy(() =>
  import('../pages/admin/AdminEventPage').then((module) => ({ default: module.AdminEventPage })),
);
const AdminPacingPage = lazy(() =>
  import('../pages/admin/AdminPacingPage').then((module) => ({ default: module.AdminPacingPage })),
);
const AdminPrizesPage = lazy(() =>
  import('../pages/admin/AdminPrizesPage').then((module) => ({ default: module.AdminPrizesPage })),
);
const AdminRecordsPage = lazy(() =>
  import('../pages/admin/AdminRecordsPage').then((module) => ({ default: module.AdminRecordsPage })),
);
const AdminShell = lazy(() => import('../pages/admin/AdminShell').then((module) => ({ default: module.AdminShell })));
const AdminSystemPage = lazy(() =>
  import('../pages/admin/AdminSystemPage').then((module) => ({ default: module.AdminSystemPage })),
);

export function App() {
  const Router = isDesktopRuntime() ? HashRouter : BrowserRouter;

  return (
    <Router>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/display" replace />} />
          <Route path="/display" element={<DisplayPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/event" element={<AdminEventPage />} />
          <Route path="/admin/prizes" element={<AdminPrizesPage />} />
          <Route path="/admin/pacing" element={<AdminPacingPage />} />
          <Route path="/admin/rules" element={<AdminShell title="规则" />} />
          <Route path="/admin/participants" element={<AdminShell title="参与者" />} />
          <Route path="/admin/records" element={<AdminRecordsPage />} />
          <Route path="/admin/system" element={<AdminSystemPage />} />
          <Route path="/diagnostics" element={<AdminDiagnosticsPage />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.protocol === 'file:' || Boolean(window.signalHuntDesktop);
}

function RouteLoadingFallback() {
  return (
    <main className="route-loading" aria-label="页面加载中">
      正在加载...
    </main>
  );
}
