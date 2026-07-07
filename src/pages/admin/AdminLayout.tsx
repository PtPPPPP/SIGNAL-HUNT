import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { StatusBadge } from '../../components/ui/AdminUI';
import { BrandMark } from '../../features/brand/BrandMark';

type AdminLayoutProps = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
};

const navGroups = [
  {
    label: 'Overview',
    items: [{ to: '/admin/dashboard', label: 'Dashboard', icon: 'D' }],
  },
  {
    label: 'Exhibition',
    items: [
      { to: '/admin/event', label: 'Activities', icon: 'A' },
      { to: '/admin/prizes', label: 'Prizes', icon: 'P' },
      { to: '/admin/pacing', label: 'Prize Pacing', icon: 'W' },
      { to: '/admin/records', label: 'Records', icon: 'R' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/staff', label: 'Staff', icon: 'S' },
      { to: '/diagnostics', label: 'Diagnostics', icon: 'X' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/appearance', label: 'Appearance', icon: 'V' },
      { to: '/admin/system', label: 'Settings', icon: 'C' },
    ],
  },
];

export function AdminLayout({ title, eyebrow = 'Quantum Design Exhibition Control Center', children }: AdminLayoutProps) {
  const [currentTime, setCurrentTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(formatTime(new Date())), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar" aria-label="后台导航">
        <div className="admin-sidebar-brand">
          <BrandMark variant="on-light" />
          <div>
            <strong>SIGNAL HUNT</strong>
            <span>Exhibition Control</span>
          </div>
        </div>

        <nav className="admin-nav">
          {navGroups.map((group) => (
            <section className="admin-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
                >
                  <span className="admin-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="admin-topbar-status" aria-label="系统状态">
            <div>
              <span>MODE</span>
              <StatusBadge tone="neutral">OFFLINE MODE</StatusBadge>
            </div>
            <div>
              <span>SYSTEM</span>
              <StatusBadge tone="success">READY</StatusBadge>
            </div>
            <div>
              <span>LOCAL TIME</span>
              <strong>{currentTime}</strong>
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
