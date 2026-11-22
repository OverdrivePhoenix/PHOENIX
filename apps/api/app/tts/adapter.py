import os
import sys
import json
import re
import io
import asyncio
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any, List

def sanitize_speech_text(raw: str) -> str:
    """
    Cleans raw markdown, code syntax, bullet points, asterisks, brackets,
    and technical symbols so the TTS engine speaks natural human sentences.
    """
    if not raw:
        return ""
    text = raw
    # Strip markdown code blocks
    text = re.sub(r'```[\s\S]*?```', 'code block omitted.', text)
    # Strip inline backticks `foo`
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # Strip markdown links [label](url) -> label
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Strip headers #, ##
    text = re.sub(r'^[#\s]+', '', text, flags=re.MULTILINE)
    # Strip asterisks / bold / italics
    text = re.sub(r'[*_]{1,3}', '', text)
    # Expand technical symbols into spoken English
    text = text.replace('$', 'dollars ')
    text = text.replace('%', ' percent ')
    text = text.replace('&', ' and ')
    text = text.replace('+', ' plus ')
    text = text.replace('==', ' equals ')
    text = text.replace('!=', ' does not equal ')
    # Strip markdown bullets and arrows
    text = re.sub(r'^[\s*\-•>]+\s*', '', text, flags=re.MULTILINE)
    # Collapse excess whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


@dataclass
class VoiceSynthesisResult:
    audio_bytes: bytes
    media_type: str = "audio/mpeg"
    provider: str = "edge_tts"
    voice: str = "en-GB-RyanNeural"
    clean_text: str = ""


@dataclass
class VoiceInfo:
    id: str
    name: str
    gender: str
    language: str
    description: str
    recommended_for_tone: str = "calm_concise"


class BaseTTSProvider:
    provider_id: str
    display_name: str
    tier: str  # "Free (No Key Required)", "Free Tier (API Key)", "Custom / Self-Hosted"
    description: str

    def is_available(self) -> bool:
        return True

    def get_voices(self) -> List[VoiceInfo]:
        return []

    async def synthesize(self, text: str, voice_id: str, tone: str = "calm_concise") -> bytes:
        raise NotImplementedError


