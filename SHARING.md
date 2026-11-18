# Share the Windows app

Send **Southlake-Hive-Setup-2.0.0.exe** and **Karen-Windows-Quick-Start.html** through an approved file-sharing service such as OneDrive or SharePoint, or a USB drive. Give the recipient download access. There is no ZIP to extract.

A C: drive link works on this computer only. To send a download link, upload the installer and share that actual file page. Building an installer does not create a public download URL.

Suggested message:

> Download the Hive installer from this shared folder. Open it, choose Install, then Finish. Open Hive from the desktop afterwards. Connect your own eligible ChatGPT account, then choose Add a document. The quick-start guide shows the first steps. Your saved cards and notes are private to your installation/account.

## Administrator checks

The pilot installer is unsigned. Arrange approved software distribution and publisher signing before routine Southlake rollout. Do not ask Karen to bypass Windows protection. Verify the intended Windows computer, microphone, documents and real ChatGPT inference using the intended account/workspace. OpenAI controls account/app eligibility; a subscription label alone does not guarantee access. No API key or sponsor token is included.

Hive independently implements the published Sign in with ChatGPT protocol. Confirm that the intended deployment is admitted and Southlake authorizes the document-data flow to OpenAI. The separately licensed demonstration DevKit is not bundled.

The same clean installer goes to each recipient. It contains the app, bundled document readers, voice model and an optional fictional sample, not the sender's account or imported documents. Do not send the app-data folder. To change computers, deliberately export a private memory backup, then restore it into the correct active account on the new computer. Backups contain private document text and notes, not original files or credentials.

Version 1.5.0's service-navigation installer remains separately available. Version 2.0 is the personal document workflow. It preserves previous on-disk data without converting it or introducing shared-team memory.

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
