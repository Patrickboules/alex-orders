# PRD: Group Food Ordering Website

## 1. Introduction

A website that lets a group of about 50 people order food together from one restaurant.

Today, collecting orders from 50 people through chats is slow and error-prone: menus get passed around as photos, people's choices get lost, totals are calculated by hand, and it is hard to track who has paid.

This website solves that by:

1. Letting a small set of **admins** (the owner plus up to 3 others) quickly upload a restaurant's menu as photos, a PDF, or a link. An AI model (via the NVIDIA API) reads the menu and turns it into structured items and prices, which the admin reviews before publishing.
2. Letting admins open a **group order** for a restaurant and share its link.
3. Letting **participants** identify themselves with a name and phone number (no password, no SMS code), and choose their items.
4. When the admin closes the order, the system **regroups** everyone's items into one combined list to send to the restaurant, and gives each participant a **receipt** showing what they owe, payable in cash or by InstaPay (via the owner's QR code).
5. Letting admins mark each participant as **paid** on a dashboard.

The UI must be white, clean and minimalist.

**Tech stack:** Next.js (App Router, TypeScript), MongoDB, NVIDIA API (vision-language model) for menu parsing.

### Glossary

| Term | Meaning |
|---|---|
| Admin | One of up to 4 trusted people who upload menus, create group orders, close them, and track payments. |
| Participant | Anyone who joins a group order and picks items. Identified by name + phone. |
| Restaurant | A restaurant record with a name, optional logo/cover image, and a menu. Shown as a card. |
| Menu item | One orderable thing on a menu, with a name, price, category, and optional size/variant prices. |
| Group order | One ordering session for one restaurant. Status is `open` or `closed`. |
| Order line | One participant's choice: a menu item, variant (if any), quantity, and optional note. |
| Multiplier | A number the admin picks per group order (`1.14` or `1.26`) that is applied to every participant's subtotal to cover tax/service. |
| Regrouped order | The combined list of all items across all participants, with total quantities, used to place the order with the restaurant. |

## 2. Goals

- An admin can go from "I have a menu photo/PDF/link" to a published, orderable menu in **under 3 minutes** for a typical menu (≈ 50–100 items).
- A participant can open the link, identify themselves, pick items and submit in **under 2 minutes**, on a phone.
- Support **50 concurrent participants** on one group order without errors or lost choices.
- Each participant's receipt total is calculated automatically and correctly, including the chosen multiplier.
- Admins can see at a glance who has paid and who hasn't.

## 3. User Stories

Stories are ordered roughly in build order. Each should fit into one focused session.

### Foundation

### US-001: Project setup

**Description:** As a developer, I need a working Next.js + MongoDB project so that features can be built on top of it.

**Acceptance Criteria:**

- [ ] Next.js (latest stable, App Router, TypeScript, Tailwind CSS) app created at the repo root, replacing the placeholder Python files (`main.py`, `pyproject.toml`, `.python-version`).
- [ ] MongoDB connection helper in `lib/db.ts` that reuses a single client across hot reloads in development.
- [ ] `.env.example` lists every required variable: `MONGODB_URI`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `INSTAPAY_QR_URL` (or path), `INSTAPAY_HANDLE`, `BLOB_READ_WRITE_TOKEN` (file storage for uploaded menus).
- [ ] `npm run dev` starts the app and the home page loads.
- [ ] Typecheck/lint passes.

### US-002: Data models

**Description:** As a developer, I need defined data shapes for restaurants, group orders, participants and order lines so that all features store data consistently.

**Acceptance Criteria:**

- [ ] TypeScript types and MongoDB collections exist for: `admins`, `restaurants`, `participants`, `groupOrders`, `orderLines` (see section 7, Data Model).
- [ ] Indexes created: unique `participants.phone`; `orderLines` on `{ groupOrderId, participantId }`; `groupOrders` on `status`.
- [ ] Prices are stored as integers in **piasters** (1 EGP = 100 piasters) to avoid floating-point errors.
- [ ] Typecheck/lint passes.

### US-003: Admin login

**Description:** As an admin, I want to log in to a private area so that only trusted people can upload menus and manage orders.

**Acceptance Criteria:**

