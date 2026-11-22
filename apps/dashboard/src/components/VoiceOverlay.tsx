import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Strands from './Strands';

export type VoiceTone = 'calm_concise' | 'conversational' | 'direct';

interface VoiceOverlayProps {
  isStandaloneOverlay?: boolean;
  onCloseOverlay?: () => void;
  onOpenCommandCenter?: () => void;
  currentProjectName?: string;
  onSendCommand?: (cmd: string, tone: VoiceTone) => Promise<{ intent: string; reply: string }>;
}

const STRANDS_COLORS = [
  '#3B82F6',
  '#60A5FA',
  '#93C5FD',
  '#F8FAFC',
  '#38BDF8',
  '#2563EB',
  '#1E3A8A'
];

interface ToneDetail {
  key: VoiceTone;
  label: string;
  badge: string;
  pitch: number;
  rate: number;
  samplePhrase: string;
  description: string;
}

const TONE_CONFIGS: Record<VoiceTone, ToneDetail> = {
  calm_concise: {
    key: 'calm_concise',
    label: 'Calm & Concise',
    badge: 'J.A.R.V.I.S. BUTLER',
    pitch: 0.95,
    rate: 0.98,
    samplePhrase: 'Good day, Sir. All engineering agents remain fully synchronized. Diagnostics are nominal, and I am standing by on your directive.',
    description: 'Paul Bettany style, composed British cadence, polite address, reassuring and understated.'
  },
  conversational: {
    key: 'conversational',
    label: 'Conversational',
    badge: 'HUMAN COLLABORATOR',
    pitch: 1.02,
    rate: 1.04,
    samplePhrase: "Hey there! Everything is running smoothly right now. The test suite passed with flying colors, so we're ready to ship whenever you give the word.",
    description: 'Warm, natural partner engineer. Uses contractions, natural pauses, and conversational inflection.'
  },
  direct: {
    key: 'direct',
    label: 'Direct',
    badge: 'EXECUTIVE BRIEF',
    pitch: 1.00,
    rate: 1.15,
    samplePhrase: 'Build passed. Zero security alerts. Two tasks pending authorization. Standing by for command.',
    description: 'Crisp, fast, high-efficiency status and decision points with zero fluff.'
  }
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  isStandaloneOverlay = true,
  onCloseOverlay,
  onOpenCommandCenter,
  currentProjectName = 'Project PHOENIX',
  onSendCommand
}) => {
  // Island expansion state: 'notch' (compact top pill) or 'expanded' (full island)
  const [islandMode, setIslandMode] = useState<'notch' | 'expanded'>('notch');
  const [selectedTone, setSelectedTone] = useState<VoiceTone>('calm_concise');
  const [activeProvider, setActiveProvider] = useState<string>('edge_tts');
  const [providersList, setProvidersList] = useState<any[]>([]);
  const [isListening, setIsListening] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0.05);
  const [captionText, setCaptionText] = useState<string>(
    'Listening for your command, Sir...'
  );
  const [inputText, setInputText] = useState<string>('');
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showProviderMenu, setShowProviderMenu] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Set transparent background for overlay mode
  useEffect(() => {
    if (isStandaloneOverlay) {
      document.documentElement.classList.add('overlay-transparent');
      document.body.classList.add('overlay-transparent');
    }
    return () => {
      document.documentElement.classList.remove('overlay-transparent');
      document.body.classList.remove('overlay-transparent');
    };
  }, [isStandaloneOverlay]);

  // Load available TTS providers on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/tts/providers`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.providers) {
          setProvidersList(data.providers);
          if (data.active_provider_id) setActiveProvider(data.active_provider_id);
          if (data.active_tone) setSelectedTone(data.active_tone);
        }
      })
      .catch(() => {});
  }, []);

  // Keyboard shortcut listener: Escape collapses the island back to notch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIslandMode('notch');
        setShowContextMenu(null);
        setShowProviderMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle click-through state via desktop bridge
  const setInteractive = async (interactive: boolean) => {
    try {
      if ((window as any).pywebview?.api?.set_interactive) {
        (window as any).pywebview.api.set_interactive(interactive);
      } else {
        await fetch(`${API_BASE}/overlay/interactive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interactive })
        });
      }
    } catch {
      // Offline fallback
    }
  };

  // Initialize Microphone & Web Audio Analyser
  useEffect(() => {
    let cancelled = false;

    const initAudio = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (!cancelled && analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const normalized = Math.min(1.0, average / 128);

            if (!isMuted && !isSpeaking) {
              setAudioLevel(Math.max(0.04, normalized));
            }

            animationFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      } catch (err) {
        console.warn('Microphone analyser notice:', err);
      }
    };

    initAudio();

    // Setup Web Speech Recognition with low-latency conversational turn-taking
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              const finalTranscript = event.results[i][0].transcript.trim();
              if (finalTranscript) {
                handleUserUtterance(finalTranscript);
              }
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          if (interimTranscript) {
            setCaptionText(interimTranscript);
          }
        };

        recognition.onerror = (e: any) => {
          if (e.error !== 'no-speech') {
            console.warn('SpeechRecognition notice:', e.error);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('SpeechRecognition notice:', e);
      }
    }

    return () => {
      cancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (activeAudioElementRef.current) {
        activeAudioElementRef.current.pause();
      }
    };
  }, []);

  // Speak using swappable backend TTS provider (Edge Neural / ElevenLabs / Google Cloud)
  // with fallback to browser SpeechSynthesis
  const speakWithActiveProvider = async (rawText: string, tone: VoiceTone = selectedTone) => {
    setIsSpeaking(true);
    setIsListening(false);
    setCaptionText(rawText);

    // Stop recognition while speaking to prevent feedback echo
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    // Attempt to synthesize audio via backend provider
    try {
      const response = await fetch(`${API_BASE}/api/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawText,
          tone: tone,
          provider_id: activeProvider
        })
      });

      if (response.ok && response.headers.get('content-type')?.includes('audio')) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        activeAudioElementRef.current = audio;

        // Connect audio element to Web Audio analyser if available
        if (audioContextRef.current && analyserRef.current) {
          try {
            const audioSource = audioContextRef.current.createMediaElementSource(audio);
            audioSource.connect(analyserRef.current);
            analyserRef.current.connect(audioContextRef.current.destination);
          } catch {}
        }

        audio.onended = () => {
          setIsSpeaking(false);
          setIsListening(true);
          setAudioLevel(0.06);
          setCaptionText(
            tone === 'conversational'
              ? 'Listening... Ask me anything, or give a command.'
              : tone === 'direct'
              ? 'Listening for direct command.'
              : 'Listening for your command, Sir...'
          );
          if (recognitionRef.current && !isMuted) {
            try {
              recognitionRef.current.start();
            } catch {}
          }
        };

        audio.onerror = () => {
          fallbackBrowserSpeech(rawText, tone);
        };

        await audio.play();
        return;
      }
    } catch {
      // Backend TTS fallback to browser
    }

    fallbackBrowserSpeech(rawText, tone);
  };

  // Browser SpeechSynthesis fallback
  const fallbackBrowserSpeech = (text: string, tone: VoiceTone) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const toneConfig = TONE_CONFIGS[tone];
      utterance.pitch = toneConfig.pitch;
      utterance.rate = toneConfig.rate;

      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(
        (v) =>
          v.name.toLowerCase().includes('natural') ||
          v.name.toLowerCase().includes('ryan') ||
          v.name.toLowerCase().includes('george') ||
          v.name.toLowerCase().includes('daniel') ||
          v.lang.startsWith('en')
      );
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsListening(true);
        setAudioLevel(0.06);
        setCaptionText('Listening for your command...');
        if (recognitionRef.current && !isMuted) {
          try {
            recognitionRef.current.start();
          } catch {}
        }
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setIsListening(true);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setIsSpeaking(false);
      setIsListening(true);
    }
  };

  const handleUserUtterance = async (speechText: string) => {
    if (!speechText.trim()) return;

    // Expand island into voice view when user speaks
    setIslandMode('expanded');
    setCaptionText(`"${speechText}"`);
    setIsListening(false);

    try {
      let replyText =
        selectedTone === 'conversational'
          ? "Got it! Relaying that directive to our autonomous agents now."
          : selectedTone === 'direct'
          ? "Command acknowledged. Executing."
          : "Very well, Sir. I have relayed your directive to the orchestrator.";

      if (onSendCommand) {
        const res = await onSendCommand(speechText, selectedTone);
        if (res?.reply) replyText = res.reply;
      } else {
        const res = await fetch(`${API_BASE}/jarvis/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: speechText, tone: selectedTone })
        }).then((r) => r.json());
        if (res?.spoken_reply) replyText = res.spoken_reply;
      }

      await speakWithActiveProvider(replyText, selectedTone);
    } catch {
      const errReply = "My apologies, Sir. A communication delay occurred with the local node. Standing by.";
      await speakWithActiveProvider(errReply, selectedTone);
    }
  };

  const handlePreviewTone = (tone: VoiceTone) => {
    const config = TONE_CONFIGS[tone];
    speakWithActiveProvider(config.samplePhrase, tone);
  };

  const toggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    if (nextMuted) {
      setAudioLevel(0);
      setIsListening(false);
      setCaptionText('Microphone muted.');
    } else {
      setIsListening(!isSpeaking);
      setCaptionText('Listening for your command...');
    }
  };

  const handleSelectProvider = async (providerId: string) => {
    setActiveProvider(providerId);
    setShowProviderMenu(false);
    try {
      await fetch(`${API_BASE}/api/tts/providers/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId, tone: selectedTone })
      });
      setCaptionText(`Switched TTS engine to: ${providerId.replace('_', ' ').toUpperCase()}`);
    } catch {}
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRestoreFullApp = () => {
    if (onOpenCommandCenter) {
      onOpenCommandCenter();
    } else {
      fetch(`${API_BASE}/tray/restore-window`, { method: 'POST' }).catch(() => {});
    }
  };

  const handleDismissOverlay = () => {
    if (onCloseOverlay) {
      onCloseOverlay();
    } else {
      fetch(`${API_BASE}/overlay/toggle`, { method: 'POST' }).catch(() => {});
    }
  };

  const isExpanded = islandMode === 'expanded';

  return (
    <div
      onClick={() => {
        if (isExpanded) setIslandMode('notch');
        setShowContextMenu(null);
        setShowProviderMenu(false);
      }}
      className={`w-full h-full flex flex-col items-center justify-start overflow-hidden select-none relative ${
        isStandaloneOverlay ? 'bg-transparent pointer-events-none' : 'bg-surface-container-lowest'
      }`}
    >
      {/* Dynamic Island / Top Notch Capsule with fluid cubic-bezier spring transition */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setShowContextMenu(null);
          if (!isExpanded) setIslandMode('expanded');
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => {
          if (!isExpanded) setInteractive(false);
        }}
        className={`pointer-events-auto island-morph bg-black text-white shadow-island border border-white/10 relative flex flex-col overflow-hidden cursor-pointer backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isExpanded
            ? 'w-[450px] h-[350px] rounded-b-[32px] rounded-t-none px-4 pt-2 pb-3 shadow-[0_24px_60px_rgba(0,0,0,0.9),0_0_24px_rgba(59,130,246,0.2)]'
            : 'w-[240px] h-[38px] rounded-b-2xl rounded-t-none px-3.5 py-1.5 flex-row items-center justify-between hover:w-[260px] shadow-[0_12px_30px_rgba(0,0,0,0.7)]'
        }`}
      >
        {/* Subtle interior rim glow */}
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none border border-white/5 shadow-island-ambient" />

        {/* ================= COMPACT NOTCH (IDLE STATE) ================= */}
        {!isExpanded && (
          <div className="w-full h-full flex items-center justify-between z-10">
            {/* Left status indicator */}
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSpeaking
                    ? 'bg-amber-400 animate-pulse'
                    : isMuted
                    ? 'bg-neutral-600'
                    : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span className="text-xs font-medium tracking-tight text-white/90">
                PHOENIX · AI
              </span>
            </div>

            {/* Right mini equalizer & voice button */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-0.5 text-xs text-emerald-400 font-mono">
                <span className="equalizer-bar-1 w-0.5 bg-emerald-400 rounded-full inline-block" />
                <span className="equalizer-bar-2 w-0.5 bg-emerald-400 rounded-full inline-block" />
                <span className="equalizer-bar-3 w-0.5 bg-emerald-400 rounded-full inline-block" />
              </div>
              <span className="material-symbols-outlined text-[15px] text-primary/80">
                graphic_eq
              </span>
            </div>
          </div>
        )}

        {/* ================= EXPANDED VOICE COCKPIT (ACTIVE STATE) ================= */}
        {isExpanded && (
          <div className="w-full h-full flex flex-col justify-between z-10 animate-fadeIn">
            {/* Top Bar: Controls & Status */}
            <div className="w-full flex items-center justify-between pb-1.5 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isSpeaking
                      ? 'bg-amber-400 animate-pulse'
                      : isMuted
                      ? 'bg-neutral-500'
                      : 'bg-primary animate-ping'
                  }`}
                />
                <span className="text-[11px] font-mono font-bold tracking-wider text-white">
                  PHOENIX VOICE
                </span>

                {/* Swappable Provider Badge / Switcher */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProviderMenu(!showProviderMenu);
                  }}
                  className="px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 text-[9px] font-mono font-bold flex items-center gap-1 hover:bg-primary/30 transition-colors"
                  title="Click to switch TTS voice provider"
                >
                  <span>{activeProvider.replace('_', ' ').toUpperCase()}</span>
                  <span className="material-symbols-outlined text-[10px]">arrow_drop_down</span>
                </button>
              </div>

              {/* Action Buttons: Collapse, Restore Command Center, Dismiss */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIslandMode('notch');
                  }}
                  title="Collapse to compact top notch (Esc)"
                  className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">expand_less</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestoreFullApp();
                  }}
                  title="Open Full Command Center"
                  className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismissOverlay();
                  }}
                  title="Hide Notch Overlay"
                  className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            </div>

            {/* Provider Picker Dropdown Menu (revealed when provider badge is clicked) */}
            {showProviderMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-10 left-4 z-50 w-64 bg-neutral-900/95 border border-white/15 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 backdrop-blur-xl animate-fadeIn text-xs font-mono"
              >
                <div className="px-2 py-1 text-[10px] text-neutral-400 uppercase tracking-wider border-b border-white/10 font-bold">
                  Swappable TTS Providers
                </div>
                {providersList.map((p) => {
                  const isSelected = activeProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectProvider(p.id)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-primary/20 text-primary font-bold'
                          : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-[9px] text-neutral-400">{p.tier}</div>
                      </div>
                      {isSelected && (
                        <span className="material-symbols-outlined text-[14px] text-primary">
                          check
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Center: React Bits <Strands /> WebGL Orb */}
            <div className="w-full h-[140px] relative flex items-center justify-center my-0.5 overflow-hidden">
              <div
                className={`absolute w-[140px] h-[140px] rounded-full blur-2xl transition-all duration-500 pointer-events-none ${
                  isSpeaking
                    ? 'bg-amber-400/25 scale-125'
                    : isMuted
                    ? 'bg-neutral-600/10 scale-90'
                    : 'bg-primary/25 scale-105'
                }`}
              />

              <Strands
                glass={true}
                colors={STRANDS_COLORS}
                level={audioLevel}
                listening={isListening && !isMuted}
              />
            </div>

            {/* Dynamic Live Caption Transcript */}
            <div className="w-full px-2 py-1 min-h-[38px] flex items-center justify-center text-center">
              <p className="text-[11px] font-mono text-neutral-200 leading-snug line-clamp-2">
                {captionText}
              </p>
            </div>

            {/* Voice Tone Selector Bar */}
            <div className="w-full flex items-center justify-between gap-1 p-1 bg-neutral-900/80 border border-white/10 rounded-xl my-1">
              <div className="flex items-center gap-1 flex-1">
                {(['calm_concise', 'conversational', 'direct'] as VoiceTone[]).map((t) => {
                  const active = selectedTone === t;
                  return (
                    <button
                      key={t}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTone(t);
                        setCaptionText(`Voice tone set to: ${TONE_CONFIGS[t].label}`);
                      }}
                      title={TONE_CONFIGS[t].description}
                      className={`flex-1 py-1 px-1.5 rounded-lg text-[9px] font-mono font-medium transition-all text-center truncate ${
                        active
                          ? 'bg-primary text-on-primary font-bold shadow-sm'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                      }`}
                    >
                      {t === 'calm_concise' ? 'Calm' : t === 'conversational' ? 'Human' : 'Direct'}
                    </button>
                  );
                })}
              </div>

              {/* 1-Click Test / Preview Voice Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreviewTone(selectedTone);
                }}
                title="Preview natural spoken voice sample"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-primary border border-primary/30 text-[9px] font-mono transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">volume_up</span>
                <span>Test</span>
              </button>
            </div>

            {/* Bottom Controls Bar */}
            <div className="w-full flex items-center justify-between pt-1">
              {/* Mute / Unmute Button */}
              <button
                onClick={toggleMute}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-mono text-xs font-semibold transition-all ${
                  isMuted
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">
                  {isMuted ? 'mic_off' : 'mic'}
                </span>
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              {/* End Voice Session / Collapse to Notch */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIslandMode('notch');
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 text-xs font-mono transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">call_end</span>
                <span>End Voice</span>
              </button>

              {/* Status */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isMuted
                      ? 'bg-neutral-500'
                      : isSpeaking
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400 animate-ping'
                  }`}
                />
                <span>{isMuted ? 'MUTED' : isSpeaking ? 'SPEAKING' : 'LISTENING'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sleek Custom Right-Click Context Menu */}
      {showContextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: showContextMenu.y, left: showContextMenu.x }}
          className="fixed z-50 w-52 bg-neutral-900/95 border border-white/15 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 backdrop-blur-xl animate-fadeIn text-xs font-mono pointer-events-auto"
        >
          <button
            onClick={() => {
              setIslandMode(isExpanded ? 'notch' : 'expanded');
              setShowContextMenu(null);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 text-left transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-primary">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
            <span>{isExpanded ? 'Collapse to Notch' : 'Expand Voice Island'}</span>
          </button>

          <button
            onClick={() => {
              toggleMute();
              setShowContextMenu(null);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 text-left transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-primary">
              {isMuted ? 'mic' : 'mic_off'}
            </span>
            <span>{isMuted ? 'Unmute Microphone' : 'Mute Microphone'}</span>
          </button>

          <button
            onClick={() => {
              handleRestoreFullApp();
              setShowContextMenu(null);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 text-left transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-primary">dashboard</span>
            <span>Open Command Center</span>
          </button>

          <button
            onClick={() => {
              handleDismissOverlay();
              setShowContextMenu(null);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 text-left transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-amber-400">
              visibility_off
            </span>
            <span>Hide Notch Overlay</span>
          </button>

          <div className="h-[1px] bg-white/10 my-0.5" />

          <button
            onClick={() => {
              fetch(`${API_BASE}/emergency-pause`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paused: true })
              }).catch(() => {});
              setShowContextMenu(null);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-500/20 text-left transition-colors font-bold"
          >
            <span className="material-symbols-outlined text-[15px]">pause_circle</span>
            <span>Emergency Pause</span>
          </button>
        </div>
      )}
    </div>
  );
};
