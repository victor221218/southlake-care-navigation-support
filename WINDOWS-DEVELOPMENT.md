# Windows development — version 2.0.0

These steps are for Matthew or a developer. Karen uses the finished Windows installer and needs none of these tools.

## Prerequisites

- Windows with Node.js 24 and pnpm 11.25.0.
- Python 3 for runtime staging.
- The official **Electron 45.3.2 Windows x64 ZIP**, matching package.json. Obtain it from Electron's official release distribution and verify its published checksum.
- The Inno Setup compiler. The tested installer was compiled with the official 64-bit Inno Setup 7.1.1 toolchain; an approved compatible build environment is required.

Install pinned dependencies, then build **before** testing: the document tests execute the built reader worker.

```powershell
pnpm install --frozen-lockfile --node-linker=hoisted
pnpm build
pnpm test
node scripts/package.mjs
```

`pnpm start` opens the app when the Electron package runtime is installed. Dependency tools are for development only and are not required on recipient computers. No ChatGPT token or account credentials are supplied with source.

## Configure the Windows runtime

Create `.runtime/runtimes.json` on the build machine. Use the actual absolute path to the verified Windows runtime ZIP; this is a local build setting excluded from source control.

```json
[
  {
    "platform": "win32",
    "arch": "x64",
    "path": "C:/build-tools/electron-v45.3.2-win32-x64.zip"
  }
]
```

Stage and compile:

```powershell
python scripts/prepare-windows.py
& 'C:/build-tools/Inno Setup/ISCC.exe' scripts/windows-installer.iss
```

Adjust only the compiler path to its approved installation. The result is `release/setup/Southlake-Hive-Setup.exe`. Version and app identity are defined in package.json and scripts/windows-installer.iss; keep them consistent. It installs per Windows user and retains separate app-data files on upgrade/uninstall.

The packager collects dependency license notices. Keep the bundled Vosk model source manifest, Apache license and notices with the assets. The OpenAI demonstration DevKit is not bundled; this app implements the published protocol independently.

## Current native acceptance check

After build/package and runtime configuration:

```powershell
node scripts/prepare-document-smoke.mjs
python scripts/prepare-windows.py --document-smoke
& '.runtime/document-smoke-2.0.0/Southlake Hive Document Test.exe'
```

Run this from a normal Windows desktop session. It uses its own isolated test profile and fictional files, exercises the shipping main/renderer/IPC, checks all three bundled Office/PDF readers, and relaunches to verify pending notes are saved before closing. It writes `document-smoke-result.json` in its test directory. It does not sign in, perform live AI requests, read existing user data or open the microphone. The test preload/bootstrap and fixtures are **not** part of the shipping installer.

For an extraction-only installer check, use a fresh test directory:

```powershell
& 'release/setup/Southlake-Hive-Setup.exe' /PORTABLE=1 /DIR="C:/build-tests/hive-2.0.0" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

This copies application files without normal shortcuts/uninstall registration. It does not prove the UI, account connection or AI work. Do not disable Chromium sandboxing or bypass OS protection to make a build launch.

`scripts/verify-windows-release.mjs` records the prepared release's provenance and compares extracted/tested artifacts. It expects this workspace's recorded QA stages, extraction folder and handoff output folder; review those paths when adapting the release process to a new build machine. It is not a prerequisite for compiling the app.

## Before regular Southlake use

Verify the intended app/account can complete real ChatGPT requests. Do not assume Plus/Pro subscription status alone admits a private app. Confirm the intended document handling, account separation, backup/restore and microphone behavior; arrange approved distribution and publisher signing. The current database/backup encryption limits and data flow are documented in START-HERE.md. Keep patient identifiers out of pilot tests.

Legacy service-navigation and Mac development notes are retained in BUILDING.md; they do not define the version 2.0 Windows document workflow.
