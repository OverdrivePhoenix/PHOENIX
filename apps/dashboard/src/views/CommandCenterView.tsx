import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('5173')
    ? window.location.origin
    : 'http://localhost:8000');

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
  onSendCommand?: (transcript: string) => Promise<{ intent: string; reply: string }>;
}

interface ChatTurn {
  id: string;
  command: string;
  reply?: string;
  status: 'sending' | 'done' | 'error';
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  currentProject,
  tasks,
  agents,
  approvals,
  executionLogs,
  sessionUptime,
  onTriggerPlanModal,
  onSendCommand
}) => {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const activeTask = tasks.find((t) => t.status === 'in_progress') || tasks[0] || {
    title: 'Stripe Webhook & Idempotency',
    feature_branch: 'feat/checkout-flow'
  };
  const blockedTasks = tasks.filter((t) => t.status === 'blocked');
  const activeAgentsCount = agents.filter((a) => a.status === 'running' || a.status === 'active').length;
  const totalAgentsCount = agents.length || 6;

  // Typed Command Bar State
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
    const maxH = 4 * 20 + 16; // max 4 lines
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
      {/* Section Header: Title + Single Primary Action */}
      <div className="flex items-center justify-between gap-6 pb-4 border-b border-white/[0.08] shrink-0">
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
      <section className="grid grid-cols-4 bg-[#111113] border border-white/[0.08] rounded-[4px] divide-x divide-white/[0.08] shrink-0">
        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate" title="ACTIVE TASK">
            ACTIVE TASK
          </span>
          <span className="font-display text-[32px] leading-none text-[#F2F2F2] tabular-nums whitespace-nowrap" title="1 Active Task">
            01
          </span>
          <span className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate" title={activeTask.title}>
            {activeTask.title}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate" title="FLEET">
            FLEET
          </span>
          <span className="font-display text-[32px] leading-none text-[#F2F2F2] tabular-nums whitespace-nowrap">
            {String(activeAgentsCount || 2).padStart(2, '0')}/{String(totalAgentsCount).padStart(2, '0')}
          </span>
          <span className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate" title="SWE · QA ACTIVE">
            SWE · QA ACTIVE
          </span>
        </div>

        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate" title="BLOCKED">
            BLOCKED
          </span>
          <span className={`font-display text-[32px] leading-none tabular-nums whitespace-nowrap ${blockedTasks.length > 0 ? 'text-[#FF3B30]' : 'text-[#F2F2F2]'}`}>
            {String(blockedTasks.length).padStart(2, '0')}
          </span>
          <span className="text-[11px] font-mono text-[#55555A] whitespace-nowrap truncate" title={blockedTasks[0]?.title || 'PIPELINE CLEAR'}>
            {blockedTasks[0]?.title || 'PIPELINE CLEAR'}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E] whitespace-nowrap truncate" title="APPROVALS">
            APPROVALS
          </span>
          <span className={`font-display text-[32px] leading-none tabular-nums whitespace-nowrap ${pendingApprovals.length > 0 ? 'text-[#FF3B30]' : 'text-[#F2F2F2]'}`}>
            {String(pendingApprovals.length).padStart(2, '0')}
          </span>
          <span
            className={`text-[11px] font-mono whitespace-nowrap truncate ${pendingApprovals.length > 0 ? 'text-[#FF3B30]' : 'text-[#55555A]'}`}
            title={pendingApprovals[0]?.action || 'ZERO-TRUST CLEAR'}
          >
            {pendingApprovals[0]?.action || 'ZERO-TRUST CLEAR'}
          </span>
        </div>
      </section>

      {/* ONE Live Execution Stream List */}
      <section className="flex-1 min-h-[140px] flex flex-col">
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
            <div className="p-4 text-[13px] font-mono text-[#55555A]">
              Waiting for agent execution events...
            </div>
          ) : (
            executionLogs.map((log) => {
              const isAlert = log.level === 'error' || log.level === 'warn';
              return (
                <div
                  key={log.id}
                  className="px-6 py-2.5 flex items-center gap-4 text-[13px] hover:bg-white/[0.02] transition-colors duration-150"
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
