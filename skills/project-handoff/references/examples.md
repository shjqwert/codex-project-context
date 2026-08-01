# Handoff Examples

## Supported Diagnosis

```json
{
  "title": "Session shutdown cleanup",
  "summary": "Verified cleanup now runs after the transport closes.",
  "files": ["src/session.ts"],
  "symbols": ["stopSession"],
  "tests": ["session cleanup"],
  "sections": {
    "bugDiagnosis": "The early return bypassed cleanup; the focused regression test failed before the change and passed afterward.",
    "verification": "Focused session cleanup test passed."
  }
}
```

## Unconfirmed Cause

Omit `bugDiagnosis` when logs show a failure but code and controlled comparison do not establish the cause. Record the observed failure and missing evidence under `risks` and `evidence`.

## Reject

Do not create a handoff for formatting one file, answering a question, or restating an OpenSpec task without new implementation, diagnosis, constraint, or verification evidence.
