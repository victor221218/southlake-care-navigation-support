# Share the Windows app

Share the [GitHub download page](https://github.com/victor221218/southlake-care-navigation-support/releases/tag/v2.4.0). Users choose **Southlake-Care-Navigation-Support-Setup-2.4.0.exe** and open it; there is no ZIP to extract to install the app. The same page offers the quick-start guide and a complete source/handoff ZIP for maintainers.

A C: drive link works on this computer only. To send a download link, upload the installer and share that actual file page. The public GitHub release is verified separately after upload.

Suggested message:

> Download the Southlake Care Navigation Support installer from this shared folder. Open it, choose Install, then Finish. Open the app from the desktop afterwards. Connect your own eligible ChatGPT account, then use the full Workspace chat or Add a document beside Speak. The quick-start guide shows the first steps. Your saved cards and notes are private to your installation/account.

## Administrator checks

The pilot installer is unsigned. Arrange approved software distribution and publisher signing before routine Southlake rollout. Follow the organization's software approval process when Windows blocks an unsigned build. Verify the intended Windows computer, microphone, documents and real ChatGPT inference using the intended account/workspace. OpenAI controls account/app eligibility; a subscription label alone does not guarantee access. No API key or sponsor token is included.

The app independently implements the published Sign in with ChatGPT protocol. Confirm that the intended deployment is admitted and Southlake authorizes the document-data flow to OpenAI. The separately licensed demonstration DevKit is not bundled.

The same clean installer goes to each recipient. It contains the app, bundled document readers, voice model, 27 researched service pathways and an optional fictional sample, not the sender's account or imported documents. Do not send the app-data folder. To change computers, deliberately export a private memory backup, then restore it into the correct active account on the new computer. Backups contain private document text and notes, not original files or credentials.

Version 1.5.0's service-navigation installer remains separately available. Version 2.4 retains the full Workspace chat and separate editable memory library. It preserves previous on-disk data without converting it or introducing shared-team memory.

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

## Version 2.4 upgrade

The Windows application and shortcuts now use Southlake Care Navigation Support. The installer keeps the existing installation ID and the Windows data location `%APPDATA%\Southlake Hive` to retain saved accounts, documents and notes. Close the previous app before updating. Public starting cards are initialized separately in each account and do not transfer anyone’s comments to another account. No automatic updater is included.

## Default pages and memory controls

Workspace opens first as a full-width chat. Known services fills the page, with an optional floating assistant on the right. Manage memory is directly beneath Known services in the sidebar and supports searching, editing and deleting personal messages/notes/feedback; document corrections remain attached to their source cards. Messages save automatically. These remain individual records, with no shared team feedback store.

Version 2.4 places Ask assistant in the upper-right of the Known services heading, clear of service rows. Manage memory is directly beneath Known services in the sidebar. Ask assistant also remains under View details; it selects the provider and opens the side panel. Minimize/Escape retains the draft and directory filters; Open Workspace continues the same conversation.