- [ ] `/admin/login` page with phone number + password fields.
- [ ] Admin accounts are created by a seed script (`npm run seed:admin -- --name "..." --phone "..." --password "..."`). There is no public sign-up.
- [ ] The system allows at most 4 admin accounts. The seed script refuses to create a 5th.
- [ ] Passwords are hashed with bcrypt (or argon2). They are never stored in plain text.
- [ ] On success, a random token is saved on the admin record and set in an HTTP-only `admin_token` cookie, and the admin is redirected to `/admin`. There is no session secret or signed session.
- [ ] Wrong credentials show "Incorrect phone or password" without saying which one was wrong.
- [ ] Every `/admin/*` page and admin API route returns a redirect (pages) or 401 (API) when no valid admin session exists.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Restaurants & menus

### US-004: Create a restaurant

**Description:** As an admin, I want to add a restaurant with a name and image so that it appears as a card on the site.

**Acceptance Criteria:**

- [ ] `/admin/restaurants/new` form with: name (required), phone (optional), cover image upload (optional).
- [ ] Saving creates the restaurant with menu status `empty` and redirects to its menu upload page.
- [ ] `/admin/restaurants` lists all restaurants as cards (image, name, number of menu items, menu status).
- [ ] Admin can edit the name/phone/image and delete a restaurant. Delete asks for confirmation and is blocked if the restaurant has an `open` group order.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-005: Upload a menu (photos, PDF, or link)

**Description:** As an admin, I want to upload a menu as photos, a PDF, or a link so that I don't have to type it in.

**Acceptance Criteria:**

- [ ] The menu upload page has three tabs: **Photos**, **PDF**, **Link**.
- [ ] Photos: drag-and-drop or pick multiple images (JPG, PNG, WEBP, HEIC). Max 10 images, 10 MB each. On mobile, the picker allows using the camera.
- [ ] PDF: one PDF file, max 20 MB, max 15 pages.
- [ ] Link: a URL text field. The server fetches the page. If the URL points directly to an image or PDF, it is treated as that file type.
- [ ] Files that are too large, the wrong type, or links that fail to load show a clear error message saying which file failed and why.
- [ ] After a successful upload, the admin sees a "Parsing menu…" state with a progress indicator (e.g. "Page 2 of 5").
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-006: Parse the menu with the NVIDIA API

**Description:** As an admin, I want the menu to be read automatically so that items and prices are filled in for me.

**Acceptance Criteria:**

- [ ] A server-side function `parseMenu(input)` sends each image (or each PDF page rendered to an image) to the NVIDIA API vision model set in `NVIDIA_MODEL`, authenticated with `NVIDIA_API_KEY`.
- [ ] For links to HTML pages, the page's visible text is extracted and sent to the model as text (with any large menu images on the page sent as images).
- [ ] The model is asked to return **JSON only**, matching this shape:
  ```json
  {
    "categories": [
      {
        "name": "Burgers",
        "items": [
          {
            "name": "Classic Burger",
            "description": "Beef patty, cheese, lettuce",
            "price": 150,
            "variants": [
              { "name": "Single", "price": 150 },
              { "name": "Double", "price": 210 }
            ]
          }
        ]
      }
    ]
  }
  ```
- [ ] The response is validated with a schema (e.g. Zod). If it is invalid JSON, the request is retried once. If it fails again, that page is marked "Could not read" and the others continue.
- [ ] Pages are processed in parallel (max 4 at a time) so that a 5-page menu finishes in under 60 seconds in normal conditions.
- [ ] Results from all pages are merged. Categories with the same name are combined.
- [ ] Arabic and English menus are both supported. Item names are kept in the language they appear in.
- [ ] The API key is used on the server only and never sent to the browser.
- [ ] The parsed result is saved as a **draft** menu. It is not visible to participants yet.
- [ ] Typecheck/lint passes.

### US-007: Review and edit the parsed menu

**Description:** As an admin, I want to review and fix the parsed menu before publishing so that prices and names are correct.

**Acceptance Criteria:**

