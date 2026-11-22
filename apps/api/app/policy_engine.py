import hmac
import hashlib
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Tuple
from .config import settings

class PolicyEngine:
    RESTRICTED_ACTIONS = {
        "db_migration",
        "prod_deploy",
        "spend_money",
        "iam_change",
        "delete_data",
        "locked_path_mutation"
    }

    @staticmethod
    def canonical_payload_hash(payload: dict) -> str:
        """Computes deterministic SHA-256 hash of JSON payload."""
        canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    @classmethod
    def generate_approval_token(cls, action: str, payload: dict) -> Tuple[str, str]:
        """
        Generates an HMAC-SHA256 time-bound approval token.
        Returns: (approval_token, iso_expires_at)
        """
        payload_hash = cls.canonical_payload_hash(payload)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.approval_token_ttl_seconds)
        expires_ts = int(expires_at.timestamp())
        message = f"{action}:{payload_hash}:{expires_ts}"
        signature = hmac.new(
            settings.policy_secret_key.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        token = f"phx_appr_{expires_ts}_{signature[:32]}"
        return token, expires_at.isoformat()

    @classmethod
    def verify_approval_token(cls, action: str, payload: dict, token: str) -> bool:
        """
        Verifies that the approval token matches the exact action, untampered payload, and is unexpired.
        """
        try:
            parts = token.split("_")
            if len(parts) != 4 or parts[0] != "phx" or parts[1] != "appr":
                return False
            expires_ts = int(parts[2])
            signature = parts[3]
            # Check expiration
            if time.time() > expires_ts:
                return False
            # Verify signature
            payload_hash = cls.canonical_payload_hash(payload)
            expected_message = f"{action}:{payload_hash}:{expires_ts}"
            expected_sig = hmac.new(
                settings.policy_secret_key.encode("utf-8"),
                expected_message.encode("utf-8"),
                hashlib.sha256
            ).hexdigest()[:32]
            return hmac.compare_digest(signature, expected_sig)
        except Exception:
            return False

    @classmethod
    def evaluate_action(cls, action: str) -> str:
        """Returns 'require_approval' if action is restricted, else 'auto_execute'."""
        if action.lower().strip() in cls.RESTRICTED_ACTIONS:
            return "require_approval"
        return "auto_execute"
