import { AdminLayout } from './AdminLayout';

export function AdminSystemPage() {
  return (
    <AdminLayout title="系统">
      <section className="admin-placeholder" aria-label="系统状态">
        <p>数据库结构版本：1</p>
        <p>奖项 JSON 导入请在「奖品」页面操作。</p>
      </section>
    </AdminLayout>
  );
}
