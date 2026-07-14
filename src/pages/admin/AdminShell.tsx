import { AdminLayout } from './AdminLayout';

type AdminShellProps = {
  title: string;
};

export function AdminShell({ title }: AdminShellProps) {
  return (
    <AdminLayout title={title}>
      <section className="admin-placeholder" aria-label={`${title} 状态`}>
        <p>该模块尚未开放，将在后续阶段实现。</p>
      </section>
    </AdminLayout>
  );
}
