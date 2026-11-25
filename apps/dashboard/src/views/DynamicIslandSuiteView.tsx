import React, { useState } from 'react';
import { DynamicIsland, IslandState } from '../components/DynamicIsland';

interface DynamicIslandSuiteViewProps {
  currentProjectName?: string;
  dailySpend?: number;
  onApproveAction?: (id: string, token: string) => void;
  onDenyAction?: (id: string, token: string) => void;
  onOpenVoice?: () => void;
}

export const DynamicIslandSuiteView: React.FC<DynamicIslandSuiteViewProps> = ({
  currentProjectName = 'No active project',
  dailySpend = 0,
  onApproveAction,
  onDenyAction,
  onOpenVoice,
}) => {
  const [selectedState, setSelectedState] = useState<IslandState>('idle');
  const [canvasTheme, setCanvasTheme] = useState<'midnight' | 'studio'>('midnight');

  const mockApproval = {
    id: 'appr-gate-8921',
    action: 'Cloud Resource: Deploy to Prod',
    risk_level: 'high',
    token: 'phx_token_gate_8921_verified',
  };

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-2.5rem)] bg-surface-container-lowest text-on-surface select-none font-sans p-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-8 pb-16">
        {/* Top Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-black border border-white/20 flex items-center justify-center shadow-sm">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Dynamic Island{' '}
                <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-mono tracking-wider font-semibold">
                  Specimen Suite
                </span>
              </h1>
              <p className="text-xs text-outline">
                Tactile matte capsules, live telemetry cards, and multi-state desktop notch widgets
              </p>
            </div>
          </div>

          {/* Canvas Theme Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-surface-container p-1 rounded-full border border-outline-variant/30 text-xs font-mono">
              <button
                onClick={() => setCanvasTheme('studio')}
                className={`px-3 py-1 rounded-full transition-all ${
                  canvasTheme === 'studio'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-outline hover:text-white'
                }`}
              >
                Studio Canvas
              </button>
              <button
                onClick={() => setCanvasTheme('midnight')}
                className={`px-3 py-1 rounded-full transition-all ${
                  canvasTheme === 'midnight'
                    ? 'bg-surface-container-highest text-primary font-semibold shadow-sm'
                    : 'text-outline hover:text-white'
                }`}
              >
                Midnight Notch
              </button>
            </div>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* SECTION 1: LIVE INTERACTIVE RIG & DESKTOP TOP-NOTCH SIMULATION           */}
        {/* ========================================================================= */}
        <section className="flex flex-col items-center gap-4">
          <div className="text-center">
            <span className="text-[10px] font-mono tracking-widest text-outline uppercase">
              Interactive Live Rig · Top-Notch Desktop Simulation
            </span>
          </div>

          <div
            className={`relative w-full max-w-4xl h-[340px] rounded-3xl border border-outline-variant/40 p-6 flex flex-col items-center justify-between shadow-2xl overflow-hidden transition-all duration-300 ${
              canvasTheme === 'studio'
                ? 'bg-neutral-800/80 border-neutral-600'
                : 'bg-black/90 border-outline-variant/20'
            }`}
          >
            {/* Wallpaper Gradient Mesh Backdrop */}
            <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-600 via-indigo-900 to-transparent" />

            {/* Fake Desktop Top-Bar Context */}
            <div className="w-full flex items-center justify-between text-[11px] font-mono text-outline select-none px-2 z-10">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>PHOENIX TOP NOTCH · HP OMEN 16</span>
              </div>
              <div className="flex items-center gap-3">
                <span>RTX-5060: IDLE (42°C)</span>
                <span>DOCKER: SANDBOXED</span>
              </div>
            </div>

            {/* Center: Live Interactive Dynamic Island */}
            <div className="z-20 pt-2">
              <DynamicIsland
                activeAgent="SWE-03 · Run"
                pendingApproval={mockApproval}
                dailySpend={dailySpend}
                onApproveAction={onApproveAction}
                onDenyAction={onDenyAction}
                onOpenVoice={onOpenVoice}
                initialState={selectedState}
              />
            </div>

            {/* State Selector Pills Bar */}
            <div className="z-10 flex flex-wrap items-center justify-center gap-2 p-1.5 bg-surface-container/80 backdrop-blur-md rounded-full border border-outline-variant/30 shadow-md">
              <button
                onClick={() => setSelectedState('idle')}
                className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                  selectedState === 'idle'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-outline hover:text-white'
                }`}
              >
                Compact Notch
              </button>
              <button
                onClick={() => setSelectedState('gate')}
                className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                  selectedState === 'gate'
                    ? 'bg-amber-400 text-black font-semibold shadow-sm'
                    : 'text-outline hover:text-white'
                }`}
              >
                HITL Gate #8921
              </button>
              <button
                onClick={() => setSelectedState('voice')}
                className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                  selectedState === 'voice'
                    ? 'bg-blue-400 text-black font-semibold shadow-sm'
                    : 'text-outline hover:text-white'
                }`}
              >
                Voice Butler
              </button>
              <button
                onClick={() => setSelectedState('music')}
                className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                  selectedState === 'music'
                    ? 'bg-rose-400 text-black font-semibold shadow-sm'
                    : 'text-outline hover:text-white'
                }`}
              >
                Milestone Cockpit
              </button>
              <button
                onClick={() => setSelectedState('finance')}
                className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                  selectedState === 'finance'
                    ? 'bg-emerald-400 text-black font-semibold shadow-sm'
                    : 'text-outline hover:text-white'
                }`}
              >
                Token Telemetry
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 2: SPECIMEN CATALOG & DIMENSIONS GRID                            */}
        {/* ========================================================================= */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Specimen Catalog & Dimensions
              </h2>
              <p className="text-xs text-outline">
                Synchronized with Stitch Project 2205262784469173850 specifications
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Specimen 1: Autonomous HITL Gate */}
            <div className="flex flex-col items-center p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 gap-3">
              <div className="text-[11px] font-mono text-outline flex items-center justify-between w-full">
                <span>01 · Autonomous HITL Gate</span>
                <span className="text-primary font-bold">348 × 62 px</span>
              </div>
              <div className="w-full max-w-[350px] h-[62px] bg-black text-white rounded-full px-4 flex items-center justify-between shadow-island border border-amber-500/30">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center animate-pulse">
                    <span className="material-symbols-outlined text-[16px]">gavel</span>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-amber-400 tracking-wider uppercase font-bold">
                      Gate #8921
                    </div>
                    <div className="text-xs font-semibold text-white tracking-tight">
                      Deploy to Prod?
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-neutral-800 text-neutral-400">
                    Reject
                  </span>
                  <span className="px-3.5 py-1 text-xs font-semibold rounded-full bg-amber-500 text-black font-mono shadow-[0_0_12px_rgba(245,158,11,0.5)]">
                    Approve
                  </span>
                </div>
              </div>
            </div>

            {/* Specimen 2: Live Voice Recording & Waveform */}
            <div className="flex flex-col items-center p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 gap-3">
              <div className="text-[11px] font-mono text-outline flex items-center justify-between w-full">
                <span>02 · Live Voice Recording</span>
                <span className="text-primary font-bold">270 × 44 px</span>
              </div>
              <div className="w-full max-w-[270px] h-[44px] bg-black text-white rounded-full px-4 flex items-center justify-between shadow-island border border-white/10">
                <div className="flex items-center space-x-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                  <div className="flex items-center space-x-1">
                    <span className="w-0.5 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="w-0.5 h-4 bg-orange-400 rounded-full" />
                    <span className="w-0.5 h-5 bg-red-500 rounded-full" />
                    <span className="w-0.5 h-3 bg-red-400 rounded-full" />
                    <span className="w-0.5 h-4 bg-orange-500 rounded-full" />
                    <span className="w-0.5 h-2 bg-red-500 rounded-full" />
                  </div>
                </div>
                <span className="text-xs font-mono text-red-400 font-semibold tracking-wider">
                  01:20
                </span>
              </div>
            </div>

            {/* Specimen 3: Compact Running Agent Notch */}
            <div className="flex flex-col items-center p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 gap-3">
              <div className="text-[11px] font-mono text-outline flex items-center justify-between w-full">
                <span>03 · Active Worker Notch</span>
                <span className="text-primary font-bold">220 × 38 px</span>
              </div>
              <div className="w-full max-w-[220px] h-[38px] bg-black text-white rounded-full px-4 flex items-center justify-between shadow-island border border-white/10">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium tracking-tight">SWE-03 · Run</span>
                </div>
                <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-mono">
                  <span className="equalizer-bar-1 w-0.5 bg-emerald-400 rounded-full inline-block" />
                  <span className="equalizer-bar-2 w-0.5 bg-emerald-400 rounded-full inline-block" />
                  <span className="equalizer-bar-3 w-0.5 bg-emerald-400 rounded-full inline-block" />
                  <span className="ml-1 text-[11px] text-neutral-400">98%</span>
                </div>
              </div>
            </div>

            {/* Specimen 4: Token Telemetry & Spend Card */}
            <div className="flex flex-col items-center p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 gap-3">
              <div className="text-[11px] font-mono text-outline flex items-center justify-between w-full">
                <span>04 · Daily API Spend Telemetry</span>
                <span className="text-primary font-bold">350 × 160 px</span>
              </div>
              <div className="w-full max-w-[350px] h-[160px] bg-black text-white rounded-3xl p-4 flex flex-col justify-between shadow-island border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-primary font-bold text-base leading-none">PX</span>
                    <div>
                      <span className="text-[9px] font-mono text-neutral-400 block">AI-ORCH</span>
                      <span className="text-xs font-bold text-white">Daily Spend</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-400">updated 2m ago</span>
                </div>
                <div className="flex items-baseline space-x-2 my-1">
                  <span className="text-2xl font-bold font-mono">${dailySpend.toFixed(2)}</span>
                  <span className="text-xs font-mono text-emerald-400">+1.24% burn</span>
                </div>
                <div className="w-full h-9">
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
                      d="M 0,22 Q 40,24 60,18 T 100,28 T 130,36 T 150,22 T 180,18 T 210,12 T 240,16 T 280,10 T 300,14"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Specimen 5: Milestone Cockpit Card */}
            <div className="flex flex-col items-center p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 gap-3">
              <div className="text-[11px] font-mono text-outline flex items-center justify-between w-full">
                <span>05 · Milestone Execution Cockpit</span>
                <span className="text-primary font-bold">360 × 148 px</span>
              </div>
              <div className="w-full max-w-[360px] h-[148px] bg-black text-white rounded-3xl p-4 flex flex-col justify-between shadow-island border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-500 shadow-md flex items-center justify-center font-bold text-xs text-white">
                      GL
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold tracking-tight text-white leading-tight">
                        Glow · Echo
                      </h4>
                      <p className="text-xs text-neutral-400">Autonomous Runner</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-800">
                    <span className="w-1 h-3 bg-rose-500 rounded-full animate-bounce" />
                    <span className="w-1 h-4 bg-rose-400 rounded-full animate-pulse" />
                    <span className="w-1 h-2 bg-rose-500 rounded-full" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full w-[42%]" />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                    <span>1:20</span>
                    <span>-2:15</span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 pt-1">
                  <span className="text-[11px] font-mono text-neutral-400">Step 3 / 8</span>
                  <span className="text-[11px] font-mono text-emerald-400">Executing...</span>
                </div>
              </div>
            </div>

            {/* Specimen 6: Airdrop / Artifact Sync Ring */}
            <div className="flex flex-col items-center p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 gap-3">
              <div className="text-[11px] font-mono text-outline flex items-center justify-between w-full">
                <span>06 · Code Artifact Sync Ring</span>
                <span className="text-primary font-bold">290 × 52 px</span>
              </div>
              <div className="w-full max-w-[290px] h-[52px] bg-black text-white rounded-full px-4 flex items-center justify-between shadow-island border border-white/10">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                    <span className="material-symbols-outlined text-[16px]">sync</span>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-neutral-400 uppercase">Artifact</div>
                    <div className="text-xs font-semibold text-white">Docker Image Sync</div>
                  </div>
                </div>
                <div className="text-xs font-mono text-primary font-semibold">100%</div>
              </div>
            </div>
          </div>
        </section>

        {/* Dynamic Island DNA & Motion Curves Note */}
        <section className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <h4 className="font-bold text-white uppercase tracking-wider mb-2 font-mono text-xs">
              Dynamic Island DNA
            </h4>
            <p className="text-outline text-xs leading-relaxed">
              Engineered with zero-trust security gating. High-risk actions automatically wake the
              desktop island with an amber pulsing glow, allowing instant approval or rejection from
              the top notch while the heavy Command Center window rests in the Windows System Tray.
            </p>
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-white uppercase tracking-wider mb-2 font-mono text-xs">
              Motion Physics & Bezier
            </h4>
            <p className="text-outline text-xs leading-relaxed font-mono">
              transition: all 0.48s cubic-bezier(0.16, 1, 0.3, 1);<br />
              Hardware accelerated: will-change width, height, border-radius, transform.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
