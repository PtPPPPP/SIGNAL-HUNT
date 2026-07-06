import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

import { BrandMark } from '../../features/brand/BrandMark';

type AdminLayoutProps = {
  title: string;
  children: ReactNode;
};

const navItems = [
  { to: '/admin/dashboard', label: '仪表盘' },
  { to: '/admin/prizes', label: '奖品' },
  { to: '/admin/records', label: '记录' },
  { to: '/admin/system', label: '系统' },
];

export function AdminLayout({ title, children }: AdminLayoutProps) {
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar" aria-label="后台导航">
        <BrandMark variant="on-light" />
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className="admin-nav-link">
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="admin-workspace">
        <header>
          <h1>{title}</h1>
        </header>
        {children}
      </section>
    </main>
  );
}
