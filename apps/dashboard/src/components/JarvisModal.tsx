import React, { useState } from 'react';

interface JarvisModalProps {
  isOpen: boolean;
  onClose: () => void;
  briefingScript: string;
  onSendCommand: (cmd: string) => Promise<{ intent: string; reply: string }>;
  onOpenLiveVoice?: () => void;
}

export const JarvisModal: React.FC<JarvisModalProps> = ({
  isOpen,
  onClose,
  briefingScript,
  onSendCommand,
  onOpenLiveVoice
}) => {
  const [inputText, setInputText] = useState('');
  const [conversation, setConversation] = useState<{ sender: 'jarvis' | 'user'; text: string }[]>([
    { sender: 'jarvis', text: briefingScript || "At your service, Sir. How may I assist your engineering fleet today?" }
  ]);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || busy) return;
    const userMsg = inputText.trim();
    setInputText('');
    setConversation((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setBusy(true);
    try {
      const res = await onSendCommand(userMsg);
      setConversation((prev) => [...prev, { sender: 'jarvis', text: res.reply }]);
    } catch {
      setConversation((prev) => [
        ...prev,
        { sender: 'jarvis', text: "Pardon me, Sir. I encountered a minor communication fault with the central control plane." }
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans">
      <div className="w-full max-w-lg rounded-xl bg-surface-container-low border border-outline-variant/40 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">graphic_eq</span>
              <span className="absolute inset-0 rounded-full border border-primary animate-ping opacity-30" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-on-surface">J.A.R.V.I.S. Butler Voice Engine</h3>
              <p className="text-[11px] font-mono text-outline">IRON MAN BUTLER PROTOCOL // BRITISH RP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenLiveVoice && (
              <button
                onClick={() => {
                  onClose();
                  onOpenLiveVoice();
                }}
                className="px-2.5 py-1 rounded bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-xs font-mono flex items-center gap-1 transition-all"
                title="Switch to Full WebGL Live Voice Screen"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_full</span>
                <span>Live Orb</span>
              </button>
            )}
            <button onClick={onClose} className="text-outline hover:text-on-surface p-1">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Audio Waveform Visualization Simulation */}
        <div className="h-16 bg-surface-container-lowest flex items-center justify-center gap-1.5 px-6 border-b border-outline-variant/20">
          {[40, 65, 80, 50, 95, 75, 45, 85, 90, 60, 70, 85, 45, 60, 75].map((h, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-primary transition-all duration-300"
              style={{
                height: busy ? `${h}%` : '20%',
                opacity: busy ? 0.9 : 0.4
              }}
            />
          ))}
        </div>

        {/* Conversation Stream */}
        <div className="p-4 flex flex-col gap-3 max-h-72 overflow-y-auto text-sm">
          {conversation.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col max-w-[85%] rounded-lg p-3 ${
                msg.sender === 'jarvis'
                  ? 'self-start bg-surface-container text-on-surface border border-outline-variant/30 font-serif italic'
                  : 'self-end bg-primary/20 text-primary border border-primary/40 font-sans'
              }`}
            >
              <span className="text-[10px] font-mono font-bold uppercase not-italic text-outline mb-1">
                {msg.sender === 'jarvis' ? 'J.A.R.V.I.S. (Spoken)' : 'Sir (Owner)'}
              </span>
              <p className="leading-relaxed">{msg.text}</p>
            </div>
          ))}
          {busy && (
            <div className="self-start text-[11px] font-mono text-primary italic">
              J.A.R.V.I.S. is processing verbal directive...
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-outline-variant/20 flex gap-2 bg-surface-container">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Speak or type: 'Approve migration', 'Emergency pause', 'Fleet status'..."
            className="flex-1 bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy || !inputText.trim()}
            className="px-4 py-2 rounded bg-primary text-on-primary font-medium text-sm hover:bg-primary-container disabled:opacity-50 transition-colors"
          >
            Direct
          </button>
        </form>
      </div>
    </div>
  );
};
