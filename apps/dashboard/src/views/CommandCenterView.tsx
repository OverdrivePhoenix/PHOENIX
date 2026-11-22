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
    <div className="flex-1 h-[calc(100vh-2.5rem)] overflow-y-auto bg-surface-container-lowest p-5 flex flex-col gap-5 font-sans">
      {/* Top Telemetry & Health Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-surface-container-low border border-outline-variant/30">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <div>
            <h2 className="text-base font-semibold text-on-surface">
              {currentProject?.name || 'College Canteen App'}
            </h2>
            <p className="text-xs text-outline font-mono">
              Branch: <span className="text-primary">{activeTask.feature_branch || 'main'}</span> · Workstation: OMEN-16 (RTX-5060)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs font-mono">
          <div>
            <div className="flex items-center justify-between gap-2 text-outline text-[11px]">
              <span>DAILY API BUDGET</span>
              <span className="text-on-surface font-bold">${dailySpend.toFixed(2)} / $50.00</span>
            </div>
            <div className="w-40 h-1.5 bg-surface-container-highest rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, (dailySpend / 50.0) * 100)}%` }}
              />
            </div>
          </div>

          <div className="hidden sm:flex flex-col text-right">
            <span className="text-outline text-[10px] uppercase">Session Uptime</span>
            <span className="text-on-surface font-medium">{sessionUptime}</span>
          </div>

          <button
            onClick={onTriggerPlanModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-on-primary font-medium text-xs hover:bg-primary-container transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
            <span>Plan Milestone</span>
          </button>
        </div>
      </div>

      {/* 4-Card Fleet Status Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Task */}
        <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase text-outline">Active Task</span>
            <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono text-[10px] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> RUNNING
            </span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-on-surface truncate">{activeTask.title}</h4>
            <p className="text-xs text-outline font-mono mt-1 truncate">{activeTask.feature_branch || 'feat/active'}</p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-xs font-mono text-outline">
            <span>Docker Runner</span>
            <span className="text-primary">68% Done</span>
          </div>
        </div>

        {/* Card 2: Active Agents */}
        <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase text-outline">Agent Fleet</span>
            <span className="text-xs font-mono font-bold text-on-surface">6 Configured</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-mono">SWE: Active</span>
            <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-mono">QA: Active</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-outline text-[10px] font-mono">Sec: Idle</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-outline text-[10px] font-mono">DevOps: Idle</span>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-xs font-mono text-outline">
            <span>Assigned Threads: 12</span>
            <span className="text-on-surface">RTX-5060</span>
          </div>
        </div>

        {/* Card 3: Blocked Tasks */}
        <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase text-outline">Blocked Tasks</span>
            <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
              blockedTasks.length > 0 ? 'bg-tertiary-container/30 text-tertiary' : 'bg-surface-container text-outline'
            }`}>
              {blockedTasks.length} BLOCKED
            </span>
          </div>
          <div>
            <h4 className="text-sm font-medium text-on-surface truncate">
              {blockedTasks[0]?.title || 'Zero active pipeline blockers'}
            </h4>
            <p className="text-xs text-outline mt-1 font-mono">
              {blockedTasks.length > 0 ? 'Max retry limit reached' : 'Clean test execution pass'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-xs font-mono text-outline">
            <span>QA Pass Rate</span>
            <span className="text-on-surface">96.4%</span>
          </div>
        </div>

        {/* Card 4: Pending Approvals */}
        <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase text-outline">Human Control</span>
            <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
              pendingApprovals.length > 0 ? 'bg-error-container/30 text-error animate-pulse' : 'bg-surface-container text-outline'
            }`}>
              {pendingApprovals.length} PENDING
            </span>
          </div>
          <div>
            <h4 className="text-sm font-medium text-on-surface truncate">
              {pendingApprovals[0]?.action || 'No operations awaiting authorization'}
            </h4>
            <p className="text-xs text-outline mt-1 font-mono">
              Risk Level: <span className="text-error font-bold">{pendingApprovals[0]?.risk_level?.toUpperCase() || 'NONE'}</span>
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-xs font-mono text-outline">
            <span>Zero-Trust Gate</span>
            <span className="text-primary">Enforced</span>
          </div>
        </div>
      </div>

      {/* Hardware Telemetry Halftone Canvas */}
      <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-on-surface font-semibold">
            <span className="material-symbols-outlined text-[16px] text-primary">memory</span>
            <span>WORKSTATION CLUSTER & DOCKER RUNNER TELEMETRY</span>
          </div>
          <span className="text-[11px] text-outline">Hover dots to inspect hardware architecture</span>
        </div>

        <div className="relative w-full h-44 rounded bg-surface-container-lowest overflow-hidden border border-outline-variant/20">
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
          <div className="absolute bottom-2 left-3 pointer-events-none text-[11px] font-mono text-on-surface/80 bg-surface-container-lowest/80 px-2 py-0.5 rounded border border-outline-variant/30 backdrop-blur-sm">
            NODE: HP OMEN 16 // NVIDIA RTX 5060 (8GB VRAM) // 16 CORES // DOCKER DAEMON SANDBOXED
          </div>
        </div>
      </div>

      {/* Split Execution View: Terminal Logs & Pending Action Approval */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Real-time Terminal Log Feed */}
        <div className="lg:col-span-2 p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
            <div className="flex items-center gap-2 text-xs font-mono text-on-surface">
              <span className="material-symbols-outlined text-[16px] text-primary">terminal</span>
              <span className="font-semibold">CONTAINER TERMINAL & TEST RUNNER FEED</span>
            </div>
            <span className="text-[10px] font-mono text-outline">AUTO-STREAMING // FIRESTORE SYNC</span>
          </div>

          <div className="h-64 overflow-y-auto font-mono text-xs text-on-surface-variant flex flex-col gap-1.5 p-3 rounded bg-surface-container-lowest border border-outline-variant/20">
            {executionLogs.length === 0 ? (
              <div className="text-outline italic">Waiting for incoming agent tool executions...</div>
            ) : (
              executionLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-outline text-[10px] shrink-0 mt-0.5">{log.created_at?.slice(11, 19)}</span>
                  <span className={`px-1 py-0.2 rounded text-[10px] uppercase font-bold shrink-0 ${
                    log.level === 'warn' ? 'bg-tertiary-container/30 text-tertiary' :
                    log.level === 'error' ? 'bg-error-container/30 text-error' :
                    'bg-surface-container text-primary'
                  }`}>
                    {log.agent_id}
                  </span>
                  <span className="text-on-surface">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1 Col: Pending Approval Card */}
        <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-mono text-error font-semibold">
              <span className="material-symbols-outlined text-[16px]">gavel</span>
              <span>PENDING AUTHORIZATION</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-error-container/30 text-error font-bold">
              ZERO-TRUST GATE
            </span>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-outline text-xs">
              <span className="material-symbols-outlined text-[32px] text-primary/40 mb-2">verified_user</span>
              <p>No high-risk operations awaiting human sign-off.</p>
              <p className="text-[10px] mt-1">Autonomous fleet is operating within pre-approved guardrails.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-error-container/40 text-error">
                  {pendingApprovals[0].risk_level.toUpperCase()} RISK
                </span>
                <h4 className="text-sm font-semibold text-on-surface mt-1.5">
                  {pendingApprovals[0].action}
                </h4>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  {pendingApprovals[0].rationale}
                </p>
              </div>

              <div className="p-2.5 rounded bg-surface-container font-mono text-[11px] text-outline flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span>Rollback Plan:</span>
                  <span className="text-on-surface text-right">{pendingApprovals[0].rollback_plan}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => onApproveAction(pendingApprovals[0].id, pendingApprovals[0].approval_token)}
                  className="flex-1 py-2 px-3 rounded bg-primary text-on-primary font-medium text-xs hover:bg-primary-container transition-colors shadow-sm"
                >
                  Approve (1-Click)
                </button>
                <button
                  onClick={() => onDenyAction(pendingApprovals[0].id, pendingApprovals[0].approval_token)}
                  className="py-2 px-3 rounded bg-surface-container hover:bg-surface-container-high text-outline hover:text-on-surface text-xs transition-colors"
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
