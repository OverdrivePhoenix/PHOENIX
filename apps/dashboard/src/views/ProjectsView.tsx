import React, { useState } from 'react';

interface ProjectsViewProps {
  projects: any[];
  currentProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, goal: string, repoUrl: string) => Promise<void>;
  onTriggerPlanModal: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onTriggerPlanModal
}) => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreateProject(name.trim(), goal.trim(), repoUrl.trim());
      setName('');
      setGoal('');
      setRepoUrl('');
      setShowNewModal(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 h-[calc(100vh-2.5rem)] overflow-y-auto bg-surface-container-lowest p-6 flex flex-col gap-6 font-sans">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Initiatives & Workspaces</h2>
          <p className="text-xs text-outline font-mono mt-0.5">
            CONCURRENT PROJECT ISOLATION // PERSISTENT FIRESTORE REPOSITORIES
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-on-primary font-medium text-xs hover:bg-primary-container transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>New Initiative</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {projects.map((proj) => {
          const isSelected = proj.id === currentProjectId;
          return (
            <div
              key={proj.id}
              className={`p-5 rounded-lg bg-surface-container-low border transition-all flex flex-col justify-between gap-4 ${
                isSelected
                  ? 'border-primary shadow-md'
                  : 'border-outline-variant/30 hover:border-outline-variant'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase text-outline">
                    {proj.default_branch || 'main'}
                  </span>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/20 text-primary">
                      CURRENT
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-on-surface">{proj.name}</h3>
                <p className="text-xs text-on-surface-variant mt-1.5 line-clamp-2 leading-relaxed">
                  {proj.goal || proj.description || 'Autonomous development project.'}
                </p>
              </div>

              <div className="p-3 rounded bg-surface-container font-mono text-xs flex flex-col gap-1.5">
                <div className="flex justify-between text-outline">
                  <span>Repository:</span>
                  <span className="text-primary truncate max-w-[150px]">{proj.repo_url || 'local/workspace'}</span>
                </div>
                <div className="flex justify-between text-outline">
                  <span>Created:</span>
                  <span className="text-on-surface">{proj.created_at?.slice(0, 10)}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between gap-2">
                <button
                  onClick={() => onSelectProject(proj.id)}
                  disabled={isSelected}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-surface-container text-outline cursor-default'
                      : 'bg-surface-container-high hover:bg-surface-bright text-on-surface'
                  }`}
                >
                  {isSelected ? 'Active Workspace' : 'Switch Workspace'}
                </button>
                <button
                  onClick={onTriggerPlanModal}
                  className="py-1.5 px-3 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-mono font-medium transition-colors"
                >
                  Plan
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-surface-container-low border border-outline-variant/40 shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-semibold text-on-surface">Start New Initiative</h3>
              <button onClick={() => setShowNewModal(false)} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 font-sans text-sm">
              <div>
                <label className="text-xs font-mono text-outline uppercase block mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Canteen Pre-Ordering System"
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-outline uppercase block mb-1">High-Level Goal</label>
                <textarea
                  required
                  rows={3}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Describe target features, user stories, and architecture..."
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-outline uppercase block mb-1">Git Repository URL (Optional)</label>
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded bg-surface-container text-outline hover:text-on-surface text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="px-4 py-2 rounded bg-primary text-on-primary font-medium text-xs hover:bg-primary-container disabled:opacity-50"
                >
                  {busy ? 'Initializing...' : 'Launch Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