- [ ] The review page shows the original upload (images/PDF pages) side by side with the editable parsed menu on desktop, and stacked on mobile.
- [ ] Admin can: edit any category name, item name, description, price or variant; add or delete items, variants and categories; drag to reorder categories and items.
- [ ] Items with a missing or zero price are highlighted, and publishing is blocked until they are fixed.
- [ ] A **Publish menu** button sets menu status to `published`. A published menu can be edited again later, and the changes apply to new order lines only.
- [ ] A **Re-upload** button replaces the draft with a new parse, after a confirmation prompt.
- [ ] Changes are saved when the admin clicks **Save draft** or **Publish**. Leaving the page with unsaved changes shows a browser warning.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: Public restaurant cards

**Description:** As a visitor, I want to see restaurants as cards on the home page so that I can browse menus and find open group orders.

**Acceptance Criteria:**

- [ ] The home page (`/`) is public and needs no login.
- [ ] It shows a grid of cards: one per restaurant with a published menu. Each card shows the image (or a neutral placeholder), name, and an "Order open" badge if the restaurant has an open group order.
- [ ] Clicking a card opens `/r/[restaurantId]`, showing the read-only menu grouped by category. If a group order is open for it, a prominent "Join order" button links to that order.
- [ ] Grid layout: 1 column on phones, 2 on tablets, 3–4 on desktop.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Group orders

### US-009: Create a group order

**Description:** As an admin, I want to start a group order for a restaurant so that people can join and pick their items.

**Acceptance Criteria:**

- [ ] On a restaurant with a published menu, an admin clicks **Start group order**.
- [ ] Form fields:
  - Title (optional, default "<Restaurant> – <date>")
  - Multiplier: a required choice between **1.14** and **1.26**, default 1.14
- [ ] On save, a group order with status `open` is created and the admin sees a share link (`/o/[shortCode]`) with a **Copy link** button and a QR code of the link.
- [ ] Multiple group orders can be open at the same time, each for a different restaurant. A restaurant can have only one open group order at a time.
- [ ] The admin can change the multiplier while the order is open and after it is closed. Receipts recalculate immediately.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-010: Participant identification

**Description:** As a participant, I want to identify myself with just my name and phone number so that I can order quickly without creating an account.

**Acceptance Criteria:**

- [ ] When opening `/o/[shortCode]` for the first time on a device, the participant sees a short form: **Name** and **Phone number**.
- [ ] Phone is validated as an Egyptian mobile number (`01` + 9 digits, e.g. `01012345678`). `+20` or `0020` prefixes are accepted and normalized to the `01…` form.
- [ ] If the phone already exists, the existing participant record is reused and the name is updated to the latest entry.
- [ ] A long-lived (1 year), HTTP-only `participant_token` cookie stores the participant's random token (saved on the participant record), so returning on the same device skips the form.
- [ ] A small "Not you? Switch" link clears the cookie and shows the form again.
- [ ] There is no SMS verification and no password.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-011: Choose items

**Description:** As a participant, I want to pick items from the menu so that my order is added to the group order.

**Acceptance Criteria:**

- [ ] The order page shows the restaurant name, the menu by category, and a sticky category bar for jumping between sections.
- [ ] A search box filters items by name as you type.
- [ ] Tapping an item opens a sheet with: variant picker (if the item has variants), a quantity stepper (min 1, max 20), an optional note field (max 140 characters, e.g. "no onions"), and **Add**.
- [ ] A sticky bottom bar shows the participant's item count and subtotal, and opens their cart.
- [ ] In the cart, participants can change quantity, edit notes, or remove lines.
- [ ] Every change is saved to the server immediately. Refreshing the page or opening it on another device with the same phone shows the same cart.
- [ ] Once the order is `closed`, the page becomes read-only and shows "This order is closed" plus the participant's receipt.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-012: Close the group order

**Description:** As an admin, I want to close the group order when everyone has picked so that no more changes can be made.

**Acceptance Criteria:**

- [ ] The admin order page (`/admin/orders/[id]`) shows a live list of participants with their item counts and subtotals. It refreshes at least every 10 seconds.
- [ ] A **Close order** button asks for confirmation, then sets the status to `closed` and saves `closedAt`.
- [ ] After closing, all participant add/edit/remove requests for that order are rejected by the server (HTTP 409) with the message "This order is closed".
- [ ] The admin can **Reopen** a closed order (with confirmation) if someone was missed.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-013: Regrouped order for the restaurant