class EdgeTTSProvider(BaseTTSProvider):
    """
    Microsoft Azure Neural TTS via edge-tts.
    100% Free, zero configuration, studio-grade realistic voice synthesis.
    """
    provider_id = "edge_tts"
    display_name = "Edge Neural (Free & Unlimited)"
    tier = "Free (No Key Required)"
    description = "Ultra-realistic studio neural voices powered by Microsoft Azure. No API key needed."

    VOICES = [
        VoiceInfo("en-GB-RyanNeural", "Ryan (British Butler / J.A.R.V.I.S.)", "Male", "en-GB", "Warm, composed British butler cadence, refined and articulate.", "calm_concise"),
        VoiceInfo("en-GB-SoniaNeural", "Sonia (British Female)", "Female", "en-GB", "Clear, poised British professional voice.", "calm_concise"),
        VoiceInfo("en-GB-LibbyNeural", "Libby (British Warm)", "Female", "en-GB", "Bright, natural, articulate British tone.", "conversational"),
        VoiceInfo("en-GB-ThomasNeural", "Thomas (British Classic)", "Male", "en-GB", "Deep, dignified narrative British cadence.", "calm_concise"),
        VoiceInfo("en-US-JennyNeural", "Jenny (US Conversational)", "Female", "en-US", "Warm, expressive, natural human conversational voice.", "conversational"),
        VoiceInfo("en-US-ChristopherNeural", "Christopher (US Senior Engineer)", "Male", "en-US", "Confident, natural collaborative male colleague.", "conversational"),
        VoiceInfo("en-US-GuyNeural", "Guy (US Relaxed)", "Male", "en-US", "Casual, natural engineer tone.", "conversational"),
        VoiceInfo("en-US-AriaNeural", "Aria (US Executive)", "Female", "en-US", "Direct, clear, executive briefing tempo.", "direct"),
        VoiceInfo("en-US-EricNeural", "Eric (US Neutral)", "Male", "en-US", "Balanced, calm engineering lead voice.", "calm_concise"),
        VoiceInfo("en-US-MichelleNeural", "Michelle (US Warm)", "Female", "en-US", "Engaging, pleasant collaborator voice.", "conversational"),
        VoiceInfo("en-AU-NatashaNeural", "Natasha (Australian Warm)", "Female", "en-AU", "Friendly, crisp Australian colleague.", "conversational"),
        VoiceInfo("en-AU-WilliamNeural", "William (Australian Male)", "Male", "en-AU", "Relaxed Australian engineer delivery.", "conversational"),
        VoiceInfo("en-IN-NeerjaNeural", "Neerja (Indian English)", "Female", "en-IN", "Expressive, articulate Indian English voice.", "conversational"),
        VoiceInfo("en-IN-PrabhatNeural", "Prabhat (Indian Male)", "Male", "en-IN", "Clear, poised Indian English professional.", "direct"),
        VoiceInfo("en-CA-LiamNeural", "Liam (Canadian Modern)", "Male", "en-CA", "Crisp, modern Canadian tech tone.", "direct"),
        VoiceInfo("en-CA-ClaraNeural", "Clara (Canadian Warm)", "Female", "en-CA", "Warm, articulate Canadian collaborator.", "conversational"),
    ]

    def is_available(self) -> bool:
        try:
            import edge_tts
            return True
        except ImportError:
            return False

    def get_voices(self) -> List[VoiceInfo]:
        return self.VOICES

    async def synthesize_custom(
        self,
        text: str,
        voice_id: str = "en-GB-RyanNeural",
        speed: float = 1.0,
        pitch: int = 0,
        volume: int = 100,
        tone: str = "calm_concise"
    ) -> bytes:
        import edge_tts
        clean = sanitize_speech_text(text)
        if not clean:
            clean = "System ready."

        speed_pct = int(round((speed - 1.0) * 100))
        rate_str = f"{speed_pct:+d}%"
        pitch_str = f"{int(pitch):+d}Hz"
        vol_pct = int(round(volume - 100))
        vol_str = f"{vol_pct:+d}%"

        selected_voice = voice_id or "en-GB-RyanNeural"
        comm = edge_tts.Communicate(clean, voice=selected_voice, rate=rate_str, pitch=pitch_str, volume=vol_str)
        chunks = []
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    async def synthesize(self, text: str, voice_id: str, tone: str = "calm_concise") -> bytes:
        import edge_tts
        clean = sanitize_speech_text(text)
        if not clean:
            clean = "System ready."

        # Tone-specific rate and pitch modulation
        rate = "+0%"
        pitch = "+0Hz"
        if tone == "conversational":
            rate = "+4%"
            pitch = "+2Hz"
        elif tone == "direct":
            rate = "+14%"
            pitch = "+0Hz"
        elif tone == "calm_concise":
            rate = "-2%"
            pitch = "-2Hz"

        selected_voice = voice_id or "en-GB-RyanNeural"
        comm = edge_tts.Communicate(clean, voice=selected_voice, rate=rate, pitch=pitch)
        chunks = []
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)


class ElevenLabsProvider(BaseTTSProvider):
    """
    ElevenLabs Generative Voice AI.
    Ultra-realistic voice cloning with free tier (10,000 characters/month).
    """
    provider_id = "elevenlabs"
    display_name = "ElevenLabs Voice AI"
    tier = "Free Tier (10k chars/mo with API Key)"
    description = "State-of-the-art conversational voice AI with natural human emotion and inflection."

    VOICES = [
        VoiceInfo("pNInz6obpgDQGcFmaJgB", "Adam (Deep & Articulate)", "Male", "en-US", "Deep, warm, dignified engineer tone.", "conversational"),
        VoiceInfo("JBFqnCBsd6RMkjVDRZzb", "George (British Butler)", "Male", "en-GB", "Polite, intelligent British butler persona.", "calm_concise"),
        VoiceInfo("21m00Tcm4TlvDq8ikWAM", "Rachel (Calm & Professional)", "Female", "en-US", "Engaging, pleasant collaborative assistant.", "conversational"),
        VoiceInfo("ErXwobaYiN019PkySvjV", "Antoni (Direct & Crisp)", "Male", "en-US", "Energetic, clear, fast executive delivery.", "direct"),
    ]

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or os.environ.get("ELEVENLABS_API_KEY", "")

    def is_available(self) -> bool:
        return bool(self.api_key or os.environ.get("ELEVENLABS_API_KEY"))

    def get_voices(self) -> List[VoiceInfo]:
        return self.VOICES

    async def synthesize(self, text: str, voice_id: str, tone: str = "calm_concise") -> bytes:
        import httpx
        key = self.api_key or os.environ.get("ELEVENLABS_API_KEY", "")
        if not key:
            raise ValueError("ElevenLabs API Key is not configured. Please add your key in Settings.")

        clean = sanitize_speech_text(text)
        selected_voice = voice_id or "pNInz6obpgDQGcFmaJgB"
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{selected_voice}"
        headers = {
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        }
        payload = {
            "text": clean,
            "model_id": "eleven_turbo_v2_5",
            "voice_settings": {
                "stability": 0.55 if tone == "conversational" else 0.75,
                "similarity_boost": 0.80,
                "style": 0.20 if tone == "conversational" else 0.05
            }
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"ElevenLabs error ({resp.status_code}): {resp.text}")
            return resp.content


