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
  ChevronLeft,
  Play,
  Volume2,
  Sparkles,
  LayoutDashboard,
  EyeOff,
  Power,
  Radio,
  SlidersHorizontal,
  SquareCheck
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
  const collapseTimerRef = useRef<any>(null);

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

  const handleToggleExpand = (nextExpanded: boolean) => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    if (nextExpanded) {
      // 1. Instantly expand the native OS window canvas to accommodate the expanded island
      notifyNativeResize(true);
      // 2. Animate CSS island element smoothly outward
      setIsExpanded(true);
    } else {
      // 1. Animate CSS island element smoothly back to pill size
      setIsExpanded(false);
      setShowVoiceSettings(false);
      // 2. Wait 340ms (CSS transition is 320ms) for visual collapse to cleanly complete
      collapseTimerRef.current = setTimeout(() => {
        // 3. Shrink native OS window bounds only after animation finishes
        notifyNativeResize(false);
      }, 340);
    }
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

  // Auto-expand only when a NEW approval arrives after initial mount
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    if (pendingApproval) {
      handleToggleExpand(true);
      setCaptionText(`Approval required: ${pendingApproval.action}`);
    }
  }, [pendingApproval?.id]);

  // Keyboard & outside click collapse listener (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleToggleExpand(false);
        setShowContextMenu(null);
        setShowVoiceSettings(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

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
      className={`w-full h-full flex flex-col items-center justify-start overflow-hidden select-none relative p-2 bg-transparent font-sans ${
        isExpanded ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      style={{ background: 'transparent', backgroundColor: 'transparent', margin: 0 }}
    >
      {/* ================= APPLE IPHONE DYNAMIC ISLAND CAPSULE ================= */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setShowContextMenu(null);
          if (!isExpanded) handleToggleExpand(true);
        }}
        onContextMenu={handleContextMenu}
        style={{
          width: isExpanded ? '540px' : '260px',
          height: isExpanded ? '460px' : '38px',
          borderRadius: isExpanded ? '26px' : '9999px',
          background: '#0D0F12',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: isExpanded
            ? '0 24px 60px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          transition: 'all 320ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'width, height, border-radius, box-shadow'
        }}
        className={`pointer-events-auto text-white relative flex flex-col overflow-hidden cursor-pointer select-none ${
          isExpanded
            ? 'px-5 py-4'
            : 'px-3.5 py-0 flex-row items-center justify-between'
        }`}
      >
        {/* Subtle interior ambient edge highlight */}
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none border border-white/[0.04]" />

        {/* ================= 1. COLLAPSED STATE: SLEEK APPLE PILL ================= */}
        {!isExpanded && (
          <div className="w-full h-full flex items-center justify-between px-3.5 z-10 select-none whitespace-nowrap">
            {/* Leading accessory: Glowing Indicator + Agent Badge */}
            <div className="flex items-center space-x-2.5 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    pendingApproval
                      ? 'bg-amber-400'
                      : isSpeaking
                      ? 'bg-amber-400'
                      : isEmergencyPaused
                      ? 'bg-red-500'
                      : isMuted
                      ? 'bg-neutral-600'
                      : 'bg-emerald-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    pendingApproval
                      ? 'bg-amber-400'
                      : isSpeaking
                      ? 'bg-amber-400'
                      : isEmergencyPaused
                      ? 'bg-red-500'
                      : isMuted
                      ? 'bg-neutral-500'
                      : 'bg-emerald-400'
                  }`}
                />
              </span>
              <span className="text-[12px] font-mono font-medium tracking-wide text-white/95 whitespace-nowrap truncate">
                {pendingApproval ? 'GATE REQ' : isEmergencyPaused ? 'PAUSED' : (activeAgent || 'PHOENIX · SWE-03')}
              </span>
            </div>

            {/* Trailing accessory: Mini <Strands/> Audio Orb */}
            <div className="flex items-center space-x-2 shrink-0 ml-2">
              <div className="w-6 h-6 relative rounded-full overflow-hidden flex items-center justify-center bg-white/[0.06] border border-white/10 shadow-inner">
                <Strands
                  colors={STRANDS_COLORS}
                  speed={0.8}
                  amplitude={0.9}
                  energy={0.5}
                  level={audioLevel}
                  listening={!isSpeaking && !isMuted}
                  glass={true}
                  interactive={false}
                  scale={0.85}
                  opacity={0.95}
                />
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. EXPANDED STATE: IPHONE LIVE ACTIVITY EXPERIENCE ================= */}
        {isExpanded && (
          <div className="w-full h-full flex flex-col justify-between z-10 animate-fadeIn">
            {/* ZONE 1: APPLE-STYLE HEADER BAR */}
            <div className="w-full flex items-center justify-between pb-2 shrink-0 border-b border-white/[0.06]">
              {/* Left Identity Group */}
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isSpeaking
                        ? 'bg-amber-400'
                        : isMuted
                        ? 'bg-neutral-600'
                        : 'bg-emerald-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      isSpeaking
                        ? 'bg-amber-400'
                        : isMuted
                        ? 'bg-neutral-500'
                        : 'bg-emerald-400'
                    }`}
                  />
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold tracking-tight text-white/95 leading-none">
                    {activeAgent}
                  </span>
                  <span className="text-[10px] text-white/40 font-mono tracking-wider pt-0.5 leading-none">
                    {isSpeaking ? 'SPEAKING' : isMuted ? 'MUTED' : 'AUTONOMOUS FLEET'}
                  </span>
                </div>
              </div>

              {/* Right Utility Navigation (Uncluttered: Just Dashboard & Close) */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleRestoreFullApp}
                  title="Open Command Center (Dashboard)"
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white/70 hover:text-white flex items-center justify-center transition-all border border-white/[0.08]"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleExpand(false);
                  }}
                  title="Collapse Dynamic Island (Esc)"
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white/70 hover:text-white flex items-center justify-center transition-all border border-white/[0.08]"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* APPROVAL GATE CARD (Apple Pay / Face ID Authorization Style) */}
            {pendingApproval && (
              <div className="w-full my-2.5 p-3.5 rounded-2xl bg-gradient-to-b from-amber-500/[0.12] to-amber-950/[0.25] border border-amber-500/30 flex items-center justify-between shrink-0 shadow-lg animate-fadeIn gap-3">
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400 text-black font-bold uppercase tracking-wider shrink-0">
                      GATE #{pendingApproval.id.slice(-4)}
                    </span>
                    <span className="text-[11px] text-amber-200/90 font-medium">Authorization Required</span>
                  </div>
                  <span className="text-xs text-white/95 font-medium block leading-snug line-clamp-2">
                    {pendingApproval.action}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <LiquidButton
                    variant="destructive"
                    size="sm"
                    className="rounded-full px-3.5 py-1.5 text-xs font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDenyAction) onDenyAction(pendingApproval.id, pendingApproval.token);
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </LiquidButton>

                  <LiquidButton
                    variant="amber"
                    size="sm"
                    className="rounded-full px-4 py-1.5 text-xs font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onApproveAction) onApproveAction(pendingApproval.id, pendingApproval.token);
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </LiquidButton>
                </div>
              </div>
            )}

            {/* ZONE 2: MAIN HERO VIEW (Acoustic Chamber & Dynamic Orb) */}
            {!showVoiceSettings && (
              <>
                <div className="w-full flex-1 flex flex-col items-center justify-center py-2 my-auto">
                  {/* Acoustic Glass Lens */}
                  <div className="w-20 h-20 relative flex items-center justify-center rounded-full bg-gradient-to-b from-white/[0.05] via-transparent to-black/40 border border-white/[0.08] shadow-[inset_0_1px_2px_rgba(255,255,255,0.12),0_12px_32px_rgba(0,0,0,0.6)] overflow-hidden">
                    <Strands
                      colors={STRANDS_COLORS}
                      count={3}
                      speed={1.05}
                      amplitude={1.15}
                      waviness={1.0}
                      energy={0.65}
                      thickness={1.0}
                      spread={1.0}
                      glow={1.15}
                      taper={1.0}
                      intensity={1.0}
                      saturation={1.0}
                      scale={0.9}
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

                  {/* Subtitle / Caption Typography */}
                  <div className="w-full px-6 pt-2.5 text-center">
                    <p className="text-xs font-medium text-white/90 truncate leading-snug">
                      {captionText}
                    </p>
                  </div>
                </div>

                {/* ZONE 3: APPLE BOTTOM TACTILE DOCK (3 Perfectly Spaced Buttons) */}
                <div className="w-full flex items-center justify-center gap-3 pt-2 pb-1 shrink-0">
                  {/* Button 1: Mic Mute */}
                  <LiquidButton
                    variant={isMuted ? 'default' : 'primary'}
                    size="default"
                    className="flex-1 max-w-[130px] rounded-full h-10 gap-2 font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMute();
                    }}
                    title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4 text-neutral-400" /> : <Mic className="w-4 h-4 text-blue-200" />}
                    <span>{isMuted ? 'Muted' : 'Mute'}</span>
                  </LiquidButton>

                  {/* Button 2: Voice Customizer */}
                  <LiquidButton
                    variant="default"
                    size="default"
                    className="flex-1 max-w-[130px] rounded-full h-10 gap-2 font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowVoiceSettings(true);
                    }}
                    title="Customize Voice & Acoustics (voice-generator.com)"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-white/80" />
                    <span>Voice</span>
                  </LiquidButton>

                  {/* Button 3: End Call */}
                  <MetalButton
                    variant="dark"
                    size="default"
                    className="flex-1 max-w-[130px] rounded-full h-10 gap-2 font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEndSession();
                    }}
                    title="End voice session and collapse"
                  >
                    <PhoneOff className="w-4 h-4 text-red-400" />
                    <span>End</span>
                  </MetalButton>
                </div>
              </>
            )}

            {/* ZONE 2 ALTERNATE: APPLE SETTINGS SHEET (Voice-Generator.com Suite) */}
            {showVoiceSettings && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full flex-1 flex flex-col justify-between py-1 overflow-y-auto space-y-3 animate-fadeIn text-xs"
              >
                {/* Sheet Sub-Header */}
                <div className="flex items-center justify-between px-1">
                  <button
                    onClick={() => setShowVoiceSettings(false)}
                    className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Voice</span>
                  </button>
                  <span className="font-semibold text-white/90 text-[13px] tracking-tight">
                    Voice & Acoustics
                  </span>
                  <div className="w-12" />
                </div>

                {/* Segmented Controller for Tone (Apple Pill Tabs) */}
                <div className="w-full bg-white/[0.06] p-1 rounded-full flex items-center border border-white/[0.08]">
                  {(['calm_concise', 'conversational', 'direct'] as VoiceTone[]).map((tone) => (
                    <button
                      key={tone}
                      onClick={() => setSelectedTone(tone)}
                      className={`flex-1 py-1.5 rounded-full text-center font-medium transition-all ${
                        selectedTone === tone
                          ? 'bg-primary text-on-primary font-semibold shadow-sm'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {tone === 'calm_concise' ? 'Concise' : tone === 'conversational' ? 'Colleague' : 'Direct'}
                    </button>
                  ))}
                </div>

                {/* Grouped Inset Card for Voice Parameters */}
                <div className="space-y-3 bg-white/[0.04] p-3 rounded-2xl border border-white/[0.08]">
                  {/* Voice Selector Row */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-white/70">Neural Model</span>
                      <span className="text-[10px] font-mono text-white/40">{currentVoiceObj?.language}</span>
                    </div>
                    <select
                      value={selectedVoiceId}
                      onChange={(e) => {
                        const newVoice = e.target.value;
                        setSelectedVoiceId(newVoice);
                        fetch(`${API_BASE}/api/tts/voice-generator/save`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            voice_id: newVoice,
                            tone: selectedTone
                          })
                        }).catch(() => {});
                      }}
                      className="w-full bg-neutral-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary font-medium"
                    >
                      {voiceList.map((v) => (
                        <option key={v.id} value={v.id} className="bg-neutral-900 text-white">
                          {v.name} ({v.gender}, {v.language})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sliders Grid: Speed & Pitch */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {/* Speaking Speed */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/60">Speed</span>
                        <span className="font-mono text-primary font-semibold">{speechSpeed.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.6"
                        max="1.8"
                        step="0.05"
                        value={speechSpeed}
                        onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>

                    {/* Voice Pitch */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/60">Pitch</span>
                        <span className="font-mono text-primary font-semibold">
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
                        className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Action Row: Test Voice & Save */}
                <div className="flex items-center gap-3 pt-1">
                  <LiquidButton
                    variant="primary"
                    size="default"
                    className="flex-1 rounded-full h-10 font-medium"
                    disabled={isTestingVoice}
                    onClick={() => handlePreviewVoice()}
                  >
                    <Play className="w-4 h-4 text-blue-200" />
                    <span>{isTestingVoice ? 'Synthesizing...' : 'Preview Voice'}</span>
                  </LiquidButton>

                  <LiquidButton
                    variant="emerald"
                    size="default"
                    className="flex-1 rounded-full h-10 font-medium"
                    onClick={handleSaveVoiceConfig}
                  >
                    <Check className="w-4 h-4 text-emerald-200" />
                    <span>Apply Voice</span>
                  </LiquidButton>
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
          className="fixed pointer-events-auto z-50 w-52 rounded-2xl bg-neutral-900/95 border border-white/10 shadow-2xl p-1.5 text-xs font-sans text-neutral-300 backdrop-blur-2xl animate-fadeIn"
        >
          <button
            onClick={() => {
              handleToggleExpand(!isExpanded);
              setShowContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 hover:text-white flex items-center gap-2.5 font-medium transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
            <span>{isExpanded ? 'Collapse to Pill' : 'Expand Island'}</span>
          </button>

          <button
            onClick={() => {
              setShowContextMenu(null);
              setIsExpanded(true);
              setShowVoiceSettings(true);
              notifyNativeResize(true);
            }}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 hover:text-white flex items-center gap-2.5 font-medium transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span>Voice & Acoustics</span>
          </button>

          <button
            onClick={handleRestoreFullApp}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 hover:text-white flex items-center gap-2.5 font-medium transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Command Center</span>
          </button>

          <button
            onClick={toggleMute}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 hover:text-white flex items-center gap-2.5 font-medium transition-colors"
          >
            {isMuted ? <Mic className="w-4 h-4 text-blue-400" /> : <MicOff className="w-4 h-4" />}
            <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
          </button>

          <div className="h-[1px] bg-white/10 my-1.5" />

          <button
            onClick={() => {
              setShowContextMenu(null);
              if (onCloseOverlay) onCloseOverlay();
              else fetch(`${API_BASE}/overlay/toggle`, { method: 'POST' }).catch(() => {});
            }}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white flex items-center gap-2.5 font-medium transition-colors"
          >
            <EyeOff className="w-4 h-4" />
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
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-500/20 text-red-400 flex items-center gap-2.5 font-medium transition-colors"
          >
            <Power className="w-4 h-4" />
            <span>Exit PHOENIX</span>
          </button>
        </div>
      )}
    </div>
  );
};
