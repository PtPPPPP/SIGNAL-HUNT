import { BrandMark } from '../../features/brand/BrandMark';

type AdminShellProps = {
  title: string;
};

export function AdminShell({ title }: AdminShellProps) {
  return (
    <main className="admin-shell">
      <header>
        <BrandMark variant="on-light" />
        <h1>{title}</h1>
      </header>
      <section className="admin-placeholder" aria-label={`${title} 状态`}>
        <p>该模块尚未开放，将在后续阶段实现。</p>
      </section>
    </main>
  );
}