**Description:** As an admin, I want all items combined into one list so that I can place a single order with the restaurant easily.

**Acceptance Criteria:**

- [ ] The admin order page has a **Regrouped** tab that combines identical lines (same item + same variant) and shows total quantity, unit price and line total. Example: if 3 people order "Classic Burger – Double" (1, 2 and 1), it shows **4 × Classic Burger – Double**.
- [ ] Lines with notes are listed under their combined item with the person's name, e.g. "Ahmed: no onions".
- [ ] Items are grouped by menu category, in menu order.
- [ ] The bottom shows: items subtotal, multiplier, and grand total.
- [ ] A **Copy as text** button copies a plain-text version that can be pasted into WhatsApp to send to the restaurant.
- [ ] A **By person** tab shows each participant's lines and totals.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Receipts & payment

### US-014: Receipt calculation

**Description:** As a developer, I need one function that calculates each participant's amount owed so that receipts and the admin dashboard always match.

**Acceptance Criteria:**

- [ ] Pure function `calculateReceipts(groupOrder, orderLines)` in `lib/receipts.ts` returns, for each participant: lines, subtotal, and total.
- [ ] Formula (all amounts in piasters):
  1. `subtotal` = sum of (unit price × quantity) of the participant's lines.
  2. `total` = `subtotal × multiplier` (1.14 or 1.26), rounded **up** to the nearest whole EGP (100 piasters).
- [ ] There is no delivery fee. Each person pays only for their own items times the multiplier.
- [ ] Worked example (put in the unit tests): multiplier 1.14: A orders 100 EGP and pays **114 EGP**. B orders 200 EGP and pays **228 EGP**. With multiplier 1.26: A pays **126 EGP**. A 37.50 EGP order at 1.14 = 42.75, which rounds up to **43 EGP**.
- [ ] Participants with zero items are excluded and owe 0.
- [ ] Unit tests cover: the worked example, multiplier 1.26, a single participant, and rounding.
- [ ] Typecheck/lint passes.

### US-015: Participant receipt with payment options

**Description:** As a participant, I want to see a receipt of what I owe and how to pay so that I can settle up quickly.

**Acceptance Criteria:**

- [ ] Once the order is closed, the participant's page at `/o/[shortCode]` shows a receipt: restaurant, date, each line (qty × name – variant, line price), subtotal, "Tax & service (×1.14)" (or ×1.26), and **Total to pay** in large type.
- [ ] While the order is still open, an estimated receipt is shown, labelled "Estimate – final after order closes".
- [ ] Below the total there are two payment options:
  - **Cash**: the text "Pay [total] EGP in cash to [admin name]".
  - **InstaPay**: the owner's InstaPay QR code image (from `INSTAPAY_QR_URL`), the InstaPay handle with a copy button, and the exact amount.
- [ ] The receipt shows the payment status: "Unpaid" or "Paid ✓".
- [ ] A participant can only see their own receipt. Requesting another participant's receipt returns 403.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-016: Admin payment tracking

**Description:** As an admin, I want to mark who has paid so that I know who still owes money.

**Acceptance Criteria:**

- [ ] The admin order page has a **Payments** tab listing each participant: name, phone (tap to call / WhatsApp link), total owed, method (Cash / InstaPay / –), and a **Paid** toggle.
- [ ] Toggling Paid on asks for the method (Cash or InstaPay) and saves `paidAt` and `paidMethod`. Toggling off clears them.
- [ ] A summary at the top shows: "X of Y paid · collected [amount] EGP · outstanding [amount] EGP".
- [ ] Filter buttons: All | Unpaid | Paid.
- [ ] If the multiplier changes after someone is marked paid, their row shows a warning "Amount changed since payment".
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-017: Admin dashboard

**Description:** As an admin, I want a single dashboard so that I can see all restaurants and orders in one place.

**Acceptance Criteria:**

- [ ] `/admin` shows: open group orders (restaurant, participant count, running total, link to manage), recently closed orders with paid/unpaid counts, and a link to Restaurants.
- [ ] A **New restaurant** shortcut button is visible.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## 4. Functional Requirements

**Access & identity**

