import React from 'react';

export interface SourceStatus {
  source: string;
  state: 'live' | 'stale' | 'error' | 'disconnected' | string;
  last_ok?: string | null;
  last_error?: string | null;
  next_poll?: string | null;
  meta?: Record<string, any>;
}

export function formatRelativeTime(isoOrEpoch?: string | number | null): string {
  if (!isoOrEpoch) return 'never';
  let ms: number;
  if (typeof isoOrEpoch === 'number') {
    ms = isoOrEpoch > 1e12 ? isoOrEpoch : isoOrEpoch * 1000;
  } else {
    ms = Date.parse(isoOrEpoch);
  }
  if (!Number.isFinite(ms) || ms <= 0) return 'never';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export const SourceBadge: React.FC<{
  label: string;
  status?: SourceStatus;
  onClick?: () => void;
}> = ({ label, status, onClick }) => {
  const st = status?.state || 'disconnected';
  const age = status?.last_ok ? formatRelativeTime(status.last_ok) : null;

  let text = 'connect';
  let dotCls = 'bg-[#55555A]';
  let borderCls = 'border-white/[0.08] text-[#8A8A8E]';

  if (st === 'live') {
    text = age ? `live · ${age}` : 'live';
    dotCls = 'bg-[#F2F2F2]';
    borderCls = 'border-white/[0.14] text-[#F2F2F2]';
  } else if (st === 'stale') {
    text = age ? `stale · ${age}` : 'stale';
    dotCls = 'bg-[#8A8A8E]';
    borderCls = 'border-white/[0.12] text-[#8A8A8E]';
  } else if (st === 'error') {
    text = 'error';
    dotCls = 'bg-[#FF3B30]';
    borderCls = 'border-[#FF3B30]/40 text-[#FF3B30]';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={status?.last_error || `${label}: ${text}`}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-[4px] bg-[#111113] border text-[11px] font-mono tabular-nums whitespace-nowrap ${borderCls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
      <span className="uppercase text-[#8A8A8E]">{label}</span>
      <span>{text}</span>
    </button>
  );
};

export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="bg-[#111113] border border-white/[0.08] rounded-[4px] divide-y divide-white/[0.06]">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="px-4 py-3.5 flex items-center justify-between gap-4 animate-pulse">
        <div className="h-3 w-40 bg-white/[0.06] rounded-[2px]" />
        <div className="h-3 w-24 bg-white/[0.04] rounded-[2px]" />
        <div className="h-3 w-28 bg-white/[0.04] rounded-[2px]" />
        <div className="h-3 w-20 bg-white/[0.04] rounded-[2px]" />
      </div>
    ))}
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}> = ({ title, description, ctaLabel, onCta }) => (
  <div className="bg-[#111113] border border-white/[0.08] rounded-[4px] p-10 flex flex-col items-center justify-center text-center gap-3">
    <p className="text-[13px] font-medium text-[#F2F2F2]">{title}</p>
    <p className="text-[12px] font-mono text-[#8A8A8E] max-w-md">{description}</p>
    {ctaLabel && onCta && (
      <button
        type="button"
        onClick={onCta}
        className="mt-2 px-4 py-2 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] text-[12px] font-medium hover:bg-white transition-colors"
      >
        {ctaLabel}
      </button>
    )}
  </div>
);

export const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="px-4 py-3 rounded-[4px] bg-[#111113] border border-[#FF3B30]/40 flex items-center justify-between gap-4 text-[12px] font-mono">
    <span className="text-[#FF3B30] truncate">{message}</span>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1 rounded-[4px] border border-white/[0.12] text-[#F2F2F2] hover:bg-white/[0.06] shrink-0"
      >
        Retry
      </button>
    )}
  </div>
);
