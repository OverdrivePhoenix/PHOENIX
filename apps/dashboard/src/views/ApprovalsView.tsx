import React from 'react';

interface ApprovalsViewProps {
  approvals: any[];
  onApproveAction: (approvalId: string, token: string) => void;
  onDenyAction: (approvalId: string, token: string) => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  approvals,
  onApproveAction,
  onDenyAction
}) => {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const pastApprovals = approvals.filter((a) => a.status !== 'pending');

  return (
    <div className="flex-1 h-[calc(100vh-2.5rem)] overflow-y-auto bg-surface-container-lowest p-6 flex flex-col gap-6 font-sans">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Human-in-the-Loop Approvals</h2>
          <p className="text-xs text-outline font-mono mt-0.5">
            DETERMINISTIC CRYPTOGRAPHIC POLICY GATE // ZERO-TRUST EXECUTION
          </p>
        </div>
        <span className="px-2.5 py-1 rounded bg-surface-container text-xs font-mono text-outline">
          {pendingApprovals.length} PENDING · {pastApprovals.length} RESOLVED
        </span>
      </div>

      {/* Pending Approvals Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-outline flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
          Awaiting Verified Authorization
        </h3>

        {pendingApprovals.length === 0 ? (
          <div className="p-8 rounded-lg bg-surface-container-low border border-outline-variant/20 text-center text-outline text-sm">
            <span className="material-symbols-outlined text-[32px] text-primary/40 mb-2">check_circle</span>
            <p>No operations currently require human authorization.</p>
          </div>
        ) : (
          pendingApprovals.map((appr) => (
            <div
              key={appr.id}
              className="p-5 rounded-lg bg-surface-container-low border border-error/40 shadow-sm flex flex-col gap-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-error-container/40 text-error">
                    {appr.risk_level.toUpperCase()} RISK
                  </span>
                  <h4 className="text-base font-semibold text-on-surface">{appr.action}</h4>
                </div>
                <span className="text-xs font-mono text-outline">
                  Token: <code className="text-primary">{appr.approval_token?.slice(0, 24)}...</code>
                </span>
              </div>

              <div className="p-3 rounded bg-surface-container text-xs text-on-surface-variant leading-relaxed">
                {appr.rationale}
              </div>

              {/* Diff / Action Payload Preview */}
              <div className="p-3 rounded bg-surface-container-lowest border border-outline-variant/20 font-mono text-xs">
                <div className="text-[10px] uppercase text-outline mb-1">Action Payload & Target State</div>
                <pre className="text-primary overflow-x-auto">
                  {JSON.stringify(appr.action_payload, null, 2)}
                </pre>
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-outline">
                <div>
                  Rollback Strategy: <span className="text-on-surface">{appr.rollback_plan}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onApproveAction(appr.id, appr.approval_token)}
                    className="px-4 py-1.5 rounded bg-primary text-on-primary font-medium hover:bg-primary-container transition-colors shadow-sm"
                  >
                    Authorize Action
                  </button>
                  <button
                    onClick={() => onDenyAction(appr.id, appr.approval_token)}
                    className="px-4 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-outline hover:text-on-surface transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Historical Approvals Section */}
      <div className="flex flex-col gap-3 mt-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-outline">
          Historical Audit Ledger
        </h3>
        <div className="flex flex-col gap-2">
          {pastApprovals.map((appr) => (
            <div
              key={appr.id}
              className="p-3 rounded bg-surface-container-low border border-outline-variant/20 flex items-center justify-between text-xs font-mono"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    appr.status === 'approved' ? 'text-primary' : 'text-error'
                  }`}
                >
                  {appr.status === 'approved' ? 'check_circle' : 'cancel'}
                </span>
                <span className="text-on-surface font-medium">{appr.action}</span>
                <span className="text-outline">({appr.decision_channel || 'desktop_ui'})</span>
              </div>
              <div className="flex items-center gap-4 text-outline">
                <span className="uppercase font-bold text-on-surface">{appr.status}</span>
                <span>{appr.decided_at?.slice(0, 19)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