- FR-1: The system must support up to 4 admin accounts, created only by a seed script and logged in with phone + password.
- FR-2: All `/admin` pages and admin APIs must require a valid admin session.
- FR-3: Participants must identify themselves with name + Egyptian mobile number only, with no verification. The phone number is the unique identity.
- FR-4: The participant identity must be remembered on the device with a long-lived HTTP-only cookie.

**Restaurants & menus**

- FR-5: Admins must be able to create, edit and delete restaurants.
- FR-6: Admins must be able to upload a menu as up to 10 photos, one PDF (up to 15 pages), or a URL.
- FR-7: The system must parse uploaded menus into categories, items, descriptions, prices and variants using the NVIDIA API vision model, on the server only.
- FR-8: Parsed menus must be saved as drafts and must be reviewed, and published by an admin before participants can see them.
- FR-9: The system must block publishing while any item has a missing or zero price.
- FR-10: The public home page must show every restaurant with a published menu as a card.

**Group orders**

- FR-11: Admins must be able to create a group order for one restaurant, with a multiplier of exactly 1.14 or 1.26. There is no delivery fee.
- FR-12: A restaurant can have at most one open group order at a time.
- FR-13: Group orders stay open until an admin closes them manually. There is no automatic cutoff.
- FR-14: Participants must be able to add, edit and remove their own order lines only while the order is open. Changes are saved on the server immediately.
- FR-15: The server must reject participant changes to closed orders.
- FR-16: Admins must be able to reopen a closed order.
- FR-17: The system must produce a regrouped order (identical item+variant lines combined, notes listed by person), copyable as plain text.

**Receipts & payment**

- FR-18: Each participant's total must equal `subtotal × multiplier`, rounded up to the nearest EGP.
- FR-19: Receipt amounts must be calculated by a single shared function used by both the participant receipt and the admin dashboard.
- FR-20: The receipt must show both payment options: cash, and InstaPay with the owner's QR code, handle and exact amount.
- FR-21: Admins must be able to mark each participant as paid or unpaid with a method (Cash/InstaPay), and see paid/outstanding totals.

## 5. Non-Goals (Out of Scope)

- No online payment processing or automatic InstaPay confirmation. Payment is confirmed manually by admins.
- No SMS/OTP verification and no participant passwords.
- No multiple restaurants in a single group order.
- No automatic order cutoff time or reminders/notifications (SMS, WhatsApp, push, email).
- No sending orders to restaurants automatically. The admin copies the regrouped text and sends it themselves.
- No delivery fee and no delivery tracking.
- No public admin sign-up and no role levels among admins. All admins have equal powers.
- No menu item images or nutritional info.
- No per-item add-ons/extras beyond variants and a free-text note.
- No order history analytics or reports beyond the dashboard in US-017.
- No native mobile app. The website must work well in mobile browsers.

## 6. Design Considerations

- **Style:** white and minimalist. White background, near-black text (e.g. `#111`), one restrained accent color used only for primary actions and status badges, generous whitespace, thin 1px light-gray borders instead of heavy shadows, and rounded corners (8–12px).
- **Typography:** one clean sans-serif that supports Arabic and Latin (e.g. IBM Plex Sans Arabic, or Inter plus Noto Sans Arabic). Prices use tabular numbers so they line up.
- **Mobile-first:** most participants will use phones. Tap targets must be at least 44px. The cart bar and primary buttons are sticky at the bottom.
- **RTL:** item names in Arabic must display correctly (`dir="auto"` on text fields and item names).
- **Components:** shadcn/ui on Tailwind is a good fit (Card, Sheet, Dialog, Tabs, Toggle, Input) because it is minimal by default.
- **Key screens:** Home (restaurant cards) · Restaurant menu · Join form · Order page + cart · Receipt · Admin login · Admin dashboard · Restaurant list/edit · Menu upload · Menu review · Admin order page (Participants / Regrouped / By person / Payments tabs).
- **Empty states:** "No restaurants yet" on the home page, "Your cart is empty" in the cart, "No one has joined yet" on the admin order page.

## 7. Technical Considerations

**Stack**

- Next.js App Router with TypeScript and Server Actions / Route Handlers. Tailwind CSS + shadcn/ui.
- MongoDB with the official `mongodb` driver (or Mongoose). Use MongoDB Atlas for hosting.
- Deploy target: Vercel (or similar). The repo currently holds a placeholder Python project (`main.py`, `pyproject.toml`), which should be removed in US-001.

