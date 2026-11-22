import React, { useState } from 'react';

interface ActivityViewProps {
  logs: any[];
}

export const ActivityView: React.FC<ActivityViewProps> = ({ logs }) => {
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');

  const filtered = logs.filter((log) => {
    if (filterAgent !== 'all' && log.agent_id !== filterAgent) return false;
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    return true;
  });

  return (
    <div className="flex-1 h-[calc(100vh-2.5rem)] overflow-y-auto bg-surface-container-lowest p-6 flex flex-col gap-6 font-sans">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Execution Audit Ledger</h2>
          <p className="text-xs text-outline font-mono mt-0.5">
            IMMUTABLE EVENT TRACES // TOOL INVOCATIONS & ARTIFACT MUTATIONS
          </p>
        </div>
        <span className="px-2.5 py-1 rounded bg-surface-container text-xs font-mono text-outline">
          {logs.length} EVENTS RECORDED
        </span>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-outline">Agent:</span>
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/40 rounded px-2 py-1 text-on-surface focus:outline-none"
          >
            <option value="all">All Agents</option>
            <option value="chief_orchestrator">Chief Orchestrator</option>
            <option value="project_manager">Project Manager</option>
            <option value="software_engineer">Software Engineer</option>
            <option value="qa_engineer">QA Engineer</option>
            <option value="security_reviewer">Security Reviewer</option>
            <option value="devops_engineer">DevOps Engineer</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-outline">Severity:</span>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/40 rounded px-2 py-1 text-on-surface focus:outline-none"
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="audit">Audit</option>
          </select>
        </div>
      </div>

      {/* Event Stream Table */}
      <div className="rounded-lg bg-surface-container-low border border-outline-variant/30 overflow-hidden font-mono text-xs">
        <div className="grid grid-cols-12 gap-2 p-3 bg-surface-container text-outline font-semibold uppercase text-[10px] border-b border-outline-variant/20">
          <div className="col-span-2">Timestamp</div>
          <div className="col-span-2">Agent Role</div>
          <div className="col-span-2">Event Type</div>
          <div className="col-span-6">Audit Message</div>
        </div>

        <div className="divide-y divide-outline-variant/20 max-h-[500px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-outline italic">No matching execution events found.</div>
          ) : (
            filtered.map((log) => (
              <div key={log.id} className="grid grid-cols-12 gap-2 p-3 items-center hover:bg-surface-container/40 transition-colors">
                <div className="col-span-2 text-outline text-[11px] truncate">
                  {log.created_at?.slice(0, 19)}
                </div>
                <div className="col-span-2">
                  <span className="px-1.5 py-0.5 rounded bg-surface-container text-primary font-bold text-[10px]">
                    {log.agent_id}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                    log.level === 'warn' ? 'bg-tertiary-container/30 text-tertiary' :
                    log.level === 'error' ? 'bg-error-container/30 text-error' :
                    'bg-surface-container-high text-on-surface'
                  }`}>
                    {log.event_type}
                  </span>
                </div>
                <div className="col-span-6 text-on-surface leading-relaxed">
                  {log.message}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
