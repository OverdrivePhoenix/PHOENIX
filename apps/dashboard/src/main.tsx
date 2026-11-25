import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { TitleBar } from './components/TitleBar';
import { Sidebar, ViewType } from './components/Sidebar';
import { CommandCenterView } from './views/CommandCenterView';
import { ApprovalsView } from './views/ApprovalsView';
import { AgentsView } from './views/AgentsView';
import { ProjectsView } from './views/ProjectsView';
import { SettingsView } from './views/SettingsView';
import { ActivityView } from './views/ActivityView';
import { VoiceOverlay } from './components/VoiceOverlay';
import { JarvisModal } from './components/JarvisModal';
import { PlanModal } from './components/PlanModal';
import { API_BASE, useLive } from './lib/liveApi';

const IS_DEMO = import.meta.env.VITE_PHOENIX_DEMO === '1';

export function App() {
  const [activeView, setActiveView] = useState<ViewType>('command-center');
  const [projects, setProjects] = useState<any[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [agents, setAgents] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [isEmergencyPaused, setIsEmergencyPaused] = useState(false);
  const [jarvisBriefing, setJarvisBriefing] = useState<string>('');
  const [isJarvisModalOpen, setIsJarvisModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  const { data: liveSummary } = useLive<any>('/live/summary', {
    projects_tracked: 0,
    need_attention: 0,
    open_prs: 0,
    ci_failing: 0,
    most_active_project: null,
    most_active_branch: null,
    last_sync: null,
    source_status: {}
  });

  const { data: liveEventsPayload, refresh: refreshEvents } = useLive<{ events: any[] }>('/live/events', {
    events: []
  });

  const refreshData = async () => {
    try {
      const [projRes, agentRes, apprRes, jarvisRes] = await Promise.all([
        fetch(`${API_BASE}/projects`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/agents`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/approvals`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/jarvis/briefing`).then((r) => r.json()).catch(() => null)
      ]);
      if (Array.isArray(projRes)) {
        setProjects(projRes);
        if (!currentProjectId && projRes.length > 0) setCurrentProjectId(projRes[0].id);
      }
      if (Array.isArray(agentRes)) setAgents(agentRes);
      if (Array.isArray(apprRes)) setApprovals(apprRes);
      if (jarvisRes?.script) {
        setJarvisBriefing(jarvisRes.script);
        setIsEmergencyPaused(Boolean(jarvisRes.emergency_paused));
      }
    } catch {
      if (IS_DEMO && projects.length === 0) {
        setProjects([{ id: 'demo-1', name: 'Demo Workspace', default_branch: 'main' }]);
      }
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, [currentProjectId]);

  const handleEmergencyPause = async () => {
    const nextState = !isEmergencyPaused;
    setIsEmergencyPaused(nextState);
    try {
      await fetch(`${API_BASE}/emergency-pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextState })
      });
    } catch {}
  };

  const handleApproveAction = async (approvalId: string, token: string) => {
    try {
      await fetch(`${API_BASE}/approvals/${approvalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'approved',
          approval_token: token,
          channel: 'desktop_ui'
        })
      });
      await refreshData();
    } catch {}
  };

  const handleDenyAction = async (approvalId: string, token: string) => {
    try {
      await fetch(`${API_BASE}/approvals/${approvalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'rejected',
          approval_token: token,
          channel: 'desktop_ui'
        })
      });
      await refreshData();
    } catch {}
  };

  const handleCreateProject = async (name: string, goal: string, repoUrl: string) => {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, goal, repo_url: repoUrl })
    }).then((r) => r.json());
    if (res?.id) {
      setProjects((prev) => [res, ...prev]);
      setCurrentProjectId(res.id);
    }
  };

  const handleGeneratePlan = async (goal: string) => {
    if (!currentProjectId) throw new Error('No active project');
    const res = await fetch(`${API_BASE}/projects/${currentProjectId}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal })
    }).then((r) => r.json());
    await refreshData();
    return res;
  };

  const handleJarvisCommand = async (transcript: string) => {
    const res = await fetch(`${API_BASE}/jarvis/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, context_project_id: currentProjectId })
    }).then((r) => r.json());
    await refreshData();
    return { intent: res.intent, reply: res.spoken_reply };
  };

  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];
  const topPendingApproval = approvals.find((a) => a.status === 'pending');
  const isStandaloneNotch = window.location.hash === '#dynamic-island' || window.location.pathname === '/island';
  const isVoiceOverlay =
    window.location.hash === '#voice-overlay' ||
    window.location.pathname === '/voice-overlay' ||
    window.location.pathname === '/overlay';

  if (isVoiceOverlay || isStandaloneNotch) {
    return (
      <div
        id="app"
        className="w-full h-full bg-transparent overflow-hidden"
        style={{ background: 'transparent', backgroundColor: 'transparent', margin: 0, padding: 0 }}
      >
        <VoiceOverlay
          isStandaloneOverlay={true}
          currentProjectName={liveSummary?.most_active_project || currentProject?.name || null}
          needAttention={liveSummary?.need_attention ?? 0}
          lastSync={liveSummary?.last_sync ?? null}
          pendingApproval={
            topPendingApproval
              ? {
                  id: topPendingApproval.id,
                  action: topPendingApproval.action,
                  risk_level: topPendingApproval.risk_level,
                  token: topPendingApproval.approval_token
                }
              : null
          }
          isEmergencyPaused={isEmergencyPaused}
          onApproveAction={handleApproveAction}
          onDenyAction={handleDenyAction}
          onOpenCommandCenter={() => {
            fetch(`${API_BASE}/tray/restore-window`, { method: 'POST' }).catch(() => {});
          }}
          onCloseOverlay={() => {
            fetch(`${API_BASE}/overlay/toggle`, { method: 'POST' }).catch(() => {});
          }}
          onSendCommand={async (cmd, tone) => {
            const res = await fetch(`${API_BASE}/jarvis/command`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcript: cmd, tone })
            }).then((r) => r.json());
            await refreshData();
            return { intent: res.intent, reply: res.spoken_reply };
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0A0A0B] text-[#F2F2F2] overflow-hidden">
      {IS_DEMO && (
        <div className="px-4 py-1 bg-[#FF3B30] text-[#0A0A0B] text-[11px] font-mono font-bold text-center">
          DEMO DATA MODE (PHOENIX_DEMO=1)
        </div>
      )}

      {/* Main Window Header */}
      <TitleBar
        currentProjectName={liveSummary?.most_active_project || currentProject?.name || null}
        currentBranch={liveSummary?.most_active_branch || currentProject?.default_branch || null}
        needAttention={liveSummary?.need_attention ?? 0}
        projectsTracked={liveSummary?.projects_tracked ?? 0}
        isEmergencyPaused={isEmergencyPaused}
        onEmergencyPauseToggle={handleEmergencyPause}
      />

      {/* Main Desktop Window Shell */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          pendingApprovalsCount={approvals.filter((a) => a.status === 'pending').length}
        />

        <main className="flex-1 flex overflow-hidden">
          {activeView === 'command-center' && (
            <CommandCenterView
              summary={liveSummary}
              events={liveEventsPayload?.events || []}
              onTriggerPlanModal={() => setIsPlanModalOpen(true)}
              onSendCommand={handleJarvisCommand}
              onOpenSettings={() => setActiveView('settings')}
            />
          )}

          {activeView === 'approvals' && (
            <ApprovalsView
              approvals={approvals}
              onApproveAction={handleApproveAction}
              onDenyAction={handleDenyAction}
            />
          )}

          {activeView === 'agents' && <AgentsView agents={agents} />}

          {activeView === 'projects' && (
            <ProjectsView
              projects={projects}
              currentProjectId={currentProjectId}
              onSelectProject={setCurrentProjectId}
              onCreateProject={handleCreateProject}
              onTriggerPlanModal={() => setIsPlanModalOpen(true)}
              onOpenSettings={() => setActiveView('settings')}
            />
          )}

          {activeView === 'settings' && <SettingsView />}

          {activeView === 'activity' && (
            <ActivityView events={liveEventsPayload?.events || []} onRefresh={refreshEvents} />
          )}
        </main>
      </div>

      <JarvisModal
        isOpen={isJarvisModalOpen}
        onClose={() => setIsJarvisModalOpen(false)}
        briefingScript={jarvisBriefing}
        onSendCommand={handleJarvisCommand}
        onOpenLiveVoice={() => setActiveView('settings')}
      />

      <PlanModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        projectName={liveSummary?.most_active_project || currentProject?.name || 'Workspace'}
        onGeneratePlan={handleGeneratePlan}
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