**Menu parsing (NVIDIA API)**

- Use NVIDIA's OpenAI-compatible endpoint (`https://integrate.api.nvidia.com/v1/chat/completions`) with `Authorization: Bearer $NVIDIA_API_KEY`.
- The model name comes from `NVIDIA_MODEL` so it can be swapped without code changes. Choose a vision-capable model from build.nvidia.com that handles Arabic text well, and test it on 3–5 real menus before committing.
- Images are resized server-side (max ~1600px on the long edge, using `sharp`) before sending, to reduce latency and cost.
- PDF pages are rendered to images server-side (e.g. `pdfjs-dist` or `pdf-to-img`). If a PDF has selectable text, that text can also be sent as context to improve accuracy.
- Link fetching: server-side `fetch` with a 15-second timeout and a 20 MB size limit. Only `http`/`https` URLs are allowed, and private/internal IP addresses are blocked, so the server cannot be tricked into fetching internal resources (SSRF).
- Parsing can take longer than default serverless timeouts. Either set a longer route `maxDuration`, or process pages one request at a time from the client and merge the results.
- Uploaded files are stored in object storage (e.g. Vercel Blob, S3 or Cloudinary), not in MongoDB, so they can be shown next to the parsed menu during review.

**Data model (suggested)**

```ts
admins       { _id, name, phone, passwordHash, createdAt }
restaurants  { _id, name, phone?, coverImageUrl?, menuStatus: 'empty'|'draft'|'published',
               menu: { categories: [{ id, name, items: [{ id, name, description?, price, variants?: [{ id, name, price }] }] }] },
               sourceFiles: [{ url, type: 'image'|'pdf'|'link' }], createdBy, updatedAt }
participants { _id, name, phone (unique, normalized 01XXXXXXXXX), createdAt }
groupOrders  { _id, shortCode (unique), restaurantId, title, status: 'open'|'closed',
               multiplier: 1.14|1.26, createdBy, createdAt, closedAt?,
               payments: [{ participantId, paidAt, paidMethod: 'cash'|'instapay', amountAtPayment }] }
orderLines   { _id, groupOrderId, participantId, itemId, variantId?, nameSnapshot, priceSnapshot (piasters),
               quantity, note?, createdAt, updatedAt }
```

- `nameSnapshot`/`priceSnapshot` keep each order line's name and price as they were when added, so later menu edits don't change existing orders.
- All money is stored in piasters (integers). It is only converted to EGP for display.

**Concurrency & performance**

- 50 people adding items at the same time is light load. Each line is its own document, so participants never overwrite each other.
- The admin live view polls every 5–10 seconds. WebSockets are not needed.
- The order page should load in under 2 seconds on a 4G phone.

**Security**

- The NVIDIA API key and MongoDB URI are server-only environment variables.
- Participant APIs check that the participant in the cookie owns the order lines they are editing.
- Rate-limit the join and add-line endpoints (e.g. 30 requests/minute per IP) to prevent spam.
- Share links use a random short code (8+ characters), not the MongoDB ID.

## 8. Success Metrics

- Menu upload → published takes under 3 minutes for a typical menu, and the AI gets at least 90% of item prices right before admin edits.
- A participant goes from opening the link to submitting in under 2 minutes on a phone.
- A full order with 50 participants completes with zero lost or duplicated items.
- Receipt totals match a manual calculation in 100% of test cases.
- Admins no longer use manual spreadsheets or chat tallies to track payments.

## 9. Open Questions

1. Rounding: is rounding each participant's total up to the nearest whole EGP acceptable, or should it be exact to the piaster?
2. Which admin name should appear on the "Pay in cash to …" line: the admin who created the order, or always the owner?
3. Should all admins share the owner's single InstaPay QR code, or should each admin be able to upload their own?
4. Which NVIDIA model performs best on Arabic and English restaurant menus? This needs a quick test with real menus.
5. Should participants be able to see who else has joined, or what others ordered? (This PRD assumes **no**: participants see only their own items.)
6. Are there participants who might share a phone number, e.g. ordering for a family member? If so, should one phone be allowed several named sub-orders?
