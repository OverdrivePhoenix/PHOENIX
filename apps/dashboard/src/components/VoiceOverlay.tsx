import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Strands from './Strands';
import OVERLAY_TOKENS from '../constants/overlayTokens.json';
import { Mic, MicOff, PhoneOff, ChevronUp, LayoutDashboard, Settings } from 'lucide-react';

export type VoiceTone = 'calm_concise' | 'conversational' | 'direct';
export type NotchState = 'idle' | 'hover' | 'voice' | 'approval';

const STATE_DIMENSIONS = OVERLAY_TOKENS.states;

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
  '#F2F2F2',
  '#A1A1AA',
  '#71717A',
  '#E4E4E7',
  '#52525B',
  '#3F3F46',
  '#27272A'
];

const OPAQUE_CLEAR_COLOR = [0.0, 0.0, 0.0, 1.0];
const TOP_GAP = (OVERLAY_TOKENS as any).topGap ?? 6;

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('5173')
    ? window.location.origin
    : 'http://localhost:8000');

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  onOpenCommandCenter,
  currentProjectName = 'College Canteen App',
  activeAgent = 'PHOENIX · SWE-03',
  pendingApproval = null,
  dailySpend = 18.42,
  isEmergencyPaused = false,
  onApproveAction,
  onDenyAction,
  onSendCommand
}) => {
  const [notchState, setNotchState] = useState<NotchState>(
    pendingApproval ? 'approval' : 'idle'
  );
  const [isReady, setIsReady] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0.04);
  const [captionText, setCaptionText] = useState<string>('Listening for command...');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('en-GB-RyanNeural');

  const stageRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);

  const requestState = (next: NotchState) => {
    try {
      if ((window as any).pywebview?.api?.set_state) {
        (window as any).pywebview.api.set_state(next);
      } else {
        setNotchState(next);
        setIsReady(true);
      }
    } catch {
      setNotchState(next);
      setIsReady(true);
    }
  };

  // Overflow assertion: verify content never overflows current state token bounds
  const checkOverflow = (stateName: NotchState) => {
    const el = stageRef.current;
    if (!el) return;
    const dim = STATE_DIMENSIONS[stateName];
    const ow = Math.max(0, el.scrollWidth - dim.width);
    const oh = Math.max(0, el.scrollHeight - dim.height);
    if (ow > 0 || oh > 0) {
      const msg = `Overflow in state='${stateName}': scroll=${el.scrollWidth}x${el.scrollHeight} > token=${dim.width}x${dim.height} (overflow +${ow}w,+${oh}h)`;
      console.error(msg);
      try {
        (window as any).pywebview?.api?.log_error(msg);
      } catch {}
    }
  };

  // Regression guard: verify WebView viewport matches DIP window bounds on load & resize
  useEffect(() => {
    const checkViewport = () => {
      const minW = STATE_DIMENSIONS.approval.width;
      const minH = STATE_DIMENSIONS.approval.height;
      if (window.innerWidth < minW || window.innerHeight < minH) {
        const msg = `Overlay viewport clipped: ${window.innerWidth}x${window.innerHeight} < ${minW}x${minH} (dpr=${window.devicePixelRatio})`;
        console.error(msg);
        try {
          (window as any).pywebview?.api?.log_error(msg);
        } catch {}
      }
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Listen to main-process tween lifecycle events
  useEffect(() => {
    const onLeave = () => setIsReady(false);
    const onSettled = (e: Event) => {
      const next = (e as CustomEvent<NotchState>).detail;
      if (next && STATE_DIMENSIONS[next]) {
        setNotchState(next);
        requestAnimationFrame(() => checkOverflow(next));
      }
      setIsReady(true);
    };
    window.addEventListener('island:leave', onLeave);
    window.addEventListener('island:settled', onSettled);
    return () => {
      window.removeEventListener('island:leave', onLeave);
      window.removeEventListener('island:settled', onSettled);
    };
  }, []);

  // Load persisted default voice for TTS replies
  useEffect(() => {
    fetch(`${API_BASE}/api/tts/voice-generator/voices`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.default_voice) setSelectedVoiceId(data.default_voice);
      })
      .catch(() => {});
  }, []);

  // React to incoming approvals
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      if (pendingApproval) requestState('approval');
      return;
    }
    if (pendingApproval) {
      requestState('approval');
      setCaptionText(pendingApproval.action);
    } else if (notchState === 'approval') {
      requestState('idle');
    }
  }, [pendingApproval?.id]);

  // Escape collapses to idle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestState('idle');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const speakWithActiveProvider = async (rawText: string) => {
    setIsSpeaking(true);
    setCaptionText(rawText);
    try {
      const response = await fetch(`${API_BASE}/api/tts/voice-generator/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawText,
          voice_id: selectedVoiceId,
          speed: 1.0,
          pitch: 0,
          volume: 100,
          tone: 'calm_concise'
        })
      });
      if (response.ok && response.headers.get('content-type')?.includes('audio')) {
        const blob = await response.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        activeAudioElementRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          setAudioLevel(0.04);
          setCaptionText('Listening for command...');
        };
        await audio.play();
        return;
      }
    } catch {}
    setIsSpeaking(false);
  };

  const handleUserUtterance = async (transcript: string) => {
    setCaptionText(`"${transcript}"`);
    if (onSendCommand) {
      try {
        const res = await onSendCommand(transcript, 'calm_concise');
        if (res?.reply) await speakWithActiveProvider(res.reply);
      } catch {}
    }
  };

  // Audio analyser + Web Speech Recognition
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

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              const txt = event.results[i][0].transcript.trim();
              if (txt) handleUserUtterance(txt);
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          if (interim) setCaptionText(interim);
        };
        recognition.start();
        recognitionRef.current = recognition;
      } catch {}
    }

    return () => {
      cancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (activeAudioElementRef.current) activeAudioElementRef.current.pause();
    };
  }, []);

  const handleOpenDashboard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenCommandCenter) {
      onOpenCommandCenter();
    } else {
      fetch(`${API_BASE}/tray/restore-window`, { method: 'POST' }).catch(() => {});
    }
    try {
      (window as any).pywebview?.api?.open_dashboard();
    } catch {}
  };

  const handleMouseEnter = () => {
    try {
      (window as any).pywebview?.api?.hover(true);
    } catch {}
  };

  const handleMouseLeave = () => {
    try {
      (window as any).pywebview?.api?.hover(false);
    } catch {}
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (notchState === 'idle' || notchState === 'hover') {
      requestState(pendingApproval ? 'approval' : 'voice');
    }
  };

  const dim = STATE_DIMENSIONS[notchState];
  const radius = Math.min(Math.floor(dim.height / 2), 36);
  const isDebugShape = typeof window !== 'undefined' && (window as any).__PHOENIX_DEBUG_SHAPE__ === true;
  const surfaceBg = isDebugShape ? 'transparent' : '#000000';

  return (
    <div
      onClick={() => {
        if (notchState !== 'idle') requestState('idle');
      }}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: surfaceBg,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        colorScheme: 'dark'
      }}
    >
      <div
        ref={stageRef}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-state={notchState}
        style={{
          position: 'absolute',
          top: `${TOP_GAP}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: `${dim.width}px`,
          height: `${dim.height}px`,
          boxSizing: 'border-box',
          padding: notchState === 'idle' ? '0 12px' : '12px 16px',
          overflow: 'hidden',
          background: surfaceBg,
          border: isReady && !isDebugShape ? '1px solid rgba(255, 255, 255, 0.10)' : 'none',
          borderRadius: `${radius}px`,
          color: '#F2F2F2',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div
          style={{
            opacity: isReady ? 1 : 0,
            transition: 'opacity 120ms ease-out',
            width: '100%',
            height: '100%',
            minWidth: 0
          }}
        >
          {/* 1. IDLE (200 × 36): status dot + PHOENIX · SWE-03 + mini orb */}
          {notchState === 'idle' && (
            <div className="w-full h-full flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    pendingApproval || isEmergencyPaused ? 'bg-[#FF3B30]' : 'bg-[#F2F2F2]'
                  }`}
                />
                <span className="text-[11px] font-mono font-medium tracking-wider text-[#F2F2F2] whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                  {pendingApproval ? 'GATE REQ' : activeAgent}
                </span>
              </div>
              <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-[#0A0A0B]">
                <Strands
                  colors={STRANDS_COLORS}
                  speed={0.6}
                  amplitude={0.6}
                  energy={0.25}
                  level={0}
                  listening={false}
                  glass={true}
                  interactive={false}
                  scale={0.8}
                  maxDevicePixelRatio={2}
                  paused={true}
                  opaqueClearColor={OPAQUE_CLEAR_COLOR}
                />
              </div>
            </div>
          )}

          {/* 2. HOVER (360 × 84): active task + status + budget readout ($18.42) */}
          {notchState === 'hover' && (
            <div className="w-full h-full flex items-center justify-between gap-3 min-w-0">
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      pendingApproval || isEmergencyPaused ? 'bg-[#FF3B30]' : 'bg-[#F2F2F2]'
                    }`}
                  />
                  <span className="text-[11px] font-mono uppercase text-[#8A8A8E] whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                    {activeAgent} · {isEmergencyPaused ? 'PAUSED' : 'ACTIVE'}
                  </span>
                </div>
                <span className="text-[13px] font-sans text-[#F2F2F2] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 mt-1">
                  {currentProjectName}
                </span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[12px] font-mono tabular-nums text-[#F2F2F2] whitespace-nowrap">
                  ${dailySpend.toFixed(2)}
                </span>
                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-[#0A0A0B]">
                  <Strands
                    colors={STRANDS_COLORS}
                    speed={0.8}
                    amplitude={0.9}
                    energy={0.45}
                    level={audioLevel}
                    listening={!isSpeaking && !isMuted}
                    glass={true}
                    interactive={false}
                    scale={0.85}
                    maxDevicePixelRatio={2}
                    paused={false}
                    opaqueClearColor={OPAQUE_CLEAR_COLOR}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. VOICE (440 × 196): header + Strands orb + transcript + 3-button dock (Mute, Voice, End) */}
          {notchState === 'voice' && (
            <div className="w-full h-full flex flex-col justify-between gap-2 min-w-0">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08] shrink-0 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F2F2F2] shrink-0" />
                  <span className="text-[11px] font-mono uppercase text-[#F2F2F2] whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                    {activeAgent} · BUTLER ONLINE
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleOpenDashboard}
                    title="Open Command Center"
                    className="w-7 h-7 rounded-[4px] border border-white/[0.10] bg-transparent hover:bg-white/[0.06] text-[#8A8A8E] hover:text-[#F2F2F2] flex items-center justify-center"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      requestState('idle');
                    }}
                    title="Collapse (Esc)"
                    className="w-7 h-7 rounded-[4px] border border-white/[0.10] bg-transparent hover:bg-white/[0.06] text-[#8A8A8E] hover:text-[#F2F2F2] flex items-center justify-center"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-1 min-h-0 min-w-0">
                <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 bg-[#0A0A0B]">
                  <Strands
                    colors={STRANDS_COLORS}
                    speed={1.0}
                    amplitude={1.1}
                    energy={0.65}
                    level={audioLevel}
                    listening={!isSpeaking && !isMuted}
                    glass={true}
                    interactive={false}
                    scale={0.9}
                    maxDevicePixelRatio={2}
                    paused={false}
                    opaqueClearColor={OPAQUE_CLEAR_COLOR}
                  />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[11px] font-mono uppercase text-[#8A8A8E] whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                    {isSpeaking ? 'SPEAKING' : isMuted ? 'MUTED' : 'LISTENING'}
                  </span>
                  <span className="text-[13px] font-sans text-[#F2F2F2] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 mt-0.5">
                    {captionText}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMuted(!isMuted);
                  }}
                  className="h-8 rounded-[4px] border border-white/[0.18] bg-transparent hover:bg-white/[0.06] text-[#F2F2F2] text-[12px] font-mono flex items-center justify-center gap-1.5 whitespace-nowrap min-w-0"
                >
                  {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  onClick={handleOpenDashboard}
                  title="Open Settings > Voice in Main Window"
                  className="h-8 rounded-[4px] border border-white/[0.18] bg-transparent hover:bg-white/[0.06] text-[#F2F2F2] text-[12px] font-mono flex items-center justify-center gap-1.5 whitespace-nowrap min-w-0"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Voice</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSpeaking(false);
                    requestState('idle');
                  }}
                  className="h-8 rounded-[4px] bg-[#F2F2F2] hover:bg-white text-[#0A0A0B] text-[12px] font-mono font-medium flex items-center justify-center gap-1.5 whitespace-nowrap min-w-0"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>End</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. APPROVAL (520 × 196): #id AUTHORIZATION REQUIRED, task title, Risk level · Guardrail, Reject/Authorize */}
          {notchState === 'approval' && (
            <div className="w-full h-full flex flex-col justify-between gap-2 min-w-0">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08] shrink-0 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-[#FF3B30] shrink-0" />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#F2F2F2] whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                    #{pendingApproval?.id ? pendingApproval.id.slice(-4) : 'CK-1'} AUTHORIZATION REQUIRED
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleOpenDashboard}
                    title="Open Command Center"
                    className="w-7 h-7 rounded-[4px] border border-white/[0.10] bg-transparent hover:bg-white/[0.06] text-[#8A8A8E] hover:text-[#F2F2F2] flex items-center justify-center"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      requestState('idle');
                    }}
                    title="Collapse (Esc)"
                    className="w-7 h-7 rounded-[4px] border border-white/[0.10] bg-transparent hover:bg-white/[0.06] text-[#8A8A8E] hover:text-[#F2F2F2] flex items-center justify-center"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col min-w-0 flex-1 justify-center">
                <span
                  className="text-[13px] font-medium text-[#F2F2F2] whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
                  title={pendingApproval?.action || 'Cloud Resource Provisioning'}
                >
                  {pendingApproval?.action || 'Cloud Resource Provisioning (Redis Cluster)'}
                </span>
                <span className="text-[11px] font-mono text-[#8A8A8E] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 mt-1">
                  Risk level: {(pendingApproval?.risk_level || 'MEDIUM').toUpperCase()} · Guardrail: Enforced
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onDenyAction && pendingApproval) onDenyAction(pendingApproval.id, pendingApproval.token);
                    requestState('idle');
                  }}
                  className="h-8 rounded-[4px] border border-white/[0.18] bg-transparent hover:bg-white/[0.06] text-[#F2F2F2] text-[12px] font-mono whitespace-nowrap min-w-0"
                >
                  Reject
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onApproveAction && pendingApproval) onApproveAction(pendingApproval.id, pendingApproval.token);
                    requestState('idle');
                  }}
                  className="h-8 rounded-[4px] bg-[#F2F2F2] hover:bg-white text-[#0A0A0B] text-[12px] font-mono font-medium whitespace-nowrap min-w-0"
                >
                  Authorize
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
