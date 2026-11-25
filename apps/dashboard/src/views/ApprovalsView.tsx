import React, { useState } from 'react';
import { EmptyState } from '../components/LiveStatus';

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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const pastApprovals = approvals.filter((a) => a.status !== 'pending');

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex-1 h-[calc(100vh-3rem)] overflow-y-auto bg-[#0A0A0B] p-8 flex flex-col gap-6 font-sans text-[#F2F2F2]">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div>
          <h2 className="text-[13px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E]">
            Human-in-the-Loop Approvals
          </h2>
          <p className="text-[11px] text-[#55555A] font-mono mt-1">
            CRYPTOGRAPHIC POLICY GATE // ZERO-TRUST EXECUTION
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-[4px] bg-[#111113] border border-white/[0.08] text-[11px] font-mono tabular-nums text-[#8A8A8E]">
          {pendingApprovals.length} PENDING · {pastApprovals.length} RESOLVED
        </span>
      </div>

      {/* Pending Approvals */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E]">
          Awaiting Authorization
        </h3>

        {pendingApprovals.length === 0 ? (
          <EmptyState
            title="No pending approvals"
            description="No operations currently require human authorization."
          />
        ) : (
          pendingApprovals.map((appr) => (
            <div
              key={appr.id}
              className="p-5 rounded-[4px] bg-[#111113] border border-[#FF3B30]/40 flex flex-col gap-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-semibold border border-[#FF3B30]/40 text-[#FF3B30] uppercase">
                    {(appr.risk_level || 'high').toUpperCase()} RISK
                  </span>
                  <h4 className="text-[14px] font-semibold text-[#F2F2F2]">{appr.action}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => copyId(appr.id)}
                  className="text-[11px] font-mono text-[#8A8A8E] hover:text-[#F2F2F2] border border-white/[0.08] rounded-[4px] px-2 py-0.5"
                  title={appr.id}
                >
                  {copiedId === appr.id ? 'Copied' : `ID: ${String(appr.id).slice(0, 12)}...`}
                </button>
              </div>

              {appr.rationale && (
                <div className="p-3 rounded-[4px] bg-[#0A0A0B] border border-white/[0.06] text-[12px] text-[#8A8A8E]">
                  {appr.rationale}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 text-[11px] font-mono text-[#8A8A8E]">
                <div className="truncate">
                  Rollback: <span className="text-[#F2F2F2]">{appr.rollback_plan || 'Not specified'}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onDenyAction(appr.id, appr.approval_token)}
                    className="px-3.5 py-1.5 rounded-[4px] border border-white/[0.12] text-[#8A8A8E] hover:text-[#F2F2F2]"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => onApproveAction(appr.id, appr.approval_token)}
                    className="px-3.5 py-1.5 rounded-[4px] bg-[#FF3B30] text-[#0A0A0B] font-semibold hover:opacity-90"
                  >
                    Authorize
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Historical Audit Ledger */}
      <div className="flex flex-col gap-3 mt-2">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E]">
          Historical Audit Ledger
        </h3>
        {pastApprovals.length === 0 ? (
          <EmptyState
            title="No approval history yet"
            description="Resolved authorization decisions will be recorded here."
          />
        ) : (
          <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-[4px] bg-[#111113]">
            {pastApprovals.map((appr) => (
              <div
                key={appr.id}
                className="px-4 py-3 flex items-center justify-between text-[12px] font-mono"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={appr.status === 'approved' ? 'text-[#F2F2F2]' : 'text-[#FF3B30]'}>
                    {appr.status === 'approved' ? 'APPROVED' : 'REJECTED'}
                  </span>
                  <span className="text-[#F2F2F2] truncate">{appr.action}</span>
                  <span className="text-[#55555A]">({appr.decision_channel || 'desktop_ui'})</span>
                </div>
                <span className="text-[#55555A] tabular-nums shrink-0">{appr.decided_at?.slice(0, 19) || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
