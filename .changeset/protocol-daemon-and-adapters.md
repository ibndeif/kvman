---
"@kvman/protocol": minor
---

The daemon and its adapters (M1.8):

- `daemonLockSchema`, `daemonStartReportSchema`, and `kernelPorts` (ADRs 0087, 0088).
- `healthRequestSchema` and `healthResultSchema` for `kernel.health.get`, `shutdownRequestSchema` and `shutdownResultSchema` for `kernel.shutdown`, and `kernelStartedSchema` for `kernel.started`.
- The HTTP response bodies `commandReplyResponseSchema`, `commandAcceptedResponseSchema`, `queryResponseSchema`, `messageStatusSchema`, `subscriptionCreatedSchema`, and `messageStateSchema` (ADR 0094).
- The kernel codes `NOT_FOUND`, `PORT_UNAVAILABLE`, and `KERNEL_STOPPING` (ADRs 0090, 0095).
- The SSE `resync` reason is `cursor-expired` or `cursor-unknown` (ADR 0098), and `SseMessage<Name>` types each stream message.
