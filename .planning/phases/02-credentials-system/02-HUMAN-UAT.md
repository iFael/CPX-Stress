---
status: partial
phase: 02-credentials-system
source: [02-VERIFICATION.md]
started: 2026-04-06T16:30:00Z
updated: 2026-04-06T16:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Full Credential Save Flow
expected: Navigate to Settings via sidebar, fill user and password, click Salvar. Toast "Credenciais salvas com sucesso!" appears, both fields show "Configurado", fields are cleared after save.
result: [pending]

### 2. Credential Alert Banner
expected: On TestConfig screen with missing credentials, yellow warning banner "Credenciais MisterT nao configuradas" is visible above the error area. Clicking "Configurar" navigates to Settings page.
result: [pending]

### 3. Startup Credential Check
expected: Restart the app after saving credentials. TestConfig loads without credential alert banner, Executar button is enabled and clickable.
result: [pending]

### 4. Password Masking Toggle
expected: Password field shows dots/bullets by default. Clicking eye icon reveals text. Clicking again hides it.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
