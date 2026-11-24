# Care Navigation Support — Windows quick start

Open the **Care Navigation Support** Windows installer for your version and choose **Install**, then **Finish**. Open **Care Navigation Support** from your desktop or Start menu afterwards.

This installer supports Windows 10 version 2004 or later and Windows 11 on 64-bit Intel/AMD computers. It installs for the current Windows user. The pilot is unsigned. If Windows or your organization blocks it, ask your administrator to approve distribution. A signed publisher release is required for a routine Southlake rollout.

## Start in Workspace

Workspace opens as a full-width chat, with Add a document beside Speak. **Chat history** keeps your conversations and drafts. Use **Manage memory** for information you choose to keep for future reference.

## Known services are ready to browse

Use the [inventory and outcome guide](README.md#maintain-the-service-inventory-and-outcomes) to import an updated program list, confirm tracked outcomes and try the live ranking demo. **Needs details** identifies missing information on each card.

Open **Known services** on the left for 27 researched services in full-width horizontal rows. Category and search controls are at the top; the directory fills the page. The assistant opens only when requested, as a floating panel on the right. Open View details or choose Ask assistant on a row. Your saved average rating appears beside the program contact. A named person appears only when the source lists one. Otherwise use the listed phone/email. Confirm current eligibility, service area, fees and capacity with the provider. No past outcomes or success rates are preloaded.

Choose **Ask assistant** beneath View details, or **Ask more about this card** in its details, to open the floating assistant with that service selected. Use × or Escape to minimize it, or **Open Workspace** for the full chat. Type **Remember that …** to save a note on the selected service.

## Start with three steps

1. **Connect ChatGPT.** Sign in on the official OpenAI page in your browser, review identity and plan-usage permission, then return to the app. Use your own account. Account, workspace and app eligibility are decided by OpenAI; signing in alone does not prove AI usage is available. The app never switches to API billing.
2. **Add a document.** Use the button beside **Speak** at the bottom of the chat. Review the extracted cards and any warnings, then choose **Save cards**. Import happens on your computer. For a first look, choose **Manage memory → Try a sample spreadsheet** in the empty memory list. The sample contains no real services or contacts.
3. **Ask a question.** Matching source cards appear below the answer. Open one for its exact fields, contacts, source links and notes. **Ask about this card** makes it the conversation's selected source.

On a service card, choose **Add a note** near the top. Notes and corrections save automatically when you pause. Wait for **Saved on this card**. Choose **New note** for a separate entry. Closing the card or app also waits for a pending note to save.

Ordinary messages stay together in the conversation. To keep a note, type **Remember that intake asked for a Thursday callback.** If a card is selected, the note goes on that card. Otherwise it appears under **Personal notes**.

**Editing and deleting memory:** choose Edit beside a saved message or feedback entry, change its text and save. Choose Delete to remove it. Document cards offer Add correction so the original source remains intact. Deleting feedback leaves its source service/document card in place. Completed changes affect subsequent AI answers; already displayed answers remain a record of that earlier conversation.

**New chat** starts a separate discussion and selected-card context. Earlier case chats, drafts and saved records remain available. Conversations persist in this app; this does not train the AI model or read your ChatGPT Memory.

## Which model is answering?

The app uses OpenAI’s hosted models through your ChatGPT connection. It prefers **GPT-6.2 Astra** when available, followed by **GPT-6.2 Sol** or the first model returned for your account. Look under the chat title for the active model. Use **Connection & backup → Choose an available AI model** to select another model for the session.

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

## Updating the app

Close the current app and open the new installer. After installation, open **Care Navigation Support** from the desktop or Start menu. Your saved documents, notes, ratings, cases and connections are available in the same workspace. Use **Connection & backup** to move saved information to another computer.

## Add a service or spreadsheet

Choose **Add a service** at the top of chat, or ask “Could you help me add a service?” The form appears in the conversation. Pick a **Service area** from the dropdown, leave it blank, or choose **Other or multiple areas** to type your own. Use **More details** for fields such as organization, email and referral details. Enter any one detail and choose **Save service**. The confirmation is followed by **Close chat** to archive in Manage memory, **Continue chat** to stay in the conversation, and **Delete chat** to discard the conversation and its feedback. Your new card is saved in Known services.

In **Known services**, choose **Remove** on a row to hide it from the directory and future recommendations. Switch **Active services** to **Removed services**. Choose **Restore** to bring the card back with its history, or confirm **Delete permanently** to erase it and its saved notes, ratings and results from this workspace.

To load a spreadsheet, choose **Known services → Import services**. In the review, pick a row to check the program, coverage and contact details. Include the rows you want to save.

Known services lists **Services with recorded outcomes** first, followed by own and public services without outcomes. A blue **(Own source)** label identifies entries you added. Preloaded entries show **(Public source)**. See saved notes and results in **View details**.

## Keep a case conversation

1. Choose **New chat** for a separate conversation. A detailed ride request can become **Transportation in North York · Walker access**.
2. Use the search field under **New chat** to find a conversation by title. **Chat history** shows each conversation under **Feedback needed**, **No service selected**, or **Feedback recorded**, with the latest activity first within each group.
3. Open **⋯ → Record feedback** to jump to a pending result. Open **⋯ → Rename conversation** to type a new title or choose **Suggest a title**.
4. Click a conversation title to return to its messages and draft. Use **Earlier messages** to read older parts of the chat.

Service recommendations show matching **Own-source leads** first, even before you rate them, then **Public options**. Own leads with low ratings or mostly unsuccessful outcomes appear last with their saved history. Read each card’s short reason and **Confirm** check. Choose **View details → Why this rank**, or ask “How did you rank the options?” for the comparison.

### Keep or discard a conversation

Choose **⋯ → Add to memory library** to keep the complete conversation as one item. Find it under a linked organization or filter **Manage memory** to **Saved conversations**. Open the saved item to review its history. Choose **Reopen conversation** to continue it.

Choose **⋯ → Delete chat history** to discard a practice or inaccurate chat and its older automatic entries.

### When you’re finished

After the last pending result and any open note are saved, a separate assistant message comes into view at the end of the chat. It asks **What would you like to do next?**

- **Keep in chat history** leaves the chat in the sidebar.
- **Add to memory library** files the entire conversation as one item you can open later.
- **Delete chat and notes** permanently removes the conversation and feedback linked to it after you confirm. This includes the notes, results and ratings saved from that chat. Use Manage memory for any older standalone notes.

In **Chat history**, open the conversation’s **⋯** menu and choose **Finish conversation** to see the same choices at the end of the chat.

### Find an organization’s history

In **Manage memory**, search for the organization, service, or note. The organization card shows a short list of saved items. Use **Delete** beside a visible note or result to remove it. Choose **Expand history** to see older items and their dates, or to open, edit or delete one. Use **Add memory** to write a new note with an optional organization name.

### Correct a wrong rating or note

Look beneath the service follow-up for **Undo note**, **Undo result**, or **Undo rating change**, depending on what was saved. The matching **Redo** appears there after using Undo. Inside a text box, Ctrl+Z and Ctrl+Y still edit the text. Saving another change clears the redo option.

## Follow up from a service card in chat

1. Ask “I need transportation in North York for an older adult who uses a walker. Show me suitable service cards.”
2. Click a recommendation or **Use this service**. The listed phone and email appear under **Known contact** at the top. Choose **Add a note** and **Save note** to record information before or after a result. The note also saves to the provider card. **View details** opens the full card.
3. After trying the service, choose **Worked** or **Didn’t work**. Use **Not yet** to return later.
4. Add an optional note or rating and choose **Save result**. A blank note and rating are fine. **Finish later** keeps a draft with the topic. Saved feedback is also available on the service card.
5. If it didn’t work, choose **See other options** to return to the choices. Choose **New chat** when the subject changes. Reopen earlier chats from the sidebar.

You can type **I didn’t enjoy using the service** after choosing it or after saving one service in the current chat. The app saves **Didn’t work** on that card. Add a score with **Save rating**, or reply with a score such as **2/5** in the same chat. In a new chat, ask for matching services to see the updated ratings, or ask **What rating did I save for [service name]?**

## Record a result from Known services

Open **View details**. At the top, review **Your notes & results** before the provider details. The bottom has three actions:

- **Use this service** opens a follow-up card in chat with the listed phone and email.
- **Ask more about this card** opens the assistant with this service selected.
- **Provider page** opens the listed provider website.

After trying the service, choose **Worked** or **Didn’t work** in the chat. Add a note or rating if useful, then choose **Save result**. Use **Not yet** when a follow-up is still pending.

The saved result appears at the top of the card and in **Manage memory**. Use **Edit** to change its result, rating or comment; use **Delete** to remove it after confirmation. Your service notes and summaries stay available in a new conversation and after reopening the app. Keep a backup when moving computers. Notes save automatically; the result form has its own Save result button.

## Full-page services and floating chat

Known services uses the whole page. Ask assistant sits in the upper-right of its heading, clear of the service rows. No chat is shown below the directory. The Ask assistant button in the upper-right of the Known services heading opens the assistant, and Ask assistant stays underneath View details on every service row. The panel can be minimized without clearing a draft or changing the directory filters. Open Workspace continues the same conversation in the full chat.
