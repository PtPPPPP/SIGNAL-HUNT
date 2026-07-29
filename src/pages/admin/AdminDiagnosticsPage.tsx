import { useLocation } from 'react-router-dom';

import {
  signalHuntDatabase,
  type SignalHuntDatabase,
} from '../../db/database';
import { DiagnosticsView } from '../../features/admin/diagnostics/DiagnosticsView';
import { useDiagnosticsViewModel } from '../../features/admin/diagnostics/useDiagnosticsViewModel';
import { AdminLayout } from './AdminLayout';

type AdminDiagnosticsPageProps = {
  db?: SignalHuntDatabase;
};

export function AdminDiagnosticsPage({
  db = signalHuntDatabase,
}: AdminDiagnosticsPageProps) {
  const location = useLocation();
  const viewModel = useDiagnosticsViewModel(db, location.pathname);

  return (
    <AdminLayout title="运行诊断" db={db}>
      <DiagnosticsView {...viewModel} />
    </AdminLayout>
  );
}
