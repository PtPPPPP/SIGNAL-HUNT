import { useEffect, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { StatusBadge } from '../../components/ui/AdminUI';
import { ReturnToDisplayButton } from '../../components/ui/ReturnToDisplayButton';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { BrandMark } from '../../features/brand/BrandMark';
import {
  readSystemReadiness,
  type SystemReadiness,
} from '../../features/admin/systemReadiness';
import './admin.css';
import './admin-pages.css';

type AdminLayoutProps = {
  title: string;
  eyebrow?: string;
  hasUnsavedChanges?: boolean;
  db?: SignalHuntDatabase;
  children: ReactNode;
};

const navGroups = [
  {
    label: '运营',
    items: [
      { to: '/admin/dashboard', label: '概览', code: 'OV' },
      { to: '/admin/event', label: '活动配置', code: 'EV' },
      { to: '/admin/prizes', label: '奖池管理', code: 'PR' },
      { to: '/admin/pacing', label: '发放策略', code: 'PC' },
      { to: '/admin/records', label: '抽奖记录', code: 'RC' },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/admin/system#backup', label: '备份恢复', code: 'BK' },
      { to: '/diagnostics', label: '运行诊断', code: 'DG' },
      { to: '/admin/system#window', label: '窗口设置', code: 'WN' },
    ],
  },
] as const;

export function AdminLayout({
  title,
  eyebrow = 'Quantum Design · 活动运营工作台',
  hasUnsavedChanges = false,
  db = signalHuntDatabase,
  children,
}: AdminLayoutProps) {
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(() => formatTime(new Date()));
  const [readiness, setReadiness] = useState<SystemReadiness>({
    label: '状态未检查',
    tone: 'neutral',
  });

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setCurrentTime(formatTime(new Date())),
      30_000,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const subscription = liveQuery(() => readSystemReadiness(db)).subscribe({
      next: (next) =>
        setReadiness((current) =>
          current.label === next.label && current.tone === next.tone
            ? current
            : next,
        ),
      error: () => setReadiness({ label: '数据库异常', tone: 'danger' }),
    });

    return () => subscription.unsubscribe();
  }, [db]);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar" aria-label="后台导航">
        <div className="admin-sidebar-brand">
          <BrandMark variant="on-light" />
          <div>
            <strong>SIGNAL HUNT</strong>
            <span>运营工作台</span>
          </div>
        </div>

        <nav className="admin-nav">
          {navGroups.map((group) => (
            <section className="admin-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const [pathname, hash = ''] = item.to.split('#');
                const isAnchorItem = Boolean(hash);
                const isAnchorActive =
                  isAnchorItem &&
                  location.pathname === pathname &&
                  (location.hash === `#${hash}` ||
                    (!location.hash && hash === 'window'));

                return isAnchorItem ? (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`admin-nav-link${isAnchorActive ? ' active' : ''}`}
                  >
                    <span className="admin-nav-code" aria-hidden="true">
                      {item.code}
                    </span>
                    {item.label}
                  </Link>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      `admin-nav-link${isActive ? ' active' : ''}`
                    }
                  >
                    <span className="admin-nav-code" aria-hidden="true">
                      {item.code}
                    </span>
                    {item.label}
                  </NavLink>
                );
              })}
            </section>
          ))}
        </nav>

        <footer className="admin-sidebar-footer">
          <StatusBadge tone={readiness.tone}>{readiness.label}</StatusBadge>
          <span>本机离线运行</span>
        </footer>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar-heading">
            <p>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="admin-topbar-actions">
            <div className="admin-topbar-status" aria-label="系统状态">
              <span>本地时间</span>
              <strong>{currentTime}</strong>
              <StatusBadge tone="neutral">离线模式</StatusBadge>
            </div>
            <ReturnToDisplayButton hasUnsavedChanges={hasUnsavedChanges} />
          </div>
        </header>
        <div className="admin-page-content">{children}</div>
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
