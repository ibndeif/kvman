---
"@kvman/protocol": minor
---

The notification tray (M2.12, 08 §8.11, ADRs 0162–0164): `NotificationItem` and the requests and answers of `kernel.notifications.list`, `.count`, `kernel.notification.read`, `.dismiss`, `kernel.notifications.read-all`, `.mute`, the `kernel.notifications.changed` payload, the `ui.*` answer, and `kernel.message.retry`'s request. The event stream's `ui` message gains `workspaceId`, and `storedPreferencesSchema` describes the stored preferences with the muted extensions per workspace.
