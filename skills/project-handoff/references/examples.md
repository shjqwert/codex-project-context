# Handoff Examples

## Create Chinese Current State

```json
{
  "title": "会话关闭资源清理",
  "summary": "已验证传输关闭后执行资源清理。",
  "kind": "bug",
  "files": ["src/session.ts"],
  "symbols": ["stopSession"],
  "tests": ["session cleanup"],
  "aliases": [
    "会话关闭清理验证",
    "传输关闭后清理",
    "session shutdown resource cleanup",
    "cleanup after transport close"
  ],
  "sections": {
    "objective": "保留已验证的关闭清理结果，供后续任务继续。",
    "currentState": "src/session.ts 中绕过清理的提前返回已经修复。",
    "workCompleted": "将清理移动到传输关闭之后，并增加聚焦回归测试。",
    "bugDiagnosis": "受控测试证明提前返回绕过了清理。",
    "verification": "session cleanup 聚焦测试已经通过。",
    "remainingWork": "运行更广泛的会话测试套件。"
  }
}
```

## Update with a Milestone

Read W001 current revision first, then submit the complete next state:

```json
{
  "workId": "W001",
  "expectedRevision": 1,
  "title": "会话关闭资源清理已完成",
  "summary": "聚焦测试和完整会话测试均已通过。",
  "kind": "bug",
  "status": "completed",
  "checkpoint": true,
  "checkpointReason": "修复和完整验证均已完成。",
  "files": ["src/session.ts"],
  "symbols": ["stopSession"],
  "tests": ["session cleanup", "session suite"],
  "aliases": [
    "会话关闭清理验证",
    "传输关闭后清理",
    "session shutdown resource cleanup",
    "cleanup after transport close"
  ],
  "sections": {
    "objective": "确保会话关闭始终释放资源。",
    "currentState": "修复和完整验证均已完成。",
    "workCompleted": "修复提前返回并完成聚焦与完整测试。",
    "verification": "session cleanup 和 session suite 均已通过。",
    "remainingWork": "没有剩余实现工作。"
  }
}
```

## Unconfirmed Cause

When logs show a failure but controlled evidence does not establish the cause, omit `bugDiagnosis`. Put the observed failure under `currentState`, the next investigation under `remainingWork`, and only material uncertainty under `risks`.

## Separate Objectives

Two windows working in the same repository use different work IDs when their outcomes and acceptance criteria are independently completable. Shared files or modules do not merge them. If the boundary is ambiguous, ask the user and do not write.

## Reject

Do not create or update a handoff for formatting one file, answering a routine question, or restating accepted information with no continuation risk.
