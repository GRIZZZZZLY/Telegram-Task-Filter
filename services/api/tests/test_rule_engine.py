"""Unit tests for RuleEngine.

Tests cover:
  - default_rules.yaml (mention trigger)
  - edge cases: missing file, empty file, case-insensitivity
  - custom rules: keyword trigger, multiple conditions
"""
from pathlib import Path

import pytest

from app.services.rule_engine import MessageMeta, RuleEngine

_MENTION_RULE_YAML = """
- id: mention_me
  name: Mention @LindsyQQ
  enabled: true
  priority: 100
  when:
    mention: "@LindsyQQ"
  then:
    create_task: true
    priority: high
"""


@pytest.fixture
def engine(tmp_path) -> RuleEngine:
    """Engine with a fixed test rule — independent of production YAML."""
    rules_file = tmp_path / "test_rules.yaml"
    rules_file.write_text(_MENTION_RULE_YAML)
    return RuleEngine(str(rules_file))


@pytest.fixture
def custom_engine(tmp_path) -> RuleEngine:
    """Engine loaded from a temp YAML for custom rule testing."""
    yaml_content = """
- id: kw_rule
  name: Keyword rule
  enabled: true
  priority: 50
  when:
    keywords: ["todo", "fix"]
  then:
    create_task: true
    priority: medium

- id: high_kw_rule
  name: Urgent keyword
  enabled: true
  priority: 75
  when:
    keywords: ["срочно", "urgent"]
  then:
    create_task: true
    priority: high

- id: disabled_rule
  name: Disabled rule
  enabled: false
  priority: 200
  when:
    keywords: ["never"]
  then:
    create_task: true
    priority: high
"""
    rules_file = tmp_path / "rules.yaml"
    rules_file.write_text(yaml_content, encoding="utf-8")
    return RuleEngine(str(rules_file))


# ── Default rules (mention) ────────────────────────────────────────────────

class TestMentionRule:
    def test_mention_creates_high_priority_task(self, engine):
        meta = MessageMeta(chat_id="-100123", mentions=["@LindsyQQ"])
        result = engine.evaluate("Hey @LindsyQQ please review this", meta)
        assert result.create_task is True
        assert result.priority.value == "high"
        assert result.matched_rule_id == "mention_me"

    def test_no_mention_no_task(self, engine):
        meta = MessageMeta(chat_id="-100123", mentions=[])
        result = engine.evaluate("Random message with no trigger", meta)
        assert result.create_task is False
        assert result.matched_rule_id is None

    def test_mention_is_case_insensitive(self, engine):
        meta = MessageMeta(chat_id="-100123", mentions=["@lindsyqq"])
        result = engine.evaluate("Hey @lindsyqq check this", meta)
        assert result.create_task is True

    def test_wrong_mention_no_task(self, engine):
        meta = MessageMeta(chat_id="-100123", mentions=["@SomeoneElse"])
        result = engine.evaluate("Hey @SomeoneElse check this", meta)
        assert result.create_task is False


# ── Custom keyword rules ───────────────────────────────────────────────────

class TestKeywordRule:
    def test_todo_keyword_match(self, custom_engine):
        meta = MessageMeta(chat_id="-100")
        result = custom_engine.evaluate("TODO: update the docs", meta)
        assert result.create_task is True
        assert result.priority.value == "medium"

    def test_keyword_case_insensitive(self, custom_engine):
        meta = MessageMeta(chat_id="-100")
        result = custom_engine.evaluate("please FIX this bug", meta)
        assert result.create_task is True

    def test_urgent_keyword_high_priority(self, custom_engine):
        meta = MessageMeta(chat_id="-100")
        result = custom_engine.evaluate("срочно нужен деплой", meta)
        assert result.create_task is True
        assert result.priority.value == "high"

    def test_no_matching_keyword_no_task(self, custom_engine):
        meta = MessageMeta(chat_id="-100")
        result = custom_engine.evaluate("everything looks fine", meta)
        assert result.create_task is False

    def test_disabled_rule_ignored(self, custom_engine):
        """Rule with enabled=false must never match."""
        meta = MessageMeta(chat_id="-100")
        result = custom_engine.evaluate("never match this text", meta)
        assert result.create_task is False

    def test_higher_priority_rule_wins(self, custom_engine):
        """When both kw_rule and high_kw_rule match, high_kw_rule (priority=75) wins."""
        meta = MessageMeta(chat_id="-100")
        # "urgent" matches high_kw_rule (priority=75) AND is a keyword in text
        result = custom_engine.evaluate("urgent todo fix everything", meta)
        assert result.matched_rule_id == "high_kw_rule"
        assert result.priority.value == "high"


# ── Edge cases ─────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_missing_rules_file_returns_no_task(self, tmp_path):
        eng = RuleEngine(str(tmp_path / "nonexistent.yaml"))
        meta = MessageMeta(chat_id="-100", mentions=["@LindsyQQ"])
        result = eng.evaluate("anything", meta)
        assert result.create_task is False

    def test_empty_rules_file_returns_no_task(self, tmp_path):
        empty = tmp_path / "empty.yaml"
        empty.write_text("", encoding="utf-8")
        eng = RuleEngine(str(empty))
        meta = MessageMeta(chat_id="-100", mentions=["@LindsyQQ"])
        result = eng.evaluate("anything", meta)
        assert result.create_task is False

    def test_invalid_priority_falls_back_to_medium(self, tmp_path):
        yaml_content = """
- id: bad_prio
  enabled: true
  priority: 1
  when:
    keywords: ["test"]
  then:
    create_task: true
    priority: turbo_high
"""
        f = tmp_path / "rules.yaml"
        f.write_text(yaml_content)
        eng = RuleEngine(str(f))
        meta = MessageMeta(chat_id="-100")
        result = eng.evaluate("this is a test", meta)
        assert result.create_task is True
        assert result.priority.value == "medium"  # fallback
