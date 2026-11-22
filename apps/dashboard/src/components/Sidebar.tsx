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
    <aside className="w-60 h-[calc(100vh-2.5rem)] bg-[#0d1015] border-r border-white/[0.08] flex flex-col justify-between py-4 select-none shrink-0 font-sans">
      <div className="flex flex-col gap-1.5 px-3">
        <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-white/40 font-semibold">
          Fleet Navigation
        </div>

        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all ${
                isActive
                  ? 'bg-primary/15 text-primary font-semibold shadow-sm border border-primary/25'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined text-[19px] ${isActive ? 'text-primary' : 'text-white/40'}`}>
                  {item.icon}
                </span>
                <span className="tracking-tight">{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Workstation & Sandbox Hardware Status Card */}
      <div className="px-3 pt-3 border-t border-white/[0.06] flex flex-col gap-2.5 font-mono text-[11px]">
        <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex flex-col gap-2 shadow-inner">
          <div className="flex items-center justify-between text-white/40 text-[10px] uppercase font-semibold">
            <span>Workstation Node</span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE
            </span>
          </div>

          <div className="text-white font-semibold truncate text-[11px]">
            HP Omen 16 // RTX-5060
          </div>

          <div className="flex items-center justify-between text-white/40 text-[10px]">
            <span>Docker Engine:</span>
            <span className="text-white/80 font-medium">Sandboxed</span>
          </div>

          <div className="flex items-center justify-between text-white/40 text-[10px]">
            <span>Database:</span>
            <span className="text-primary font-medium">Firestore</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-white/40 text-[10px] px-1">
          <span className="material-symbols-outlined text-[14px] text-emerald-400">verified_user</span>
          <span>Zero-Trust Policy Active</span>
        </div>
      </div>
    </aside>
  );
};
