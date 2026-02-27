"""Rule engine: evaluates Telegram messages against YAML rules.

Rule format (shared/rules/default_rules.yaml):

    - id: my_rule
      name: Human-readable label
      enabled: true
      priority: 100           # higher = evaluated first; first match wins
      when:
        mention: "@handle"    # optional — case-insensitive exact match
        keywords: ["todo"]    # optional — ANY keyword present in text
        chat_id: "-100123"    # optional — exact string match
        thread_id: "173"      # optional — exact string match
      then:
        create_task: true
        priority: high        # low | medium | high

Interface: intentionally minimal so the Telethon listener (stage 2)
can plug in without changes.
"""
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import yaml

from ..models import TaskPriority

logger = logging.getLogger(__name__)


@dataclass
class MessageMeta:
    """Metadata attached to an incoming Telegram message."""

    chat_id: str
    thread_id: Optional[str] = None
    mentions: List[str] = field(default_factory=list)
    sender: Optional[str] = None


@dataclass
class RuleResult:
    """Outcome of evaluating a message against all rules."""

    create_task: bool
    priority: TaskPriority = TaskPriority.medium
    matched_rule_id: Optional[str] = None


class RuleEngine:
    """Loads YAML rules and evaluates messages against them."""

    def __init__(self, rules_path: str) -> None:
        self._rules: list = self._load(rules_path)

    # ── Public API ─────────────────────────────────────────────────────────

    def evaluate(self, text: str, meta: MessageMeta) -> RuleResult:
        """Return RuleResult for the given message + metadata.

        Rules sorted by 'priority' descending; first match wins.
        Returns RuleResult(create_task=False) when no rule matches.
        """
        active = sorted(
            [r for r in self._rules if r.get("enabled", True)],
            key=lambda r: r.get("priority", 0),
            reverse=True,
        )
        logger.debug("RULE EVALUATE | rules_loaded=%d active=%d", len(self._rules), len(active))
        for rule in active:
            if self._matches(rule, text, meta):
                return self._build_result(rule)

        return RuleResult(create_task=False)

    # ── Private helpers ────────────────────────────────────────────────────

    @staticmethod
    def _load(path: str) -> list:
        p = Path(path)
        if not p.exists():
            return []
        with open(p, "r", encoding="utf-8") as fh:
            return yaml.safe_load(fh) or []

    @staticmethod
    def _build_result(rule: dict) -> RuleResult:
        then = rule.get("then", {})
        prio_raw = then.get("priority", "medium")
        try:
            priority = TaskPriority(prio_raw)
        except ValueError:
            priority = TaskPriority.medium
        return RuleResult(
            create_task=bool(then.get("create_task", False)),
            priority=priority,
            matched_rule_id=rule.get("id"),
        )

    @staticmethod
    def _matches(rule: dict, text: str, meta: MessageMeta) -> bool:
        """Return True only if ALL 'when' conditions are satisfied."""
        when = rule.get("when", {})

        logger.debug(
            "RULE CHECK | rule=%s when=%r mentions=%r chat=%s thread=%s",
            rule.get("id"), when, meta.mentions, meta.chat_id, meta.thread_id,
        )

        # mention — case-insensitive exact handle match
        if "mention" in when:
            handle = when["mention"].lower()
            mentions_lower = [m.lower() for m in meta.mentions]
            matched = any(m == handle for m in mentions_lower)
            logger.debug(
                "RULE mention check | rule=%s handle=%r mentions_lower=%r matched=%s",
                rule.get("id"), handle, mentions_lower, matched,
            )
            if not matched:
                return False

        # keywords — ANY keyword must appear in text (case-insensitive)
        if "keywords" in when:
            text_lower = text.lower()
            if not any(k.lower() in text_lower for k in when["keywords"]):
                return False

        # chat_id — exact string match
        if "chat_id" in when:
            if str(meta.chat_id) != str(when["chat_id"]):
                return False

        # thread_id — exact string match
        if "thread_id" in when:
            if str(meta.thread_id or "") != str(when["thread_id"]):
                return False

        logger.debug("RULE MATCHED | rule=%s", rule.get("id"))
        return True
