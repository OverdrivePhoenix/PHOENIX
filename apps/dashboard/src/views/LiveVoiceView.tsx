import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Strands from '../components/Strands';

interface LiveVoiceViewProps {
  currentProjectName?: string;
  onEndSession: () => void;
  onSendCommand?: (cmd: string) => Promise<{ intent: string; reply: string }>;
}

interface MessageEntry {
  id: string;
  sender: 'jarvis' | 'user';
  text: string;
  timestamp: string;
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

export const LiveVoiceView: React.FC<LiveVoiceViewProps> = ({
  currentProjectName = 'Project PHOENIX',
  onEndSession,
  onSendCommand
}) => {
  const [isListening, setIsListening] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0.05);
  const [captionText, setCaptionText] = useState<string>(
    'At your service, Sir. Listening for your command...'
  );
  const [inputText, setInputText] = useState<string>('');
  const [transcriptLog, setTranscriptLog] = useState<MessageEntry[]>([
    {
      id: 'init-1',
      sender: 'jarvis',
      text: 'Good day, Sir. J.A.R.V.I.S. neural telemetry and voice link established. All engineering agents are standing by on your directive.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  ]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const speakingIntervalRef = useRef<any>(null);

  // Initialize Microphone & Web Audio Analyser
  useEffect(() => {
    let cancelled = false;

    const initAudio = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.warn('Microphone access not available in this environment');
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

            // If user is not muted and not currently speaking, set level from mic
            if (!isMuted && !isSpeaking) {
              setAudioLevel(Math.max(0.04, normalized));
            }

            animationFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      } catch (err) {
        console.warn('Could not initialize microphone Web Audio analyser:', err);
      }
    };

    initAudio();

    // Setup Web Speech Recognition if available
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
            console.warn('Speech recognition notice:', e.error);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('SpeechRecognition start failed:', e);
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
      if (speakingIntervalRef.current) {
        clearInterval(speakingIntervalRef.current);
      }
    };
  }, []);

  // Handle Speech Output with Butler Voice & Strands reactivity
  const speakButlerReply = (text: string) => {
    setIsSpeaking(true);
    setIsListening(false);
    setCaptionText(text);

    // Simulate animated speech level pulses for the Strands orb while J.A.R.V.I.S. is speaking
    let step = 0;
    if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);
    speakingIntervalRef.current = setInterval(() => {
      step++;
      const modulatedLevel = 0.35 + 0.45 * Math.sin(step * 0.4) * Math.cos(step * 0.25) + Math.random() * 0.15;
      setAudioLevel(Math.max(0.1, Math.min(0.95, modulatedLevel)));
    }, 80);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 0.95; // Slightly lower, dignified pitch

      // Pick British English voice if available (Iron Man butler style)
      const voices = window.speechSynthesis.getVoices();
      const britishVoice = voices.find(
        (v) =>
          v.lang.startsWith('en-GB') ||
          v.name.toLowerCase().includes('british') ||
          v.name.toLowerCase().includes('george') ||
          v.name.toLowerCase().includes('oliver') ||
          v.name.toLowerCase().includes('daniel')
      );
      if (britishVoice) {
        utterance.voice = britishVoice;
      }

      utterance.onend = () => {
        clearInterval(speakingIntervalRef.current);
        setIsSpeaking(false);
        setIsListening(true);
        setAudioLevel(0.06);
        setCaptionText('Listening for your command, Sir...');
      };

