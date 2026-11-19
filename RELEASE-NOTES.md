# Southlake Care Navigation Support 2.7.0 — service replies as cards

- Service recommendations show all returned cards together. Separate recommendation paragraphs, Read full response and Show more choices are removed.
- Each AI-selected card holds its short reason and important eligibility, accessibility or availability checks. Cards open the existing details, personal history and provider links.
- The assistant’s read-only presentation tool validates source IDs and formats only chosen candidates. It never records an outcome or rating. Personal-history ranking remains in place among relevant choices.
- The card reasons and checks stay with their case reply across restart and memory-backup restore. Earlier saved service replies also use the cards-only layout.
- Long replies open at their first card. General document answers, questions, calculations and connection errors remain readable in answer cards. Retry, case chats, selected services, saved notes and Undo/Redo remain available.

## Install or update

Close the current app and run **Southlake-Care-Navigation-Support-Setup-2.7.0.exe**. The existing Windows installation identity and data location are retained. This update adds presentation fields to existing case-message JSON; it does not replace the database. Cards, notes, ratings and cases created with version 2.6 remain available. Use a memory backup when moving computers. Transcripts from versions before 2.6 were not persisted and cannot be recovered.

## Validation and scope

105 automated checks passed, including card selection/validation, six-card delivery, reason/check persistence, backup remapping and case-scoped source hydration. Native Windows checks verify the all-card layout, no standalone recommendation text, checks inside cards and opening at the first card, plus existing cases, ranking, saved feedback and Undo/Redo. The installer’s extracted runtime files are compared byte-for-byte with the packaged build; details are in Verification.json. Documentation screenshots use isolated practice records.

Unsigned prototype. Real recipient ChatGPT sign-in/eligibility/inference, live microphone capture on that computer, publisher signing and Southlake deployment approval remain separate checks. Public-provider information and source-review dates are unchanged. No private user records or credentials are included in the download. There is no automatic updater.
