import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger("QuotaManager")


class QuotaManager:

    def __init__(self, quota_file="quota.json", state_file="quota_state.json"):
        self.quota_file = Path(quota_file)
        self.state_file = Path(state_file)
        self.limits = {}
        self.state = self._load_state()

        if self.quota_file.exists():
            with open(self.quota_file, encoding="utf-8") as f:
                self.register_limits(json.load(f))

    def _load_state(self):
        if self.state_file.exists():
            try:
                with open(self.state_file, encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning("Impossible de charger l'état: %s", e)

        return {}

    def _save_state(self):
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(self.state, f, indent=2)

    def _init(self, model):
        if model not in self.state:
            now = time.time()

            self.state[model] = {
                "minute_start": now,
                "day_start": now,
                "day": datetime.now().date().isoformat(),
                "rpm_used": 0,
                "tpm_used": 0,
                "rpd_used": 0,
                "errors_429": 0,
                "cooloff_until": 0
            }

    def _refresh(self, model):
        self._init(model)

        now = time.time()
        s = self.state[model]

        # RPM / TPM : fenêtre de 60 secondes
        if now - s["minute_start"] >= 60:
            s["minute_start"] = now
            s["rpm_used"] = 0
            s["tpm_used"] = 0

        # RPD : réinitialisation à minuit
        current_day = datetime.now().date().isoformat()

        if s.get("day") != current_day:
            s["day"] = current_day
            s["day_start"] = now
            s["rpd_used"] = 0

            logger.info(
                "Réinitialisation quotidienne du RPD pour %s",
                model
            )

            self._save_state()

    def register_limits(self, quota_json):
        metrics = quota_json.get(
            "metrics",
            quota_json.get("consumerQuotaMetrics", [])
        )

        for metric in metrics:
            name = metric.get("metric", "")
            display = metric.get("displayName", "")
            limits = metric.get("consumerQuotaLimits", [])

            if (
                "generate_content" not in name
                and "generate_requests_per_model" not in name
            ):
                continue

            tier = "unknown"

            if "paid_tier_3" in name or "paid tier 3" in display.lower():
                tier = "tier_3"
            elif "paid_tier_2" in name or "paid tier 2" in display.lower():
                tier = "tier_2"
            elif "paid_tier" in name or "paid tier 1" in display.lower():
                tier = "tier_1"
            elif "free_tier" in name or "free tier" in display.lower():
                tier = "free"

            for limit in limits:
                unit = limit.get("unit", "")
                metric_name = limit.get("metric", "")

                kind = None

                if "/min/" in unit:
                    kind = "rpm"
                elif "/d/" in unit:
                    kind = "rpd"
                elif "token" in metric_name.lower():
                    kind = "tpm"

                if not kind:
                    continue

                for bucket in limit.get("quotaBuckets", []):
                    value = bucket.get("effectiveLimit")

                    if value is None:
                        continue

                    try:
                        value = int(value)
                    except (ValueError, TypeError):
                        continue

                    model = bucket.get("dimensions", {}).get("model")

                    if not model:
                        continue

                    self.limits.setdefault(model, {}).setdefault(
                        tier, {}
                    )

                    current = self.limits[model][tier].get(kind)

                    if current is None or value > current:
                        self.limits[model][tier][kind] = value

    def can_use_model(
        self,
        model: str,
        tier="tier_3",
        estimated_tokens=1000
    ) -> Tuple[bool, str]:

        self._refresh(model)

        if model not in self.limits:
            return False, f"Quota inconnue pour {model}"

        limits = self.limits[model].get(tier)

        if not limits:
            return False, f"Tier {tier} indisponible pour {model}"

        s = self.state[model]

        if time.time() < s["cooloff_until"]:
            return False, "Cooldown 429"

        if limits.get("rpm", 0) > 0:
            if s["rpm_used"] >= limits["rpm"]:
                return False, f"RPM atteint ({limits['rpm']})"

        if limits.get("tpm", 0) > 0:
            if s["tpm_used"] + estimated_tokens > limits["tpm"]:
                return False, f"TPM estimé atteint ({limits['tpm']})"

        if limits.get("rpd", 0) > 0:
            if s["rpd_used"] >= limits["rpd"]:
                return False, f"RPD atteint ({limits['rpd']})"

        return True, "OK"

    def select_best_model(
        self,
        preferred_models,
        tier="tier_3",
        estimated_tokens=1000
    ) -> Optional[str]:

        candidates = []

        for model in preferred_models:
            ok, reason = self.can_use_model(
                model,
                tier=tier,
                estimated_tokens=estimated_tokens
            )

            if ok:
                remaining = self.get_remaining_quota(model, tier)
                candidates.append((model, remaining))
            else:
                logger.info("%s ignoré: %s", model, reason)

        if not candidates:
            return None

        def score(item):
            _, q = item

            values = [
                x for x in (
                    q.get("remaining_rpm"),
                    q.get("remaining_tpm"),
                    q.get("remaining_rpd")
                )
                if x is not None and x >= 0
            ]

            return min(values) if values else 0

        return max(candidates, key=score)[0]

    def record_usage(self, model, usage_metadata):
        self._refresh(model)

        s = self.state[model]

        total = usage_metadata.get("totalTokenCount", 0)

        s["rpm_used"] += 1
        s["rpd_used"] += 1
        s["tpm_used"] += total

        self._save_state()

    def handle_429_error(self, model, retry_after_seconds=60):
        self._init(model)

        s = self.state[model]

        s["errors_429"] += 1
        s["cooloff_until"] = time.time() + retry_after_seconds

        self._save_state()

    def get_remaining_quota(self, model, tier="tier_3"):
        self._refresh(model)

        s = self.state[model]
        limits = self.limits.get(model, {}).get(tier, {})

        def remaining(kind, used):
            limit = limits.get(kind)

            if limit is None or limit < 0:
                return None

            return max(0, limit - used)

        return {
            "remaining_rpm": remaining(
                "rpm", s["rpm_used"]
            ),
            "remaining_tpm": remaining(
                "tpm", s["tpm_used"]
            ),
            "remaining_rpd": remaining(
                "rpd", s["rpd_used"]
            )
        }

    def all_status(self, tier="tier_3"):
        result = {}

        for model in self.limits:
            self._refresh(model)

            q = self.get_remaining_quota(model, tier)
            s = self.state[model]
            limits = self.limits[model].get(tier, {})

            result[model] = {
                "model": model,
                "tier": tier,
                "rpm_limit": limits.get("rpm"),
                "rpm_used": s["rpm_used"],
                "rpm_remaining": q["remaining_rpm"],
                "tpm_limit": limits.get("tpm"),
                "tpm_used": s["tpm_used"],
                "tpm_remaining": q["remaining_tpm"],
                "rpd_limit": limits.get("rpd"),
                "rpd_used": s["rpd_used"],
                "rpd_remaining": q["remaining_rpd"],
                "errors_429": s["errors_429"],
                "blocked": time.time() < s["cooloff_until"]
            }

        return result
