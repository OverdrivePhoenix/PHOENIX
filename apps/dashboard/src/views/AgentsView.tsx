import React from 'react';
import { EmptyState } from '../components/LiveStatus';

interface AgentsViewProps {
  agents: any[];
}

export const AgentsView: React.FC<AgentsViewProps> = ({ agents }) => {
  return (
    <div className="flex-1 h-[calc(100vh-3rem)] overflow-y-auto bg-[#0A0A0B] p-8 flex flex-col gap-6 font-sans text-[#F2F2F2]">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div>
          <h2 className="text-[13px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E]">
            Agent Fleet
          </h2>
          <p className="text-[11px] text-[#55555A] font-mono mt-1">
            ACTIVE BACKEND AGENT REGISTRY
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-[4px] bg-[#111113] border border-white/[0.08] text-[11px] font-mono tabular-nums text-[#8A8A8E]">
          {agents.length} AGENTS
        </span>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          title="No active agents reported by backend"
          description="Agent telemetry appears here when the orchestration runtime has active or registered agents."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="p-5 rounded-[4px] bg-[#111113] border border-white/[0.08] flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase text-[#8A8A8E]">{agent.role || 'Agent'}</span>
                  <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono border border-white/[0.10] text-[#F2F2F2] uppercase">
                    {agent.status || 'unknown'}
                  </span>
                </div>
                <h3 className="text-[14px] font-semibold text-[#F2F2F2]">{agent.name}</h3>
                <p className="text-[11px] text-[#8A8A8E] font-mono mt-1">
                  Model: {agent.model_name || 'Not available'}
                </p>
              </div>

              <div className="p-3 rounded-[4px] bg-[#0A0A0B] border border-white/[0.06] font-mono text-[11px] flex flex-col gap-1.5 tabular-nums">
                <div className="flex justify-between text-[#8A8A8E]">
                  <span>Tokens Used:</span>
                  <span className="text-[#F2F2F2]">
                    {typeof agent.total_tokens_used === 'number' ? agent.total_tokens_used.toLocaleString() : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-[#8A8A8E]">
                  <span>Success Rate:</span>
                  <span className="text-[#F2F2F2]">
                    {typeof agent.success_rate === 'number' ? `${agent.success_rate}%` : 'Not available'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
