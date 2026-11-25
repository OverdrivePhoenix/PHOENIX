import json
import logging
import os
import shutil
import sys
import time
from typing import Any, Dict, List, Tuple

DEFAULT_SETTINGS: Dict[str, Any] = {
    "version": 1,
    "voice": {
        "engine": "edge_tts",
        "id": "en-GB-RyanNeural",
        "name": "Ryan (British Butler / J.A.R.V.I.S.)",
        "lang": "en-GB",
        "rate": 1.0,
        "pitch": 1.0,
        "tone": "concise",
    },
    "greeting": {
        "enabled": True,
    },
    "speakTypedReplies": False,
}

VALID_TONES = {"concise", "conversational", "direct"}
TONE_ALIASES = {
    "calm_concise": "concise",
    "concise": "concise",
    "conversational": "conversational",
    "direct": "direct",
}


def get_data_dir() -> str:
    if getattr(sys, "frozen", False):
        d = os.path.abspath(os.path.join(os.path.dirname(sys.executable), "data"))
    else:
        d = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
    os.makedirs(d, exist_ok=True)
    return d


def get_settings_path() -> str:
    return os.path.join(get_data_dir(), "settings.json")


def get_history_path() -> str:
    return os.path.join(get_data_dir(), "command_history.json")


def _log_voice(msg: str):
    try:
        logging.info(f"[voice] {msg}")
        if getattr(sys, "frozen", False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        diag_file = os.path.join(app_dir, "phoenix_runtime.txt")
        with open(diag_file, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} [voice] {msg}\n")
    except Exception:
        pass


def _clamp(val: Any, lo: float, hi: float, default: float) -> float:
    try:
        v = float(val)
        if v != v:  # NaN
            return default
        return max(lo, min(hi, round(v, 2)))
    except Exception:
        return default


def validate_settings(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("Settings root must be a JSON object")

    v_raw = raw.get("voice") if isinstance(raw.get("voice"), dict) else {}
    g_raw = raw.get("greeting") if isinstance(raw.get("greeting"), dict) else {}

    def_v = DEFAULT_SETTINGS["voice"]
    raw_tone = str(v_raw.get("tone", def_v["tone"])).strip().lower()
    tone = TONE_ALIASES.get(raw_tone, def_v["tone"])

    engine = str(v_raw.get("engine") or def_v["engine"]).strip() or def_v["engine"]
    vid = str(v_raw.get("id") or def_v["id"]).strip() or def_v["id"]
    name = str(v_raw.get("name") or vid).strip() or vid
    lang = str(v_raw.get("lang") or def_v["lang"]).strip() or def_v["lang"]

    return {
        "version": 1,
        "voice": {
            "engine": engine,
            "id": vid,
            "name": name,
            "lang": lang,
            "rate": _clamp(v_raw.get("rate", def_v["rate"]), 0.5, 2.0, def_v["rate"]),
            "pitch": _clamp(v_raw.get("pitch", def_v["pitch"]), 0.5, 2.0, def_v["pitch"]),
            "tone": tone,
        },
        "greeting": {
            "enabled": bool(g_raw.get("enabled", True)),
        },
        "speakTypedReplies": bool(raw.get("speakTypedReplies", False)),
    }


def _atomic_write_json(path: str, data: Any, keep_bak: bool = True):
    tmp_path = path + ".tmp"
    bak_path = path + ".bak"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    if keep_bak and os.path.exists(path):
        try:
            shutil.copy2(path, bak_path)
        except Exception:
            pass
    os.replace(tmp_path, path)


def load_settings() -> Tuple[Dict[str, Any], str, str]:
    """Returns (settings_dict, source_label, settings_path)."""
    path = get_settings_path()
    bak_path = path + ".bak"

    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = validate_settings(json.load(f))
            return data, "primary", path
        except Exception as exc:
            _log_voice(f"Corrupt primary settings.json ({exc}); trying .bak")

    if os.path.exists(bak_path):
        try:
            with open(bak_path, "r", encoding="utf-8") as f:
                data = validate_settings(json.load(f))
            _log_voice(f"Recovered settings from .bak ({bak_path})")
            return data, "bak", path
        except Exception as exc:
            _log_voice(f"Corrupt settings.json.bak ({exc}); falling back to defaults")

    # One-time migration from legacy tts_settings.json if present
    legacy_path = os.path.join(get_data_dir(), "tts_settings.json")
    if os.path.exists(legacy_path):
        try:
            with open(legacy_path, "r", encoding="utf-8") as f:
                leg = json.load(f)
            migrated = validate_settings({
                "version": 1,
                "voice": {
                    "engine": leg.get("active_provider_id", "edge_tts"),
                    "id": leg.get("active_voice_id", "en-GB-RyanNeural"),
                    "name": leg.get("active_voice_id", "en-GB-RyanNeural"),
                    "lang": "-".join(str(leg.get("active_voice_id", "en-GB")).split("-")[:2]),
                    "tone": leg.get("active_tone", "concise"),
                },
            })
            _atomic_write_json(path, migrated, keep_bak=False)
            _log_voice(f"Migrated legacy tts_settings.json to {path} (voice={migrated['voice']['id']})")
            return migrated, "migrated", path
        except Exception:
            pass

    defaults = validate_settings(DEFAULT_SETTINGS)
    _log_voice(f"Using default settings (path={path})")
    return defaults, "default", path


def save_settings(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    current, _, path = load_settings()
    merged = {
        "version": 1,
        "voice": {**current["voice"], **(payload.get("voice") or {})},
        "greeting": {**current["greeting"], **(payload.get("greeting") or {})},
        "speakTypedReplies": payload.get("speakTypedReplies", current["speakTypedReplies"]),
    }
    validated = validate_settings(merged)
    _atomic_write_json(path, validated, keep_bak=True)
    v = validated["voice"]
    _log_voice(
        f"Saved settings to {path}: engine={v['engine']} id={v['id']} rate={v['rate']} pitch={v['pitch']} tone={v['tone']} "
        f"greeting={validated['greeting']['enabled']} speakTyped={validated['speakTypedReplies']}"
    )
    return validated, path


def load_command_history() -> List[str]:
    path = get_history_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                arr = json.load(f)
            if isinstance(arr, list):
                return [str(x)[:4000] for x in arr if isinstance(x, str)][-50:]
        except Exception:
            pass
    return []


def append_command_history(cmd: str) -> List[str]:
    clean = str(cmd).strip()[:4000]
    if not clean:
        return load_command_history()
    hist = load_command_history()
    if not hist or hist[-1] != clean:
        hist.append(clean)
    hist = hist[-50:]
    _atomic_write_json(get_history_path(), hist, keep_bak=False)
    return hist
