# Windows development — version 2.12.0

These steps cover development and installer builds. End users use the finished Windows installer and need none of these tools.

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

Adjust only the compiler path to its approved installation. The result is `release/setup/Care-Navigation-Support-Setup-2.12.0.exe`. Version and app identity are defined in package.json and scripts/windows-installer.iss. Keep them consistent. The hoisted pinned dependencies provide the Windows resource editor used during staging. `assets/care-navigation-logo.png` is the supplied artwork and `assets/hive.ico` contains the Windows icon sizes. It installs per Windows user and retains separate app-data files on upgrade/uninstall.

The packager collects dependency license notices. Keep the bundled Vosk model source manifest, Apache license and notices with the assets. The OpenAI demonstration DevKit is not bundled; this app implements the published protocol independently.

## Current native acceptance check

After build/package and runtime configuration:

```powershell
node scripts/prepare-document-smoke.mjs
python scripts/prepare-windows.py --document-smoke
& '.runtime/document-smoke-2.12.0/Care Navigation Support Test.exe'
```

Run this from a normal Windows desktop session. It uses its own isolated test profile and fictional files, exercises the shipping main/renderer/IPC, checks all three bundled Office/PDF readers, and relaunches to verify pending notes are saved before closing. It writes `document-smoke-result.json` in its test directory. It does not sign in, perform live AI requests, read existing user data or open the microphone. The test preload/bootstrap and fixtures are **not** part of the shipping installer.

For an extraction-only installer check, use a fresh test directory:

```powershell
& 'release/setup/Care-Navigation-Support-Setup-2.12.0.exe' /PORTABLE=1 /DIR="C:/build-tests/care-navigation-support-2.12.0" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

This copies application files without normal shortcuts/uninstall registration. It does not prove the UI, account connection or AI work. Do not disable Chromium sandboxing or bypass OS protection to make a build launch.

`scripts/verify-windows-release.mjs` records the prepared release's provenance and compares extracted/tested artifacts. It expects this workspace's recorded QA stages, extraction folder and handoff output folder; review those paths when adapting the release process to a new build machine. It is not a prerequisite for compiling the app.

## Before regular Southlake use

Verify the intended app/account can complete real ChatGPT requests. Do not assume Plus/Pro subscription status alone admits a private app. Confirm the intended document handling, account separation, backup/restore and microphone behavior; arrange approved distribution and publisher signing. The current database/backup encryption limits and data flow are documented in START-HERE.md. Keep patient identifiers out of pilot tests.

Legacy service-navigation and Mac development notes are retained in BUILDING.md; they do not define the version 2.7 Windows document workflow.

## Service directory and app identity

`src/documents/services.mjs` builds the 27 public cards from the earlier researched catalog, with source dates and targeted contact updates. Initialization uses stable source keys, avoids duplicate imports, and retains notes when the public snapshot is updated. `src/app-identity.mjs` preserves the legacy Windows data folder independently of the displayed product name. Production runtime files stage into `release/windows-app-2.12.0`. Keep the Inno Setup application ID unchanged when publishing upgrades.

## Version 2.7 interface checks

The native test verifies Workspace as the default full-width chat, composer visibility in a compact window, no Keep this message checkbox, full-page service rows with a floating assistant, automatic saving, a separate memory library, feedback/message editing, confirmed and cancelled deletion, original-source retention, import and reopening. Its file picker is an isolated fixture returning a fictional CSV; the shipping button/IPC/importer run unchanged. All test profiles and UI fixtures are excluded from the production installer.

The version 2.7 native checks also verify the full-page directory with closed chat, header launcher, overlay bounds on compact windows, retained directory width/filters/drafts, Escape focus restoration, Ask assistant below View details, and continuity when expanding to Workspace. The same chat DOM, history, selected card and speech engine are reused; no second chat session or additional native window is created.

The version 2.7 native layout checks verify that Ask assistant remains inside the Known services heading without overlapping the directory at normal and compact sizes, and that Manage memory is the next sidebar item beneath Known services.

## Service results

`DocumentStore.serviceResult` validates service ownership, an explicit result and an optional integer rating from 1 to 5. Updates require the current record version; plain comment edits cannot overwrite result metadata. Result counts and rating averages derive from stored records. Source cards and ordinary comments stay intact. Migration 0004 is additive and runs through the existing migration journal.

The 105 automated tests include an upgrade from the previous schema, backup compatibility, private-account isolation, corrections/deletions and AI grounding in personal results. Native Windows checks cover the three service actions, history before Category, contact selection, no automatic success on selection/copy, the compact result form, duplicate-click protection, result editing/deletion, draft protection, Manage memory editing and persistence after reopening. New screenshot fixtures use isolated practice records.

## Cases, ranking and saved-input history in 2.7

Migration 0005 adds owner-scoped cases, ordered messages, automatic-memory links, the selected case and saved-input history. DocumentCases implements draft/selection persistence, pagination, per-case history search, archive/reopen/delete and backup remapping. DocumentAssistant reconstructs only the current case conversation; automatic messages from another case are excluded from its source retrieval. Current corrected records take precedence over older transcript statements. Interrupted turns can retry without duplicating the user message or its automatic memory.

InputHistory records transactional snapshots of explicit saved notes/results. Undo/Redo checks the current record contents before changing them, increments record versions, clears abandoned redo branches and stays within the active owner. Case deletion removes linked automatic records and related snapshots. Source imports and permanent case deletion do not use this correction stack.

Service search requires all search terms and applies the category filter first. Matching services sort by average saved rating; no ratings uses an internal neutral value of 3 solely for ordering. Smoothed reported outcome balance breaks ties. No neutral score is displayed as an observed rating. Response cards also preserve query relevance.

105 automated tests cover the existing workflow plus case isolation, restart, long transcript archive/reopen, automatic-memory deletion, backup remapping, older history search, retry, undo/redo, stale conflicts and ranking. Native Windows checks cover the compact card grid, case sidebar, titles, drafts, archive/delete/cancel, library reopening, rating Undo/Redo and persistence after reopening.

## Cards-only service responses in 2.7

`present_service_options` is a read-only answer-formatting tool. It accepts one to six previously read source cards with bounded reason/confirmation strings. All IDs are revalidated against the active owner and case; invented, unread, duplicate, archived and personal-memory records are rejected. Presentation finishes the response immediately without a further prose-generation round. It never records an outcome, rating or note. The chosen candidates retain relevance-first personal-history ordering.

Case message JSON stores only source references and the short presentation fields. Reopening refreshes the source card while retaining that reply’s reason/check; other cases’ automatic notes are excluded. Backup restore remaps references and retains presentation fields. Deleted source cards are omitted; the historical answer remains readable when no cards remain. Existing case payloads need no schema migration.

The renderer shows all returned cards, suppresses standalone service-recommendation prose and keeps provider checks inside each card. Pending responses show a status card rather than briefly flashing streamed prose. Non-service answers, calculations and errors remain readable; errors keep Retry. Normal Workspace uses three columns where space allows and two at smaller widths; the floating assistant uses two. Long replies open at their first card. Native checks verify all returned choices, the absence of narrative/expansion controls, checks inside cards and the first-card position, alongside the existing case, rating and correction workflow.


## In-chat service follow-up and topic names

`CaseFollowups` validates a service against the recommendation in its owning topic. Its prompt and optional draft live in existing case-message JSON. The final save writes a single provider result and an Undo entry in the same transaction. Reopening resolves the result from the provider record so Undo and Redo show the current state. Backup restore remaps provider and result references. These controls work locally.

`topic.mjs` summarizes the first request for a new topic using directory service categories and areas. The service and area also provide a local lookup when a full prompt is too specific for a direct text match. The Windows check exercises the sample transportation prompt, feedback in chat, deferral, switching topics, returning to a draft and Undo/Redo.


Independent service notes use the same comment and Undo/Redo records as the provider detail view. Follow-up messages retain the draft and linked comment IDs. The display picks a phone and email separately, so multiple phone entries cannot hide an available email. The Windows check covers the contact block and saving a note while the result is still pending.


## Weekly case queue and feedback corrections in 2.11

The sidebar derives the activity time from case messages, with the case creation time as a fallback. Week labels use the Windows date and start on Monday. The queue checks each selection against its saved result on the same owner and provider. Deferred or undone results remain pending. The feedback menu can open an older message page and offers a shortcut back to the latest page.

Undo and Redo in a follow-up use that message’s linked note and result IDs and validate the expected history entry in the same transaction as the correction. This keeps changes on the selected feedback even if another service or case has a newer edit. Closing uses the existing conversation archive and reopening returns it to the active queue. The Windows acceptance checks exercise filtering, the menu, the title suggestion, correction controls and archive reopening.

## Curated memory in 2.12

The app stores normal chat turns in the case transcript. An explicit note request writes one note to the selected card or personal notes. Grouped queries omit legacy automatic copies linked to a chat while retaining the transcript. The archive action keeps one conversation, and the existing delete action removes its transcript and case-linked automatic copies.

The memory library groups relevant items by service provider, explicit organization field, or imported file. Saved conversations use selected card references from the transcript. Queries page organization groups and their history independently. Context-card references are remapped during backup restore. The storage schema stays compatible with earlier profiles.
