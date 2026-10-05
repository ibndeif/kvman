# ADR 0013 — The UI review: answered questions, the Settings page, and the Arabic catalogs

The product owner used the `coder` preset in Arabic and asked for three things (2026-10-05): an answered `ask` question showed its JSON; the Arabic texts didn't fit the app; and the whole UI, the Settings page most of all, needed a pass. Decisions 2 to 5 were asked with mockups and each took the recommended option. The others are the smallest fix for what the review found; the product owner may overrule any of them.

## Decisions

1. **An answered question shows its answer.** The result of an `ask text`, `ask choice`, or `ask confirm` call is shown as an answered card instead of the call card: the question's prompt, then the answer. A choice lists every option with the chosen ones marked, and the "other" answer as a chosen line; a text question shows the text; a confirm shows Yes or No; a skipped question, and one that a message dismissed, shows "Skipped". It is read from the stored call (the question) and its result (the answer), so nothing stored changes. A failed `ask` call, `ask help`, and a result that isn't an answer keep the call card.
2. **One scope switch for the Settings page** (asked; chosen over a per-row "Set for this workspace only" link, and over the switch on every row). The page has one switch, "All workspaces | Only <workspace>", which starts on "All workspaces". A change is stored in the page's scope when the key has it, and globally otherwise.
   - While the page is on "All workspaces", a key whose value comes from this workspace is shown disabled, with "<workspace> has its own value. Switch to <workspace> to change it.": `kernel.settings.list` gives the value in effect, and editing a value that isn't in effect would show nothing.
   - While the page is on the workspace, a key with only the global scope says "The same in every workspace."
   - A key whose value is set in the scope being edited shows "Changed" (or "Changed for <workspace>") and its reset.
3. **A setting is saved as it changes** (asked; chosen over the Save button). A select or a checkbox saves on change; a text, number, lines, or JSON field saves on Enter (a single-line field) or when the person leaves it. A value equal to the one in effect isn't sent. A saved row shows "Saved" for 3 seconds. A value kvman rejects stays in the field with the first issue under it, and shows no toast; any other failure shows the usual toast.
4. **Choices are named in the person's language** (asked; chosen over raw values). A select option whose value is a string shows the catalog text `<key>.options.<value>` when there is one, else the value. `kernel.language` is a select of the languages the loaded catalogs have (`kernel.health.get`), each named in itself. The catalog keys are a convention of the Settings page only: nothing requires them.
5. **A setting's key is shown on demand** (asked; chosen over a collapsed "Advanced" part, which needed a new flag on settings, and over keys under every description). A row's "Details" holds the key and where the value comes from. The mockup also showed the default value; `kernel.settings.list` doesn't give it, and no field was added for it.
6. **The Settings page has a search box.** It filters by a setting's title, description, or key, ignoring case; a group with no match is hidden, with its link, and "No setting matches." shows when nothing is left. The Secrets section shows only while the box is empty.
7. **The welcome chat's title has its own key.** `kvcoder.welcome.title` was both the title of the setting `kvcoder.welcome` and the welcome chat's title, so the Settings page named the setting "Welcome to kvman Coder". The chat's title is now `{ key: 'kvcoder.ui.welcomeChat' }`, and `kvcoder.welcome.title` is "Welcome note". A welcome chat stored before this change shows "Welcome note" as its title; no bundled preset sets `kvcoder.welcome`.
8. **Names keep their direction.** On the Extensions page, a package name, a version, a source, and a command, query, setting, or handler name are left-to-right runs of their own (`dir="ltr"`), so `@kvman/kvai` no longer shows as `kvman/kvai@` in Arabic.
9. **Settings are described in plain words.** The catalog descriptions of the settings a person changes no longer say `null`, `kvai.complete`, or "session"; the English description in each registration, which extension authors read, is unchanged.
10. **The Arabic glossary.** Every Arabic catalog was reviewed against the screens. One term has one translation:

    | English | Arabic | Was |
    |---|---|---|
    | turn | جولة | دور |
    | token | توكن | رمز |
    | shell | الطرفية | الصدفة |
    | prompt (system prompt) | تعليمات النظام | موجّه النظام |
    | artifact | مخرج، المخرجات | مستند |
    | output (of a call) | الناتج | المخرجات |
    | plan (a paid subscription) | اشتراك | خطة |
    | API key | مفتاح API | مفتاح واجهة برمجية |
    | extension | إضافة | إضافة and امتداد |
    | browser tab | تبويب | لسان and تبويب |
    | the caller | المستدعي | المتصل |
    | worker | خيط عمل | عامل |
    | idle (a chat) | جاهزة | متوقفة |
    | Home (the workspace) | الرئيسية | المنزل |
    | helper, subagent | وكيل مساعد، وكيل فرعي | مساعد |

    Buttons and menu items are verbal nouns (حفظ، إلغاء، سماح، رفض، نسخ، إرسال), sentences that address the person stay imperative, a count comes after a colon instead of forcing a plural (`النماذج: 12`), digits are Western, and a Latin word after و has a space or is reworded.
11. **Small fixes to the question card.** Enter in a text question sends the answer, and a chosen option is outlined.
12. **Text takes its own direction.** Each block of rendered Markdown (a paragraph, a heading, a list and its items, a quote, a table) has `dir="auto"`, and so has a person's message, so an English answer in the Arabic app no longer shows as `.Done`; a code block is always left to right.

## Consequences

- Plan 02 §2.11, plan 06 §6.4, §6.6, and §6.7, and plan 08 §8.1 and §8.7 are corrected.
- The scenarios are in `milestones/QA20-TEST-CASES.md`. The Settings tests of M2.2 and QA 1 are rewritten for the new page and keep their ids.
- Changesets: `@kvman/kvcoder`, `@kvman/kvwebui`, `@kvman/kvai`, `@kvman/kvcustomizer`, and `@kvman/testkit` (its localization guide).
