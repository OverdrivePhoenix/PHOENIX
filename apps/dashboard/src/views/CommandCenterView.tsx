import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { API_BASE, liveApi } from '../lib/liveApi';
import { EmptyState, SourceBadge, SourceStatus, formatRelativeTime } from '../components/LiveStatus';

interface LiveSummary {
  projects_tracked: number;
  need_attention: number;
  open_prs: number;
  ci_failing: number;
  most_active_project?: string | null;
  most_active_branch?: string | null;
  last_sync?: string | null;
  source_status?: Record<string, SourceStatus>;
}

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

interface CommandCenterViewProps {
  summary: LiveSummary;
  events: LiveEventItem[];
  onTriggerPlanModal: () => void;
  onSendCommand?: (transcript: string) => Promise<{ intent: string; reply: string }>;
  onOpenSettings?: () => void;
}

interface ChatTurn {
  id: string;
  command: string;
  reply?: string;
  status: 'sending' | 'done' | 'error';
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  summary,
  events,
  onTriggerPlanModal,
  onSendCommand,
  onOpenSettings
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const [speakTypedReplies, setSpeakTypedReplies] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/jarvis/history`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.history)) setHistory(d.history);
      })
      .catch(() => {});
    fetch(`${API_BASE}/api/settings`)
      .then((r) => r.json())
      .then((cfg) => {
        setSpeakTypedReplies(Boolean(cfg?.speakTypedReplies));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 4 * 20 + 16;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  };

  const submitCommand = async () => {
    const trimmed = inputText.trim().slice(0, 4000);
    if (!trimmed || isSending) return;

    const turnId = `cmd-${Date.now()}`;
    setTurns((prev) => [...prev, { id: turnId, command: trimmed, status: 'sending' }]);
    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setHistory((prev) => (prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed].slice(-50)));
    setHistIdx(-1);
    setIsSending(true);

    try {
      let reply = '';
      if (onSendCommand) {
        const res = await onSendCommand(trimmed);
        reply = res?.reply || 'Command executed.';
      } else {
        const resp = await fetch(`${API_BASE}/jarvis/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: trimmed })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        reply = data?.spoken_reply || 'Command executed.';
      }

      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, reply, status: 'done' } : t))
      );

      if (speakTypedReplies && reply) {
        try {
          const ttsRes = await fetch(`${API_BASE}/api/tts/synthesize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: reply })
          });
          if (ttsRes.ok && ttsRes.headers.get('content-type')?.includes('audio')) {
            const blob = await ttsRes.blob();
            const audio = new Audio(URL.createObjectURL(blob));
            await audio.play();
          }
        } catch {}
      }
    } catch (err: any) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, reply: `Error: ${err?.message || 'Command failed'}`, status: 'error' }
            : t
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCommand();
    } else if (e.key === 'Escape') {
      setInputText('');
      setHistIdx(-1);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } else if (e.key === 'ArrowUp' && !inputText.includes('\n')) {
      if (history.length === 0) return;
      e.preventDefault();
      const nextIdx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(nextIdx);
      setInputText(history[nextIdx]);
    } else if (e.key === 'ArrowDown' && !inputText.includes('\n')) {
      if (histIdx === -1) return;
      e.preventDefault();
      if (histIdx >= history.length - 1) {
        setHistIdx(-1);
        setInputText('');
      } else {
        const nextIdx = histIdx + 1;
        setHistIdx(nextIdx);
        setInputText(history[nextIdx]);
      }
    }
  };

  return (
    <div className="flex-1 h-[calc(100vh-3rem)] overflow-y-auto bg-[#0A0A0B] p-8 flex flex-col gap-6 font-sans text-[#F2F2F2]">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-6 pb-4 border-b border-white/[0.08] shrink-0">
        <div className="min-w-0">
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E] whitespace-nowrap truncate">
            Command Center
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <SourceBadge label="Antigravity" status={summary.source_status?.antigravity} onClick={onOpenSettings} />
            <SourceBadge label="GitHub" status={summary.source_status?.github} onClick={onOpenSettings} />
            <span className="text-[11px] font-mono text-[#55555A] tabular-nums">
              updated {formatRelativeTime(summary.last_sync)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => liveApi.post('/live/sync', { source: 'all' }).catch(() => {})}
            className="px-3 py-2 rounded-[4px] bg-[#111113] border border-white/[0.10] text-[12px] font-mono text-[#F2F2F2] hover:border-white/[0.22]"
          >
            Sync
          </button>
          <button
            onClick={onTriggerPlanModal}
            className="px-4 py-2 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] text-[13px] font-medium whitespace-nowrap hover:bg-white transition-colors duration-150"
          >
            Plan Milestone
          </button>
        </div>
      </div>

      {/* 4 Real Computed Stats */}
      <section className="grid grid-cols-4 bg-[#111113] border border-white/[0.08] rounded-[4px] divide-x divide-white/[0.08] shrink-0">
        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate">
            PROJECTS TRACKED
          </span>
          <span className="font-display text-[32px] leading-none text-[#F2F2F2] tabular-nums whitespace-nowrap">
            {String(summary.projects_tracked).padStart(2, '0')}
          </span>
          <span className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate">
            {summary.most_active_project || 'No workspace active'}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate">
            NEED ATTENTION
          </span>
          <span className={`font-display text-[32px] leading-none tabular-nums whitespace-nowrap ${summary.need_attention > 0 ? 'text-[#FF3B30]' : 'text-[#F2F2F2]'}`}>
            {String(summary.need_attention).padStart(2, '0')}
          </span>
          <span className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate">
            {summary.need_attention > 0 ? 'UNSEEN OR FAILING' : 'ALL CLEAR'}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate">
            OPEN PRS
          </span>
          <span className="font-display text-[32px] leading-none text-[#F2F2F2] tabular-nums whitespace-nowrap">
            {String(summary.open_prs).padStart(2, '0')}
          </span>
          <span className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate">
            GITHUB REPOSITORIES
          </span>
        </div>

        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate">
            CI FAILING
          </span>
          <span className={`font-display text-[32px] leading-none tabular-nums whitespace-nowrap ${summary.ci_failing > 0 ? 'text-[#FF3B30]' : 'text-[#F2F2F2]'}`}>
            {String(summary.ci_failing).padStart(2, '0')}
          </span>
          <span className={`text-[11px] font-mono whitespace-nowrap truncate ${summary.ci_failing > 0 ? 'text-[#FF3B30]' : 'text-[#55555A]'}`}>
            {summary.ci_failing > 0 ? 'DEFAULT BRANCH RED' : 'CHECKS NOMINAL'}
          </span>
        </div>
      </section>

      {/* ONE Live Event Stream */}
      <section className="flex-1 min-h-[140px] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] shrink-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E] whitespace-nowrap">
            Live Event Stream
          </span>
          <span className="text-[11px] font-mono tabular-nums text-[#55555A] whitespace-nowrap">
            {events.length} EVENTS
          </span>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#111113] border border-t-0 border-white/[0.08] rounded-b-[4px] divide-y divide-white/[0.06]">
          {events.length === 0 ? (
            <EmptyState
              title="No transition events yet"
              description="PHOENIX monitors Antigravity workspaces and GitHub repositories silently after baseline sync and records changes here."
            />
          ) : (
            events.map((ev) => {
              const isAlert = ev.severity === 'urgent' || ev.severity === 'attention';
              return (
                <div
                  key={ev.id}
                  className="px-6 py-2.5 flex items-center gap-4 text-[13px] hover:bg-white/[0.02] transition-colors duration-150"
                >
                  <span className="text-[11px] font-mono tabular-nums text-[#55555A] shrink-0 w-20">
                    {formatRelativeTime(ev.ts)}
                  </span>
                  <span
                    className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded-[4px] border shrink-0 w-24 text-center truncate ${
                      ev.severity === 'urgent'
                        ? 'text-[#FF3B30] border-[#FF3B30]/35 bg-[#FF3B30]/10'
                        : isAlert
                        ? 'text-[#F2F2F2] border-white/[0.15] bg-[#0A0A0B]'
                        : 'text-[#8A8A8E] border-white/[0.08] bg-[#0A0A0B]'
                    }`}
                  >
                    {ev.source}
                  </span>
                  <span className="text-[13px] text-[#F2F2F2] truncate min-w-0">
                    {ev.payload?.message || ev.kind}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Typed Command Bar (plain text only, same pipeline as voice) */}
      <section className="shrink-0 flex flex-col gap-2">
        {turns.length > 0 && (
          <div className="max-h-36 overflow-y-auto bg-[#111113] border border-white/[0.08] rounded-[4px] p-3 flex flex-col gap-2 text-[12px]">
            {turns.map((t) => (
              <div key={t.id} className="flex flex-col gap-0.5 border-b border-white/[0.04] pb-1.5 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[#F2F2F2] break-words">{`> ${t.command}`}</span>
                  <span
                    className={`font-mono text-[10px] uppercase shrink-0 ${
                      t.status === 'error' ? 'text-[#FF3B30]' : t.status === 'sending' ? 'text-[#8A8A8E]' : 'text-[#55555A]'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
                {t.reply && (
                  <p className={`font-sans text-[12px] break-words ${t.status === 'error' ? 'text-[#FF3B30]' : 'text-[#8A8A8E]'}`}>
                    {t.reply}
                  </p>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}

        <div className="flex items-end gap-2 bg-[#111113] border border-white/[0.08] rounded-[4px] px-3 py-2 focus-within:border-white/[0.20] transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            maxLength={4000}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-[13px] font-mono text-[#F2F2F2] placeholder-[#55555A] resize-none focus:outline-none leading-5 min-w-0"
          />
          <button
            type="button"
            disabled={isSending || !inputText.trim()}
            onClick={submitCommand}
            aria-label="Send command"
            className="w-8 h-8 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] hover:bg-white disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center shrink-0 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
};
