# Handoff Examples

## Supported Diagnosis

```json
{
  "title": "Session shutdown cleanup",
  "summary": "Verified cleanup now runs after the transport closes.",
  "kind": "bug",
  "files": ["src/session.ts"],
  "symbols": ["stopSession"],
  "tests": ["session cleanup"],
  "aliases": [
    "会话关闭资源清理",
    "传输关闭后清理",
    "session shutdown resource cleanup",
    "cleanup after transport close"
  ],
  "sections": {
    "objective": "Preserve the verified cleanup fix for continuation in a new task.",
    "currentState": "The early-return cleanup defect is fixed in src/session.ts.",
    "workCompleted": "Moved cleanup after transport closure and added a focused regression test.",
    "bugDiagnosis": "The early return bypassed cleanup; the focused test failed before the change and passed afterward.",
    "verification": "The focused session cleanup test passed.",
    "remainingWork": "Run the broader session suite and inspect any platform-specific shutdown failures."
  }
}
```

## Unconfirmed Cause

Omit `bugDiagnosis` when logs show a failure but code and controlled comparison do not establish the cause. Record the observed state under `currentState`, the needed investigation under `remainingWork`, and only material uncertainty under `risks`.

## Reject

Do not create a handoff for formatting one file, answering a question, or restating an accepted specification without new implementation, diagnosis, constraint, verification, or continuation risk.
