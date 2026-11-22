import React, { useState, useEffect } from 'react';

export type IslandState = 'idle' | 'gate' | 'voice' | 'finance' | 'music';

interface DynamicIslandProps {
  activeAgent?: string;
  pendingApproval?: {
    id: string;
    action: string;
    risk_level: string;
    token: string;
  } | null;
  dailySpend?: number;
  sessionUptime?: string;
  isEmergencyPaused?: boolean;
  onApproveAction?: (id: string, token: string) => void;
  onDenyAction?: (id: string, token: string) => void;
  onOpenVoice?: () => void;
  onOpenFullApp?: () => void;
  initialState?: IslandState;
  standalone?: boolean;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  activeAgent = 'SWE-03 · Run',
  pendingApproval,
  dailySpend = 18.42,
  sessionUptime = '06h 42m',
  isEmergencyPaused = false,
  onApproveAction,
  onDenyAction,
  onOpenVoice,
  onOpenFullApp,
  initialState = 'idle',
  standalone = false,
}) => {
  const [state, setState] = useState<IslandState>(initialState);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-escalate to 'gate' state if there is a pending approval
  useEffect(() => {
    if (pendingApproval) {
      setState('gate');
    }
  }, [pendingApproval?.id]);

  const stateDimensions: Record<
    IslandState,
    { width: string; height: string; radius: string }
  > = {
    idle: { width: '220px', height: '38px', radius: '9999px' },
    gate: { width: '350px', height: '62px', radius: '9999px' },
    voice: { width: '310px', height: '58px', radius: '9999px' },
    finance: { width: '350px', height: '160px', radius: '32px' },
    music: { width: '360px', height: '148px', radius: '34px' },
  };

  const currentDim = stateDimensions[state];

  return (
    <div className="flex flex-col items-center select-none font-sans z-50">
      {/* Morphing Dynamic Island Matte Capsule */}
      <div
        className="island-morph bg-black text-white shadow-island border border-white/10 px-4 py-2 relative flex items-center justify-between overflow-hidden cursor-pointer backdrop-blur-2xl"
        style={{
          width: currentDim.width,
          height: currentDim.height,
          borderRadius: currentDim.radius,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Subtle ambient interior border highlight */}
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none border border-white/5 shadow-island-ambient" />

        {/* ================= STATE 1: IDLE / COMPACT NOTCH ================= */}
        {state === 'idle' && (
          <div
            className="w-full h-full flex items-center justify-between animate-fadeIn z-10"
            onClick={() => setState(pendingApproval ? 'gate' : 'music')}
            title="Click to expand dynamic island"
          >
            <div className="flex items-center space-x-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isEmergencyPaused
                    ? 'bg-amber-500'
                    : 'bg-emerald-500 animate-pulse'
                }`}
              />
              <span className="text-xs font-medium tracking-tight text-white/90">
                {isEmergencyPaused ? 'FLEET · PAUSED' : activeAgent}
              </span>
            </div>

            <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-mono">
              <span className="equalizer-bar-1 w-0.5 bg-emerald-400 rounded-full inline-block" />
              <span className="equalizer-bar-2 w-0.5 bg-emerald-400 rounded-full inline-block" />
              <span className="equalizer-bar-3 w-0.5 bg-emerald-400 rounded-full inline-block" />
              <span className="ml-1 text-[11px] text-neutral-400">98%</span>
            </div>
          </div>
        )}

        {/* ================= STATE 2: HITL APPROVAL GATE ================= */}
        {state === 'gate' && (
          <div className="w-full h-full flex items-center justify-between animate-fadeIn z-10">
            <div
              className="flex items-center space-x-3 cursor-pointer"
              onClick={() => onOpenFullApp && onOpenFullApp()}
            >
              <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center animate-pulse shrink-0 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                <span className="material-symbols-outlined text-[16px]">gavel</span>
              </div>
              <div className="truncate max-w-[150px]">
                <div className="text-[9px] font-mono text-amber-400 tracking-wider uppercase font-bold">
                  Gate #{pendingApproval?.id?.slice(-4) || '8921'}
                </div>
                <div className="text-xs font-semibold text-white tracking-tight truncate">
                  {pendingApproval?.action || 'Deploy to Prod?'}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (pendingApproval && onDenyAction) {
                    onDenyAction(pendingApproval.id, pendingApproval.token);
                  }
                  setState('idle');
                }}
                className="px-3 py-1 text-xs font-semibold rounded-full bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors cursor-pointer"
              >
                Reject
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (pendingApproval && onApproveAction) {
                    onApproveAction(pendingApproval.id, pendingApproval.token);
                  }
                  setState('idle');
                }}
                className="px-3.5 py-1 text-xs font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-black font-mono transition-colors shadow-[0_0_12px_rgba(245,158,11,0.5)] cursor-pointer"
              >
                Approve
              </button>
            </div>
          </div>
        )}

        {/* ================= STATE 3: J.A.R.V.I.S. VOICE CALL ================= */}
        {state === 'voice' && (
          <div className="w-full h-full flex items-center justify-between animate-fadeIn z-10">
            <div
              className="flex items-center space-x-2.5 cursor-pointer"
              onClick={onOpenVoice}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-500 to-amber-400 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-md">
                JV
              </div>
              <div>
                <div className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
                  Live Voice Butler
                </div>
                <div className="text-xs font-semibold text-white">J.A.R.V.I.S. Live</div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-800">
                <span className="w-1 h-3 bg-blue-500 rounded-full animate-bounce" />
                <span className="w-1 h-4 bg-sky-400 rounded-full animate-pulse" />
                <span className="w-1 h-2 bg-blue-500 rounded-full" />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setState('idle');
                }}
                className="w-7 h-7 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-colors cursor-pointer"
                title="End voice session"
              >
                <span className="material-symbols-outlined text-[13px]">call_end</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= STATE 4: TOKEN TELEMETRY & SPEND ================= */}
        {state === 'finance' && (
          <div className="w-full h-full flex flex-col justify-between py-1 animate-fadeIn z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 rounded-md bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">
                  PX
                </div>
                <div>
                  <span className="text-[9px] font-mono text-neutral-400 block uppercase">
                    AI Fleet Telemetry
                  </span>
                  <span className="text-xs font-bold text-white">Daily Cloud Spend</span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setState('idle');
                }}
                className="text-[10px] font-mono text-neutral-400 hover:text-white"
              >
                collapse ✕
              </button>
            </div>

            <div className="flex items-baseline space-x-2 my-1">
              <span className="text-2xl font-bold font-mono text-white">
                ${dailySpend.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-emerald-400">+1.24% budget</span>
            </div>

            <div className="w-full h-10">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 40">
                <line
                  x1="0"
                  y1="20"
                  x2="300"
                  y2="20"
                  stroke="rgba(255,255,255,0.15)"
                  strokeDasharray="2 3"
                  strokeWidth="1"
                />
                <path
                  d="M 0,24 Q 40,26 60,18 T 100,28 T 130,36 T 150,20 T 180,18 T 210,12 T 240,16 T 280,10 T 300,14"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        )}

        {/* ================= STATE 5: MILESTONE EXECUTION COCKPIT ================= */}
        {state === 'music' && (
          <div className="w-full h-full flex flex-col justify-between py-1 animate-fadeIn z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-500 shadow-md flex items-center justify-center font-bold text-xs text-white">
                  GL
                </div>
                <div>
                  <h4 className="text-xs font-semibold tracking-tight text-white leading-tight">
                    Glow · Sprint Cycle
                  </h4>
                  <p className="text-[10px] text-neutral-400">Checkout Flow Milestone</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-800">
                  <span className="w-1 h-3 bg-rose-500 rounded-full animate-bounce" />
                  <span className="w-1 h-4 bg-rose-400 rounded-full animate-pulse" />
                  <span className="w-1 h-2 bg-rose-500 rounded-full" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setState('idle');
                  }}
                  className="text-neutral-400 hover:text-white text-xs p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full w-[42%]" />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                <span>Task 4 / 9 Active</span>
                <span>42% complete</span>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setState('finance');
                }}
                className="text-neutral-400 hover:text-white text-xs font-mono"
                title="View Spend"
              >
                Telemetry
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenFullApp) onOpenFullApp();
                }}
                className="px-3 py-0.5 rounded-full bg-white text-black font-semibold text-[11px] hover:bg-neutral-200 transition-colors"
              >
                Open Dashboard
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setState('gate');
                }}
                className="text-amber-400 hover:text-amber-300 text-xs font-mono"
                title="View Gates"
              >
                Gates
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating State Mini-Switcher (shows on hover or when expanded) */}
      {(isHovered || state !== 'idle') && (
        <div className="mt-2 flex items-center gap-1.5 p-1 bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg animate-fadeIn text-[10px] font-mono">
          <button
            onClick={() => setState('idle')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              state === 'idle'
                ? 'bg-white text-black font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Compact
          </button>
          <button
            onClick={() => setState('gate')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              state === 'gate'
                ? 'bg-amber-400 text-black font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            HITL Gate
          </button>
          <button
            onClick={() => setState('voice')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              state === 'voice'
                ? 'bg-blue-400 text-black font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Voice
          </button>
          <button
            onClick={() => setState('music')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              state === 'music'
                ? 'bg-rose-400 text-black font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Cockpit
          </button>
          <button
            onClick={() => setState('finance')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              state === 'finance'
                ? 'bg-emerald-400 text-black font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Spend
          </button>
          {onOpenFullApp && (
            <button
              onClick={onOpenFullApp}
              className="px-2 py-0.5 rounded-full bg-primary/20 text-primary hover:bg-primary/30 flex items-center gap-0.5"
              title="Open full Command Center"
            >
              <span className="material-symbols-outlined text-[11px]">open_in_new</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
