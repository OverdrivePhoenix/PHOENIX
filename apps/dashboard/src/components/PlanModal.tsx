import React, { useState } from 'react';

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  onGeneratePlan: (goal: string) => Promise<{ summary: string; tasks_created: number }>;
}

export const PlanModal: React.FC<PlanModalProps> = ({
  isOpen,
  onClose,
  projectName,
  onGeneratePlan
}) => {
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ summary: string; tasks_created: number } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await onGeneratePlan(goal.trim());
      setResult(res);
    } catch {
      setResult({
        summary: "I do apologize, Sir. An error interrupted the task decomposition process.",
        tasks_created: 0
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans">
      <div className="w-full max-w-lg rounded-xl bg-surface-container-low border border-outline-variant/40 shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">auto_awesome</span>
            <div>
              <h3 className="text-base font-semibold text-on-surface">Plan Milestone with J.A.R.V.I.S.</h3>
              <p className="text-xs text-outline font-mono">Project: {projectName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-outline hover:text-on-surface">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 font-sans text-sm">
            <div>
              <label className="text-xs font-mono text-outline uppercase block mb-1">
                Milestone Objective / Architectural Goal
              </label>
              <textarea
                required
                rows={4}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Implement Stripe webhook handling with idempotency keys, write pytest integration tests, verify signature validation, and document failure modes..."
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded p-3 text-on-surface placeholder:text-outline focus:outline-none focus:border-primary text-xs font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded bg-surface-container text-outline hover:text-on-surface text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !goal.trim()}
                className="px-4 py-2 rounded bg-primary text-on-primary font-medium text-xs hover:bg-primary-container disabled:opacity-50 transition-colors"
              >
                {busy ? 'J.A.R.V.I.S. is Decomposing...' : 'Generate Plan ↗'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 font-sans">
            <div className="p-4 rounded-lg bg-surface-container border border-primary/30 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono text-primary font-semibold">
                <span>PLAN ESTABLISHED</span>
                <span>{result.tasks_created} TASKS SAVED TO FIRESTORE</span>
              </div>
              <p className="text-xs text-on-surface leading-relaxed italic font-serif">
                "{result.summary}"
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded bg-primary text-on-primary font-medium text-xs hover:bg-primary-container"
              >
                View Tasks in Command Center
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
