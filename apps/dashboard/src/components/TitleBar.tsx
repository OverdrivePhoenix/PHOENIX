import React from 'react';
import { DynamicIsland } from './DynamicIsland';

interface TitleBarProps {
  currentProjectName: string;
  currentBranch: string;
  jarvisStatus: string;
  isEmergencyPaused: boolean;
  onEmergencyPauseToggle: () => void;
  onOpenJarvisModal: () => void;
  onOpenLiveVoice?: () => void;
  onOpenDynamicIslandSuite?: () => void;
  pendingApproval?: {
    id: string;
    action: string;
    risk_level: string;
    token: string;
  } | null;
  activeAgent?: string;
  dailySpend?: number;
  onApproveAction?: (id: string, token: string) => void;
  onDenyAction?: (id: string, token: string) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  currentProjectName,
  currentBranch,
  jarvisStatus,
  isEmergencyPaused,
  onEmergencyPauseToggle,
  onOpenJarvisModal,
  onOpenLiveVoice,
  onOpenDynamicIslandSuite,
  pendingApproval,
  activeAgent = 'SWE-03 · Run',
  dailySpend = 18.42,
  onApproveAction,
  onDenyAction
}) => {
  return (
    <header className="titlebar-drag-region h-11 w-full bg-surface-container-lowest border-b border-outline-variant/30 flex items-center justify-between px-3 z-50 text-xs font-mono relative overflow-visible">
      {/* Left: Window Branding & Title */}
      <div className="flex items-center gap-3 titlebar-no-drag">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-primary/20 text-primary font-bold flex items-center justify-center text-[11px] border border-primary/40">
            P
          </span>
          <span className="font-semibold text-on-surface tracking-wider">PHOENIX</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-outline">DESKTOP v1.0</span>
        </div>

        <div className="h-3 w-[1px] bg-outline-variant/40" />

        <div className="flex items-center gap-1.5 text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px] text-outline">folder</span>
          <span className="text-on-surface font-medium">{currentProjectName || 'Canteen App'}</span>
        </div>

        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container text-primary text-[11px]">
          <span className="material-symbols-outlined text-[13px]">alt_route</span>
          <span>{currentBranch || 'feat/checkout-flow'}</span>
        </div>
      </div>

      {/* Center: Morphing Desktop Top-Notch Dynamic Island */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 pt-0.5 titlebar-no-drag z-50 overflow-visible">
        <DynamicIsland
          activeAgent={activeAgent}
          pendingApproval={pendingApproval}
          dailySpend={dailySpend}
          isEmergencyPaused={isEmergencyPaused}
          onApproveAction={onApproveAction}
          onDenyAction={onDenyAction}
          onOpenVoice={onOpenLiveVoice || onOpenJarvisModal}
          onOpenFullApp={onOpenDynamicIslandSuite}
        />
      </div>

      {/* Right: Emergency Pause & Window Controls */}
      <div className="flex items-center gap-2 titlebar-no-drag">
        <button
          onClick={onEmergencyPauseToggle}
          className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
            isEmergencyPaused
              ? 'bg-error text-surface font-bold animate-pulse'
              : 'bg-surface-container-high hover:bg-error/20 text-error border border-error/30'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {isEmergencyPaused ? 'play_arrow' : 'pause_circle'}
          </span>
          <span>{isEmergencyPaused ? 'RESUME EXECUTION' : 'EMERGENCY PAUSE'}</span>
        </button>

        <div className="h-3 w-[1px] bg-outline-variant/40 mx-1" />

        {/* Window action buttons */}
        <div className="flex items-center gap-1 text-outline">
          <button
            onClick={onOpenDynamicIslandSuite}
            className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-outline hover:text-primary text-[10px] font-mono flex items-center gap-1"
            title="Open Dynamic Island Specimen Suite"
          >
            <span className="material-symbols-outlined text-[12px]">view_agenda</span>
            <span>Suite</span>
          </button>
          <button
            className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high rounded text-outline hover:text-on-surface"
            title="Minimize to Tray"
          >
            <span className="material-symbols-outlined text-[14px]">remove</span>
          </button>
          <button
            className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high rounded text-outline hover:text-on-surface"
            title="Maximize"
          >
            <span className="material-symbols-outlined text-[13px]">crop_square</span>
          </button>
          <button
            className="w-6 h-6 flex items-center justify-center hover:bg-error hover:text-surface rounded text-outline"
            title="Close to System Tray"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      </div>
    </header>
  );
};
