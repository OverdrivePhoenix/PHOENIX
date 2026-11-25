import React from 'react';
import { API_BASE } from '../lib/liveApi';

interface TitleBarProps {
  currentProjectName?: string | null;
  currentBranch?: string | null;
  needAttention?: number;
  projectsTracked?: number;
  isEmergencyPaused: boolean;
  onEmergencyPauseToggle: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  currentProjectName,
  currentBranch,
  needAttention = 0,
  projectsTracked = 0,
  isEmergencyPaused,
  onEmergencyPauseToggle
}) => {
  const projectLabel = currentProjectName || 'No active project';
  const branchLabel = currentBranch || '—';

  return (
    <header className="h-12 w-full bg-[#0A0A0B] border-b border-white/[0.08] flex items-center justify-between gap-6 px-6 shrink-0 select-none">
      {/* Left: Wordmark + Project + Branch */}
      <div className="flex items-center gap-4 min-w-0">
        <span
          className="font-display text-[18px] tracking-[0.08em] text-[#F2F2F2] whitespace-nowrap shrink-0"
          title="Project PHOENIX"
        >
          PHOENIX
        </span>

        <span className="h-3.5 w-px bg-white/[0.08] shrink-0" />

        <span
          className="text-[13px] font-medium text-[#F2F2F2] truncate min-w-0"
          title={projectLabel}
        >
          {projectLabel}
        </span>

        <span
          className="text-[11px] font-mono text-[#8A8A8E] px-2 py-0.5 border border-white/[0.08] rounded-[4px] bg-[#111113] whitespace-nowrap truncate max-w-[180px]"
          title={branchLabel}
        >
          {branchLabel}
        </span>
      </div>

      {/* Right: Live Attention Readout + Overlay Toggle + Emergency Pause */}
      <div className="flex items-center gap-4 shrink-0">
        <button
          onClick={() => {
            fetch(`${API_BASE}/overlay/toggle`, { method: 'POST' }).catch(() => {});
          }}
          className="flex items-center gap-2.5 px-2.5 py-1 border border-white/[0.08] rounded-[4px] bg-[#111113] hover:border-white/[0.20] transition-colors duration-150"
          title="Toggle Top-Center Dynamic Notch Overlay"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isEmergencyPaused || needAttention > 0 ? 'bg-[#FF3B30]' : 'bg-[#F2F2F2]'
            }`}
          />
          <span className="text-[11px] font-mono text-[#F2F2F2] tabular-nums whitespace-nowrap">
            {projectsTracked} tracked
          </span>
          <span className="h-2.5 w-px bg-white/[0.08]" />
          <span
            className={`text-[11px] font-mono tabular-nums whitespace-nowrap ${
              needAttention > 0 ? 'text-[#FF3B30]' : 'text-[#8A8A8E]'
            }`}
          >
            {needAttention} attention
          </span>
        </button>

        <button
          onClick={onEmergencyPauseToggle}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-[11px] font-mono uppercase tracking-wider whitespace-nowrap transition-colors duration-150 ${
            isEmergencyPaused
              ? 'bg-[#FF3B30] text-[#0A0A0B] font-semibold'
              : 'bg-[#111113] text-[#FF3B30] border border-[#FF3B30]/40 hover:bg-[#FF3B30]/10'
          }`}
          title={isEmergencyPaused ? 'Resume autonomous fleet' : 'Emergency pause all agents'}
        >
          <span className="material-symbols-outlined text-[14px]">
            {isEmergencyPaused ? 'play_arrow' : 'pause'}
          </span>
          <span>{isEmergencyPaused ? 'RESUME' : 'EMERGENCY PAUSE'}</span>
        </button>
      </div>
    </header>
  );
};
