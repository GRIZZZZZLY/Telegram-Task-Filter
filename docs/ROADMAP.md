# Roadmap (Planned Improvements)

Status: planning document, no automatic implementation.

## 1-week strategic plan (approved)

### Day 1 — Scope lock

- lock scope and success criteria
- define in/out boundaries

### Day 2 — Data reliability

- migration policy hardening
- rollback rules for DB updates

### Day 3 — Regression strategy

- smoke/regression/nightly matrix
- priority scenarios:
  - PIN
  - context lift
  - start-work toggle
  - done/reopen
  - thread filters

### Day 4 — UX consolidation

- compact/normal layout rules
- narrow-window behavior rules

### Day 5 — Diagnostics and operations

- standard error states
- health diagnostics checklist

### Day 6 — Release readiness

- release runbook
- update and rollback checklist

### Day 7 — Go/No-Go

- final validation against acceptance criteria
- next sprint backlog freeze

---

## Backlog (prioritized)

### High priority

1. Align stats "В работе" with `in_progress`
2. Expand end-to-end regression coverage
3. Versioned DB migrations (history, not only runtime alter)

### Medium priority

4. Compact action overflow on narrow card widths
5. Bulk task operations (multi-select)
6. Context-lift thresholds configurable in Settings

### Low priority

7. Rich operational dashboard
8. Beta channel rollout strategy

---

## Non-goals (for this phase)

- AI task extraction
- cross-platform non-Windows packaging
- cloud sync / multi-user collaboration
