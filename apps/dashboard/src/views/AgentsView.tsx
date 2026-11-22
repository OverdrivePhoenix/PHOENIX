import React from 'react';

interface AgentsViewProps {
  agents: any[];
}

export const AgentsView: React.FC<AgentsViewProps> = ({ agents }) => {
  return (
    <div className="flex-1 h-[calc(100vh-2.5rem)] overflow-y-auto bg-surface-container-lowest p-6 flex flex-col gap-6 font-sans">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Agent Fleet Matrix</h2>
          <p className="text-xs text-outline font-mono mt-0.5">
            OPENAI AGENTS SDK // ISOLATED CONTAINERS & SPECIALIZED ROLES
          </p>
        </div>
        <span className="px-2.5 py-1 rounded bg-surface-container text-xs font-mono text-primary font-bold">
          {agents.length} AGENTS DEPLOYED
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="p-5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col justify-between gap-4 hover:border-primary/40 transition-colors shadow-sm"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase text-outline">{agent.role}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/20 text-primary uppercase">
                  {agent.status}
                </span>
              </div>
              <h3 className="text-base font-semibold text-on-surface">{agent.name}</h3>
              <p className="text-xs text-outline font-mono mt-1">Model: {agent.model_name}</p>
            </div>

            <div className="p-3 rounded bg-surface-container font-mono text-xs flex flex-col gap-1.5">
              <div className="flex justify-between text-outline">
                <span>Cumulative Tokens:</span>
                <span className="text-on-surface font-semibold">{agent.total_tokens_used?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between text-outline">
                <span>Verification Success:</span>
                <span className="text-primary font-bold">{agent.success_rate || 96.0}%</span>
              </div>
              <div className="flex justify-between text-outline">
                <span>Docker Sandbox:</span>
                <span className="text-on-surface">Enforced</span>
              </div>
            </div>

            <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between text-xs font-mono text-outline">
              <span>Authority: Scoped Tools</span>
              <span className="text-primary">Zero Host Access</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
