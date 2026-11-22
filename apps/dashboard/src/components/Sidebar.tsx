import React from 'react';

export type ViewType = 'command-center' | 'live-voice' | 'dynamic-island' | 'approvals' | 'agents' | 'projects' | 'settings' | 'activity';

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
    { id: 'dynamic-island', label: 'Dynamic Island', icon: 'view_agenda' },
    { id: 'live-voice', label: 'Live Voice', icon: 'graphic_eq' },
    { id: 'approvals', label: 'Approvals', icon: 'gavel', badge: pendingApprovalsCount },
    { id: 'agents', label: 'Agents', icon: 'smart_toy' },
    { id: 'projects', label: 'Projects', icon: 'folder_open' },
    { id: 'settings', label: 'Settings', icon: 'tune' },
    { id: 'activity', label: 'Activity', icon: 'receipt_long' },
  ];

  return (
    <aside className="w-56 h-[calc(100vh-2.5rem)] bg-surface-container-low border-r border-outline-variant/30 flex flex-col justify-between py-3 select-none shrink-0 font-sans">
      <div className="flex flex-col gap-1 px-2">
        <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-outline">
          Navigation
        </div>

        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? 'bg-surface-container-high text-primary font-medium border-l-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-primary' : 'text-outline'}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-tertiary-container/40 text-tertiary border border-tertiary/40">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Workstation & Sandbox Hardware Status Card */}
      <div className="px-3 pt-3 border-t border-outline-variant/20 flex flex-col gap-2 font-mono text-[11px]">
        <div className="p-2 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-outline text-[10px] uppercase">
            <span>Workstation Node</span>
            <span className="flex items-center gap-1 text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              ONLINE
            </span>
          </div>

          <div className="text-on-surface font-semibold truncate text-[11px]">
            HP Omen 16 // RTX-5060
          </div>

          <div className="flex items-center justify-between text-outline text-[10px]">
            <span>Docker Engine:</span>
            <span className="text-on-surface-variant">Sandboxed</span>
          </div>

          <div className="flex items-center justify-between text-outline text-[10px]">
            <span>Database:</span>
            <span className="text-primary">Firestore</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-outline text-[10px] px-1">
          <span className="material-symbols-outlined text-[13px] text-primary">verified_user</span>
          <span>Zero-Trust Policy Active</span>
        </div>
      </div>
    </aside>
  );
};