class GoogleCloudTTSProvider(BaseTTSProvider):
    """
    Google Cloud Text-to-Speech (Neural2 & Journey voices).
    Generous free tier: 1 to 4 million characters monthly.
    """
    provider_id = "google_cloud"
    display_name = "Google Cloud TTS (Neural2)"
    tier = "Free Tier (1M chars/mo with GCP Key)"
    description = "Google DeepMind-developed WaveNet and Neural2 voice models with natural prosody."

    VOICES = [
        VoiceInfo("en-GB-Neural2-B", "Google British Male (Neural2-B)", "Male", "en-GB", "Rich, natural British inflection.", "calm_concise"),
        VoiceInfo("en-GB-Neural2-C", "Google British Female (Neural2-C)", "Female", "en-GB", "Articulate, pleasant British tone.", "calm_concise"),
        VoiceInfo("en-US-Journey-F", "Google Journey Voice (US)", "Female", "en-US", "Conversational, highly natural prosody.", "conversational"),
        VoiceInfo("en-US-Neural2-D", "Google Neural2 Male (US)", "Male", "en-US", "Crisp, authoritative tech lead voice.", "direct"),
    ]

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or os.environ.get("GCP_TTS_API_KEY", "")

    def is_available(self) -> bool:
        return bool(self.api_key or os.environ.get("GCP_TTS_API_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))

    def get_voices(self) -> List[VoiceInfo]:
        return self.VOICES

    async def synthesize(self, text: str, voice_id: str, tone: str = "calm_concise") -> bytes:
        import httpx
        key = self.api_key or os.environ.get("GCP_TTS_API_KEY", "")
        clean = sanitize_speech_text(text)
        selected_voice = voice_id or "en-GB-Neural2-B"
        lang_code = "-".join(selected_voice.split("-")[:2])

        if key:
            url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={key}"
            payload = {
                "input": {"text": clean},
                "voice": {"languageCode": lang_code, "name": selected_voice},
                "audioConfig": {"audioEncoding": "MP3", "speakingRate": 1.05 if tone == "direct" else 0.98}
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    import base64
                    data = resp.json()
                    return base64.b64decode(data.get("audioContent", ""))
                raise RuntimeError(f"Google Cloud TTS error ({resp.status_code}): {resp.text}")
        else:
            raise ValueError("Google Cloud TTS API Key is not configured.")


class OpenAITTSProvider(BaseTTSProvider):
    """
    OpenAI TTS / Self-hosted compatible endpoint (e.g. Kokoro-TTS or Piper).
    """
    provider_id = "openai_compatible"
    display_name = "OpenAI / Local Custom TTS"
    tier = "Custom / API Key"
    description = "Supports OpenAI TTS-1 or any OpenAI-compatible local TTS server (Kokoro/Piper/Whisper)."

    VOICES = [
        VoiceInfo("onyx", "Onyx (Deep & Authoritative)", "Male", "en-US", "Deep resonance, authoritative.", "calm_concise"),
        VoiceInfo("alloy", "Alloy (Neutral & Balanced)", "Neutral", "en-US", "Balanced, versatile.", "conversational"),
        VoiceInfo("echo", "Echo (Warm & Friendly)", "Male", "en-US", "Warm, rounded tone.", "conversational"),
        VoiceInfo("fable", "Fable (British Cadence)", "Male", "en-GB", "British-style expression.", "calm_concise"),
        VoiceInfo("nova", "Nova (Bright & Energetic)", "Female", "en-US", "High clarity, crisp.", "direct"),
    ]

    def __init__(self, api_key: str = "", base_url: str = ""):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.base_url = base_url or os.environ.get("TTS_BASE_URL", "https://api.openai.com/v1")

    def is_available(self) -> bool:
        return bool(self.api_key or "localhost" in self.base_url or "127.0.0.1" in self.base_url)

    def get_voices(self) -> List[VoiceInfo]:
        return self.VOICES

    async def synthesize(self, text: str, voice_id: str, tone: str = "calm_concise") -> bytes:
        import httpx
        clean = sanitize_speech_text(text)
        url = f"{self.base_url.rstrip('/')}/audio/speech"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {
            "model": "tts-1",
            "input": clean,
            "voice": voice_id or "onyx",
            "speed": 1.12 if tone == "direct" else 1.0
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"OpenAI TTS error ({resp.status_code}): {resp.text}")
            return resp.content


class BrowserWebSpeechProvider(BaseTTSProvider):
    """
    Browser-native Web Speech API.
    Zero-network, offline fallback using local OS neural speech synthesizer.
    """
    provider_id = "browser_speech"
    display_name = "Browser / OS Speech (Offline)"
    tier = "Free (Offline Built-in)"
    description = "Uses the client device's native speech synthesis engine. Completely offline."

    VOICES = [
        VoiceInfo("browser_default", "System Natural Butler (Auto)", "Any", "en-US/GB", "Default system TTS voice with Bettany cadence.", "calm_concise"),
    ]

    def is_available(self) -> bool:
        return True

    def get_voices(self) -> List[VoiceInfo]:
        return self.VOICES

    async def synthesize(self, text: str, voice_id: str, tone: str = "calm_concise") -> bytes:
        # Browser handles synthesis locally; return empty bytes to instruct client-side synthesis
        return b""


class SwappableTTSManager:
    """
    Central manager for swappable voice providers.
    Maintains active provider configuration and persistent settings in data/tts_settings.json.
    """
    def __init__(self):
        if getattr(sys, 'frozen', False):
            base_dir = os.path.join(os.path.dirname(sys.executable), "data")
        else:
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
        os.makedirs(base_dir, exist_ok=True)
        self.settings_file = os.path.join(base_dir, "tts_settings.json")

        self.providers: Dict[str, BaseTTSProvider] = {
            "edge_tts": EdgeTTSProvider(),
            "elevenlabs": ElevenLabsProvider(),
            "google_cloud": GoogleCloudTTSProvider(),
            "openai_compatible": OpenAITTSProvider(),
            "browser_speech": BrowserWebSpeechProvider(),
        }

        self.active_provider_id = "edge_tts"
        self.active_voice_id = "en-GB-RyanNeural"
        self.active_tone = "calm_concise"
        self._load_settings()

    def _load_settings(self):
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.active_provider_id = data.get("active_provider_id", "edge_tts")
                    self.active_voice_id = data.get("active_voice_id", "en-GB-RyanNeural")
                    self.active_tone = data.get("active_tone", "calm_concise")
                    # Update provider keys if present
                    if "elevenlabs_api_key" in data:
                        p = self.providers.get("elevenlabs")
                        if isinstance(p, ElevenLabsProvider):
                            p.api_key = data["elevenlabs_api_key"]
                    if "gcp_tts_api_key" in data:
                        p = self.providers.get("google_cloud")
                        if isinstance(p, GoogleCloudTTSProvider):
                            p.api_key = data["gcp_tts_api_key"]
                    if "openai_api_key" in data:
                        p = self.providers.get("openai_compatible")
                        if isinstance(p, OpenAITTSProvider):
                            p.api_key = data["openai_api_key"]
        except Exception:
            pass

    def _save_settings(self):
        try:
            os.makedirs(os.path.dirname(self.settings_file), exist_ok=True)
            data = {
                "active_provider_id": self.active_provider_id,
                "active_voice_id": self.active_voice_id,
                "active_tone": self.active_tone
            }
            # Save configured keys
            p_el = self.providers.get("elevenlabs")
            if isinstance(p_el, ElevenLabsProvider) and p_el.api_key:
                data["elevenlabs_api_key"] = p_el.api_key
            p_gcp = self.providers.get("google_cloud")
            if isinstance(p_gcp, GoogleCloudTTSProvider) and p_gcp.api_key:
                data["gcp_tts_api_key"] = p_gcp.api_key
            p_oai = self.providers.get("openai_compatible")
            if isinstance(p_oai, OpenAITTSProvider) and p_oai.api_key:
                data["openai_api_key"] = p_oai.api_key

            with open(self.settings_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    def get_providers_info(self) -> Dict[str, Any]:
        result = []
        for pid, provider in self.providers.items():
            result.append({
                "id": pid,
                "name": provider.display_name,
                "tier": provider.tier,
                "description": provider.description,
                "is_available": provider.is_available(),
                "is_active": pid == self.active_provider_id,
                "voices": [asdict(v) for v in provider.get_voices()]
            })
        return {
            "active_provider_id": self.active_provider_id,
            "active_voice_id": self.active_voice_id,
            "active_tone": self.active_tone,
            "providers": result
        }

    def set_active_config(self, provider_id: str, voice_id: Optional[str] = None, tone: Optional[str] = None, api_keys: Optional[Dict[str, str]] = None):
        if provider_id in self.providers:
            self.active_provider_id = provider_id
        if voice_id:
            self.active_voice_id = voice_id
        if tone:
            self.active_tone = tone

        if api_keys:
            if "elevenlabs" in api_keys:
                p = self.providers.get("elevenlabs")
                if isinstance(p, ElevenLabsProvider):
                    p.api_key = api_keys["elevenlabs"]
            if "google_cloud" in api_keys:
                p = self.providers.get("google_cloud")
                if isinstance(p, GoogleCloudTTSProvider):
                    p.api_key = api_keys["google_cloud"]
            if "openai_compatible" in api_keys:
                p = self.providers.get("openai_compatible")
                if isinstance(p, OpenAITTSProvider):
                    p.api_key = api_keys["openai_compatible"]

        self._save_settings()

    async def synthesize(self, text: str, provider_id: Optional[str] = None, voice_id: Optional[str] = None, tone: Optional[str] = None) -> VoiceSynthesisResult:
        chosen_provider_id = provider_id or self.active_provider_id
        chosen_voice_id = voice_id or self.active_voice_id
        chosen_tone = tone or self.active_tone

        clean = sanitize_speech_text(text)
        provider = self.providers.get(chosen_provider_id) or self.providers["edge_tts"]

        # If chosen provider is not available, gracefully fallback to edge_tts
        if not provider.is_available():
            provider = self.providers["edge_tts"]
            chosen_voice_id = "en-GB-RyanNeural"

        try:
            audio = await provider.synthesize(clean, chosen_voice_id, chosen_tone)
            return VoiceSynthesisResult(
                audio_bytes=audio,
                media_type="audio/mpeg",
                provider=provider.provider_id,
                voice=chosen_voice_id,
                clean_text=clean
            )
        except Exception as e:
            # Fallback to EdgeTTS if external API failed
            if provider.provider_id != "edge_tts":
                fallback = self.providers["edge_tts"]
                audio = await fallback.synthesize(clean, "en-GB-RyanNeural", chosen_tone)
                return VoiceSynthesisResult(
                    audio_bytes=audio,
                    media_type="audio/mpeg",
                    provider="edge_tts_fallback",
                    voice="en-GB-RyanNeural",
                    clean_text=clean
                )
            raise e

    async def synthesize_custom(
        self,
        text: str,
        voice_id: str = "en-GB-RyanNeural",
        speed: float = 1.0,
        pitch: int = 0,
        volume: int = 100,
        tone: str = "calm_concise",
        provider_id: Optional[str] = None
    ) -> VoiceSynthesisResult:
        clean = sanitize_speech_text(text)
        provider = self.providers.get(provider_id or self.active_provider_id) or self.providers["edge_tts"]

        try:
            if hasattr(provider, "synthesize_custom"):
                audio = await provider.synthesize_custom(clean, voice_id, speed, pitch, volume, tone)
            else:
                audio = await provider.synthesize(clean, voice_id, tone)
            return VoiceSynthesisResult(
                audio_bytes=audio,
                media_type="audio/mpeg",
                provider=provider.provider_id,
                voice=voice_id,
                clean_text=clean
            )
        except Exception:
            fallback = self.providers["edge_tts"]
            audio = await fallback.synthesize_custom(clean, voice_id, speed, pitch, volume, tone)
            return VoiceSynthesisResult(
                audio_bytes=audio,
                media_type="audio/mpeg",
                provider="edge_tts_custom_fallback",
                voice=voice_id,
                clean_text=clean
            )



# Global instance
tts_manager = SwappableTTSManager()
