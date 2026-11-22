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
import { LiveVoiceView } from './views/LiveVoiceView';
import { DynamicIslandSuiteView } from './views/DynamicIslandSuiteView';
import { DynamicIsland } from './components/DynamicIsland';
import { VoiceOverlay } from './components/VoiceOverlay';
import { JarvisModal } from './components/JarvisModal';
import { PlanModal } from './components/PlanModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export function App() {
  const [activeView, setActiveView] = useState<ViewType>('command-center');
  const [projects, setProjects] = useState<any[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [executionLogs, setExecutionLogs] = useState<any[]>([]);
  const [isEmergencyPaused, setIsEmergencyPaused] = useState(false);
  const [jarvisBriefing, setJarvisBriefing] = useState<string>('');
  const [isJarvisModalOpen, setIsJarvisModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [sessionUptime, setSessionUptime] = useState('06h 42m 19s');

  // Butler vocal greeting upon UI activation: "System online, Sir."
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const speakActivation = () => {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance('System online, Sir.');
          utterance.rate = 1.0;
          utterance.pitch = 0.95;
          const voices = window.speechSynthesis.getVoices();
          const britishVoice = voices.find(
            (v) =>
              v.lang.startsWith('en-GB') ||
              v.name.toLowerCase().includes('british') ||
              v.name.toLowerCase().includes('george') ||
              v.name.toLowerCase().includes('daniel')
          );
          if (britishVoice) utterance.voice = britishVoice;
          window.speechSynthesis.speak(utterance);
        } catch {}
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        speakActivation();
      } else {
        window.speechSynthesis.onvoiceschanged = speakActivation;
      }
    }
  }, []);

  // Initial Fetch & Refresh
  const refreshData = async () => {
    try {
      // 1. Projects
      const projRes = await fetch(`${API_BASE}/projects`).then((r) => r.json());
      if (Array.isArray(projRes) && projRes.length > 0) {
        setProjects(projRes);
        if (!currentProjectId) {
          setCurrentProjectId(projRes[0].id);
        }
      }

      // 2. Agents
      const agentRes = await fetch(`${API_BASE}/agents`).then((r) => r.json());
      if (Array.isArray(agentRes)) setAgents(agentRes);

      // 3. Approvals
      const apprRes = await fetch(`${API_BASE}/approvals`).then((r) => r.json());
      if (Array.isArray(apprRes)) setApprovals(apprRes);

      // 4. Execution Logs
      const logRes = await fetch(`${API_BASE}/activity?limit=50`).then((r) => r.json());
      if (Array.isArray(logRes)) setExecutionLogs(logRes);

      // 5. J.A.R.V.I.S. Briefing
      const jarvisRes = await fetch(`${API_BASE}/jarvis/briefing`).then((r) => r.json());
      if (jarvisRes?.script) {
        setJarvisBriefing(jarvisRes.script);
        setIsEmergencyPaused(jarvisRes.emergency_paused);
      }
    } catch {
      // Offline fallback state with realistic data matching Stitch designs
      if (projects.length === 0) {
        const mockProj = {
          id: 'proj-canteen-1',
          name: 'College Canteen App',
          description: 'Autonomous canteen pre-ordering mobile & web application.',
          goal: 'Build an MVP with login, menu browsing, cart, order placement and admin menu management.',
          repo_url: 'https://github.com/org/canteen-app',
          default_branch: 'feat/checkout-flow',
          created_at: new Date().toISOString()
        };
        setProjects([mockProj]);
        setCurrentProjectId(mockProj.id);
      }

      if (agents.length === 0) {
        setAgents([
          { id: 'chief_orchestrator', name: 'Chief Orchestrator', role: 'Global Coordination', model_name: 'gemini-2.5-flash', status: 'idle', total_tokens_used: 14200, success_rate: 98.4 },
          { id: 'project_manager', name: 'Project Manager', role: 'PRD & Decomposition', model_name: 'gemini-2.5-flash', status: 'idle', total_tokens_used: 28400, success_rate: 96.2 },
          { id: 'software_engineer', name: 'Software Engineer', role: 'Code & Refactoring', model_name: 'gemini-2.5-flash', status: 'running', total_tokens_used: 89500, success_rate: 92.1 },
          { id: 'qa_engineer', name: 'QA Engineer', role: 'Test Suite Execution', model_name: 'gemini-2.5-flash', status: 'running', total_tokens_used: 41200, success_rate: 95.8 },
          { id: 'security_reviewer', name: 'Security Reviewer', role: 'Diff Audits & Hygiene', model_name: 'gemini-2.5-flash', status: 'running', total_tokens_used: 19800, success_rate: 99.5 },
          { id: 'devops_engineer', name: 'DevOps Engineer', role: 'CI/CD & Staging', model_name: 'gemini-2.5-flash', status: 'idle', total_tokens_used: 23100, success_rate: 94.0 }
        ]);
      }

      if (approvals.length === 0) {
        setApprovals([
          {
            id: 'appr-mock-1',
            project_id: 'proj-canteen-1',
            action: 'Cloud Resource Provisioning (Redis Cluster)',
            rationale: 'Provision multi-region Redis replica for webhook idempotency key storage. Estimated cost: +$14.50/month against budget.',
            risk_level: 'medium',
            rollback_plan: 'Auto-deprovision Terraform state; fallback to memory cache.',
            action_payload: { provider: 'AWS ElastiCache', node_type: 'cache.t4g.micro', region: 'us-east-1' },
            approval_token: 'phx_appr_1774300000_c3ab87e912f9',
            token_expires_at: new Date(Date.now() + 3600000).toISOString(),
            status: 'pending',
            created_at: new Date().toISOString()
          }
        ]);
      }

      if (tasks.length === 0) {
        setTasks([
          { id: 'task-1', title: 'Stripe Webhook & Idempotency Key Storage', status: 'in_progress', priority: 'high', feature_branch: 'feat/checkout-flow' },
          { id: 'task-2', title: 'Order cancellation race condition test', status: 'blocked', priority: 'medium', feature_branch: 'feat/cancellation-race' },
          { id: 'task-3', title: 'OAuth2 JWT token refresh rotation', status: 'done', priority: 'high', feature_branch: 'feat/jwt-auth' }
        ]);
      }

      if (executionLogs.length === 0) {
        setExecutionLogs([
          { id: 'log-1', agent_id: 'software_engineer', level: 'info', event_type: 'tool_call', message: 'Mounted /workspaces/canteen-app into sandbox container phoenix-runner-canteen.', created_at: new Date().toISOString() },
          { id: 'log-2', agent_id: 'qa_engineer', level: 'info', event_type: 'test_result', message: 'Executed pytest tests/integration/test_checkout.py: 14 passed in 2.1s.', created_at: new Date().toISOString() },
          { id: 'log-3', agent_id: 'security_reviewer', level: 'warn', event_type: 'approval_requested', message: 'Interception: Redis resource provisioning requires verified human authorization.', created_at: new Date().toISOString() }
        ]);
      }
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [currentProjectId]);

  // Fetch Tasks for current project
  useEffect(() => {
    if (!currentProjectId) return;
    fetch(`${API_BASE}/projects/${currentProjectId}/tasks`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTasks(data);
      })
      .catch(() => {});
  }, [currentProjectId]);

  // Emergency Pause Toggle
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

  // 1-Click Approve Action
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
    } catch {
      // Local optimistic update
      setApprovals((prev) =>
        prev.map((a) => (a.id === approvalId ? { ...a, status: 'approved', decided_at: new Date().toISOString() } : a))
      );
    }
  };

  // 1-Click Deny Action
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
    } catch {
      setApprovals((prev) =>
        prev.map((a) => (a.id === approvalId ? { ...a, status: 'rejected', decided_at: new Date().toISOString() } : a))
      );
    }
  };

  // Create Project
  const handleCreateProject = async (name: string, goal: string, repoUrl: string) => {
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, goal, repo_url: repoUrl })
      }).then((r) => r.json());
      if (res?.id) {
        setProjects((prev) => [res, ...prev]);
        setCurrentProjectId(res.id);
      }
    } catch {
      const fallback = { id: `proj-${Date.now()}`, name, goal, repo_url: repoUrl, created_at: new Date().toISOString() };
      setProjects((prev) => [fallback, ...prev]);
      setCurrentProjectId(fallback.id);
    }
  };

  // Plan Milestone
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

  // J.A.R.V.I.S. Command
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
  const isVoiceOverlay = window.location.hash === '#voice-overlay' || window.location.pathname === '/voice-overlay' || window.location.pathname === '/overlay';

  if (isVoiceOverlay) {
    return (
      <VoiceOverlay
        isStandaloneOverlay={true}
        currentProjectName={currentProject?.name}
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
    );
  }

  if (isStandaloneNotch) {
    return (
      <div className="w-screen h-screen bg-transparent flex flex-col items-center justify-start pt-1 overflow-hidden select-none">
        <DynamicIsland
          activeAgent="SWE-03 · Run"
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
          dailySpend={18.42}
          sessionUptime={sessionUptime}
          isEmergencyPaused={isEmergencyPaused}
          onApproveAction={handleApproveAction}
          onDenyAction={handleDenyAction}
          onOpenVoice={() => {
            fetch(`${API_BASE}/tray/open-voice`, { method: 'POST' }).catch(() => {});
          }}
          onOpenFullApp={() => {
            fetch(`${API_BASE}/tray/restore-window`, { method: 'POST' }).catch(() => {});
          }}
          standalone={true}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-surface-container-lowest text-on-surface overflow-hidden">
      {/* Frameless Desktop Titlebar with Embedded Dynamic Island */}
      <TitleBar
        currentProjectName={currentProject?.name}
        currentBranch={currentProject?.default_branch || 'feat/checkout-flow'}
        jarvisStatus={isEmergencyPaused ? 'Paused' : 'Active'}
        isEmergencyPaused={isEmergencyPaused}
        onEmergencyPauseToggle={handleEmergencyPause}
        onOpenJarvisModal={() => setIsJarvisModalOpen(true)}
        onOpenLiveVoice={() => setActiveView('live-voice')}
        onOpenDynamicIslandSuite={() => setActiveView('dynamic-island')}
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
        activeAgent="SWE-03 · Run"
        dailySpend={18.42}
        onApproveAction={handleApproveAction}
        onDenyAction={handleDenyAction}
      />

      {/* Main Desktop Window Shell */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          pendingApprovalsCount={approvals.filter((a) => a.status === 'pending').length}
        />

        {/* Dynamic View Canvas */}
        <main className="flex-1 flex overflow-hidden">
          {activeView === 'command-center' && (
            <CommandCenterView
              currentProject={currentProject}
              tasks={tasks}
              agents={agents}
              approvals={approvals}
              executionLogs={executionLogs}
              dailySpend={18.42}
              sessionUptime={sessionUptime}
              onApproveAction={handleApproveAction}
              onDenyAction={handleDenyAction}
              onTriggerPlanModal={() => setIsPlanModalOpen(true)}
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
            />
          )}

          {activeView === 'settings' && <SettingsView />}

          {activeView === 'activity' && <ActivityView logs={executionLogs} />}

          {activeView === 'live-voice' && (
            <div className="flex-1 flex flex-col h-[calc(100vh-2.5rem)] bg-surface-container-lowest overflow-hidden relative">
              <div className="h-12 px-6 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/80 backdrop-blur-md z-10 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">graphic_eq</span>
                  <span className="text-sm font-semibold tracking-wide">Live Conversational Voice Cockpit</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container border border-outline-variant/40 text-primary">
                    NATURAL HUMAN VOICE
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      fetch(`${API_BASE}/overlay/toggle`, { method: 'POST' }).catch(() => {});
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-mono font-bold hover:bg-primary-container transition-all shadow-sm"
                    title="Pop out into a true frameless, transparent screen overlay floating over Windows"
                  >
                    <span className="material-symbols-outlined text-[15px]">picture_in_picture_alt</span>
                    <span>Float on Desktop Screen</span>
                  </button>
                  <button
                    onClick={() => setActiveView('command-center')}
                    className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-outline hover:text-on-surface text-xs font-mono transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-surface-container-lowest to-[#08090b]">
                <VoiceOverlay
                  isStandaloneOverlay={false}
                  currentProjectName={currentProject?.name}
                  onOpenCommandCenter={() => setActiveView('command-center')}
                  onCloseOverlay={() => setActiveView('command-center')}
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
            </div>
          )}

          {activeView === 'dynamic-island' && (
            <DynamicIslandSuiteView
              currentProjectName={currentProject?.name}
              dailySpend={18.42}
              onApproveAction={handleApproveAction}
              onDenyAction={handleDenyAction}
              onOpenVoice={() => setActiveView('live-voice')}
            />
          )}
        </main>
      </div>

      {/* J.A.R.V.I.S. Voice Engine Modal */}
      <JarvisModal
        isOpen={isJarvisModalOpen}
        onClose={() => setIsJarvisModalOpen(false)}
        briefingScript={jarvisBriefing}
        onSendCommand={handleJarvisCommand}
        onOpenLiveVoice={() => setActiveView('live-voice')}
      />

      {/* Plan Milestone Modal */}
      <PlanModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        projectName={currentProject?.name || 'Initiative'}
        onGeneratePlan={handleGeneratePlan}
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
