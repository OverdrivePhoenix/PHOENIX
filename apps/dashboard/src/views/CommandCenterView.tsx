import React from 'react';
import HalftoneReveal from '../components/HalftoneReveal';

interface CommandCenterViewProps {
  currentProject: any;
  tasks: any[];
  agents: any[];
  approvals: any[];
  executionLogs: any[];
  dailySpend: number;
  sessionUptime: string;
  onApproveAction: (approvalId: string, token: string) => void;
  onDenyAction: (approvalId: string, token: string) => void;
  onTriggerPlanModal: () => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  currentProject,
  tasks,
  agents,
  approvals,
  executionLogs,
  dailySpend,
  sessionUptime,
  onApproveAction,
  onDenyAction,
  onTriggerPlanModal
}) => {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const activeTask = tasks.find((t) => t.status === 'in_progress') || tasks[0] || {
    title: 'Stripe Webhook & Idempotency Key Storage',
    feature_branch: 'feat/checkout-flow',
    description: 'Autonomous worker executing local tests in Docker sandbox.'
  };

  const blockedTasks = tasks.filter((t) => t.status === 'blocked');
  const activeAgentsCount = agents.filter((a) => a.status === 'running' || a.status === 'active').length || 3;

  return (
    <div className="flex-1 h-[calc(100vh-2.5rem)] overflow-y-auto bg-[#0a0c10] p-6 flex flex-col gap-6 font-sans">
      {/* Top Telemetry & Health Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#12151b] border border-white/[0.08] shadow-md backdrop-blur-sm">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white tracking-tight">
                {currentProject?.name || 'College Canteen App'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-white/50 font-mono mt-0.5">
              Branch: <span className="text-primary font-medium">{activeTask.feature_branch || 'main'}</span> · Workstation: OMEN-16 (RTX-5060)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs font-mono">
          <div className="bg-white/[0.03] px-3.5 py-2 rounded-xl border border-white/[0.06]">
            <div className="flex items-center justify-between gap-3 text-white/50 text-[10px] uppercase font-semibold">
              <span>Daily API Budget</span>
              <span className="text-white font-bold">${dailySpend.toFixed(2)} / $50.00</span>
            </div>
            <div className="w-36 h-1.5 bg-white/10 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (dailySpend / 50.0) * 100)}%` }}
              />
            </div>
          </div>

          <div className="hidden sm:flex flex-col text-right">
            <span className="text-white/40 text-[10px] uppercase font-semibold">Session Uptime</span>
            <span className="text-white font-medium">{sessionUptime}</span>
          </div>

          <button
            onClick={onTriggerPlanModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container transition-all shadow-md active:scale-95"
          >
            <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
            <span>Plan Milestone</span>
          </button>
        </div>
      </div>

      {/* 4-Card Fleet Status Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Task */}
        <div className="p-4 rounded-2xl bg-[#12151b] border border-white/[0.08] shadow-sm flex flex-col justify-between hover:border-white/20 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 font-semibold">Active Task</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-mono text-[10px] font-semibold flex items-center gap-1.5 border border-emerald-400/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> RUNNING
            </span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white/95 truncate">{activeTask.title}</h4>
            <p className="text-xs text-white/40 font-mono mt-1 truncate">{activeTask.feature_branch || 'feat/active'}</p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/40">
            <span>Docker Runner</span>
            <span className="text-primary font-medium">68% Done</span>
          </div>
        </div>

        {/* Card 2: Active Agents */}
        <div className="p-4 rounded-2xl bg-[#12151b] border border-white/[0.08] shadow-sm flex flex-col justify-between hover:border-white/20 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 font-semibold">Agent Fleet</span>
            <span className="text-xs font-mono font-bold text-white/90">6 Configured</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-mono font-medium border border-primary/20">SWE: Active</span>
            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-mono font-medium border border-primary/20">QA: Active</span>
            <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-white/40 text-[10px] font-mono">Sec: Idle</span>
            <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-white/40 text-[10px] font-mono">DevOps: Idle</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/40">
            <span>Threads: 12</span>
            <span className="text-white/80">RTX-5060</span>
          </div>
        </div>

        {/* Card 3: Blocked Tasks */}
        <div className="p-4 rounded-2xl bg-[#12151b] border border-white/[0.08] shadow-sm flex flex-col justify-between hover:border-white/20 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 font-semibold">Blocked Tasks</span>
            <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
              blockedTasks.length > 0
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'bg-white/[0.04] text-white/40'
            }`}>
              {blockedTasks.length} BLOCKED
            </span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white/95 truncate">
              {blockedTasks[0]?.title || 'Zero active pipeline blockers'}
            </h4>
            <p className="text-xs text-white/40 mt-1 font-mono">
              {blockedTasks.length > 0 ? 'Max retry limit reached' : 'Clean test execution pass'}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/40">
            <span>QA Pass Rate</span>
            <span className="text-white/80 font-medium">96.4%</span>
          </div>
        </div>

        {/* Card 4: Pending Approvals */}
        <div className="p-4 rounded-2xl bg-[#12151b] border border-white/[0.08] shadow-sm flex flex-col justify-between hover:border-white/20 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 font-semibold">Human Control</span>
            <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
              pendingApprovals.length > 0
                ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30 animate-pulse'
                : 'bg-white/[0.04] text-white/40'
            }`}>
              {pendingApprovals.length} PENDING
            </span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white/95 truncate">
              {pendingApprovals[0]?.action || 'No operations awaiting authorization'}
            </h4>
            <p className="text-xs text-white/40 mt-1 font-mono">
              Risk Level: <span className="text-amber-400 font-bold">{pendingApprovals[0]?.risk_level?.toUpperCase() || 'NONE'}</span>
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/40">
            <span>Zero-Trust Gate</span>
            <span className="text-emerald-400 font-medium">Enforced</span>
          </div>
        </div>
      </div>

      {/* Hardware Telemetry Halftone Canvas */}
      <div className="p-4 rounded-2xl bg-[#12151b] border border-white/[0.08] shadow-sm flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="material-symbols-outlined text-[16px] text-primary">memory</span>
            <span>WORKSTATION CLUSTER & DOCKER RUNNER TELEMETRY</span>
          </div>
          <span className="text-[11px] text-white/40">Hover dots to inspect hardware architecture</span>
        </div>

        <div className="relative w-full h-44 rounded-xl bg-black/40 overflow-hidden border border-white/[0.06]">
          <HalftoneReveal
            src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1400&auto=format&fit=crop"
            mode="duotone"
            shape="dot"
            cellSize={6}
            angle={45}
            inkColor="#adc6ff"
            accentColor="#df7412"
            paperColor="#0c0e11"
            revealRadius={150}
            softness={0.5}
            wander={true}
            clickBurst={true}
          />
          <div className="absolute bottom-2 left-3 pointer-events-none text-[11px] font-mono text-white/80 bg-black/70 px-2.5 py-1 rounded-lg border border-white/10 backdrop-blur-md">
            NODE: HP OMEN 16 // NVIDIA RTX 5060 (8GB VRAM) // 16 CORES // DOCKER DAEMON SANDBOXED
          </div>
        </div>
      </div>

      {/* Split Execution View: Terminal Logs & Pending Action Approval */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Real-time Terminal Log Feed */}
        <div className="lg:col-span-2 p-4 rounded-2xl bg-[#12151b] border border-white/[0.08] shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
            <div className="flex items-center gap-2 text-xs font-mono text-white">
              <span className="material-symbols-outlined text-[16px] text-primary">terminal</span>
              <span className="font-semibold">CONTAINER TERMINAL & TEST RUNNER FEED</span>
            </div>
            <span className="text-[10px] font-mono text-white/40">AUTO-STREAMING // FIRESTORE SYNC</span>
          </div>

          <div className="h-64 overflow-y-auto font-mono text-xs text-white/70 flex flex-col gap-1.5 p-3.5 rounded-xl bg-black/40 border border-white/[0.06]">
            {executionLogs.length === 0 ? (
              <div className="text-white/40 italic">Waiting for incoming agent tool executions...</div>
            ) : (
              executionLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-white/40 text-[10px] shrink-0 mt-0.5">{log.created_at?.slice(11, 19)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 ${
                    log.level === 'warn' ? 'bg-amber-500/20 text-amber-300' :
                    log.level === 'error' ? 'bg-red-500/20 text-red-300' :
                    'bg-white/[0.06] text-primary'
                  }`}>
                    {log.agent_id}
                  </span>
                  <span className="text-white/90">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1 Col: Pending Approval Card */}
        <div className="p-4 rounded-2xl bg-[#12151b] border border-white/[0.08] shadow-sm flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 font-semibold">
              <span className="material-symbols-outlined text-[16px]">gavel</span>
              <span>PENDING AUTHORIZATION</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-400/10 text-amber-400 font-bold border border-amber-400/20">
              ZERO-TRUST GATE
            </span>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white/40 text-xs">
              <span className="material-symbols-outlined text-[36px] text-primary/30 mb-2">verified_user</span>
              <p className="font-medium text-white/60">No operations awaiting human sign-off.</p>
              <p className="text-[10px] mt-1 text-white/40">Autonomous fleet is operating within pre-approved guardrails.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {pendingApprovals[0].risk_level.toUpperCase()} RISK
                </span>
                <h4 className="text-sm font-semibold text-white mt-2">
                  {pendingApprovals[0].action}
                </h4>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                  {pendingApprovals[0].rationale}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] font-mono text-[11px] text-white/50 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span>Rollback Plan:</span>
                  <span className="text-white/80 text-right">{pendingApprovals[0].rollback_plan}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => onApproveAction(pendingApprovals[0].id, pendingApprovals[0].approval_token)}
                  className="flex-1 py-2 px-3 rounded-xl bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container transition-all shadow-md active:scale-95"
                >
                  Approve (1-Click)
                </button>
                <button
                  onClick={() => onDenyAction(pendingApprovals[0].id, pendingApprovals[0].approval_token)}
                  className="py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white text-xs transition-colors"
                >
                  Deny
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
