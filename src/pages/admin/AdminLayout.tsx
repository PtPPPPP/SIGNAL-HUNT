import { useEffect, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { NavLink } from 'react-router-dom';

import { StatusBadge } from '../../components/ui/AdminUI';
import { ReturnToDisplayButton } from '../../components/ui/ReturnToDisplayButton';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { BrandMark } from '../../features/brand/BrandMark';
import {
  readSystemReadiness,
  type SystemReadiness,
} from '../../features/admin/systemReadiness';

type AdminLayoutProps = {
  title: string;
  eyebrow?: string;
  hasUnsavedChanges?: boolean;
  db?: SignalHuntDatabase;
  children: ReactNode;
};

const navGroups = [
  {
    label: '概览',
    items: [{ to: '/admin/dashboard', label: '控制台概览', icon: '概' }],
  },
  {
    label: '展会运营',
    items: [
      { to: '/admin/event', label: '活动管理', icon: '活' },
      { to: '/admin/prizes', label: '奖品管理', icon: '奖' },
      { to: '/admin/pacing', label: '概率策略', icon: '%' },
      { to: '/admin/records', label: '抽奖记录', icon: '录' },
    ],
  },
  {
    label: '现场操作',
    items: [
      { to: '/staff', label: '工作人员操作', icon: '员' },
      { to: '/diagnostics', label: '系统诊断', icon: '诊' },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/admin/system', label: '系统设置', icon: '设' },
    ],
  },
];

export function AdminLayout({
  title,
  eyebrow = 'Quantum Design 展会控制中心',
  hasUnsavedChanges = false,
  db = signalHuntDatabase,
  children,
}: AdminLayoutProps) {
  const [currentTime, setCurrentTime] = useState(() => formatTime(new Date()));
  const [readiness, setReadiness] = useState<SystemReadiness>({
    label: '状态未检查',
    tone: 'neutral',
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(formatTime(new Date())), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const subscription = liveQuery(() => readSystemReadiness(db)).subscribe({
      next: (next) =>
        setReadiness((current) =>
          current.label === next.label && current.tone === next.tone ? current : next,
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
            <span>展会控制中心</span>
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
          <div className="admin-topbar-heading">
            <ReturnToDisplayButton hasUnsavedChanges={hasUnsavedChanges} />
            <p>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="admin-topbar-status" aria-label="系统状态">
            <div>
              <span>运行模式</span>
              <StatusBadge tone="neutral">离线模式</StatusBadge>
            </div>
            <div>
              <span>系统状态</span>
              <StatusBadge tone={readiness.tone}>{readiness.label}</StatusBadge>
            </div>
            <div>
              <span>本地时间</span>
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
