import React from 'react';

export type ViewType = 'command-center' | 'approvals' | 'agents' | 'projects' | 'activity' | 'settings';

interface SidebarProps {
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  pendingApprovalsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  pendingApprovalsCount
}) => {
  const navItems: { id: ViewType; label: string; icon: string; badge?: number }[] = [
    { id: 'command-center', label: 'Command Center', icon: 'dashboard' },
    { id: 'approvals', label: 'Approvals', icon: 'gavel', badge: pendingApprovalsCount },
    { id: 'agents', label: 'Agents', icon: 'smart_toy' },
    { id: 'projects', label: 'Projects', icon: 'folder_open' },
    { id: 'activity', label: 'Activity', icon: 'receipt_long' },
    { id: 'settings', label: 'Settings', icon: 'tune' }
  ];

  return (
    <aside className="w-56 h-[calc(100vh-3rem)] bg-[#0A0A0B] border-r border-white/[0.08] flex flex-col justify-between py-6 select-none shrink-0 font-sans">
      <div className="flex flex-col">
        <div className="px-6 pb-3 text-[11px] font-mono uppercase tracking-[0.08em] text-[#55555A] whitespace-nowrap">
          Navigation
        </div>

        <nav className="flex flex-col">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`h-10 px-6 flex items-center justify-between text-[13px] transition-colors duration-150 border-l-2 ${
                  isActive
                    ? 'border-[#F2F2F2] text-[#F2F2F2] font-medium'
                    : 'border-transparent text-[#8A8A8E] hover:text-[#F2F2F2]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`material-symbols-outlined text-[18px] shrink-0 ${
                      isActive ? 'text-[#F2F2F2]' : 'text-[#55555A]'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate whitespace-nowrap" title={item.label}>
                    {item.label}
                  </span>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 rounded-[4px] text-[11px] font-mono tabular-nums font-semibold bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/35 shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Node Status (1px hairline, no color clutter) */}
      <div className="px-6 pt-4 border-t border-white/[0.08] flex flex-col gap-2 font-mono text-[11px]">
        <div className="flex items-center justify-between text-[#55555A] uppercase">
          <span className="whitespace-nowrap">Node</span>
          <span className="flex items-center gap-1.5 text-[#F2F2F2] whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F2F2F2]" />
            ONLINE
          </span>
        </div>
        <div className="text-[#8A8A8E] truncate whitespace-nowrap" title="HP Omen 16 // RTX-5060">
          OMEN-16 · RTX-5060
        </div>
        <div className="text-[#55555A] truncate whitespace-nowrap" title="Zero-Trust Policy Enforced">
          ZERO-TRUST ENFORCED
        </div>
      </div>
    </aside>
  );
};
