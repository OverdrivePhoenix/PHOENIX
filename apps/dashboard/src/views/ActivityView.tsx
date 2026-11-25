import React, { useState } from 'react';
import { EmptyState, formatRelativeTime } from '../components/LiveStatus';
import { liveApi } from '../lib/liveApi';

interface LiveEventItem {
  id: number;
  ts: string;
  source: string;
  kind: string;
  severity: string;
  project_id?: string | null;
  payload: Record<string, any>;
  seen: boolean;
}

interface ActivityViewProps {
  events: LiveEventItem[];
  onRefresh?: () => void;
}

export const ActivityView: React.FC<ActivityViewProps> = ({ events, onRefresh }) => {
  const [filterSource, setFilterSource] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  const filtered = events.filter((ev) => {
    if (filterSource !== 'all' && ev.source !== filterSource) return false;
    if (filterSeverity !== 'all' && ev.severity !== filterSeverity) return false;
    return true;
  });

  const handleMarkSeen = async (id: number) => {
    await liveApi.post(`/live/events/${id}/seen`).catch(() => {});
    onRefresh?.();
  };

  return (
    <div className="flex-1 h-[calc(100vh-3rem)] overflow-y-auto bg-[#0A0A0B] p-8 flex flex-col gap-6 font-sans text-[#F2F2F2]">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div>
          <h2 className="text-[13px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E]">
            Live Activity & Events
          </h2>
          <p className="text-[11px] text-[#55555A] font-mono mt-1">
            TRANSITION EVENTS // DEDUPED BY SOURCE & STATE
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-[4px] bg-[#111113] border border-white/[0.08] text-[11px] font-mono tabular-nums text-[#8A8A8E]">
          {events.length} EVENTS
        </span>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 p-3 rounded-[4px] bg-[#111113] border border-white/[0.08] text-[12px] font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[#8A8A8E]">Source:</span>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="bg-[#0A0A0B] border border-white/[0.10] rounded-[4px] px-2.5 py-1 text-[#F2F2F2]"
          >
            <option value="all">All Sources</option>
            <option value="github">GitHub</option>
            <option value="antigravity">Antigravity</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#8A8A8E]">Severity:</span>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-[#0A0A0B] border border-white/[0.10] rounded-[4px] px-2.5 py-1 text-[#F2F2F2]"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="attention">Attention</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching activity events"
          description="Events appear when a tracked repository or workspace changes state after baseline sync."
        />
      ) : (
        <div className="rounded-[4px] bg-[#111113] border border-white/[0.08] divide-y divide-white/[0.06] font-mono text-[12px]">
          {filtered.map((ev) => (
            <div key={ev.id} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.02]">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[11px] text-[#55555A] tabular-nums w-20 shrink-0">
                  {formatRelativeTime(ev.ts)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-[4px] text-[10px] uppercase border shrink-0 ${
                    ev.severity === 'urgent'
                      ? 'text-[#FF3B30] border-[#FF3B30]/40'
                      : ev.severity === 'attention'
                      ? 'text-[#F2F2F2] border-white/[0.15]'
                      : 'text-[#8A8A8E] border-white/[0.08]'
                  }`}
                >
                  {ev.source} · {ev.severity}
                </span>
                <span className={`truncate ${ev.seen ? 'text-[#8A8A8E]' : 'text-[#F2F2F2]'}`}>
                  {ev.payload?.message || ev.kind}
                </span>
              </div>

              {!ev.seen && (
                <button
                  type="button"
                  onClick={() => handleMarkSeen(ev.id)}
                  className="px-2.5 py-1 rounded-[4px] border border-white/[0.10] text-[11px] text-[#8A8A8E] hover:text-[#F2F2F2] shrink-0"
                >
                  Mark seen
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
