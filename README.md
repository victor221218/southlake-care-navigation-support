# Care Navigation Support

A Windows prototype that helps navigators turn spreadsheets and documents into searchable **memory cards**, ask questions in everyday language, and keep useful notes for future conversations.

**Status:** version 2.13.0 prototype. The Windows document readers and saved-card workflow have been tested. The installer is unsigned; real recipient ChatGPT access and Southlake deployment approval remain checks before routine field use.

The app, Windows shortcut and installer are named **Care Navigation Support**. Close the previous version before running the update. Version 2.13 uses the same Windows install and data locations.

## Download and start

### [Download the complete handoff package](https://github.com/victor221218/southlake-care-navigation-support/releases/download/v2.13.0/Care-Navigation-Support-Handoff-2.13.0.zip)

Everything needed to review the prototype in one download: the Windows installer, editable source files, user and developer guides, and the verification report.

| What you need | Open this |
| --- | --- |
| **Install and try the app** | [Windows installer](https://github.com/victor221218/southlake-care-navigation-support/releases/download/v2.13.0/Care-Navigation-Support-Setup-2.13.0.exe) |
| **Quick-start guide** | [Download the quick-start guide](https://github.com/victor221218/southlake-care-navigation-support/releases/download/v2.13.0/Windows-Quick-Start.html) or [read the full guide here](START-HERE.md) |
| **Download all deliverables** | [Complete handoff ZIP](https://github.com/victor221218/southlake-care-navigation-support/releases/download/v2.13.0/Care-Navigation-Support-Handoff-2.13.0.zip) |
| **Read or edit the code** | Browse the folders above; [start with the source map below](#source-code-map) |
| **Build or maintain the app** | [Windows development instructions](WINDOWS-DEVELOPMENT.md) |
| **Review test evidence and remaining checks** | [Release page and verification files](https://github.com/victor221218/southlake-care-navigation-support/releases/tag/v2.13.0) |

The public release can be downloaded without a GitHub account. Opening the installer is different from downloading source code: Use the installer to run the app or the source files for development.

## What the app and ChatGPT each do

**Care Navigation Support** is the Windows application. It imports files, creates source cards, stores personal notes, searches saved information, and manages backups.

**ChatGPT** supplies the AI that helps interpret questions and information, summarize records, and compare details. The app provides relevant saved text to the AI when you ask a question.

The current deliverable is a Windows app. To connect it to ChatGPT, open the app and choose **Continue with ChatGPT**. There is no separate plugin to install inside ChatGPT for this version, and no coding is needed to use the finished installer.

![Default full-width Workspace chat](docs/workspace.png)

## Known services are ready on first launch

The app opens in **Workspace**, with a full-width chat and document upload beside Speak. Each discussion keeps its own messages and draft. Choose **New topic** to start a separate conversation.

Choose **Known services** to browse the 27 researched pathways as full-width horizontal rows. Category filtering and search appear above the directory; the assistant opens in a floating panel on the right. Open View details for contact details, access requirements, source links and research dates, or choose Ask assistant beneath View details to open the floating chat with that provider selected. A named person appears only when listed in the public source. Confirm eligibility, boundaries, costs and current capacity before referring.

**Manage memory**, directly beneath Known services, groups saved history by organization. Search an organization, service or note. Each group shows a short bullet preview. Choose **Expand history** to see dated notes, results and saved conversations, with controls to open, edit or delete an item. Imported cards without an organization are grouped by file. Use **Add memory** to write a note and optionally name its organization.

![Known services with Ask assistant in the upper-right heading](docs/known-services.png)

Choose Ask assistant in the upper-right of the Known services heading, or beneath View details on a service row, to open the side panel. Minimize it with × or Escape to browse the whole directory again. Open Workspace continues the same conversation in the full chat. Drafts, the selected service and saved memory are retained.

![Floating assistant with the selected service](docs/floating-assistant.png)

### Compact choices and private case chats

Screenshots in this section use fictional practice documents and isolated feedback, not provider performance records.

Service recommendations show all returned cards together, without a separate written recommendation above or below them. Each card keeps its reason and important checks with the provider. Click a card for contact details, notes, ratings and provider links. There is no Show more choices or Read full response control. Long replies open at their first card; reading earlier messages keeps your place.

![Compact service choices](docs/compact-choices.png)

Choose **View details** to compare a provider’s coverage, access requirements and recorded history. Choose **Use this service** when you’re ready to follow up. The chat then shows the phone and email when listed, **Add a note**, and the choices **Worked**, **Didn’t work** and **Not yet**. Save the result with an optional note and rating.

![Known contact and a saved note in the topic](docs/chat-followup.png)

**Case chats** groups conversations under **Week of** labels. The latest chat activity comes first, with each week starting on Monday. Filter by **Feedback needed**, **No service selected**, or **Feedback recorded**. A selected service stays under **Feedback needed** until the result is saved.

Choose **New topic** for a separate discussion. A detailed request gets a short title such as **Transportation in North York · Walker access**. Open **⋯ → Rename conversation** to edit the name or ask for a suggestion. Select a chat to return to its messages, selected service, and draft. Use **Earlier messages** to read older parts of the chat.

![Weekly case chats with feedback status](docs/case-chats.png)

- **⋯ → Record feedback** jumps to the latest service that still needs a result, even if newer messages follow it.
- **⋯ → Add to memory library** keeps a useful conversation as one item. Find it under the linked organization or use **Manage memory → Saved conversations**. Open it and choose **Reopen conversation** to continue.
- **⋯ → Delete chat history** permanently discards a practice or inaccurate conversation and its older automatic entries.

When the last pending result and its notes are saved, the chat asks **What would you like to do next?** Choose **Keep chat open**, **Add to memory library**, or **Delete chat and notes**. The last option asks for confirmation and removes the conversation and its linked notes, ratings and results. Review older standalone notes in **Manage memory**. For other conversations, use **Case options → Finish conversation** to open the same choices.

![A saved conversation grouped under its organization](docs/case-library.png)

Use **Undo note** or **Undo result** directly beneath the follow-up card. The matching **Redo** control appears there after Undo. A rating change is labeled **Undo rating change**. Corrections affect the saved feedback linked to that card. The provider detail view also has its own correction controls. Text fields keep their normal typing shortcuts.

Services that match the search/category are ordered using the current user's saved experience. Lower average ratings appear later among matching options. Unrated services use a neutral position for ordering, without displaying a made-up rating; reported outcomes break ties. The actual average, sample count and notes remain visible. Eligibility and suitability still need confirmation. This is personal experience, not a provider-wide success measure.

### Use a service and record what happened

A service preview offers **Use this service**, **Ask more about this card**, and **Provider page**. **Use this service** opens the follow-up in chat, including when you select a service from the directory.

Your saved notes, reported results and optional ratings appear above Category and the provider facts. Known services also shows your latest note and a compact result summary above the category. These observations stay separate from the public provider information.

After following up, choose **Worked** or **Didn’t work** in the chat, add an optional rating and note, then choose **Save result**. Use **Not yet** to come back later.

![Service card with personal history above provider details](docs/service-card.png)

![Recording a result with an optional rating and explanation](docs/service-result-form.png)

Saved results can be edited or deleted on the card or in **Manage memory**. Summaries update after corrections, and results survive a new conversation, reopening the app and a memory backup/restore. Choose Add a note near the history heading for an ordinary note. Unsaved result drafts prompt before being discarded. Counts cover only explicit results recorded by the current user; they are not provider-wide success rates. Ratings are optional personal reports, not verified patient satisfaction.


![Review, edit and delete saved memory](docs/manage-memory.png)

The Ask assistant entry point is in the upper-right of the Known services heading, outside the service rows. Manage memory is directly beneath Known services in the sidebar.

## The workflow

| Step | What happens |
| --- | --- |
| **1. Install** | Open `Care-Navigation-Support-Setup-2.13.0.exe`, choose Install, then Finish. Later, open Care Navigation Support from the desktop or Start menu. |
| **2. Connect** | Choose Continue with ChatGPT. Sign in on OpenAI's page using your own ChatGPT account and review the requested permissions. Return to the app. |
| **3. Add a document** | Choose Add a document beside Speak at the bottom of the chat, select a file, review its preview and warnings, then Save cards. |
| **4. Ask a question** | Type a question, or Speak, Stop listening, review the transcript, and Send. Answers are text, with clickable source cards where relevant. |
| **5. Keep useful information** | Use **Add to memory library** to keep a whole conversation. Use **Remember that …** to save one note, or record a result from a service card. Search the organization in **Manage memory** and expand its history. |
| **6. Maintain and hand over** | Review the source and test report, verify the intended account/data flow, then continue development and approved deployment. |

### Example

Import a service spreadsheet, then ask:

> Which entries cover North York, and what contact details are listed? Show the source cards.

Choose a card to see the original fields, worksheet/row or page reference, any contact details and links supplied by the document, and your dated notes. The app does not invent a contact person when the source only lists a phone number.

## How memory works

- Imported information is stored as cards separately from the chat.
- **New topic** starts another chat with its own selected card and draft. Earlier cases stay in the sidebar.
- Ordinary chat turns stay together in Case chats. Type **Remember that …** to save a single note. When a card is selected, the note goes on that card.
- With a selected card, messages become notes on that card. Otherwise, they become personal message cards.
- Card notes save automatically when you pause. They can be edited or deleted using the controls on that card.
- Revised spreadsheets can update matching cards using unique IDs or names, keeping attached notes when rows move. Ambiguous matches require a separate version. Previous rows remain accessible through Manage files.
- Different ChatGPT connections use separate local records. Starter cards saved before sign-in can be explicitly copied into the active account using Connection & backup.
- Save a private backup to move extracted cards and notes to another computer. Original files and credentials are not included in those backups.

The assistant draws on more information as you save it. This is persistent retrieval from your records, not training a new AI model. The app cannot read your existing ChatGPT conversations or ChatGPT Memory.

**GitHub hosts the application code and downloads. It does not host or synchronize users' personal documents, cards, memory or credentials.**

## Supported computers and documents

- **Windows 10 version 2004 or later / Windows 11**, 64-bit Intel or AMD.
- **Excel `.xlsx`, CSV, TSV, Word `.docx`, searchable PDF, TXT and Markdown.**
- Up to 20 MB per file, 5,000 extracted cards, 100 table columns, or 300 PDF pages. Split larger documents.
- Older `.xls` and `.doc` files need conversion first. Scan-only PDFs need OCR before import. Images and embedded objects are not imported.
- Excel formulas use their saved cached results and are not recalculated. Calculations use imported numeric values and report matched/excluded rows. PDF text is not assumed to be a structured spreadsheet.
- English speech input is bundled. Hive does not read answers aloud.
- The **27 preloaded Known services cards** contain public provider research and dated source links. Capacity and eligibility must be confirmed with the provider. No success rates or user feedback are seeded. The optional sample and test fixtures are fictional and kept separate.

## Which AI model does the app use?

The app calls OpenAI’s hosted models through its Sign in with ChatGPT connection. It requests the models allowed for the connected account, initially prefers a model whose identifier includes `mini` or `instant`, and otherwise uses the first available model. **The active model is shown under Ask your assistant** after selection or the first AI request. Use **Connection & backup → Choose an available AI model** to inspect or change it. The model choice is retained for the current account session and resets on reconnect/account switching. It does not automatically match a model selected in a separate ChatGPT chat. No separate local LLM is bundled. The bundled English speech model converts voice to text only.

## ChatGPT account requirements

The prototype implements OpenAI's published **Sign in with ChatGPT** connection. Current documentation describes eligible **ChatGPT Plus and Pro** accounts for this kind of plan-powered AI access; Pro is not specifically required. A Free account is not documented as supporting this AI connection. A subscription alone does not establish that the app/workspace is admitted: verify the real connection before purchasing a plan for the pilot.

Document import, cards, search, notes and backups work without a paid ChatGPT connection. AI answers require internet and a permitted account/app connection. There is no silent switch to separately billed API usage, and no shared sponsor token or API key is included.

Official references: [Sign in with ChatGPT](https://developers.openai.com/siwc/quickstart) and [integration overview](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt).

## Files in the complete handoff ZIP

Extract the ZIP first, then open **START-HERE.html** inside the Care-Navigation-Support-Windows-2.13 folder.

| File or folder | What it is for |
| --- | --- |
| `START-HERE.html` | Links to the installer, guides and source overview within the extracted package |
| `Care-Navigation-Support-Setup-2.13.0.exe` | The normal per-user Windows installer; includes the app runtime, document readers and English speech model |
| `source/` | The original editable source files, tests, dependency versions, build scripts and required source assets |
| `documentation/Windows-Quick-Start.html` | Quick-start instructions |
| `documentation/Full-Guide.md` | Detailed usage, file limits, memory and backup instructions |
| `documentation/Administrator-Handoff.md` | Maintenance/distribution notes and remaining rollout checks |
| `Verification.json` | The test and installer-verification summary |
| `HANDOFF-MANIFEST.json` | File inventory and integrity hashes |
| `SHA256.txt` | SHA-256 checksums for the package's contents |

## Source code map

These files are for developers. End users do not need to open or run them.

| File or folder | What it does |
| --- | --- |
| `src/document-main.mjs` | Current app entry point: Windows window, file dialogs, local workspace boundaries and UI requests |
| `src/documents/parse.mjs`, `worker.mjs`, `importer.mjs` | Background document reading, import preview, limits and saving originals |
| `src/documents/services.mjs` | Preloaded public service cards, dated contact/source checks and repeat-safe initialization |
| `src/app-identity.mjs` | Current app name and preserved Windows data location |
| `src/documents/store.mjs` | Persistent source cards, comments, searches, spreadsheet calculations and backup/restore |
| `src/documents/case-followups.mjs`, `topic.mjs` | In-chat service selection, saved feedback drafts and short topic titles |
| `src/documents/assistant.mjs` | AI conversation, source lookup and calculation tools, kept messages and error handling |
| `src/auth.mjs` | ChatGPT sign-in, verified account identity and protected credential handling |
| `src/responses.mjs` | Streaming AI text/tool responses and confirmed completion handling |
| `src/database.mjs`, `drizzle/` | Local SQLite database persistence and schema migrations |
| `ui/documents.mjs`, `ui/documents.css` | Known services and personal workspace layout, card details, notes and conversation controls |
| `ui/voice.mjs`, `scripts/voice-assets.mjs` | English speech input and bundled speech worker |
| `assets/` | English voice model, sample/check files, supplied logo artwork, Windows icons and third-party notices |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Dependency versions and development commands |
| `scripts/build.mjs`, `scripts/package.mjs` | Compile and package the application resources |
| `scripts/prepare-windows.py`, `scripts/windows-installer.iss` | Stage the Windows runtime and create the installer |
| `tests/`, `scripts/prepare-document-smoke.mjs` | Automated checks and the isolated native Windows acceptance harness |
| `WINDOWS-DEVELOPMENT.md` | Developer prerequisites, runtime configuration, build steps and native test instructions |
| `START-HERE.md`, `SHARING.md`, `RELEASE-NOTES.md` | User, administrator and release documentation |

The active version 2.7 build uses the **document** entry points listed above. Earlier service-navigation modules and Mac packaging experiments remain as historical source. They are identified in BUILDING.md and are not the active Windows workflow.

## Build and run from source

Developers need Node.js 24 and pnpm 11.25.0. From the project directory:

```powershell
pnpm install --frozen-lockfile --node-linker=hoisted
pnpm build
pnpm test
pnpm start
```

Build before testing because the document tests execute the built background reader. Creating a distributable installer additionally needs Python, the matching official Windows Electron runtime and Inno Setup. Follow [WINDOWS-DEVELOPMENT.md](WINDOWS-DEVELOPMENT.md) for the exact configuration and commands.

The finished installer does not require these developer tools.

## What has been checked

- **105 automated checks passed**, including parsing, persistence, account separation, spreadsheet updates, backups, comment corrections, transaction rollback, simulated OAuth/AI behavior, service-result edits/deletions, rating summaries, older-database upgrades and backup compatibility.
- **Native Windows checks passed** for clean service previews, contact and feedback after selection, all three completion choices, confirmed deletion of linked notes, saved conversation reopening, memory search, and the existing document workflow.
- **77 extracted installer files matched** the prepared Windows application.
- Installer and handoff SHA-256 checksums are published in the release’s `SHA256.txt` and `Verification.json`.

### Remaining prototype checks

Real ChatGPT sign-in/eligibility/inference on the intended account, live microphone access on the recipient's computer, publisher signing and Southlake deployment review remain to be completed. Local and simulated tests do not establish those live capabilities. This is a prototype handoff, not a claim of clinical deployment approval.

## Data and handoff notes

Personal records normally live in `%APPDATA%\Southlake Hive\documents.sqlite`, with copied originals in the `documents` subfolder. Credentials are separately protected by Windows storage. The app does not encrypt its document database or exported memory backups; protect the Windows account and backups accordingly.

AI questions send the question and relevant saved text to OpenAI. File import and local card/note operations do not need an AI request. Keep patient identifiers out of pilot tests, consistent with the project scope.

No real user records, imported private documents, passwords or account credentials are included in this repository or its handoff downloads. Third-party components retain their original licenses and notices; the Vosk notices are included under assets and the built app includes collected dependency notices.

Repository administration can be transferred to the receiving technical team as part of the handoff. The downloads and original source are available together through the release page.
