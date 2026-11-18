# Southlake Hive 2.0 — Windows pilot

Open **Southlake-Hive-Setup-2.0.0.exe**, choose **Install**, then **Finish**. Open **Southlake Hive** from your desktop or Start menu afterwards. No ZIP extraction, coding tools, terminal commands or plugin setup are needed.

This installer supports Windows 10 version 2004 or later and Windows 11 on 64-bit Intel/AMD computers. It installs for the current Windows user. The pilot is unsigned. If Windows or your organization blocks it, ask your administrator to approve distribution. A signed publisher release is required for a routine Southlake rollout.

## Start with three steps

1. **Connect ChatGPT.** Sign in on the official OpenAI page in your browser, review identity and plan-usage permission, then return to Hive. Use your own account. Account, workspace and app eligibility are decided by OpenAI; signing in alone does not prove AI usage is available. The app never switches to API billing.
2. **Add a document.** Review the extracted cards and any warnings, then choose **Save cards**. Import happens on your computer. For a first look, choose **Try a fictional sample** in the empty card list. The sample contains no real services or contacts.
3. **Ask a question.** Matching source cards appear below the answer. Open one for its exact fields, contacts, source links and notes. **Ask about this card** makes it the conversation's selected source.

**Your notes & corrections** save automatically when you pause. Wait for **Saved on this card**. Choose **New note** for a separate entry. Closing the card or app also waits for a pending note to save.

**Keep this message** saves the exact words you send. With a selected card, it becomes a note on that card; otherwise, it becomes a personal message card. Turn this off for questions you do not want to retain. Questions are labelled as your messages, not verified facts. AI replies do not automatically overwrite source records.

**New conversation** clears this conversation and selected card. Saved cards and notes remain. The full chat transcript is not stored. Later questions retrieve relevant saved information again. This uses your saved records; it does not train the AI model or read your ChatGPT Memory.

## Files and updates

Supported: **.xlsx, .csv, .tsv, .docx, searchable .pdf, .txt, .md**. Limits: 20 MB per file, 5,000 extracted cards, 100 table columns, 300 PDF pages. Split larger files. Convert older .xls or .doc files first. Scan-only PDFs need OCR before import. Images, embedded objects and Word formatting are not imported.

Excel/CSV tables should have a clear header row followed by records. One row becomes one card, with its worksheet and row number. Named contacts appear only when a contact-name column exists; otherwise listed phone numbers or emails are shown. Check source details before relying on them.

Identical files do not create duplicate document cards. A revised spreadsheet with the same filename and unique IDs or names offers **Update existing document**. Matching cards keep their notes even when rows move. Removed rows are retained as previous rows. When unique keys are ambiguous, save a separate version to preserve the existing information. Source content is read-only; add a correction note or reimport the revised source.

Calculations use imported numeric cell values. Excel formulas are not executed or recalculated: only their last saved results are used, with a warning. Missing results remain missing. Calculation answers show matched row counts and exclude nonnumeric values. PDF text is not treated as a reliable spreadsheet table.

## Private memory and backups

Each ChatGPT connection has its own local records. Other Hive users do not receive your documents or notes. Different computers and Windows accounts have separate storage. There is no shared team database or automatic cross-computer synchronization.

You may import before sign-in in the **Starter workspace**. After sign-in, open **Connection & backup → Copy starter cards into this account**. This is an explicit private copy. Signing out keeps that account's cards for a verified reconnect and shows the separate starter workspace.

Use **Save a backup** to export all extracted information, cards and notes. Use **Restore a backup** on another computer to add them to the active workspace. Matching records are retained to avoid duplicates. Original files and credentials are excluded. Keep the backup private. Restoring does not erase current records.

Memory is normally in `%APPDATA%\Southlake Hive\documents.sqlite`; copied originals are in its `documents` subfolder. Credentials are separately encrypted in `account\chatgpt.auth` using Windows protected storage. The document database and backups are **not encrypted by Hive**. Protect the Windows account and backups. Earlier v1.x files, including hive.sqlite and practice.sqlite, are preserved but are not converted into this new document workspace.

Only AI questions send your message and relevant saved text to OpenAI. Import, card search and note saving work without internet or ChatGPT. Sign-in does not give Hive access to your ChatGPT chats or ChatGPT Memory. Keep patient identifiers out of this pilot, consistent with the project scope.

## Try this

Import the fictional sample. Open **Example Community Rides**, add **“Practice note: call before referring.”**, and wait for the saved indicator. Start a new conversation, search for **Practice note**, and reopen the card. Close and reopen Hive to check it again.

With an eligible ChatGPT connection, ask:

> Using my imported sample, compare the two North York transportation options. Show their contacts and source cards. Sum their Available slots and tell me how many rows you used. Do not treat these as real services.

Expected calculation: **7 slots across 2 matching rows**. Turn off **Keep this message** if you do not want the test question saved. If you imported before connecting, copy starter cards into your account first. Delete the fictional document through **Manage files** when finished.

Live ChatGPT sign-in and inference on the recipient's eligible account, and live microphone access, remain recipient checks. Automated local parser, persistence, calculation, account-isolation and simulated AI checks do not prove these live capabilities.

Official connection reference: https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