      utterance.onerror = () => {
        clearInterval(speakingIntervalRef.current);
        setIsSpeaking(false);
        setIsListening(true);
        setAudioLevel(0.06);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      // Fallback timer if speech synthesis is unavailable
      setTimeout(() => {
        clearInterval(speakingIntervalRef.current);
        setIsSpeaking(false);
        setIsListening(true);
        setAudioLevel(0.06);
        setCaptionText('Listening for your command, Sir...');
      }, Math.max(2500, text.length * 55));
    }
  };

  const handleUserUtterance = async (speechText: string) => {
    if (!speechText.trim()) return;

    const newMsg: MessageEntry = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: speechText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    setTranscriptLog((prev) => [...prev, newMsg]);
    setCaptionText(`"${speechText}"`);
    setIsListening(false);

    try {
      let replyText = "Very well, Sir. I have relayed your directive to the orchestrator.";
      if (onSendCommand) {
        const res = await onSendCommand(speechText);
        if (res && res.reply) replyText = res.reply;
      }

      const jarvisEntry: MessageEntry = {
        id: `jarvis-${Date.now()}`,
        sender: 'jarvis',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
      setTranscriptLog((prev) => [...prev, jarvisEntry]);
      speakButlerReply(replyText);
    } catch {
      const errReply = "My apologies, Sir. A communication delay occurred with the local node. I shall remain on standby.";
      speakButlerReply(errReply);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const txt = inputText.trim();
    setInputText('');
    handleUserUtterance(txt);
  };

  const toggleMute = () => {
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
    } else {
      setIsListening(!isSpeaking);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-2.5rem)] bg-surface-container-lowest text-on-surface overflow-hidden relative select-none">
      {/* Top Session Status Bar */}
      <div className="h-14 px-6 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[18px]">graphic_eq</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-on-surface tracking-wide">J.A.R.V.I.S. Live Voice Protocol</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container border border-outline-variant/40 text-primary">
                IRON MAN BUTLER
              </span>
            </div>
            <p className="text-[11px] font-mono text-outline">
              Target Project: <span className="text-on-surface-variant font-medium">{currentProjectName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-lowest border border-outline-variant/30 font-mono text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isMuted
                  ? 'bg-outline'
                  : isSpeaking
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-primary animate-ping'
              }`}
            />
            <span className="text-[11px] uppercase tracking-wider text-outline">
              {isMuted ? 'MIC MUTED' : isSpeaking ? 'J.A.R.V.I.S. SPEAKING' : 'LISTENING (STANDBY)'}
            </span>
          </div>

          {/* End Voice Session Button */}
          <button
            onClick={onEndSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error-container/20 hover:bg-error-container/40 text-error border border-error/30 text-xs font-mono font-medium transition-all"
          >
            <span className="material-symbols-outlined text-[15px]">call_end</span>
            <span>End Voice Session</span>
          </button>
        </div>
      </div>

      {/* Main Visualizer Area: Strands WebGL Orb */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden px-6">
        {/* Subtle background circular glow */}
        <div className="absolute w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl pointer-events-none -z-0" />

        {/* React Bits <Strands /> WebGL2 Canvas Container */}
        <div className="w-full max-w-xl h-[380px] sm:h-[440px] flex items-center justify-center relative z-10">
          <Strands
            glass={true}
            colors={STRANDS_COLORS}
            count={3}
            speed={1.05}
            amplitude={1.1}
            waviness={1.0}
            energy={isSpeaking ? 0.85 : 0.6}
            listening={isListening && !isMuted}
            level={audioLevel}
            interactive={true}
            className="w-full h-full"
          />
        </div>

        {/* Real-time Dynamic Caption Area */}
        <div className="w-full max-w-2xl px-6 py-4 rounded-xl bg-surface-container/60 border border-outline-variant/30 backdrop-blur-lg flex flex-col items-center text-center gap-1.5 z-10 shadow-2xl transition-all">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-outline">
            <span className="material-symbols-outlined text-[13px] text-primary">hearing</span>
            <span>{isSpeaking ? 'J.A.R.V.I.S. Speech Transmission' : 'Live Caption & Transcription'}</span>
          </div>
          <p className="text-sm sm:text-base font-serif italic text-on-surface leading-relaxed transition-all min-h-[1.75rem]">
            {captionText}
          </p>
        </div>
      </div>

      {/* Bottom Controls & Transcript Drawer */}
      <div className="p-4 bg-surface-container-low border-t border-outline-variant/30 flex flex-col gap-3 z-10 shrink-0">
        <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-4">
          {/* Mute/Unmute Mic Toggle */}
          <button
            onClick={toggleMute}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-mono text-xs font-semibold transition-all ${
              isMuted
                ? 'bg-outline-variant/30 border-outline text-outline hover:bg-outline-variant/50'
                : 'bg-primary/20 border-primary text-primary hover:bg-primary/30 shadow-lg shadow-primary/10'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isMuted ? 'mic_off' : 'mic'}
            </span>
            <span>{isMuted ? 'Unmute Microphone' : 'Mute Microphone'}</span>
          </button>

          {/* Quick Fallback Text Input (Directive) */}
          <form onSubmit={handleManualSubmit} className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Or type an instruction to J.A.R.V.I.S., Sir... (e.g. 'Deploy canteen test runner')"
              className="flex-1 px-4 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface placeholder:text-outline text-xs focus:outline-none focus:border-primary font-sans"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-mono font-medium disabled:opacity-40 hover:brightness-110 flex items-center gap-1 transition-all"
            >
              <span className="material-symbols-outlined text-[15px]">send</span>
              <span>Send</span>
            </button>
          </form>

          {/* End Voice Session secondary button */}
          <button
            onClick={onEndSession}
            className="px-3 py-2 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container text-xs font-mono transition-colors"
            title="Return to Command Center"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
