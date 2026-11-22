import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Strands from './Strands';
import { LiquidButton, MetalButton, Button } from './ui/liquid-glass-button';
import {
  Mic,
  MicOff,
  PhoneOff,
  Sliders,
  Check,
  X,
  ChevronUp,
  Play,
  Volume2,
  VolumeX,
  Sparkles,
  LayoutDashboard,
  RotateCcw,
  EyeOff,
  Power,
  Radio,
  Settings2
} from 'lucide-react';

export type VoiceTone = 'calm_concise' | 'conversational' | 'direct';

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  language: string;
  description: string;
  recommended_for_tone?: string;
}

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

const DEFAULT_VOICES: VoiceOption[] = [
  { id: 'en-GB-RyanNeural', name: 'Ryan (British Butler / J.A.R.V.I.S.)', gender: 'Male', language: 'en-GB', description: 'Warm, composed British butler cadence, refined and articulate.', recommended_for_tone: 'calm_concise' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (British Female)', gender: 'Female', language: 'en-GB', description: 'Clear, poised British professional voice.', recommended_for_tone: 'calm_concise' },
  { id: 'en-GB-LibbyNeural', name: 'Libby (British Warm)', gender: 'Female', language: 'en-GB', description: 'Bright, natural, articulate British tone.', recommended_for_tone: 'conversational' },
  { id: 'en-US-JennyNeural', name: 'Jenny (US Conversational)', gender: 'Female', language: 'en-US', description: 'Warm, expressive, natural human conversational voice.', recommended_for_tone: 'conversational' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher (US Tech Lead)', gender: 'Male', language: 'en-US', description: 'Confident, natural collaborative male colleague.', recommended_for_tone: 'conversational' },
  { id: 'en-US-GuyNeural', name: 'Guy (US Relaxed)', gender: 'Male', language: 'en-US', description: 'Casual, natural engineer tone.', recommended_for_tone: 'conversational' },
  { id: 'en-US-AriaNeural', name: 'Aria (US Executive)', gender: 'Female', language: 'en-US', description: 'Direct, clear, executive briefing tempo.', recommended_for_tone: 'direct' },
  { id: 'en-US-EricNeural', name: 'Eric (US Neutral)', gender: 'Male', language: 'en-US', description: 'Balanced, calm engineering lead voice.', recommended_for_tone: 'calm_concise' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha (Australian Warm)', gender: 'Female', language: 'en-AU', description: 'Friendly, crisp Australian colleague.', recommended_for_tone: 'conversational' },
  { id: 'en-IN-NeerjaNeural', name: 'Neerja (Indian English)', gender: 'Female', language: 'en-IN', description: 'Expressive, articulate Indian English voice.', recommended_for_tone: 'conversational' },
  { id: 'en-CA-LiamNeural', name: 'Liam (Canadian Modern)', gender: 'Male', language: 'en-CA', description: 'Crisp, modern Canadian tech tone.', recommended_for_tone: 'direct' },
];

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('5173')
    ? window.location.origin
    : 'http://localhost:8000');

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  isStandaloneOverlay = true,
  onCloseOverlay,
  onOpenCommandCenter,
  currentProjectName = 'Project PHOENIX',
  activeAgent = 'SWE-03',
  pendingApproval = null,
  dailySpend = 18.42,
  isEmergencyPaused = false,
  onApproveAction,
  onDenyAction,
  onSendCommand
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState<boolean>(false);
  const [selectedTone, setSelectedTone] = useState<VoiceTone>('calm_concise');
  const [activeProvider, setActiveProvider] = useState<string>('edge_tts');
  const [isListening, setIsListening] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0.04);
  const [captionText, setCaptionText] = useState<string>('Listening for your command, Sir...');
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Voice Generator State
  const [voiceList, setVoiceList] = useState<VoiceOption[]>(DEFAULT_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('en-GB-RyanNeural');
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [speechPitch, setSpeechPitch] = useState<number>(0);
  const [speechVolume, setSpeechVolume] = useState<number>(100);
  const [testSampleText, setTestSampleText] = useState<string>('System online, Sir. Engineering fleet ready for deployment.');
  const [isTestingVoice, setIsTestingVoice] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Synchronize OS window resize with expanded state
  const notifyNativeResize = async (expanded: boolean) => {
    try {
      if ((window as any).pywebview?.api?.set_expanded) {
        await (window as any).pywebview.api.set_expanded(expanded);
      } else {
        await fetch(`${API_BASE}/overlay/resize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expanded })
        });
      }
    } catch {}
  };

  const handleToggleExpand = (expanded: boolean) => {
    setIsExpanded(expanded);
    if (!expanded) setShowVoiceSettings(false);
    notifyNativeResize(expanded);
  };

  // Shrink native window on mount to exact pill size
  useEffect(() => {
    notifyNativeResize(false);
  }, []);

  // Load configured voices from Voice-Generator backend
  useEffect(() => {
    fetch(`${API_BASE}/api/tts/voice-generator/voices`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.voices && Array.isArray(data.voices) && data.voices.length > 0) {
          setVoiceList(data.voices);
        }
        if (data?.default_voice) setSelectedVoiceId(data.default_voice);
      })
      .catch(() => {});
  }, []);

  // Auto-expand if high-priority approval arrives
  useEffect(() => {
    if (pendingApproval) {
      handleToggleExpand(true);
      setCaptionText(`Approval required: ${pendingApproval.action}`);
    }
  }, [pendingApproval?.id]);

  // Keyboard shortcut listener: Escape collapses the island back to pill
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleToggleExpand(false);
        setShowContextMenu(null);
        setShowVoiceSettings(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

    // Setup Web Speech Recognition
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

  // Voice-Generator Preview & Playback
  const handlePreviewVoice = async (customText?: string) => {
    const textToSpeak = customText || testSampleText;
    setIsTestingVoice(true);
    setIsSpeaking(true);
    setIsListening(false);
    setCaptionText(textToSpeak);

    try {
      const resp = await fetch(`${API_BASE}/api/tts/voice-generator/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voice_id: selectedVoiceId,
          speed: speechSpeed,
          pitch: speechPitch,
          volume: speechVolume,
          tone: selectedTone
        })
      });

      if (resp.ok) {
        const audioBlob = await resp.blob();
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
          setIsTestingVoice(false);
          setIsListening(true);
          setAudioLevel(0.04);
          setCaptionText('Listening for your command, Sir...');
        };

        audio.onerror = () => {
          fallbackBrowserSpeech(textToSpeak, selectedTone);
        };

        await audio.play();
        return;
      }
    } catch {}

    fallbackBrowserSpeech(textToSpeak, selectedTone);
  };

  const handleSaveVoiceConfig = async () => {
    try {
      await fetch(`${API_BASE}/api/tts/voice-generator/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_id: selectedVoiceId,
          tone: selectedTone
        })
      });
      setShowVoiceSettings(false);
      setCaptionText('Voice profile saved.');
    } catch {
      setShowVoiceSettings(false);
    }
  };

  // Speak using swappable backend TTS provider
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
      const response = await fetch(`${API_BASE}/api/tts/voice-generator/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawText,
          voice_id: selectedVoiceId,
          speed: speechSpeed,
          pitch: speechPitch,
          volume: speechVolume,
          tone: tone
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
    } catch {}

    fallbackBrowserSpeech(rawText, tone);
  };

  const fallbackBrowserSpeech = (text: string, tone: VoiceTone) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = tone === 'calm_concise' ? 0.95 : 1.0;
      utterance.rate = speechSpeed || 1.0;

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
        setIsTestingVoice(false);
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
        setIsTestingVoice(false);
        setIsListening(true);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setIsSpeaking(false);
      setIsTestingVoice(false);
      setIsListening(true);
    }
  };

  const handleUserUtterance = async (speechText: string) => {
    if (!speechText.trim()) return;

    handleToggleExpand(true);
    setCaptionText(`"${speechText}"`);
    setIsListening(false);

    try {
      let replyText =
        selectedTone === 'conversational'
          ? "Got it! Relaying that directive to our autonomous fleet now."
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
    handleToggleExpand(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRestoreFullApp = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowContextMenu(null);
    if ((window as any).pywebview?.api?.open_dashboard) {
      (window as any).pywebview.api.open_dashboard();
    } else if (onOpenCommandCenter) {
      onOpenCommandCenter();
    } else {
      fetch(`${API_BASE}/tray/restore-window`, { method: 'POST' }).catch(() => {});
    }
  };

  const currentVoiceObj = voiceList.find((v) => v.id === selectedVoiceId) || voiceList[0];

  return (
    <div
      onClick={() => {
        if (isExpanded) handleToggleExpand(false);
        setShowContextMenu(null);
      }}
      className="w-full h-full flex flex-col items-center justify-start overflow-hidden select-none relative pt-0 bg-transparent font-sans"
    >
      {/* Sleek Pitch-Black #0B0D10 Capsule Anchored Flush at Top Edge (y=0) */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setShowContextMenu(null);
          if (!isExpanded) handleToggleExpand(true);
        }}
        onMouseEnter={() => {
          if (!isExpanded) handleToggleExpand(true);
        }}
        onContextMenu={handleContextMenu}
        style={{ backgroundColor: '#0B0D10' }}
        className={`w-full h-full text-white border border-white/[0.08] relative flex flex-col overflow-hidden cursor-pointer backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isExpanded
            ? 'rounded-b-[24px] rounded-t-none px-4 pt-2.5 pb-3 shadow-[0_20px_60px_rgba(0,0,0,0.95)]'
            : 'rounded-b-[18px] rounded-t-none px-3 py-1 flex-row items-center justify-between shadow-[0_8px_20px_rgba(0,0,0,0.85)]'
        }`}
      >
        {/* Interior ambient edge highlight */}
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />

        {/* ================= 1. IDLE STATE: EXACT #0B0D10 SLEEK PILL ================= */}
        {!isExpanded && (
          <div className="w-full h-full flex items-center justify-between z-10 px-0.5">
            {/* Status dot + SWE-03 label */}
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
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
              <span className="text-[11px] font-mono font-semibold tracking-tight text-white/90 truncate">
                {pendingApproval ? 'GATE REQ' : isEmergencyPaused ? 'PAUSED' : activeAgent}
              </span>
            </div>

            {/* Mini <Strands/> orb indicator */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <div className="w-5 h-5 relative rounded-full overflow-hidden flex items-center justify-center">
                <Strands
                  colors={STRANDS_COLORS}
                  speed={0.8}
                  amplitude={0.9}
                  energy={0.5}
                  level={audioLevel}
                  listening={!isSpeaking && !isMuted}
                  glass={false}
                  interactive={false}
                  scale={0.85}
                  opacity={0.95}
                />
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. EXPANDED STATE: DYNAMIC ISLAND CONTENT ================= */}
        {isExpanded && (
          <div className="w-full h-full flex flex-col justify-between z-10 animate-fadeIn">
            {/* Minimal Header Bar */}
            <div className="w-full flex items-center justify-between pb-1.5 shrink-0 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 truncate">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isSpeaking
                      ? 'bg-amber-400 animate-pulse'
                      : isMuted
                      ? 'bg-neutral-500'
                      : 'bg-emerald-400 animate-pulse'
                  }`}
                />
                <span className="text-[11px] font-mono font-medium tracking-wider text-white/80 truncate">
                  {isSpeaking ? 'SPEAKING' : isMuted ? 'MUTED' : `${activeAgent} · VOICE`}
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/60 truncate max-w-[120px]">
                  {currentVoiceObj?.name.split(' ')[0]}
                </span>
              </div>

              {/* Action Icons in Header */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowVoiceSettings(!showVoiceSettings);
                  }}
                  title="Custom Voice Settings (voice-generator.com)"
                  className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                    showVoiceSettings ? 'bg-primary text-on-primary' : 'hover:bg-white/10 text-white/50 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={handleRestoreFullApp}
                  title="Open Command Center Dashboard"
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleExpand(false);
                  }}
                  title="Collapse notch (Esc)"
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Approval Gate Banner (If pending) */}
            {pendingApproval && (
              <div className="w-full py-1.5 px-3 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-between text-xs my-1 shrink-0">
                <div className="truncate max-w-[210px]">
                  <span className="text-[9px] font-mono text-amber-400 uppercase font-bold block">
                    Gate #{pendingApproval.id.slice(-4)}
                  </span>
                  <span className="text-white font-medium truncate block">{pendingApproval.action}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <LiquidButton
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDenyAction) onDenyAction(pendingApproval.id, pendingApproval.token);
                    }}
                  >
                    <X className="w-3 h-3" />
                    <span>Reject</span>
                  </LiquidButton>

                  <LiquidButton
                    variant="amber"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onApproveAction) onApproveAction(pendingApproval.id, pendingApproval.token);
                    }}
                  >
                    <Check className="w-3 h-3" />
                    <span>Approve</span>
                  </LiquidButton>
                </div>
              </div>
            )}

            {/* VIEW A: MAIN ORB STAGE */}
            {!showVoiceSettings && (
              <>
                {/* Center Stage: <Strands /> WebGL2 Orb Visualizer */}
                <div className="w-full h-[150px] relative flex items-center justify-center overflow-hidden my-auto">
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

                {/* Short Live Captions / Subtitle */}
                <div className="w-full px-2 text-center shrink-0">
                  <p className="text-xs font-medium text-white/90 truncate leading-snug">
                    {captionText}
                  </p>
                </div>

                {/* Interactive Action Bar with LiquidButton & MetalButton */}
                <div className="w-full flex items-center justify-center gap-2 pt-2 shrink-0">
                  <LiquidButton
                    variant={isMuted ? 'default' : 'primary'}
                    size="sm"
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {isMuted ? <MicOff className="w-3.5 h-3.5 text-neutral-400" /> : <Mic className="w-3.5 h-3.5 text-blue-200" />}
                    <span>{isMuted ? 'Muted' : 'Mute'}</span>
                  </LiquidButton>

                  <LiquidButton
                    variant="default"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowVoiceSettings(true);
                    }}
                    title="Open Voice Generator Controls"
                  >
                    <Sliders className="w-3.5 h-3.5 text-white/80" />
                    <span>Voice</span>
                  </LiquidButton>

                  <MetalButton
                    variant="titanium"
                    size="sm"
                    onClick={handleRestoreFullApp}
                    title="Open Full Dashboard"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-neutral-300" />
                    <span>Dashboard</span>
                  </MetalButton>

                  <MetalButton
                    variant="dark"
                    size="sm"
                    onClick={handleEndSession}
                    title="End voice session and collapse notch"
                  >
                    <PhoneOff className="w-3.5 h-3.5 text-red-400" />
                    <span>End</span>
                  </MetalButton>
                </div>
              </>
            )}

            {/* VIEW B: CUSTOM VOICE-GENERATOR.COM CONTROLS */}
            {showVoiceSettings && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full flex-1 flex flex-col justify-between py-1 px-1 overflow-y-auto space-y-2 animate-fadeIn text-xs"
              >
                {/* Voice Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider flex items-center gap-1">
                      <Radio className="w-3 h-3 text-primary" />
                      Voice Model (voice-generator.com)
                    </span>
                    <span className="text-[10px] font-mono text-white/40">{currentVoiceObj?.language}</span>
                  </div>
                  <select
                    value={selectedVoiceId}
                    onChange={(e) => setSelectedVoiceId(e.target.value)}
                    className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-primary/60 font-medium"
                  >
                    {voiceList.map((v) => (
                      <option key={v.id} value={v.id} className="bg-neutral-900 text-white">
                        {v.name} ({v.gender}, {v.language})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tone Pill Tabs */}
                <div>
                  <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider block mb-1">
                    Persona Tone
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['calm_concise', 'conversational', 'direct'] as VoiceTone[]).map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setSelectedTone(tone)}
                        className={`py-1 px-2 rounded-md font-mono text-[10px] border transition-all ${
                          selectedTone === tone
                            ? 'bg-primary/20 border-primary text-primary font-bold shadow-sm'
                            : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {tone === 'calm_concise' ? 'Concise' : tone === 'conversational' ? 'Colleague' : 'Direct'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders: Speed, Pitch, Volume */}
                <div className="space-y-1.5 bg-white/[0.03] p-2 rounded-lg border border-white/[0.06]">
                  {/* Speed Slider */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/70">Speed:</span>
                    <span className="text-[10px] font-mono text-primary font-bold">{speechSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.05"
                    value={speechSpeed}
                    onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                  />

                  {/* Pitch Slider */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-white/70">Pitch:</span>
                    <span className="text-[10px] font-mono text-primary font-bold">
                      {speechPitch > 0 ? `+${speechPitch}Hz` : `${speechPitch}Hz`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-25"
                    max="25"
                    step="1"
                    value={speechPitch}
                    onChange={(e) => setSpeechPitch(parseInt(e.target.value))}
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                {/* Test & Save Action Row */}
                <div className="flex items-center gap-2 pt-1">
                  <LiquidButton
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    disabled={isTestingVoice}
                    onClick={() => handlePreviewVoice()}
                  >
                    <Play className="w-3.5 h-3.5 text-blue-200" />
                    <span>{isTestingVoice ? 'Synthesizing...' : 'Test Voice'}</span>
                  </LiquidButton>

                  <MetalButton
                    variant="titanium"
                    size="sm"
                    onClick={handleSaveVoiceConfig}
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Save</span>
                  </MetalButton>

                  <button
                    onClick={() => setShowVoiceSettings(false)}
                    className="px-2.5 py-1 text-[11px] text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Right-Click Context Menu */}
      {showContextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: Math.min(showContextMenu.y, 220), left: Math.min(showContextMenu.x, 240) }}
          className="fixed pointer-events-auto z-50 w-52 rounded-xl bg-neutral-900/95 border border-white/10 shadow-2xl p-1.5 text-xs font-sans text-neutral-300 backdrop-blur-xl animate-fadeIn"
        >
          <button
            onClick={() => {
              handleToggleExpand(!isExpanded);
              setShowContextMenu(null);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white flex items-center gap-2"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>{isExpanded ? 'Collapse to Pill' : 'Expand Island'}</span>
          </button>

          <button
            onClick={() => {
              setShowContextMenu(null);
              setIsExpanded(true);
              setShowVoiceSettings(true);
              notifyNativeResize(true);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white flex items-center gap-2"
          >
            <Sliders className="w-3.5 h-3.5 text-primary" />
            <span>Voice Generator Settings</span>
          </button>

          <button
            onClick={handleRestoreFullApp}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white flex items-center gap-2"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Open Command Center</span>
          </button>

          <button
            onClick={toggleMute}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white flex items-center gap-2"
          >
            {isMuted ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
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
            <EyeOff className="w-3.5 h-3.5" />
            <span>Hide Island (Ctrl+Shift+Space)</span>
          </button>

          <button
            onClick={() => {
              setShowContextMenu(null);
              if ((window as any).pywebview?.api?.exit_app) {
                (window as any).pywebview.api.exit_app();
              } else {
                fetch(`${API_BASE}/tray/exit`, { method: 'POST' }).catch(() => {});
              }
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 text-red-400 flex items-center gap-2"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Exit PHOENIX</span>
          </button>
        </div>
      )}
    </div>
  );
};
