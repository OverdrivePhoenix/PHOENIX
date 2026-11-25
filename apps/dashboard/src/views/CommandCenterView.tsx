import React from 'react';

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
  sessionUptime,
  onTriggerPlanModal
}) => {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const activeTask = tasks.find((t) => t.status === 'in_progress') || tasks[0] || {
    title: 'Stripe Webhook & Idempotency',
    feature_branch: 'feat/checkout-flow'
  };
  const blockedTasks = tasks.filter((t) => t.status === 'blocked');
  const activeAgentsCount = agents.filter((a) => a.status === 'running' || a.status === 'active').length;
  const totalAgentsCount = agents.length || 6;

  return (
    <div className="flex-1 h-[calc(100vh-3rem)] overflow-y-auto bg-[#0A0A0B] p-8 flex flex-col gap-8 font-sans text-[#F2F2F2]">
      {/* Section Header: Title + Single Primary Action */}
      <div className="flex items-center justify-between gap-6 pb-4 border-b border-white/[0.08]">
        <div className="min-w-0">
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E] whitespace-nowrap truncate">
            Command Center
          </h1>
          <p
            className="text-[11px] font-mono text-[#55555A] mt-1 whitespace-nowrap truncate tabular-nums"
            title={`${currentProject?.name || 'College Canteen App'} · Uptime ${sessionUptime}`}
          >
            {currentProject?.name || 'College Canteen App'} · UPTIME {sessionUptime}
          </p>
        </div>

        <button
          onClick={onTriggerPlanModal}
          className="px-4 py-2 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] text-[13px] font-medium whitespace-nowrap shrink-0 hover:bg-white transition-colors duration-150"
        >
          Plan Milestone
        </button>
      </div>

      {/* 4 Numbers: Single Row Separated by Vertical Hairlines */}
      <section className="grid grid-cols-4 bg-[#111113] border border-white/[0.08] rounded-[4px] divide-x divide-white/[0.08]">
        {/* 1. Active Task */}
        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span
            className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate"
            title="ACTIVE TASK"
          >
            ACTIVE TASK
          </span>
          <span
            className="font-display text-[32px] leading-none text-[#F2F2F2] tabular-nums whitespace-nowrap"
            title="1 Active Task"
          >
            01
          </span>
          <span
            className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate"
            title={activeTask.title}
          >
            {activeTask.title}
          </span>
        </div>

        {/* 2. Fleet */}
        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span
            className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate"
            title="FLEET"
          >
            FLEET
          </span>
          <span
            className="font-display text-[32px] leading-none text-[#F2F2F2] tabular-nums whitespace-nowrap"
            title={`${activeAgentsCount || 2} active of ${totalAgentsCount} agents`}
          >
            {String(activeAgentsCount || 2).padStart(2, '0')}/{String(totalAgentsCount).padStart(2, '0')}
          </span>
          <span
            className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate"
            title="SWE · QA ACTIVE"
          >
            SWE · QA ACTIVE
          </span>
        </div>

        {/* 3. Blocked */}
        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span
            className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate"
            title="BLOCKED"
          >
            BLOCKED
          </span>
          <span
            className={`font-display text-[32px] leading-none tabular-nums whitespace-nowrap ${
              blockedTasks.length > 0 ? 'text-[#FF3B30]' : 'text-[#F2F2F2]'
            }`}
            title={`${blockedTasks.length} blocked tasks`}
          >
            {String(blockedTasks.length).padStart(2, '0')}
          </span>
          <span
            className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate"
            title={blockedTasks[0]?.title || 'PIPELINE CLEAR'}
          >
            {blockedTasks[0]?.title || 'PIPELINE CLEAR'}
          </span>
        </div>

        {/* 4. Approvals */}
        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span
            className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate"
            title="APPROVALS"
          >
            APPROVALS
          </span>
          <span
            className={`font-display text-[32px] leading-none tabular-nums whitespace-nowrap ${
              pendingApprovals.length > 0 ? 'text-[#FF3B30]' : 'text-[#F2F2F2]'
            }`}
            title={`${pendingApprovals.length} pending approvals`}
          >
            {String(pendingApprovals.length).padStart(2, '0')}
          </span>
          <span
            className={`text-[11px] font-mono whitespace-nowrap truncate ${
              pendingApprovals.length > 0 ? 'text-[#FF3B30]' : 'text-[#55555A]'
            }`}
            title={pendingApprovals[0]?.action || 'ZERO-TRUST CLEAR'}
          >
            {pendingApprovals[0]?.action || 'ZERO-TRUST CLEAR'}
          </span>
        </div>
      </section>

      {/* ONE Live Execution Stream List */}
      <section className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] shrink-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E] whitespace-nowrap">
            Execution Stream
          </span>
          <span className="text-[11px] font-mono tabular-nums text-[#55555A] whitespace-nowrap">
            {executionLogs.length} EVENTS
          </span>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#111113] border border-t-0 border-white/[0.08] rounded-b-[4px] divide-y divide-white/[0.06]">
          {executionLogs.length === 0 ? (
            <div className="p-6 text-[13px] font-mono text-[#55555A]">
              Waiting for agent execution events...
            </div>
          ) : (
            executionLogs.map((log) => {
              const isAlert = log.level === 'error' || log.level === 'warn';
              return (
                <div
                  key={log.id}
                  className="px-6 py-3 flex items-center gap-4 text-[13px] hover:bg-white/[0.02] transition-colors duration-150"
                >
                  <span className="text-[11px] font-mono tabular-nums text-[#55555A] shrink-0 w-16">
                    {log.created_at?.slice(11, 19) || '--:--:--'}
                  </span>
                  <span
                    className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded-[4px] border shrink-0 w-20 text-center truncate ${
                      isAlert
                        ? 'text-[#FF3B30] border-[#FF3B30]/35 bg-[#FF3B30]/10'
                        : 'text-[#8A8A8E] border-white/[0.08] bg-[#0A0A0B]'
                    }`}
                    title={log.agent_id}
                  >
                    {log.agent_id}
                  </span>
                  <span className="text-[13px] text-[#F2F2F2] truncate min-w-0" title={log.message}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
