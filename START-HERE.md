# Southlake Care Navigation Support — Windows 2.1 prototype

Open **Southlake-Care-Navigation-Support-Setup-2.5.0.exe**, choose **Install**, then **Finish**. Open **Southlake Care Navigation Support** from your desktop or Start menu afterwards. No ZIP extraction, coding tools, terminal commands or plugin setup are needed.

This installer supports Windows 10 version 2004 or later and Windows 11 on 64-bit Intel/AMD computers. It installs for the current Windows user. The pilot is unsigned. If Windows or your organization blocks it, ask your administrator to approve distribution. A signed publisher release is required for a routine Southlake rollout.

## Start in Workspace

Workspace is the default page and is a full-width chat. Add a document remains beside Speak. Messages save automatically; use Manage memory directly beneath Known services in the sidebar to review, change or delete what has been saved.

## Known services are ready to browse

Open **Known services** on the left for 27 researched services in full-width horizontal rows. Category and search controls are at the top; the directory fills the page. The assistant opens only when requested, as a floating panel on the right. Open View details or choose Ask assistant on a row. A named person appears only when the source lists one. Otherwise use the listed phone/email. Confirm current eligibility, service area, fees and capacity with the provider. No past outcomes or success rates are preloaded.

Choose **Ask assistant** beneath View details, or **Ask more about this card** in its details, to open the floating assistant with that service selected. Its messages save on that service card. Use Ask assistant in the upper-right of the Known services heading to reopen chat, × or Escape to minimize, or **Open Workspace** for the full chat. Your draft and selected service remain available. Open **Manage memory** to see imported document cards, saved messages and service feedback.

## Start with three steps

1. **Connect ChatGPT.** Sign in on the official OpenAI page in your browser, review identity and plan-usage permission, then return to the app. Use your own account. Account, workspace and app eligibility are decided by OpenAI; signing in alone does not prove AI usage is available. The app never switches to API billing.
2. **Add a document.** Use the button beside **Speak** at the bottom of the chat. Review the extracted cards and any warnings, then choose **Save cards**. Import happens on your computer. For a first look, choose **Manage memory → Try a fictional sample** in the empty memory list. The sample contains no real services or contacts.
3. **Ask a question.** Matching source cards appear below the answer. Open one for its exact fields, contacts, source links and notes. **Ask about this card** makes it the conversation's selected source.

On a service card, choose **Add a note** near the top. Notes and corrections save automatically when you pause. Wait for **Saved on this card**. Choose **New note** for a separate entry. Closing the card or app also waits for a pending note to save.

**Messages save automatically.** With a selected card, the message becomes a note on that card; otherwise it becomes a personal message card. Use **Manage memory** to search saved information, edit messages/notes, or delete an item after confirmation. Retry question does not save a duplicate message. Questions stay labelled as messages; the app does not turn them into verified outcomes. AI replies do not overwrite source records.

**Editing and deleting memory:** choose Edit beside a saved message or feedback entry, change its text and save. Choose Delete to remove it. Document cards offer Add correction so the original source remains intact. Deleting feedback leaves its source service/document card in place. Completed changes affect subsequent AI answers; already displayed answers remain a record of that earlier conversation.

**New conversation** clears this conversation and selected card. Saved cards and notes remain. The full chat transcript is not stored. Later questions retrieve relevant saved information again. This uses your saved records; it does not train the AI model or read your ChatGPT Memory.

## Which model is answering?

The app uses OpenAI’s hosted models through your ChatGPT connection. After the first AI answer or choosing a model, its name appears under **Ask your assistant**. Use **Connection & backup → Choose an available AI model** to see the options your account permits. The app initially prefers an available mini/instant model. It does not copy the model selected in a separate ChatGPT chat. The English speech model only transcribes your voice.

## Files and updates

Supported: **.xlsx, .csv, .tsv, .docx, searchable .pdf, .txt, .md**. Limits: 20 MB per file, 5,000 extracted cards, 100 table columns, 300 PDF pages. Split larger files. Convert older .xls or .doc files first. Scan-only PDFs need OCR before import. Images, embedded objects and Word formatting are not imported.

Excel/CSV tables should have a clear header row followed by records. One row becomes one card, with its worksheet and row number. Named contacts appear only when a contact-name column exists; otherwise listed phone numbers or emails are shown. Check source details before relying on them.

