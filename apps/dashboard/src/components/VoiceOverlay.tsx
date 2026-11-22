import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Strands from './Strands';

export type VoiceTone = 'calm_concise' | 'conversational' | 'direct';

interface VoiceOverlayProps {
  isStandaloneOverlay?: boolean;
  onCloseOverlay?: () => void;
  onOpenCommandCenter?: () => void;
  currentProjectName?: string;
  activeAgent?: string;
  pendingApproval?: {
    id: string;
    action: string;
    risk_level: string;
    token: string;
  } | null;
  dailySpend?: number;
  isEmergencyPaused?: boolean;
  onApproveAction?: (id: string, token: string) => void;
  onDenyAction?: (id: string, token: string) => void;
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

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  isStandaloneOverlay = true,
  onCloseOverlay,
  onOpenCommandCenter,
  currentProjectName = 'Project PHOENIX',
  activeAgent = 'SWE-03 · Run',
  pendingApproval = null,
  dailySpend = 18.42,
  isEmergencyPaused = false,
  onApproveAction,
  onDenyAction,
  onSendCommand
}) => {
  // Island morphing state: 'notch' (compact top pill) or 'expanded' (full island)
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedTone, setSelectedTone] = useState<VoiceTone>('calm_concise');
  const [activeProvider, setActiveProvider] = useState<string>('edge_tts');
  const [isListening, setIsListening] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0.04);
  const [captionText, setCaptionText] = useState<string>('Listening for your command, Sir...');
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);

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

  // Load configured TTS provider
  useEffect(() => {
    fetch(`${API_BASE}/api/tts/providers`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.active_provider_id) setActiveProvider(data.active_provider_id);
        if (data.active_tone) setSelectedTone(data.active_tone);
      })
      .catch(() => {});
  }, []);

  // Auto-expand if a high-priority approval gate arrives
  useEffect(() => {
    if (pendingApproval) {
      setIsExpanded(true);
      setCaptionText(`Approval required: ${pendingApproval.action}`);
    }
  }, [pendingApproval?.id]);

  // Keyboard shortcut listener: Escape collapses the island back to notch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
        setShowContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle desktop click-through state via desktop bridge
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
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const micSource = audioCtx.createMediaStreamSource(stream);
        micSource.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / (dataArray.length * 255);
          // Scale smoothly between resting 0.04 and active 0.95
          setAudioLevel((prev) => {
            const target = Math.max(0.04, Math.min(1.0, avg * 2.2));
            return prev + (target - prev) * 0.28;
          });
          animationFrameRef.current = requestAnimationFrame(updateLevel);
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
  const speakWithActiveProvider = async (rawText: string, tone: VoiceTone = selectedTone) => {
    setIsSpeaking(true);
    setIsListening(false);
    setCaptionText(rawText);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

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
          setAudioLevel(0.04);
          setCaptionText('Listening for your command, Sir...');
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
      // Backend TTS fallback
    }

    fallbackBrowserSpeech(rawText, tone);
  };

  const fallbackBrowserSpeech = (text: string, tone: VoiceTone) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = tone === 'calm_concise' ? 0.95 : 1.0;
      utterance.rate = tone === 'direct' ? 1.15 : 1.0;

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
        setAudioLevel(0.04);
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

    // Automatically expand the notch smoothly into the voice view
    setIsExpanded(true);
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
      const errReply = "My apologies, Sir. A communication delay occurred. Standing by.";
      await speakWithActiveProvider(errReply, selectedTone);
    }
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
      setCaptionText('Listening for your command, Sir...');
    }
  };

  const handleEndSession = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (activeAudioElementRef.current) {
      activeAudioElementRef.current.pause();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsListening(true);
    setCaptionText('Listening for your command, Sir...');
    // Retract smoothly back to the compact top pill
    setIsExpanded(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRestoreFullApp = () => {
    setShowContextMenu(null);
    if (onOpenCommandCenter) {
      onOpenCommandCenter();
    } else {
      fetch(`${API_BASE}/tray/restore-window`, { method: 'POST' }).catch(() => {});
    }
  };

  return (
    <div
      onClick={() => {
        if (isExpanded) setIsExpanded(false);
        setShowContextMenu(null);
      }}
      className={`w-full h-full flex flex-col items-center justify-start overflow-hidden select-none relative pt-0 ${
        isStandaloneOverlay ? 'bg-transparent pointer-events-none' : 'bg-surface-container-lowest'
      }`}
    >
      {/* Dynamic Notch / Island: Anchored flush against the screen's top bezel (y=0) */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setShowContextMenu(null);
          if (!isExpanded) setIsExpanded(true);
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => {
          if (!isExpanded) setInteractive(false);
        }}
        className={`pointer-events-auto island-morph bg-black text-white border border-white/10 relative flex flex-col overflow-hidden cursor-pointer backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isExpanded
            ? 'w-[420px] h-[280px] rounded-b-[28px] rounded-t-none px-4 pt-2.5 pb-3 shadow-[0_24px_60px_rgba(0,0,0,0.9),0_0_20px_rgba(59,130,246,0.18)]'
            : 'w-[230px] h-[36px] rounded-b-2xl rounded-t-none px-3.5 py-1.5 flex-row items-center justify-between hover:w-[250px] shadow-[0_12px_28px_rgba(0,0,0,0.7)]'
        }`}
      >
        {/* Subtle interior ambient rim border */}
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none border border-white/5 shadow-island-ambient" />

        {/* ================= 1. IDLE STATE: SLIM SLEEK TOP-CENTER PILL ================= */}
        {!isExpanded && (
          <div className="w-full h-full flex items-center justify-between z-10">
            {/* Status dot + text */}
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  pendingApproval
                    ? 'bg-amber-400 animate-pulse'
                    : isSpeaking
                    ? 'bg-amber-400 animate-pulse'
                    : isEmergencyPaused
                    ? 'bg-red-500'
                    : isMuted
                    ? 'bg-neutral-600'
                    : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span className="text-[11px] font-mono font-medium tracking-tight text-white/90">
                {pendingApproval ? 'GATE PENDING' : isEmergencyPaused ? 'FLEET PAUSED' : activeAgent}
              </span>
            </div>

            {/* Mini Strands orb indicator / mini equalizer */}
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 relative rounded-full overflow-hidden flex items-center justify-center">
                <Strands
                  colors={STRANDS_COLORS}
                  speed={0.8}
                  amplitude={0.9}
                  energy={0.5}
                  level={audioLevel}
                  listening={!isSpeaking && !isMuted}
                  glass={false}
                  interactive={false}
                  scale={0.9}
                  opacity={0.9}
                />
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. EXPANDED STATE: MINIMAL, HUMANE VOICE & NOTCH VIEW ================= */}
        {isExpanded && (
          <div className="w-full h-full flex flex-col justify-between z-10 animate-fadeIn">
            {/* Minimal Header Bar: Status & Collapse Chevron (NO window buttons, NO popout box) */}
            <div className="w-full flex items-center justify-between pb-1 shrink-0">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isSpeaking
                      ? 'bg-amber-400 animate-pulse'
                      : isMuted
                      ? 'bg-neutral-500'
                      : 'bg-emerald-400 animate-pulse'
                  }`}
                />
                <span className="text-[11px] font-mono font-semibold tracking-wider text-white/80">
                  {isSpeaking ? 'J.A.R.V.I.S. SPEAKING' : isMuted ? 'MIC MUTED' : 'PHOENIX VOICE'}
                </span>
              </div>

              {/* Minimal Clean Collapse Chevron */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                title="Collapse notch (Esc)"
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">expand_less</span>
              </button>
            </div>

            {/* Approval Gate Banner (If approval is pending) */}
            {pendingApproval && (
              <div className="w-full py-1.5 px-3 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-between text-xs my-1">
                <div className="truncate max-w-[220px]">
                  <span className="text-[9px] font-mono text-amber-400 uppercase font-bold block">
                    Security Gate #{pendingApproval.id.slice(-4)}
                  </span>
                  <span className="text-white font-medium truncate block">{pendingApproval.action}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDenyAction) onDenyAction(pendingApproval.id, pendingApproval.token);
                    }}
                    className="px-2 py-0.5 rounded text-[11px] bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onApproveAction) onApproveAction(pendingApproval.id, pendingApproval.token);
                    }}
                    className="px-2.5 py-0.5 rounded text-[11px] bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors"
                  >
                    Approve
                  </button>
                </div>
              </div>
            )}

            {/* Center Stage: React Bits <Strands /> WebGL2 Orb Visualizer */}
            <div className="w-full h-[145px] relative flex items-center justify-center overflow-hidden my-auto">
              <Strands
                colors={STRANDS_COLORS}
                count={3}
                speed={1.05}
                amplitude={1.1}
                waviness={1.0}
                energy={0.65}
                thickness={1.0}
                spread={1.0}
                glow={1.1}
                taper={1.0}
                intensity={1.0}
                saturation={1.0}
                scale={1.0}
                glass={true}
                glassSize={1.0}
                refraction={1.0}
                rim={1.1}
                dispersion={1.0}
                listening={!isSpeaking && !isMuted}
                level={audioLevel}
                interactive={true}
                clickPulse={true}
                intro={true}
                lightMode={false}
                opacity={1.0}
              />
            </div>

            {/* Short Live Captions / Transcription */}
            <div className="w-full px-2 text-center shrink-0">
              <p className="text-xs font-medium text-white/90 truncate leading-snug font-sans">
                {captionText}
              </p>
            </div>

            {/* Humane Minimal Controls: Just Mute and End Session */}
            <div className="w-full flex items-center justify-center gap-3 pt-2 shrink-0">
              {/* Mute / Unmute Toggle */}
              <button
                onClick={toggleMute}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isMuted
                    ? 'bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700'
                    : 'bg-white/10 text-white border border-white/15 hover:bg-white/20'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                <span className="material-symbols-outlined text-[15px]">
                  {isMuted ? 'mic_off' : 'mic'}
                </span>
                <span>{isMuted ? 'Muted' : 'Mute'}</span>
              </button>

              {/* End Voice Session */}
              <button
                onClick={handleEndSession}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-all"
                title="End voice session and collapse notch"
              >
                <span className="material-symbols-outlined text-[15px]">call_end</span>
                <span>End Session</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Right-Click Context Menu */}
      {showContextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: showContextMenu.y, left: Math.min(showContextMenu.x, 320) }}
          className="fixed pointer-events-auto z-50 w-48 rounded-xl bg-neutral-900/95 border border-white/10 shadow-2xl p-1.5 text-xs font-sans text-neutral-300 backdrop-blur-xl animate-fadeIn"
        >
          <button
            onClick={() => {
              setIsExpanded(!isExpanded);
              setShowContextMenu(null);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[15px]">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
            <span>{isExpanded ? 'Collapse to Pill' : 'Expand Island'}</span>
          </button>

          <button
            onClick={handleRestoreFullApp}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[15px]">dashboard</span>
            <span>Open Command Center</span>
          </button>

          <button
            onClick={toggleMute}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[15px]">
              {isMuted ? 'mic' : 'mic_off'}
            </span>
            <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
          </button>

          <div className="h-[1px] bg-white/10 my-1" />

          <button
            onClick={() => {
              setShowContextMenu(null);
              if (onCloseOverlay) onCloseOverlay();
              else fetch(`${API_BASE}/overlay/toggle`, { method: 'POST' }).catch(() => {});
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[15px]">visibility_off</span>
            <span>Hide Overlay</span>
          </button>

          <button
            onClick={() => {
              setShowContextMenu(null);
              fetch(`${API_BASE}/tray/exit`, { method: 'POST' }).catch(() => {});
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 text-red-400 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[15px]">power_settings_new</span>
            <span>Exit PHOENIX</span>
          </button>
        </div>
      )}
    </div>
  );
};
