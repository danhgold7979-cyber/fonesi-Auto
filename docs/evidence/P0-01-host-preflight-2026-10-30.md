# P0-01 Host Preflight — Sanitized Evidence

Date: 2026-10-30  
Repository: `danhgold7979-cyber/fonesi-Auto`  
Phase branch: `phase/00-feasibility`  
Source: User-provided `Fonesi-Auto-P0-01-20261030-210623.zip`

## Host summary

| Area | Observed result |
|---|---|
| PC model | MSI GF75 Thin 10SCSR |
| OS | Windows 10 Pro, version 10.0.19044, build 19044, 64-bit |
| CPU | Intel Core i7-10750H, 6 cores / 12 logical processors |
| Physical RAM | 16 GiB (17,? bytes reported by CIM; approximately 15.82 GiB) |
| Memory modules | 2 × 8 GiB DDR4-2667 |
| GPU | NVIDIA GeForce GTX 1650 Ti; Intel UHD Graphics; virtual display adapter also present |
| NVIDIA driver | 32.0.15.6636 |
| System SSD | WDC PC SN530 NVMe, approximately 512 GB |
| Secondary HDD | WDC 2 TB SATA |
| Free space on C: | Approximately 121 GiB |
| Active power plan | Balanced |
| Wi-Fi adapter | Intel Wi-Fi 6 AX201, adapter link rate reported as 1.9 Gbps (not an Internet throughput measurement) |
| Node.js | 24.21.0 |
| npm | 11.19.0 |
| Python | 3.12.10 |
| Git | 2.55.0 |
| Java | OpenJDK 17.0.20.1 detected; version capture emitted a PowerShell native-stderr warning |
| Android Studio | Installed |
| Android SDK | SDK root exists; sdkmanager, avdmanager, emulator and SDK platform-tools/adb paths all exist |

## Virtualization findings — unresolved

The report contains conflicting/incomplete indicators:

- `Win32_ComputerSystem.HypervisorPresent = true`.
- Processor fields `VirtualizationFirmwareEnabled`, `VMMonitorModeExtensions` and `SecondLevelAddressTranslationExtensions` were reported as `false`.
- Windows optional-feature query returned `UNAVAILABLE` because the command required elevation.
- Several Hyper-V virtual Ethernet adapters are present.
- No `emulator -accel-check` output was included in this ZIP.

These fields are not sufficient to conclude whether Android Emulator hardware acceleration is usable. Do not enable/disable BIOS or Windows virtualization features based on this report alone.

## ADB / Android environment

This P0-01 ZIP did not include AVD inventory or emulator acceleration output. The separate user-provided Android fleet CSV and ADB screenshots are recorded in the Phase 0 plan. The SDK's own ADB executable exists. A separate ADB executable was also found under another application's directory; Fonesi-Auto must not depend on that external path.

## Script/runtime observations

- The collector successfully created both `host-environment.json` and `README.txt` and packaged them into ZIP.
- The Java version probe captured a `NativeCommandError` message because OpenJDK writes version details to stderr in this PowerShell invocation. Java itself is present. The collector should be hardened so native stderr does not pollute the version field.
- Windows optional-feature inspection was not elevated, so virtualization feature states remain unknown.
- Raw local paths, usernames, IPs, serials and machine-specific identifiers are intentionally omitted from this public evidence.

## P0-01 result

**Status: PARTIAL / BLOCKED for final acceptance.**

Completed:
- Host OS, CPU, RAM, GPU, storage, network adapter inventory and runtime presence were collected.
- Android Studio and Android SDK component presence were confirmed.
- The report was successfully generated and uploaded by the user.

Still required:
1. Re-run only the Windows optional-feature query in an elevated PowerShell session.
2. Capture `emulator.exe -accel-check` output.
3. Reconcile the virtualization indicators and record the actual acceleration backend.
4. Harden the Java version probe in the collector and rerun its syntax/runtime check.

No system configuration was changed by this evidence collection.
