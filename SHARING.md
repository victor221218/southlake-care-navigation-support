# Share the Windows app

Share the [GitHub download page](https://github.com/victor221218/southlake-care-navigation-support/releases/tag/v2.13.0). Users choose **Care-Navigation-Support-Setup-2.13.0.exe** and open it; there is no ZIP to extract to install the app. The same page offers the quick-start guide and a complete source/handoff ZIP for maintainers.

A C: drive link works on this computer only. To send a download link, upload the installer and share that actual file page. The public GitHub release is verified separately after upload.

Suggested message:

> Download the Care Navigation Support installer from this shared folder. Open it, choose Install, then Finish. Open the app from the desktop afterwards. Connect your own eligible ChatGPT account, then use the full Workspace chat or Add a document beside Speak. The quick-start guide shows the first steps. Your saved cards and notes are private to your installation/account.

## Administrator checks

The pilot installer is unsigned. Arrange approved software distribution and publisher signing before routine Southlake rollout. Follow the organization's software approval process when Windows blocks an unsigned build. Verify the intended Windows computer, microphone, documents and real ChatGPT inference using the intended account/workspace. OpenAI controls account/app eligibility; a subscription label alone does not guarantee access. No API key or sponsor token is included.

The app independently implements the published Sign in with ChatGPT protocol. Confirm that the intended deployment is admitted and Southlake authorizes the document-data flow to OpenAI. The separately licensed demonstration DevKit is not bundled.

The same clean installer goes to each recipient. It contains the app, bundled document readers, voice model, 27 researched service pathways and an optional fictional sample, not the sender's account or imported documents. Do not send the app-data folder. To change computers, deliberately export a private memory backup, then restore it into the correct active account on the new computer. Backups contain private document text and notes, not original files or credentials.

Version 1.5.0's service-navigation installer remains separately available. Version 2.7 retains the full Workspace chat and separate editable memory library. It preserves previous on-disk data without converting it or introducing shared-team memory.

## Developer handoff

Windows source entry points: src/document-main.mjs, src/documents/, ui/documents.mjs and ui/documents.css. Legacy service modules remain for reference and regression tests. Electron 45.3.2 / Node 24; exact dependency versions are in package.json and pnpm-lock.yaml.

After installing the pinned dependencies, build and test:

```
node scripts/build.mjs
node --test tests/*.test.mjs
node scripts/package.mjs
python scripts/prepare-windows.py
.runtime\inno-compiler\ISCC.exe scripts\windows-installer.iss
```

The document tests exercise the built background reader, so build first. The Windows staging script expects the matching official Electron runtime manifest/cache; a new build machine must supply that runtime and Inno Setup. Third-party notices are in app.asar. The installer uses the same app ID and per-user directory, preserving user data on upgrade and uninstall. Never distribute developer QA stages, test profiles or credentials.

## Version 2.13 upgrade

The Windows app and shortcuts use the name Care Navigation Support and the supplied logo. The installer keeps the existing installation ID and the Windows data location `%APPDATA%\Southlake Hive` to retain saved accounts, documents and notes. Close the previous app before updating. Public starting cards are initialized separately in each account and do not transfer anyone’s comments to another account. No automatic updater is included.

## Case chats and memory in this release

Case chats appear by week with feedback status. Service previews show source details and recorded history. Once a service is chosen, its contacts and feedback controls appear in chat. The completion prompt offers Keep chat open, Add to memory library, and Delete chat and notes. The last choice confirms permanent deletion of that chat and its linked feedback.

## Default pages and memory controls

Workspace opens first as a full-width chat. Known services fills the page, with an optional floating assistant on the right. Manage memory is directly beneath Known services. Normal messages remain in the conversation. An explicit “Remember that…” request saves a note, and recorded results stay linked to their service.

Version 2.7 places Ask assistant in the upper-right of the Known services heading, clear of service rows. Manage memory is directly beneath Known services in the sidebar. Ask assistant also remains under View details; it selects the provider and opens the side panel. Minimize/Escape retains the draft and directory filters; Open Workspace continues the same conversation.

## Service-result handoff

Version 2.7 adds a three-action service-card footer, personal history above the provider fields, and explicit Worked/Didn’t work results with optional 1–5 ratings. Records belong to the current app account and the specific service. They can be corrected/deleted in the card or Manage memory. New conversations and app restarts retain them. Memory backups include outcome/rating fields; older note-only backups remain readable.

Migration `0004_personal_service_results.sql` adds nullable outcome and rating columns to the existing personal comments table. It keeps previous comments and source cards. Do not replace the user database or change the Windows app-data identity when updating. Counts describe only explicit personal reports, not general provider success rates.

## Case chats and saved-input corrections in 2.7

Each account has its own persisted case conversations, selected cards, drafts and correction history. Active chats appear in the sidebar. Saved cases appear as one linked conversation card in Manage memory while retaining the complete transcript in the local database. New cases keep prior chats. Automatic message memory is linked to its case; deleting a case removes those entries as well as its transcript, while explicit service feedback remains. Related correction snapshots are removed so Undo cannot resurrect a deleted case.

Memory backups include active and saved cases, messages and their card links. Original files, sign-in credentials and Undo/Redo history are excluded. Existing note-only backups remain readable. The new migration is additive; do not replace the existing user database.

## Cards-only service recommendations in 2.7

All returned service choices appear together. Brief reasons and checks stay inside the corresponding card, with no separate recommendation text above or below the grid. Previously saved service replies also use the card layout. Card details, provider links, personal feedback and case conversations remain available. This update adds presentation fields to existing case-message JSON without replacing the database. Backups retain those fields. It introduces no shared memory or new service outcomes.


## Service follow-up in chat

A recommendation opens a result prompt in the same topic. It can be deferred and its optional note and rating can be drafted before saving. Choose New topic for a separate chat. Service requests get short titles based on the need and area. A saved result is a single provider feedback record, available in the conversation and on the provider card. Undo and Redo apply to that record. Backups retain the chat and its linked feedback. Existing conversations remain readable.


The follow-up card shows its listed phone and email under Known contact. Add a note saves to the provider card without recording a result. The chat previews the latest note added there. Drafts and note references carry through backup restore.
