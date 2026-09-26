---
"@kvman/protocol": minor
---

Add the blob, workspace file, and trust shapes (M2.5): `blobLimits`, `mimeTypeSchema`, `blobNameSchema`, `blobStatSchema`, `blobInfoSchema`, `blobRefChangeSchema`, `blobUploadSchema`, and `blobChunkSchema`; `filesLimits`, `fileKindSchema`, `workspacePathSchema`, `fileEntrySchema`, `fileStatSchema`, and `fileContentSchema`; `trustLimits` and the payloads of `kernel.trust.preview`, `kernel.trust.grant`, `kernel.trust.revoke`, and `kernel.trust.changed`, with `trustTokenClaimsSchema`. The host frames gain the `blobs.*` and `workspace.*` calls, and the unit of work gains `blobRefs`.
