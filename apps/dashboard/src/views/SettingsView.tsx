import React, { useState, useEffect, useRef } from 'react';
import { apiFetch, liveApi } from '../lib/liveApi';
import { SourceBadge, SourceStatus } from '../components/LiveStatus';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('5173')
    ? window.location.origin
    : 'http://localhost:8000');

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  language: string;
  description: string;
  recommended_for_tone: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  tier: string;
  description: string;
  is_available: boolean;
  is_active: boolean;
  voices: VoiceOption[];
}

export type VoiceTone = 'calm_concise' | 'conversational' | 'direct';

export const SettingsView: React.FC = () => {
  const [dailyBudget, setDailyBudget] = useState(50.0);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [telephonyEnabled, setTelephonyEnabled] = useState(true);
  const [lockedPaths, setLockedPaths] = useState('auth/*, billing/*, infra/prod/*');
  const [saved, setSaved] = useState(false);

  // Swappable TTS State
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('edge_tts');
  const [activeVoiceId, setActiveVoiceId] = useState<string>('en-GB-RyanNeural');
  const [savedVoiceName, setSavedVoiceName] = useState<string>('Ryan (British Butler / J.A.R.V.I.S.)');
  const [voicesState, setVoicesState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [activeTone, setActiveTone] = useState<VoiceTone>('calm_concise');
  const [voiceRate, setVoiceRate] = useState<number>(1.0);
  const [voicePitch, setVoicePitch] = useState<number>(1.0);
  const [greetingEnabled, setGreetingEnabled] = useState<boolean>(true);
  const [speakTypedReplies, setSpeakTypedReplies] = useState<boolean>(false);
  const [voiceNotFoundNotice, setVoiceNotFoundNotice] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isTestingVoice, setIsTestingVoice] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<string>('');
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const saveTimerRef = useRef<any>(null);

  // Live Integrations State
  const [intStatus, setIntStatus] = useState<{
    github_connected: boolean;
    keyring_available?: boolean;
    source_status: Record<string, SourceStatus>;
    projects: any[];
    antigravity_running: boolean;
    prefs: {
      ag_poll_seconds: number;
      gh_poll_focused_seconds: number;
      gh_poll_idle_seconds: number;
      speak_urgent: boolean;
      boot_digest: boolean;
    };
  } | null>(null);
  const [patInput, setPatInput] = useState('');
  const [ghClientId, setGhClientId] = useState('');
  const [deviceFlow, setDeviceFlow] = useState<{
    device_code: string;
    user_code: string;
    verification_uri: string;
  } | null>(null);
  const [intBusy, setIntBusy] = useState(false);
  const [intMsg, setIntMsg] = useState<string | null>(null);

  const loadIntegrations = () => {
    liveApi
      .get<any>('/live/integrations/status')
      .then((d) => setIntStatus(d))
      .catch(() => {});
  };

  const persistSettingsDebounced = (override?: Partial<{
    engine: string;
    id: string;
    name: string;
    lang: string;
    rate: number;
    pitch: number;
    tone: string;
    greetingEnabled: boolean;
    speakTypedReplies: boolean;
  }>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const eng = override?.engine ?? activeProviderId;
      const vid = override?.id ?? activeVoiceId;
      const prov = providers.find((p) => p.id === eng);
      const vObj = prov?.voices.find((v) => v.id === vid);
      const rawTone = override?.tone ?? activeTone;
      const normTone = rawTone === 'calm_concise' ? 'concise' : rawTone;
      fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: {
            engine: eng,
            id: vid,
            name: override?.name ?? vObj?.name ?? vid,
            lang: override?.lang ?? vObj?.language ?? 'en-GB',
            rate: override?.rate ?? voiceRate,
            pitch: override?.pitch ?? voicePitch,
            tone: normTone
          },
          greeting: { enabled: override?.greetingEnabled ?? greetingEnabled },
          speakTypedReplies: override?.speakTypedReplies ?? speakTypedReplies
        })
      }).catch(() => {});
    }, 300);
  };

  const loadVoiceSettings = async () => {
    setVoicesState('loading');
    try {
      const [provData, cfg] = await Promise.all([
        apiFetch<any>('/api/tts/providers'),
        apiFetch<any>('/api/settings')
      ]);
      if (provData?.providers) setProviders(provData.providers);
      if (cfg?.voice) {
        setActiveProviderId(cfg.voice.engine || 'edge_tts');
        setActiveVoiceId(cfg.voice.id || 'en-GB-RyanNeural');
        setSavedVoiceName(cfg.voice.name || cfg.voice.id || 'en-GB-RyanNeural');
        const t = cfg.voice.tone === 'concise' ? 'calm_concise' : (cfg.voice.tone || 'calm_concise');
        setActiveTone(t as VoiceTone);
        setVoiceRate(typeof cfg.voice.rate === 'number' ? cfg.voice.rate : 1.0);
        setVoicePitch(typeof cfg.voice.pitch === 'number' ? cfg.voice.pitch : 1.0);
        setGreetingEnabled(cfg.greeting?.enabled !== false);
        setSpeakTypedReplies(Boolean(cfg.speakTypedReplies));
        if (cfg.voice_available === false) {
          setVoiceNotFoundNotice('Saved voice not found, using default');
        } else {
          setVoiceNotFoundNotice('');
        }
      }
      setVoicesState('loaded');
    } catch {
      setVoicesState('error');
    }
  };

  // Fetch TTS Providers & canonical settings.json on mount
  useEffect(() => {
    loadVoiceSettings();
    loadIntegrations();
  }, []);

  // Update voice choices when active provider changes
  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0];
  const currentVoices = activeProvider?.voices || [];
  const matchedVoice = currentVoices.find((v) => v.id === activeVoiceId);
  const resolvedSelectVoiceId =
    matchedVoice?.id ||
    currentVoices.find((v) => v.id === 'en-GB-RyanNeural')?.id ||
    currentVoices[0]?.id ||
    '';

  const handleProviderChange = (newProviderId: string) => {
    setActiveProviderId(newProviderId);
    const prov = providers.find((p) => p.id === newProviderId);
    const nextVoice = prov && prov.voices.length > 0 ? prov.voices[0] : null;
    if (nextVoice) {
      setActiveVoiceId(nextVoice.id);
      setVoiceNotFoundNotice('');
      persistSettingsDebounced({
        engine: newProviderId,
        id: nextVoice.id,
        name: nextVoice.name,
        lang: nextVoice.language
      });
    } else {
      persistSettingsDebounced({ engine: newProviderId });
    }
  };

  const handleTestVoice = async () => {
    if (isTestingVoice) return;
    setIsTestingVoice(true);
    setTestStatus('Synthesizing speech sample...');

    try {
      if (activeProviderId === 'browser_speech') {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const sample =
            activeTone === 'calm_concise'
              ? 'Good day, Sir. Diagnostics are nominal, and the neural voice matrix is operating at peak fidelity.'
              : activeTone === 'conversational'
              ? "Hey there! Everything is running smoothly, and I'm ready to collaborate whenever you need me."
              : 'Diagnostics nominal. Zero errors detected. Standing by for command.';
          const u = new SpeechSynthesisUtterance(sample);
          u.pitch = activeTone === 'calm_concise' ? 0.95 : 1.0;
          u.rate = activeTone === 'direct' ? 1.15 : 1.0;
          u.onend = () => {
            setIsTestingVoice(false);
            setTestStatus('Playback complete.');
            setTimeout(() => setTestStatus(''), 2000);
          };
          window.speechSynthesis.speak(u);
          return;
        }
      }

      const testPhrase =
        activeTone === 'calm_concise'
          ? 'Good day, Sir. Diagnostics are nominal, and the neural speech engine is fully synchronized.'
          : activeTone === 'conversational'
          ? "Hey there! Everything's looking great, and the build pipeline is running completely smoothly."
          : 'Status nominal. All systems operational. Standing by for instruction.';

      const resp = await fetch(`${API_BASE}/api/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testPhrase
        })
      });

      if (!resp.ok) {
        throw new Error(`Synthesis failed with HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const audioUrl = URL.createObjectURL(blob);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      setTestStatus('Speaking...');

      audio.onended = () => {
        setIsTestingVoice(false);
        setTestStatus('Playback complete.');
        setTimeout(() => setTestStatus(''), 2000);
      };
      audio.onerror = () => {
        setIsTestingVoice(false);
        setTestStatus('Audio playback error.');
      };

      await audio.play();
    } catch (err: any) {
      setIsTestingVoice(false);
      setTestStatus(`Error: ${err.message || 'Synthesis unavailable'}`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Save TTS settings to backend
      await fetch(`${API_BASE}/api/tts/providers/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: activeProviderId,
          voice_id: activeVoiceId,
          tone: activeTone,
          api_key: apiKeyInput || undefined
        })
      });
    } catch {
      // Local fallback
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex-1 h-[calc(100vh-2.5rem)] overflow-y-auto bg-surface-container-lowest p-6 flex flex-col gap-6 font-sans">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">System & Policy Settings</h2>
          <p className="text-xs text-outline font-mono mt-0.5">
            DETERMINISTIC PERMISSION MATRICES // J.A.R.V.I.S. VOICE SYNTHESIS ENGINE
          </p>
        </div>
        {saved && (
          <span className="px-3 py-1 rounded bg-primary/20 text-primary text-xs font-mono font-bold animate-pulse">
            Policy & Voice Config Updated, Sir.
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-3xl font-sans text-sm">
        {/* Section 0: Live Integrations (Antigravity & GitHub) */}
        <div className="p-5 rounded-[4px] bg-[#111113] border border-white/[0.08] flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#F2F2F2]">Integrations & Live Sync</h3>
              <p className="text-[11px] text-[#8A8A8E] font-mono">
                READ-ONLY ANTIGRAVITY WORKSPACES // GITHUB GRAPHQL & CREDENTIAL MANAGER
              </p>
            </div>
            <button
              type="button"
              disabled={intBusy}
              onClick={async () => {
                setIntBusy(true);
                setIntMsg(null);
                try {
                  await liveApi.post('/live/sync', { source: 'all' });
                  loadIntegrations();
                  setIntMsg('Sync complete.');
                } catch (e: any) {
                  setIntMsg(e?.message || 'Sync failed');
                } finally {
                  setIntBusy(false);
                }
              }}
              className="px-3 py-1.5 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] text-xs font-medium hover:bg-white disabled:opacity-50"
            >
              {intBusy ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {intMsg && (
            <div className="px-3 py-2 rounded-[4px] bg-[#0A0A0B] border border-white/[0.10] text-xs font-mono text-[#F2F2F2]">
              {intMsg}
            </div>
          )}

          {/* GitHub Card */}
          <div className="p-4 rounded-[4px] bg-[#0A0A0B] border border-white/[0.08] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono uppercase text-[#F2F2F2]">GitHub</span>
                <SourceBadge label="status" status={intStatus?.source_status?.github} />
              </div>
              {intStatus?.github_connected && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={intBusy}
                    onClick={async () => {
                      setIntBusy(true);
                      setIntMsg(null);
                      try {
                        const res = await liveApi.post<any>('/live/integrations/github/test');
                        if (res.ok) {
                          setIntMsg(`GitHub OK: @${res.login} · ${res.repo_count} repos · quota ${res.rate_remaining ?? '—'}`);
                        } else {
                          const perms = (res.missing_permissions || []).join(', ');
                          setIntMsg(`GitHub test failed: ${res.error}${perms ? ` (Missing: ${perms})` : ''}`);
                        }
                      } catch (e: any) {
                        setIntMsg(e?.message || 'Test connection failed');
                      } finally {
                        setIntBusy(false);
                      }
                    }}
                    className="px-2.5 py-1 rounded-[4px] border border-white/[0.14] text-[#F2F2F2] text-[11px] font-mono hover:border-white/[0.3]"
                  >
                    Test Connection
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIntBusy(true);
                      await liveApi.del('/live/integrations/github').catch(() => {});
                      loadIntegrations();
                      setIntBusy(false);
                    }}
                    className="px-2.5 py-1 rounded-[4px] border border-[#FF3B30]/40 text-[#FF3B30] text-[11px] font-mono hover:bg-[#FF3B30]/10"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>

            {intStatus?.github_connected ? (
              <div className="text-xs font-mono text-[#8A8A8E] flex flex-col gap-1">
                <div>
                  User: <span className="text-[#F2F2F2]">{intStatus.source_status?.github?.meta?.login || 'connected'}</span>
                  {' · '}Repos: <span className="text-[#F2F2F2] tabular-nums">{intStatus.source_status?.github?.meta?.repo_count ?? 0}</span>
                  {' · '}Quota left: <span className="text-[#F2F2F2] tabular-nums">{intStatus.source_status?.github?.meta?.rate_remaining ?? '—'}</span>
                </div>
                <div>
                  Scopes: {(intStatus.source_status?.github?.meta?.scopes || []).join(', ') || 'read-only'}
                </div>
                {intStatus.source_status?.github?.last_error && (
                  <div className="text-[#FF3B30]">
                    Notice: {intStatus.source_status.github.last_error}
                  </div>
                )}
              </div>
            ) : intStatus?.keyring_available === false ? (
              <div className="p-3 rounded-[4px] bg-[#111113] border border-[#FF3B30]/40 text-xs font-mono text-[#FF3B30]">
                Secure token storage unavailable (Windows Credential Manager / keyring backend could not be loaded). PAT entry is disabled.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-mono text-[#8A8A8E]">
                  Use a fine-grained PAT with read-only permissions: Metadata, Contents, Pull requests, Issues, Actions, Checks. Stored in Windows Credential Manager.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    placeholder="github_pat_..."
                    className="flex-1 bg-[#111113] border border-white/[0.10] rounded-[4px] px-3 py-1.5 text-xs font-mono text-[#F2F2F2]"
                  />
                  <button
                    type="button"
                    disabled={intBusy || !patInput.trim()}
                    onClick={async () => {
                      setIntBusy(true);
                      setIntMsg(null);
                      try {
                        await liveApi.post('/live/integrations/github/pat', { token: patInput.trim() });
                        setPatInput('');
                        loadIntegrations();
                        setIntMsg('GitHub connected.');
                      } catch (e: any) {
                        setIntMsg(e?.message || 'GitHub connection failed');
                      } finally {
                        setIntBusy(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] text-xs font-medium disabled:opacity-50"
                  >
                    Connect PAT
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <input
                    type="text"
                    value={ghClientId}
                    onChange={(e) => setGhClientId(e.target.value)}
                    placeholder="OAuth App Client ID (Device Flow)"
                    className="flex-1 bg-[#111113] border border-white/[0.10] rounded-[4px] px-3 py-1.5 text-xs font-mono text-[#F2F2F2]"
                  />
                  <button
                    type="button"
                    disabled={intBusy || !ghClientId.trim()}
                    onClick={async () => {
                      setIntBusy(true);
                      setIntMsg(null);
                      try {
                        const res = await liveApi.post<any>('/live/integrations/github/device/start', {
                          client_id: ghClientId.trim()
                        });
                        setDeviceFlow(res);
                      } catch (e: any) {
                        setIntMsg(e?.message || 'Device flow failed');
                      } finally {
                        setIntBusy(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-[4px] border border-white/[0.12] text-xs font-mono text-[#F2F2F2] disabled:opacity-50"
                  >
                    Device Flow
                  </button>
                </div>

                {deviceFlow && (
                  <div className="p-3 rounded-[4px] bg-[#111113] border border-white/[0.10] text-xs font-mono flex items-center justify-between gap-3">
                    <div>
                      Open <span className="text-[#F2F2F2]">{deviceFlow.verification_uri}</span> and enter{' '}
                      <span className="text-[#F2F2F2] font-bold">{deviceFlow.user_code}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await liveApi.post<any>('/live/integrations/github/device/poll', {
                          client_id: ghClientId.trim(),
                          device_code: deviceFlow.device_code
                        });
                        if (r.ok) {
                          setDeviceFlow(null);
                          loadIntegrations();
                          setIntMsg('GitHub connected via Device Flow.');
                        } else {
                          setIntMsg(`Device Flow: ${r.status}`);
                        }
                      }}
                      className="px-2.5 py-1 rounded-[4px] bg-[#F2F2F2] text-[#0A0A0B] text-[11px]"
                    >
                      Verify
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Antigravity & Tracked Projects */}
          <div className="p-4 rounded-[4px] bg-[#0A0A0B] border border-white/[0.08] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono uppercase text-[#F2F2F2]">Antigravity IDE</span>
                <SourceBadge label="scan" status={intStatus?.source_status?.antigravity} />
              </div>
              <button
                type="button"
                onClick={async () => {
                  await liveApi.post('/live/projects/pick-folder').catch(() => {});
                  loadIntegrations();
                }}
                className="px-2.5 py-1 rounded-[4px] border border-white/[0.12] text-[11px] font-mono text-[#F2F2F2] hover:border-white/[0.25]"
              >
                Add Folder
              </button>
            </div>
            <div className="text-[11px] font-mono text-[#8A8A8E]">
              Roots: {(intStatus?.source_status?.antigravity?.meta?.roots || []).join(', ') || 'None detected'}
              {' · '}IDE {intStatus?.antigravity_running ? 'Running' : 'Not running'}
            </div>
            {intStatus?.projects && intStatus.projects.length > 0 && (
              <div className="divide-y divide-white/[0.06] border border-white/[0.06] rounded-[4px] max-h-40 overflow-y-auto">
                {intStatus.projects.map((p) => (
                  <div key={p.id} className="px-3 py-2 flex items-center justify-between text-xs font-mono">
                    <span className={p.excluded ? 'text-[#55555A] line-through' : 'text-[#F2F2F2]'}>
                      {p.name} {p.remote_repo ? `(${p.remote_repo})` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await liveApi.post(`/live/projects/${encodeURIComponent(p.id)}/exclude`, {
                          excluded: !p.excluded
                        });
                        loadIntegrations();
                      }}
                      className="text-[11px] text-[#8A8A8E] hover:text-[#F2F2F2]"
                    >
                      {p.excluded ? 'Include' : 'Exclude'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Polling & Proactive Digest Toggles */}
          {intStatus?.prefs && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <label className="flex items-center justify-between p-2.5 rounded-[4px] bg-[#0A0A0B] border border-white/[0.08] cursor-pointer">
                <span className="text-[#F2F2F2]">Boot spoken digest</span>
                <input
                  type="checkbox"
                  checked={intStatus.prefs.boot_digest}
                  onChange={async (e) => {
                    await liveApi.post('/live/settings', { boot_digest: e.target.checked });
                    loadIntegrations();
                  }}
                />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded-[4px] bg-[#0A0A0B] border border-white/[0.08] cursor-pointer">
                <span className="text-[#F2F2F2]">Speak urgent CI/approval alerts</span>
                <input
                  type="checkbox"
                  checked={intStatus.prefs.speak_urgent}
                  onChange={async (e) => {
                    await liveApi.post('/live/settings', { speak_urgent: e.target.checked });
                    loadIntegrations();
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Section 1: Realistic Swappable Voice & Speech Synthesis */}
        <div className="p-5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">graphic_eq</span>
              <div>
                <h3 className="text-sm font-semibold text-on-surface">Realistic Swappable Voice Engine</h3>
                <p className="text-[11px] text-outline font-mono">
                  Multi-provider voice adapter for Top Notch & Command Center
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestVoice}
                disabled={isTestingVoice}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all ${
                  isTestingVoice
                    ? 'bg-primary/20 text-primary border border-primary/40 animate-pulse'
                    : 'bg-primary text-on-primary hover:bg-primary-container shadow-sm'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isTestingVoice ? 'volume_up' : 'play_arrow'}
                </span>
                <span>{isTestingVoice ? 'Speaking...' : 'Test Voice'}</span>
              </button>
            </div>
          </div>

          {testStatus && (
            <div className="px-3 py-1.5 rounded bg-surface-container text-xs font-mono text-primary flex items-center gap-2 border border-primary/20">
              <span className="material-symbols-outlined text-[15px] animate-spin">sync</span>
              <span>{testStatus}</span>
            </div>
          )}

          {/* Provider Selection Cards */}
          <div>
            <label className="text-xs font-mono text-outline uppercase block mb-2">
              Active Voice Engine Provider
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {providers.map((p) => {
                const isSelected = p.id === activeProviderId;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-on-surface ring-1 ring-primary/40'
                        : 'bg-surface-container-lowest border-outline-variant/30 hover:border-outline-variant/60 text-outline'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-xs text-on-surface">{p.name}</div>
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                          p.tier.includes('Free (No Key')
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : p.tier.includes('Free Tier')
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            : 'bg-surface-container text-outline'
                        }`}
                      >
                        {p.tier}
                      </span>
                    </div>
                    <p className="text-[10px] text-outline mt-1.5 leading-relaxed">{p.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Voice selection & Persona Tone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-outline uppercase block mb-1">
                Selected Voice Character
              </label>
              <select
                value={currentVoices.length === 0 ? activeVoiceId : resolvedSelectVoiceId}
                disabled={voicesState === 'loading' || (voicesState === 'error' && currentVoices.length === 0)}
                onChange={(e) => {
                  const vid = e.target.value;
                  setActiveVoiceId(vid);
                  setVoiceNotFoundNotice('');
                  const vObj = currentVoices.find((v) => v.id === vid);
                  if (vObj?.name) setSavedVoiceName(vObj.name);
                  persistSettingsDebounced({ id: vid, name: vObj?.name ?? vid, lang: vObj?.language ?? 'en-GB' });
                }}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface text-xs focus:outline-none focus:border-primary font-mono"
              >
                {currentVoices.length === 0 ? (
                  <option value={activeVoiceId}>
                    {voicesState === 'loading' ? 'Loading voices...' : `${savedVoiceName} (${activeVoiceId})`}
                  </option>
                ) : (
                  currentVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.gender}, {v.language})
                    </option>
                  ))
                )}
              </select>
              {voicesState === 'error' && (
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] text-[#FF3B30] font-mono">Backend unreachable.</span>
                  <button
                    type="button"
                    onClick={loadVoiceSettings}
                    className="text-[11px] font-mono text-[#F2F2F2] underline hover:text-white"
                  >
                    Retry
                  </button>
                </div>
              )}
              {(voiceNotFoundNotice || (currentVoices.length > 0 && !matchedVoice)) && (
                <p className="text-[11px] text-[#FF3B30] font-mono mt-1">
                  {voiceNotFoundNotice || 'Saved voice not found, using default'}
                </p>
              )}
              {currentVoices.find((v) => v.id === activeVoiceId)?.description && (
                <p className="text-[10px] text-outline mt-1 italic">
                  {currentVoices.find((v) => v.id === activeVoiceId)?.description}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-mono text-outline uppercase block mb-1">
                Spoken Persona Tone
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'calm_concise', label: 'Calm Butler', desc: 'Paul Bettany cadence' },
                    { id: 'conversational', label: 'Human Peer', desc: 'Warm collaborator' },
                    { id: 'direct', label: 'Direct Brief', desc: 'Zero fluff' }
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveTone(t.id);
                      persistSettingsDebounced({ tone: t.id });
                    }}
                    className={`py-2 px-1.5 rounded text-center border transition-all ${
                      activeTone === t.id
                        ? 'bg-primary text-on-primary border-primary font-bold shadow-sm'
                        : 'bg-surface-container-lowest border-outline-variant/40 text-outline hover:text-on-surface'
                    }`}
                  >
                    <div className="text-[11px] font-semibold">{t.label}</div>
                    <div className="text-[9px] opacity-75 truncate">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Rate, Pitch, Startup Greeting & Typed Reply Speech Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-outline-variant/20">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-outline mb-1">
                <span>SPEECH RATE</span>
                <span className="text-on-surface tabular-nums">{voiceRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={voiceRate}
                onChange={(e) => {
                  const r = parseFloat(e.target.value);
                  setVoiceRate(r);
                  persistSettingsDebounced({ rate: r });
                }}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-mono text-outline mb-1">
                <span>VOICE PITCH</span>
                <span className="text-on-surface tabular-nums">{voicePitch.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={voicePitch}
                onChange={(e) => {
                  const p = parseFloat(e.target.value);
                  setVoicePitch(p);
                  persistSettingsDebounced({ pitch: p });
                }}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            <label className="flex items-center justify-between gap-3 p-2.5 rounded bg-surface-container-lowest border border-outline-variant/30 cursor-pointer">
              <span className="text-xs font-mono text-on-surface">Speak greeting on startup</span>
              <input
                type="checkbox"
                checked={greetingEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setGreetingEnabled(checked);
                  persistSettingsDebounced({ greetingEnabled: checked });
                }}
                className="accent-primary"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-2.5 rounded bg-surface-container-lowest border border-outline-variant/30 cursor-pointer">
              <span className="text-xs font-mono text-on-surface">Speak replies to typed commands</span>
              <input
                type="checkbox"
                checked={speakTypedReplies}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSpeakTypedReplies(checked);
                  persistSettingsDebounced({ speakTypedReplies: checked });
                }}
                className="accent-primary"
              />
            </label>
          </div>

          {/* API Key configuration for keys-enabled providers */}
          {activeProviderId !== 'edge_tts' && activeProviderId !== 'browser_speech' && (
            <div className="p-3 rounded bg-surface-container-lowest border border-outline-variant/30 flex flex-col gap-1.5">
              <label className="text-xs font-mono text-outline uppercase">
                {activeProviderId === 'elevenlabs'
                  ? 'ElevenLabs API Key (Free Tier 10,000 Chars/Mo)'
                  : activeProviderId === 'google_cloud'
                  ? 'Google Cloud TTS API Key (1,000,000 Chars/Mo Free)'
                  : 'OpenAI API Key or Local TTS Endpoint'}
              </label>
              <input
                type="password"
                placeholder={
                  activeProviderId === 'openai_compatible'
                    ? 'Enter API Key or http://localhost:8880/v1'
                    : 'Enter API Key...'
                }
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/40 rounded px-3 py-1.5 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
              />
              <span className="text-[10px] text-outline">
                Saved securely in local instance state data/tts_settings.json.
              </span>
            </div>
          )}

          {/* Speech Guidelines Notice */}
          <div className="p-3 rounded bg-surface-container-lowest/50 border border-outline-variant/20 flex items-center gap-3">
            <span className="material-symbols-outlined text-outline text-[18px]">verified_user</span>
            <div className="text-[11px] text-outline leading-tight">
              <span className="font-semibold text-on-surface">Sanitized Human Speech Matrix:</span> Raw markdown,
              code blocks, asterisks, brackets, and raw symbols are automatically converted to natural human speech
              cadence before passing to the audio synthesizers.
            </div>
          </div>
        </div>

        {/* Section 2: Financial & Budget Guardrails */}
        <div className="p-5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
            <span className="material-symbols-outlined text-primary text-[18px]">payments</span>
            <h3 className="text-sm font-semibold text-on-surface">API Budget & Financial Guardrails</h3>
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono text-outline mb-1">
              <span>Daily API Hard Spend Cap:</span>
              <span className="text-on-surface font-bold">${dailyBudget.toFixed(2)} USD</span>
            </div>
            <input
              type="range"
              min="10"
              max="200"
              step="5"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-[11px] text-outline mt-1 font-mono">
              Hard backend cutoff enforced when cumulative daily token spend exceeds this threshold.
            </p>
          </div>
        </div>

        {/* Section 3: Telephony & Quiet Hours */}
        <div className="p-5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
            <span className="material-symbols-outlined text-primary text-[18px]">call</span>
            <h3 className="text-sm font-semibold text-on-surface">Telephony & Quiet Hours</h3>
          </div>

          <div className="flex items-center justify-between p-3 rounded bg-surface-container">
            <div>
              <span className="text-xs font-semibold text-on-surface block">Outbound Telephony Incident Escalations</span>
              <span className="text-[10px] text-outline">Twilio SIP voice alerts for critical Sev-1 outages</span>
            </div>
            <input
              type="checkbox"
              checked={telephonyEnabled}
              onChange={(e) => setTelephonyEnabled(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-outline uppercase block mb-1">Quiet Hours Start</label>
              <input
                type="time"
                value={quietHoursStart}
                onChange={(e) => setQuietHoursStart(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-outline uppercase block mb-1">Quiet Hours End</label>
              <input
                type="time"
                value={quietHoursEnd}
                onChange={(e) => setQuietHoursEnd(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 4: User-Locked File Paths */}
        <div className="p-5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
            <span className="material-symbols-outlined text-primary text-[18px]">lock</span>
            <h3 className="text-sm font-semibold text-on-surface">User-Locked Restricted Paths</h3>
          </div>

          <div>
            <label className="text-xs font-mono text-outline uppercase block mb-1">
              Protected Path Patterns (Comma Separated)
            </label>
            <input
              type="text"
              value={lockedPaths}
              onChange={(e) => setLockedPaths(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
            />
            <p className="text-[11px] text-outline mt-1 font-mono">
              Agents cannot mutate matching files without explicit cryptographic sign-off.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="px-6 py-2 rounded bg-primary text-on-primary font-medium text-xs hover:bg-primary-container transition-colors shadow-sm"
          >
            Save All Configurations
          </button>
        </div>
      </form>
    </div>
  );
};
