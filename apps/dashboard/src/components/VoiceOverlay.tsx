import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Strands from './Strands';
import { LiquidButton, MetalButton } from './ui/liquid-glass-button';
import {
  Mic,
  MicOff,
  PhoneOff,
  Check,
  X,
  ChevronUp,
  ChevronLeft,
  Play,
  LayoutDashboard,
  SlidersHorizontal
} from 'lucide-react';

export type VoiceTone = 'calm_concise' | 'conversational' | 'direct';
export type NotchState = 'idle' | 'hover' | 'voice' | 'approval' | 'settings';

interface NotchDimensions {
  width: number;
  height: number;
}

const STATE_DIMENSIONS: Record<NotchState, NotchDimensions> = {
  idle: { width: 200, height: 34 },
  hover: { width: 320, height: 58 },
  voice: { width: 460, height: 180 },
  approval: { width: 500, height: 200 },
  settings: { width: 520, height: 340 }
};

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

// Dragheart Luard Cold Violet Palette for Strands WebGL2 Orb
const STRANDS_LUARD_COLORS = [
  '#8B5CF6',
  '#A78BFA',
  '#C4B5FD',
  '#EDE9FE',
  '#6D28D9',
  '#4C1D95',
  '#3B82F6'
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
  // State Machine: 'idle' | 'hover' | 'voice' | 'approval' | 'settings'
  const [notchState, setNotchState] = useState<NotchState>(
    pendingApproval ? 'approval' : 'idle'
  );
  const [selectedTone, setSelectedTone] = useState<VoiceTone>('calm_concise');
  const [isListening, setIsListening] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0.04);
  const [captionText, setCaptionText] = useState<string>('Ready for deployment.');

  // Voice Generator State
  const [voiceList, setVoiceList] = useState<VoiceOption[]>(DEFAULT_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('en-GB-RyanNeural');
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [speechPitch, setSpeechPitch] = useState<number>(0);
  const [speechVolume, setSpeechVolume] = useState<number>(100);
  const [testSampleText, setTestSampleText] = useState<string>('System online, Sir. Engineering fleet ready for deployment.');
  const [isTestingVoice, setIsTestingVoice] = useState<boolean>(false);

  const hoverLeaveTimerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Synchronize active hit rectangle with Python desktop launcher (0ms latency pass-through)
  const updateHitRect = (state: NotchState) => {
    const dim = STATE_DIMENSIONS[state];
    const offset_x = Math.max(0, (540 - dim.width) / 2);
    try {
      if ((window as any).pywebview?.api?.set_hit_rect) {
        (window as any).pywebview.api.set_hit_rect(offset_x, 0, dim.width, dim.height);
      }
    } catch {}
  };

  const transitionTo = (nextState: NotchState) => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setNotchState(nextState);
    updateHitRect(nextState);
  };

  // Sync initial hit rect on mount
  useEffect(() => {
    updateHitRect(notchState);
  }, []);

  // React to incoming approvals
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      if (pendingApproval) transitionTo('approval');
      return;
    }
    if (pendingApproval) {
      transitionTo('approval');
      setCaptionText(`Gate #${pendingApproval.id.slice(-4)}: ${pendingApproval.action}`);
    } else if (notchState === 'approval') {
      transitionTo('idle');
    }
  }, [pendingApproval?.id]);

  // Keyboard dismissal (Escape returns to idle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        transitionTo('idle');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
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

  // Audio Analyser Setup
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
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / (dataArray.length * 255);
          setAudioLevel((prev) => {
            const target = Math.max(0.04, Math.min(1.0, avg * 2.2));
            return prev + (target - prev) * 0.28;
          });
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      } catch {}
    };

    initAudio();

    return () => {
      cancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {});
    };
  }, []);

  const handlePreviewVoice = async () => {
    setIsTestingVoice(true);
    setIsSpeaking(true);
    try {
      const resp = await fetch(`${API_BASE}/api/tts/voice-generator/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testSampleText,
          voice_id: selectedVoiceId,
          speed: speechSpeed,
          pitch: speechPitch,
          volume: speechVolume,
          tone: selectedTone
        })
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        activeAudioElementRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          setIsTestingVoice(false);
        };
        await audio.play();
      }
    } catch {
      setIsSpeaking(false);
      setIsTestingVoice(false);
    }
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
      transitionTo('voice');
    } catch {
      transitionTo('voice');
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleOpenDashboard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenCommandCenter) {
      onOpenCommandCenter();
    } else {
      fetch(`${API_BASE}/tray/restore-window`, { method: 'POST' }).catch(() => {});
    }
  };

  // Hover management with ~120ms debounce
  const handlePillMouseEnter = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    if (notchState === 'idle') {
      transitionTo('hover');
    }
  };

  const handlePillMouseLeave = () => {
    if (notchState === 'hover') {
      hoverLeaveTimerRef.current = setTimeout(() => {
        transitionTo('idle');
      }, 120);
    }
  };

  const handlePillClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (notchState === 'idle' || notchState === 'hover') {
      transitionTo(pendingApproval ? 'approval' : 'voice');
    }
  };

  const currentDim = STATE_DIMENSIONS[notchState];
  const isExpanded = notchState !== 'idle';

  return (
    <div
      onClick={() => {
        if (notchState !== 'idle') transitionTo('idle');
      }}
      className="w-full h-full flex flex-col items-center justify-start overflow-hidden select-none relative bg-transparent font-sans"
      style={{ background: 'transparent', backgroundColor: 'transparent', margin: 0, padding: 0 }}
    >
      {/* Dynamic Notch / Island Capsule */}
      <div
        onClick={handlePillClick}
        onMouseEnter={handlePillMouseEnter}
        onMouseLeave={handlePillMouseLeave}
        style={{
          width: `${currentDim.width}px`,
          height: `${currentDim.height}px`,
          borderRadius: notchState === 'idle' ? '0 0 16px 16px' : '0 0 22px 22px',
          background: '#0B0C0E',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderTop: 'none',
          boxShadow: isExpanded
            ? '0 16px 40px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
            : '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          transition: 'all 280ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'width, height, border-radius'
        }}
        className="pointer-events-auto text-white relative flex flex-col overflow-hidden cursor-pointer select-none"
      >
        {/* Subtle interior hairline */}
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none border border-white/[0.04]" />

        {/* 1. IDLE STATE: Sleek Flush Bezel Pill (200 × 34 px) */}
        {notchState === 'idle' && (
          <div className="w-full h-full flex items-center justify-between px-3.5 z-10 select-none whitespace-nowrap">
            <div className="flex items-center space-x-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  pendingApproval
                    ? 'bg-amber-400 animate-pulse'
                    : isSpeaking
                    ? 'bg-violet-400 animate-pulse'
                    : isEmergencyPaused
                    ? 'bg-red-500'
                    : isMuted
                    ? 'bg-neutral-600'
                    : 'bg-emerald-400'
                }`}
              />
              <span className="text-[11px] font-mono tracking-wider text-white/90 truncate uppercase font-semibold">
                {pendingApproval ? 'GATE' : (activeAgent || 'SWE-03')}
              </span>
            </div>

            <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0 ml-2 bg-black/40 border border-white/[0.08]">
              <Strands
                colors={STRANDS_LUARD_COLORS}
                speed={0.8}
                amplitude={0.9}
                energy={0.5}
                level={audioLevel}
                listening={!isSpeaking && !isMuted}
                glass={true}
                interactive={false}
                scale={0.8}
                opacity={0.95}
              />
            </div>
          </div>
        )}

        {/* 2. HOVER STATE: Summary Preview (320 × 58 px) */}
        {notchState === 'hover' && (
          <div className="w-full h-full flex items-center justify-between px-4 z-10 select-none animate-fadeIn">
            <div className="flex flex-col min-w-0 pr-2">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs font-mono font-bold tracking-tight text-white uppercase">
                  {activeAgent}
                </span>
                <span className="text-[10px] font-mono text-white/40">· ACTIVE</span>
              </div>
              <span className="text-[11px] text-white/60 font-mono truncate mt-0.5">
                {currentProjectName || 'Autonomous Fleet'}
              </span>
            </div>

            <div className="flex items-center space-x-3 shrink-0">
              <span className="text-xs font-mono text-emerald-400 font-semibold tabular-nums">
                ${dailySpend.toFixed(2)}
              </span>
              <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-black/40 border border-white/[0.08]">
                <Strands
                  colors={STRANDS_LUARD_COLORS}
                  speed={0.9}
                  amplitude={1.0}
                  energy={0.6}
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

        {/* 3. VOICE STATE: Acoustic Cockpit (460 × 180 px) */}
        {notchState === 'voice' && (
          <div className="w-full h-full flex flex-col justify-between p-3.5 z-10 animate-fadeIn">
            {/* Top Bar */}
            <div className="w-full flex items-center justify-between pb-1.5 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-xs font-mono font-bold text-white uppercase">{activeAgent}</span>
                <span className="text-[10px] font-mono text-white/40">· BUTLER ONLINE</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleOpenDashboard}
                  title="Open Dashboard"
                  className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-white/70 hover:text-white flex items-center justify-center transition-colors border border-white/[0.06]"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    transitionTo('idle');
                  }}
                  title="Collapse (Esc)"
                  className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-white/70 hover:text-white flex items-center justify-center transition-colors border border-white/[0.06]"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Acoustic Chamber */}
            <div className="w-full flex-1 flex flex-col items-center justify-center py-1">
              <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-black/40 border border-white/[0.08] shadow-inner">
                <Strands
                  colors={STRANDS_LUARD_COLORS}
                  speed={1.05}
                  amplitude={1.1}
                  energy={0.65}
                  level={audioLevel}
                  listening={!isSpeaking && !isMuted}
                  glass={true}
                  interactive={true}
                  scale={0.9}
                  opacity={1.0}
                />
              </div>
              <p className="text-xs font-mono text-white/80 truncate mt-2 text-center max-w-[400px]">
                {captionText}
              </p>
            </div>

            {/* Bottom Primary Controls (Nothing OS Minimalist Dock) */}
            <div className="w-full flex items-center justify-center gap-2.5 pt-1 shrink-0">
              <LiquidButton
                variant={isMuted ? 'default' : 'primary'}
                size="sm"
                className="flex-1 max-w-[120px] rounded-xl h-8 gap-1.5 text-xs font-mono"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5 text-neutral-400" /> : <Mic className="w-3.5 h-3.5 text-violet-300" />}
                <span>{isMuted ? 'Muted' : 'Mute'}</span>
              </LiquidButton>

              <LiquidButton
                variant="default"
                size="sm"
                className="flex-1 max-w-[120px] rounded-xl h-8 gap-1.5 text-xs font-mono"
                onClick={(e) => {
                  e.stopPropagation();
                  transitionTo('settings');
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-white/70" />
                <span>Voice</span>
              </LiquidButton>

              <MetalButton
                variant="dark"
                size="sm"
                className="flex-1 max-w-[120px] rounded-xl h-8 gap-1.5 text-xs font-mono text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  transitionTo('idle');
                }}
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>End</span>
              </MetalButton>
            </div>
          </div>
        )}

        {/* 4. APPROVAL STATE: Zero-Trust Security Gate (500 × 200 px) */}
        {notchState === 'approval' && (
          <div className="w-full h-full flex flex-col justify-between p-4 z-10 animate-fadeIn">
            {/* Header */}
            <div className="w-full flex items-center justify-between pb-2 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 font-bold uppercase tracking-wider border border-amber-400/20">
                  GATE #{pendingApproval?.id ? pendingApproval.id.slice(-4) : '8921'}
                </span>
                <span className="text-xs font-mono text-white/60">AUTHORIZATION REQUIRED</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  transitionTo('idle');
                }}
                className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-white/70 hover:text-white flex items-center justify-center"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            {/* Action Details */}
            <div className="w-full flex-1 flex flex-col justify-center py-2">
              <span className="text-sm font-semibold text-white/95 leading-snug line-clamp-2">
                {pendingApproval?.action || 'Production Resource Deployment Authorization'}
              </span>
              <p className="text-xs font-mono text-white/50 mt-1">
                Risk Level: <span className="text-amber-400 font-bold uppercase">{pendingApproval?.risk_level || 'HIGH'}</span> · Guardrail: Enforced
              </p>
            </div>

            {/* Primary Action Buttons */}
            <div className="w-full flex items-center justify-end gap-3 pt-1 shrink-0">
              <LiquidButton
                variant="destructive"
                size="default"
                className="rounded-xl px-5 h-9 text-xs font-mono font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDenyAction && pendingApproval) onDenyAction(pendingApproval.id, pendingApproval.token);
                  transitionTo('idle');
                }}
              >
                <X className="w-4 h-4" />
                <span>Reject</span>
              </LiquidButton>

              <LiquidButton
                variant="amber"
                size="default"
                className="rounded-xl px-6 h-9 text-xs font-mono font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onApproveAction && pendingApproval) onApproveAction(pendingApproval.id, pendingApproval.token);
                  transitionTo('idle');
                }}
              >
                <Check className="w-4 h-4" />
                <span>Authorize</span>
              </LiquidButton>
            </div>
          </div>
        )}

        {/* 5. SETTINGS STATE: Voice & Acoustics Configuration (520 × 340 px) */}
        {notchState === 'settings' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full flex flex-col justify-between p-4 z-10 animate-fadeIn text-xs"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] shrink-0">
              <button
                onClick={() => transitionTo('voice')}
                className="flex items-center gap-1 text-primary hover:text-primary/80 font-mono font-medium transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Voice</span>
              </button>
              <span className="font-mono font-bold text-white text-[12px] uppercase tracking-wider">
                Voice & Acoustics
              </span>
              <button
                onClick={() => transitionTo('idle')}
                className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tone Selector */}
            <div className="w-full bg-black/40 p-1 rounded-xl flex items-center border border-white/[0.06] my-2">
              {(['calm_concise', 'conversational', 'direct'] as VoiceTone[]).map((tone) => (
                <button
                  key={tone}
                  onClick={() => setSelectedTone(tone)}
                  className={`flex-1 py-1.5 rounded-lg text-center font-mono font-medium text-[11px] transition-all ${
                    selectedTone === tone
                      ? 'bg-violet-600 text-white font-semibold shadow-sm'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {tone === 'calm_concise' ? 'Concise' : tone === 'conversational' ? 'Colleague' : 'Direct'}
                </button>
              ))}
            </div>

            {/* Voice Model Selector */}
            <div className="space-y-2 bg-black/40 p-3 rounded-xl border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-white/60">Neural Butler Voice</span>
                <span className="text-[10px] font-mono text-white/40">{selectedVoiceId}</span>
              </div>
              <select
                value={selectedVoiceId}
                onChange={(e) => {
                  const newVoice = e.target.value;
                  setSelectedVoiceId(newVoice);
                  fetch(`${API_BASE}/api/tts/voice-generator/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voice_id: newVoice, tone: selectedTone })
                  }).catch(() => {});
                }}
                className="w-full bg-[#111317] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
              >
                {voiceList.map((v) => (
                  <option key={v.id} value={v.id} className="bg-[#111317] text-white">
                    {v.name} ({v.language})
                  </option>
                ))}
              </select>

              {/* Sliders */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-white/50">Speed</span>
                    <span className="text-violet-400 font-bold tabular-nums">{speechSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.05"
                    value={speechSpeed}
                    onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer accent-violet-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-white/50">Pitch</span>
                    <span className="text-violet-400 font-bold tabular-nums">{speechPitch}Hz</span>
                  </div>
                  <input
                    type="range"
                    min="-25"
                    max="25"
                    step="1"
                    value={speechPitch}
                    onChange={(e) => setSpeechPitch(parseInt(e.target.value))}
                    className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer accent-violet-500"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 pt-2">
              <LiquidButton
                variant="primary"
                size="default"
                className="flex-1 rounded-xl h-9 font-mono text-xs"
                disabled={isTestingVoice}
                onClick={handlePreviewVoice}
              >
                <Play className="w-3.5 h-3.5 text-violet-200" />
                <span>{isTestingVoice ? 'Speaking...' : 'Preview Voice'}</span>
              </LiquidButton>

              <LiquidButton
                variant="emerald"
                size="default"
                className="flex-1 rounded-xl h-9 font-mono text-xs"
                onClick={handleSaveVoiceConfig}
              >
                <Check className="w-3.5 h-3.5 text-emerald-200" />
                <span>Apply Profile</span>
              </LiquidButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