Identical files do not create duplicate document cards. A revised spreadsheet with the same filename and unique IDs or names offers **Update existing document**. Matching cards keep their notes even when rows move. Removed rows are retained as previous rows. When unique keys are ambiguous, save a separate version to preserve the existing information. Source content is read-only; add a correction note or reimport the revised source.

Calculations use imported numeric cell values. Excel formulas are not executed or recalculated: only their last saved results are used, with a warning. Missing results remain missing. Calculation answers show matched row counts and exclude nonnumeric values. PDF text is not treated as a reliable spreadsheet table.

## Private memory and backups

Each ChatGPT connection has its own local records. Other app users do not receive your documents or notes. Different computers and Windows accounts have separate storage. There is no shared team database or automatic cross-computer synchronization.

You may import before sign-in in the **Starter workspace**. After sign-in, open **Connection & backup → Copy starter cards into this account**. This is an explicit private copy. Signing out keeps that account's cards for a verified reconnect and shows the separate starter workspace.

Use **Save a backup** to export all extracted information, cards and notes. Use **Restore a backup** on another computer to add them to the active workspace. Matching records are retained to avoid duplicates. Original files and credentials are excluded. Keep the backup private. Restoring does not erase current records.

Memory is normally in `%APPDATA%\Southlake Hive\documents.sqlite`; copied originals are in its `documents` subfolder. Credentials are separately encrypted in `account\chatgpt.auth` using Windows protected storage. The document database and backups are **not encrypted by the app**. Protect the Windows account and backups. Earlier v1.x files, including hive.sqlite and practice.sqlite, are preserved but are not converted into this new document workspace.

Only AI questions send your message and relevant saved text to OpenAI. Import, card search and note saving work without internet or ChatGPT. Sign-in does not give the app access to your ChatGPT chats or ChatGPT Memory. Keep patient identifiers out of this pilot, consistent with the project scope.

## Try this

Choose Manage memory and import the fictional sample from an empty memory list. Open **Example Community Rides**, add **“Practice note: call before referring.”**, and wait for the saved indicator. Start a new conversation, search for **Practice note**, and reopen the card. Close and reopen the app to check it again.

With an eligible ChatGPT connection, ask:

> Using my imported sample, compare the two North York transportation options. Show their contacts and source cards. Sum their Available slots and tell me how many rows you used. Do not treat these as real services.

Expected calculation: **7 slots across 2 matching rows**. Delete the test question from **Manage memory** afterwards if you do not want to retain it. If you imported before connecting, copy starter cards into your account first. Delete the fictional document through **Manage files** when finished.

Live ChatGPT sign-in and inference on the recipient's eligible account, and live microphone access, remain recipient checks. Automated local parser, persistence, calculation, account-isolation and simulated AI checks do not prove these live capabilities.

Official connection reference: https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt

## Updating from version 2.0

Close Southlake Hive before running the version 2.5 installer. Open **Southlake Care Navigation Support** afterwards. Existing documents, notes and saved connections stay in the same Windows app-data folder. The default page is now the full chat, and saved cards/notes are managed separately in Manage memory. The public directory is retained. Updates are installed using the new installer; there is no automatic updater. Back up your memory before changing computers.

## Select a service and record the result

Open **View details**. At the top, review **Your notes & results** before the provider details. The bottom has three actions:

- **Select this service** keeps it selected and takes you to **Contact & follow up**.
- **Ask more about this card** opens the assistant with this service selected.
- **Provider page** opens the listed provider website.

After contacting or trying the service, choose **Worked** or **Didn't work**, add an optional rating and comment, then choose **Save result**. You can also use these buttons beside the selected service in chat. Selecting or copying a contact does not save a result by itself.

The saved result appears at the top of the card and in **Manage memory**. Use **Edit** to change its result, rating or comment; use **Delete** to remove it after confirmation. Your service notes and summaries stay available in a new conversation and after reopening the app. Keep a backup when moving computers. Notes save automatically; the result form has its own Save result button.

## Full-page services and floating chat

Known services uses the whole page. Ask assistant sits in the upper-right of its heading, clear of the service rows. No chat is shown below the directory. The Ask assistant button in the upper-right of the Known services heading opens the assistant, and Ask assistant stays underneath View details on every service row. The panel can be minimized without clearing a draft or changing the directory filters. Open Workspace continues the same conversation in the full chat.
