"""
Project PHOENIX - Voice & Text-to-Speech (TTS) Engine
Modular, provider-agnostic voice adapter supporting realistic, swappable voice models.
"""
from .adapter import tts_manager, VoiceInfo, VoiceSynthesisResult, sanitize_speech_text

__all__ = ["tts_manager", "VoiceInfo", "VoiceSynthesisResult", "sanitize_speech_text"]
