# Build and verification entries

Read only relevant manifests, scripts, project configuration and maintained docs.
Record one to three concise build/verification lines: the evidenced entry and any
project-specific invocation boundary. A command's existence is not authorization
to execute it; current user restrictions and applicable global/project rules apply.

For IAR, inspect the selected .ewp/.eww and referenced configuration. For Keil,
inspect .uvproj/.uvprojx/.uvmpw and selected target. Distinguish workspace from
project, toolchain from target, and configured command from observed successful
execution. Do not invent tool paths, configurations, device names or flags from
an extension. Cite the actual file. An unknown entry stays unconfirmed.

For other stacks, derive entries from actual scripts/targets. Include wrapper
side effects (for example, a pretest build) when they affect how to invoke it.
Do not execute build, test, installation or hardware commands during discovery.
Avoid generic repeated global rules and exhaustive command catalogs; retain
existing user-specific restrictions and report real conflicting evidence.
