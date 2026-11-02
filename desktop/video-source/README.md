# Auto-derived scrcpy video protocol — source preparation

**Not built, installed or runtime-admitted.** The earlier source-download operation
stopped on a permission denial. The exact four-file retry succeeded on 2026-11-02
at 04:32 UTC after explicit user approval at 04:30:57 UTC. This preparation does not
execute downloaded code or grant phone, profile, streaming or installation effects.

## Exact source and changes

`source-provenance.json` binds the four official raw Java files at scrcpy commit
`a60891aea193d92e7e5c3942700eca63f9d19a5f` (5.0.1), their measured original bytes,
the unified patch and resulting file hashes. Originals remain outside the repository
in `/tmp/auto-p301-research/pinned-server-source/`. The patch modifies three files;
`device/Streamer.java` is inspected and unchanged. No complete upstream tree is
vendored or inferred from these four files. The later full/selected manifests in this
directory independently bind the retained official source archive, as recorded below.

The derived protocol is **AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1**, not the stock client
protocol or an official upstream artifact:

- `Options` requires one exact 64-lowercase-hex nonce, rejects duplicates, and
  validates the named video-only safety/framing subset before server cleanup/socket effects.
  No nonce is included in an error message.
The unchanged closed C# formatter remains the sole admitted option issuer. The Java guard does not independently allowlist every upstream option: crop, angle, encoder and bitrate parsing still exist, but the host formatter supplies no such overrides. These two boundaries together implement the reviewed fixed profile.

- `Server` passes a private clone of the decoded 32-byte nonce into the connection.
- After successful abstract socket bind and before its only video accept, the
  connection writes exactly `AUTOVID1_READY\n` to the real foreground stdout
  descriptor and flushes. A retained borrowed `FileOutputStream` bypasses upstream
  `Ln.disableSystemStreams()` without re-enabling global streams or swallowing
  write errors. It is never closed by the patch. READY is coordination, not evidence
  of capture, peer identity, remote retirement or physical display health.
- The accepted video stream emits dummy zero, ASCII `AUTOVID1`, then the 32 nonce
  bytes, before upstream codec/session/media output. All later framing is unchanged.
  This nonce is instance binding, not a secret or device identity; Android may log
  process arguments. Auto does not persist the raw nonce.
- Audio/control, upstream cleanup, touch display, wake/power changes and incompatible
  framing are refused by the profile. Existing device/platform behavior is not
  certified by this source edit. The known Android 9 issue remains unproved/unfixed.

## Build preparation, not a build claim

A separately reviewed build must obtain and verify the **complete exact upstream
source tree**, retain upstream Apache-2.0 license/NOTICE obligations and prominent
modified-file notices (this patch/readme and manifest), verify every input hash,
apply this patch with no fuzz/offset or unexpected edits, and verify derived hashes.
The official server JAR hash remains upstream provenance only and MUST NOT be used
as this derived server's hash. No official signing or release claim follows.

Before compiling, freeze the actual JDK, Android SDK/platform/build-tools, build
system and dependency closure from the pinned upstream build files. The four-file download alone did not establish those inputs. The subsequent complete
archive inspection and fixed direct-build source now establish the source closure;
actual preinstalled tooling and build outputs remain to be observed.
Do not install tools, accept SDK licenses, run an emulator or contact a device as a
fallback. The reviewed compile-only gate fails closed on missing exact
preinstalled tooling; its present contract does not perform provisioning. Source validation or fake-I/O native tests are not Java
compilation, Android compatibility, video rendering or performance evidence.

After actual reviewed builds, record the derived JAR digest, complete Windows
consumer DLL digest, source/patch/toolchain manifest and external pair-manifest
digest. The consumer must match this exact protocol. All three output pins here
remain `null`; the source-owned application pair pin remains unavailable. These
research hashes are not an admission API. No helper, package or native source was
changed by this patch preparation; no new dependency or arbitrary shell interface
is introduced.


## Complete source closure and compile-only gate

The reviewed `verified-full-source-manifest.json` binds all 387 regular upstream
blobs; `verified-selected-source-manifest.json` binds the 95 manual-build/provenance
inputs. These are metadata only, not vendored upstream code or an official binary.
See [the source/build evidence](../../docs/evidence/P3-01-derived-pair-build-2026-11-02.md)
and [fixed compile-only contract](../../docs/phases/P3-DERIVED-SERVER-BUILD-PROPOSAL.md).
The direct AIDL/javac/D8 route and complete five-source Windows DLL are implemented
as a bounded source gate; actual compilation is still NOT_RUN at this source freeze.
Only strict JSON evidence may be uploaded, after exact output inspection and owned
scratch cleanup. Deleted JAR/DLL outputs are not retained deployable artifacts.
