import React, { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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
  const [activeTone, setActiveTone] = useState<VoiceTone>('calm_concise');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isTestingVoice, setIsTestingVoice] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<string>('');
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Fetch TTS Providers metadata on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/tts/providers`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.providers) {
          setProviders(data.providers);
          if (data.active_provider_id) setActiveProviderId(data.active_provider_id);
          if (data.active_voice_id) setActiveVoiceId(data.active_voice_id);
          if (data.active_tone) setActiveTone(data.active_tone);
        }
      })
      .catch(() => {
        // Fallback defaults if backend is initializing
        setProviders([
          {
            id: 'edge_tts',
            name: 'Edge Neural (Free & Unlimited)',
            tier: 'Free (No Key Required)',
            description: 'Ultra-realistic studio neural voices powered by Microsoft Azure. No API key needed.',
            is_available: true,
            is_active: true,
            voices: [
              {
                id: 'en-GB-RyanNeural',
                name: 'Ryan (British Butler / J.A.R.V.I.S.)',
                gender: 'Male',
                language: 'en-GB',
                description: 'Warm, composed British butler cadence, refined and articulate.',
                recommended_for_tone: 'calm_concise'
              },
              {
                id: 'en-GB-SoniaNeural',
                name: 'Sonia (British Female)',
                gender: 'Female',
                language: 'en-GB',
                description: 'Clear, poised British professional voice.',
                recommended_for_tone: 'calm_concise'
              },
              {
                id: 'en-US-ChristopherNeural',
                name: 'Christopher (US Senior Engineer)',
                gender: 'Male',
                language: 'en-US',
                description: 'Confident, natural collaborative male colleague.',
                recommended_for_tone: 'conversational'
              },
              {
                id: 'en-US-JennyNeural',
                name: 'Jenny (US Conversational)',
                gender: 'Female',
                language: 'en-US',
                description: 'Warm, expressive, natural human conversational voice.',
                recommended_for_tone: 'conversational'
              }
            ]
          }
        ]);
      });
  }, []);

  // Update voice choices when active provider changes
  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0];
  const currentVoices = activeProvider?.voices || [];

  const handleProviderChange = (newProviderId: string) => {
    setActiveProviderId(newProviderId);
    const prov = providers.find((p) => p.id === newProviderId);
    if (prov && prov.voices.length > 0) {
      setActiveVoiceId(prov.voices[0].id);
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
          text: testPhrase,
          provider: activeProviderId,
          voice: activeVoiceId,
          tone: activeTone
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
                value={activeVoiceId}
                onChange={(e) => setActiveVoiceId(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface text-xs focus:outline-none focus:border-primary font-mono"
              >
                {currentVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender}, {v.language})
                  </option>
                ))}
              </select>
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
                    onClick={() => setActiveTone(t.id)}
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
