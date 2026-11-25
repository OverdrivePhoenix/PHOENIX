import React, { useState } from 'react';
import {
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  SourceBadge,
  SourceStatus,
  formatRelativeTime
} from '../components/LiveStatus';
import { liveApi, useLive } from '../lib/liveApi';

export interface LivePullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  reviewDecision?: string | null;
  author?: string | null;
  ciState?: string | null;
}

export interface LiveProject {
  id: string;
  name: string;
  source_kind: 'linked' | 'local' | 'github';
  seen_in: string[];
  is_manual: boolean;
  excluded: boolean;
  last_opened: number;
  branch?: string | null;
  dirty_count: number;
  ahead: number;
  behind: number;
  last_commit?: { sha: string; message: string; date: string } | null;
  remote_repo?: string | null;
  github?: {
    nameWithOwner: string;
    isPrivate: boolean;
    pushedAt?: string | null;
    url?: string | null;
    defaultBranch?: string | null;
    ciState?: string | null;
    openPrsCount: number;
    openPrs: LivePullRequest[];
    openIssuesCount: number;
  } | null;
  updated_at?: string;
}

interface LiveProjectsPayload {
  projects: LiveProject[];
  antigravity_running: boolean;
  source_status: Record<string, SourceStatus>;
}

interface ProjectsViewProps {
  projects?: any[];
  currentProjectId?: string;
  onSelectProject?: (id: string) => void;
  onCreateProject?: (name: string, goal: string, repoUrl: string) => Promise<void>;
  onTriggerPlanModal?: () => void;
  onOpenSettings?: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onOpenSettings }) => {
  const { data, loading, error, refresh } = useLive<LiveProjectsPayload>('/live/projects', {
    projects: [],
    antigravity_running: false,
    source_status: {}
  });
  const [selected, setSelected] = useState<LiveProject | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const handleSyncNow = async () => {
    setSyncing(true);
    setActionMsg(null);
    try {
      await liveApi.post('/live/sync', { source: 'all' });
      await refresh();
    } catch (e: any) {
      setActionMsg(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handlePickFolder = async () => {
    setActionMsg(null);
    try {
      const res = await liveApi.post<{ ok: boolean; cancelled?: boolean; name?: string }>('/live/projects/pick-folder');
      if (res.ok) {
        await refresh();
      }
    } catch (e: any) {
      setActionMsg(e?.message || 'Could not add folder');
    }
  };

  const handleOpen = async (projectId: string, target: 'antigravity' | 'folder' | 'github') => {
    setActionMsg(null);
    try {
      await liveApi.post(`/live/projects/${encodeURIComponent(projectId)}/open`, { target });
    } catch (e: any) {
      setActionMsg(e?.message || `Failed to open ${target}`);
    }
  };

  const handleExclude = async (projectId: string) => {
    try {
      await liveApi.post(`/live/projects/${encodeURIComponent(projectId)}/exclude`, { excluded: true });
      if (selected?.id === projectId) setSelected(null);
      await refresh();
    } catch (e: any) {
      setActionMsg(e?.message || 'Exclude failed');
    }
  };

  const projects = data.projects || [];
  const agStatus = data.source_status?.antigravity;
  const ghStatus = data.source_status?.github;

  return (
    <div className="flex-1 h-[calc(100vh-3rem)] overflow-y-auto bg-[#0A0A0B] p-8 flex flex-col gap-6 font-sans text-[#F2F2F2]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.08] shrink-0">
        <div className="min-w-0">
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E]">
            Projects & Repositories
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <SourceBadge label="Antigravity" status={agStatus} onClick={onOpenSettings} />
            <SourceBadge label="GitHub" status={ghStatus} onClick={onOpenSettings} />
            <span className="text-[11px] font-mono text-[#55555A] px-2 py-1 border border-white/[0.08] rounded-[4px] bg-[#111113]">
              IDE {data.antigravity_running ? 'RUNNING' : 'IDLE'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-3 py-1.5 rounded-[4px] bg-[#111113] border border-white/[0.10] text-[12px] font-mono text-[#F2F2F2] hover:border-white/[0.22] disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={handlePickFolder}
            className="px-3.5 py-1.5 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] text-[12px] font-medium hover:bg-white transition-colors"
          >
            Add Project Folder
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      {actionMsg && <ErrorBanner message={actionMsg} />}
      {ghStatus?.state === 'error' && ghStatus?.last_error && (
        <ErrorBanner message={`GitHub: ${ghStatus.last_error}`} onRetry={onOpenSettings} />
      )}

      {/* Content */}
      {loading ? (
        <SkeletonRows rows={5} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="Antigravity data not found. Add a folder manually."
          description="No Antigravity workspaces or GitHub repositories are currently tracked. Add a local folder or connect GitHub in Settings."
          ctaLabel="Add project folder"
          onCta={handlePickFolder}
        />
      ) : (
        <div className="bg-[#111113] border border-white/[0.08] rounded-[4px] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E]">
                <th className="py-3 px-4 font-medium">Project</th>
                <th className="py-3 px-4 font-medium">Branch</th>
                <th className="py-3 px-4 font-medium">Local State</th>
                <th className="py-3 px-4 font-medium">GitHub</th>
                <th className="py-3 px-4 font-medium">Antigravity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-[13px]">
              {projects.map((proj) => {
                const ci = proj.github?.ciState;
                const ciBad = ci === 'FAILURE' || ci === 'ERROR';
                const isSelected = selected?.id === proj.id;
                return (
                  <tr
                    key={proj.id}
                    onClick={() => setSelected(proj)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#F2F2F2] truncate max-w-[220px]" title={proj.name}>
                        {proj.name}
                      </div>
                      <div className="text-[11px] font-mono text-[#55555A] truncate max-w-[220px]">
                        {proj.remote_repo || (proj.source_kind === 'local' ? 'local-only' : proj.source_kind)}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[12px] text-[#8A8A8E] whitespace-nowrap">
                      {proj.branch || '—'}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] tabular-nums whitespace-nowrap">
                      {proj.source_kind === 'github' ? (
                        <span className="text-[#55555A]">remote-only</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={proj.dirty_count > 0 ? 'text-[#F2F2F2]' : 'text-[#55555A]'}>
                            {proj.dirty_count} dirty
                          </span>
                          <span className="text-[#55555A]">·</span>
                          <span className="text-[#8A8A8E]">+{proj.ahead}/-{proj.behind}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] tabular-nums whitespace-nowrap">
                      {proj.github ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[#8A8A8E]">{proj.github.openPrsCount} PRs</span>
                          <span className="text-[#55555A]">·</span>
                          <span className={ciBad ? 'text-[#FF3B30] font-semibold' : 'text-[#F2F2F2]'}>
                            {ci || 'NO CI'}
                          </span>
                          <span className="text-[#55555A]">·</span>
                          <span className="text-[#55555A]">{formatRelativeTime(proj.github.pushedAt)}</span>
                        </div>
                      ) : (
                        <span className="text-[#55555A]">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] tabular-nums text-[#8A8A8E] whitespace-nowrap">
                      {proj.last_opened > 0 ? formatRelativeTime(proj.last_opened) : 'Not available'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Side Sheet for Project Detail */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60"
          onClick={() => setSelected(null)}
        >
          <aside
            className="w-full max-w-md h-full bg-[#111113] border-l border-white/[0.10] p-6 overflow-y-auto flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/[0.08]">
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[#8A8A8E]">
                  {selected.source_kind} · {selected.id}
                </span>
                <h2 className="text-[16px] font-semibold text-[#F2F2F2] truncate mt-0.5">
                  {selected.name}
                </h2>
                <p className="text-[11px] font-mono text-[#55555A] truncate mt-0.5">
                  {selected.remote_repo || 'No remote repository'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-2 py-1 text-[12px] font-mono text-[#8A8A8E] hover:text-[#F2F2F2]"
              >
                ✕
              </button>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {selected.source_kind !== 'github' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpen(selected.id, 'antigravity')}
                    className="px-3 py-1.5 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] text-[12px] font-medium hover:bg-white"
                  >
                    Open in Antigravity
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpen(selected.id, 'folder')}
                    className="px-3 py-1.5 rounded-[4px] bg-[#0A0A0B] border border-white/[0.10] text-[12px] font-mono text-[#F2F2F2] hover:border-white/[0.25]"
                  >
                    Open Folder
                  </button>
                </>
              )}
              {selected.remote_repo && (
                <button
                  type="button"
                  onClick={() => handleOpen(selected.id, 'github')}
                  className="px-3 py-1.5 rounded-[4px] bg-[#0A0A0B] border border-white/[0.10] text-[12px] font-mono text-[#F2F2F2] hover:border-white/[0.25]"
                >
                  Open GitHub
                </button>
              )}
              <button
                type="button"
                onClick={() => handleExclude(selected.id)}
                className="px-3 py-1.5 rounded-[4px] border border-[#FF3B30]/40 text-[12px] font-mono text-[#FF3B30] hover:bg-[#FF3B30]/10 ml-auto"
              >
                Exclude
              </button>
            </div>

            {/* Recent Commit */}
            <div className="p-4 rounded-[4px] bg-[#0A0A0B] border border-white/[0.08] flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E]">
                Latest Commit
              </span>
              {selected.last_commit ? (
                <>
                  <div className="text-[12px] text-[#F2F2F2]">{selected.last_commit.message}</div>
                  <div className="text-[11px] font-mono text-[#55555A] tabular-nums">
                    {selected.last_commit.sha} · {formatRelativeTime(selected.last_commit.date)}
                  </div>
                </>
              ) : (
                <span className="text-[12px] font-mono text-[#55555A]">Not available</span>
              )}
            </div>

            {/* Open Pull Requests */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-[#8A8A8E]">
                Open Pull Requests ({selected.github?.openPrsCount ?? 0})
              </span>
              {selected.github && selected.github.openPrs.length > 0 ? (
                <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-[4px] bg-[#0A0A0B]">
                  {selected.github.openPrs.map((pr) => (
                    <div key={pr.number} className="p-3 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-[#F2F2F2] truncate">
                          #{pr.number} {pr.title}
                        </span>
                        <span
                          className={`text-[10px] font-mono shrink-0 ${
                            pr.ciState === 'FAILURE' || pr.ciState === 'ERROR'
                              ? 'text-[#FF3B30]'
                              : 'text-[#8A8A8E]'
                          }`}
                        >
                          {pr.ciState || 'PENDING'}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[#55555A] tabular-nums">
                        {pr.author || 'unknown'} · {pr.reviewDecision || (pr.isDraft ? 'DRAFT' : 'OPEN')} ·{' '}
                        {formatRelativeTime(pr.updatedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-[4px] bg-[#0A0A0B] border border-white/[0.08] text-[12px] font-mono text-[#55555A]">
                  {selected.github ? 'No open pull requests.' : 'Connect GitHub in Settings to view PRs and CI.'}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
