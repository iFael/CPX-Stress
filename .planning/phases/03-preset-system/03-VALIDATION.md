---
phase: 03
slug: preset-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | No test runner configured (manual validation via `npm run build`) |
| **Config file** | none |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd-verify-work`:** Build must pass with zero errors
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 03-01-01 | 01 | 1 | PRESET-01/02 | build | `npm run build` | ⬜ pending |
| 03-01-02 | 01 | 1 | PRESET-01/02 | build | `npm run build` | ⬜ pending |
| 03-02-01 | 02 | 2 | PRESET-01/02 | build | `npm run build` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner to install — validation is via TypeScript compilation + Vite build.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Built-in preset appears in modal without config | PRESET-01 | Requires running Electron app | Open app, click "Presets" in TestConfig, verify "MisterT Completo" card visible |
| Applying preset loads 10 operations | PRESET-01 | Requires UI interaction | Click "Carregar Preset" on MisterT Completo, verify form shows 10 operations |
| Save/load/rename/delete user presets | PRESET-02 | Requires full UI flow | Save current config as preset, close/reopen app, verify preset persists |
| Presets persist after app restart | PRESET-02 | Requires app lifecycle | Save preset, close app, reopen, verify preset appears in modal |

---

## Validation Sign-Off

- [ ] All tasks have build verify
- [ ] Sampling continuity: build check after every task
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
