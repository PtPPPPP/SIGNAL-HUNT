import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminPrizesPage } from '../pages/admin/AdminPrizesPage';
import { AdminRecordsPage } from '../pages/admin/AdminRecordsPage';
import { AdminShell } from '../pages/admin/AdminShell';
import { AdminSystemPage } from '../pages/admin/AdminSystemPage';
import { DisplayPage } from '../pages/display/DisplayPage';
import { StaffPage } from '../pages/staff/StaffPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/display" replace />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/event" element={<AdminShell title="活动" />} />
        <Route path="/admin/prizes" element={<AdminPrizesPage />} />
        <Route path="/admin/rules" element={<AdminShell title="规则" />} />
        <Route path="/admin/participants" element={<AdminShell title="参与者" />} />
        <Route path="/admin/records" element={<AdminRecordsPage />} />
        <Route path="/admin/appearance" element={<AdminShell title="外观" />} />
        <Route path="/admin/system" element={<AdminSystemPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/diagnostics" element={<AdminShell title="诊断" />} />
      </Routes>
    </BrowserRouter>
  );
}
