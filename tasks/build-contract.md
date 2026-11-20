# Build Contract

Five agents build this app in parallel, in one working tree. The product spec is `tasks/prd-group-ordering.md`, and this file decides **who owns which files** and **the function signatures between modules**. Shared domain types live in `lib/types.ts`. Do not change them without a strong reason; if you must, only *add* fields.

Stack: Next.js 16 (App Router, read `node_modules/next/dist/docs/` before using APIs: this version has breaking changes), React 19, Tailwind 4, TypeScript, `mongodb` driver, `zod`, `bcryptjs`, `nanoid`, `sharp`, `unpdf`, `@vercel/blob`, `vitest`.

## Auth simplification (overrides PRD US-003 / US-010 / FR-4)

- No `SESSION_SECRET` and no signed sessions.
- **Admin:** logging in with phone + password (bcrypt) creates a random token (`nanoid(32)`), saves it on the admin doc (`token`), and sets an HTTP-only cookie `admin_token`. `getCurrentAdmin()` looks up the admin by that token. Logout clears the token.
- **Participant:** joining with name + phone creates (or reuses by phone) a participant with a random `token` and sets an HTTP-only cookie `participant_token`, valid for 1 year. `getCurrentParticipant()` looks the participant up by that token. When a participant re-joins on a new device with the same phone, the existing token is reused.

## Ownership

| Agent | Owns (only writes these) |
|---|---|
| **1. DB structure** | `lib/db.ts`, `lib/db/collections.ts`, `lib/db/indexes.ts`, `lib/db/schemas.ts`, `scripts/` (seed + init-indexes), `package.json` scripts `seed:admin` and `db:init` |
| **2. DB API (data access)** | `lib/data/*.ts` (repositories) |
| **3. Parsing flow** | `lib/parse/**`, `app/api/parse/**` |
| **4. Backend logic** | `lib/auth.ts`, `lib/money.ts`, `lib/phone.ts`, `lib/receipts.ts`, `lib/regroup.ts`, `lib/storage.ts`, `lib/actions/*.ts` (Server Actions), `lib/**/*.test.ts` for its modules, `vitest.config.ts`, `package.json` script `test` |
| **5. Frontend** | `app/**` (except `app/api/parse/**`), `components/**`, `app/globals.css`, `public/` |

Nobody else edits `package.json` dependencies. If you need a new package, install it with `npm i` and say so in your final report.

## Module contracts

### Agent 1: `lib/db.ts` and `lib/db/collections.ts`

```ts
// lib/db.ts
export async function getDb(): Promise<Db>; // cached MongoClient (globalThis in dev), db name from the URI or "alex-orders"

// lib/db/collections.ts
export async function admins(): Promise<Collection<AdminDoc>>;
export async function restaurants(): Promise<Collection<RestaurantDoc>>;
export async function participants(): Promise<Collection<ParticipantDoc>>;
export async function groupOrders(): Promise<Collection<GroupOrderDoc>>;
export async function orderLines(): Promise<Collection<OrderLineDoc>>;

// lib/db/indexes.ts
export async function ensureIndexes(): Promise<void>; // idempotent
```

`lib/db/schemas.ts` holds zod schemas for `Menu` (`menuSchema`) and the inputs to every write (`restaurantInputSchema`, `groupOrderInputSchema`, `orderLineInputSchema`, `joinInputSchema`). Prices in these schemas are piasters (integers ≥ 0).

### Agent 2: `lib/data/*`

All functions are server-only (`import "server-only"`), take and return plain types (string ids in, docs out), and never check auth themselves (the actions do that).

```ts
// lib/data/admins.ts
findAdminByPhone(phone): Promise<AdminDoc | null>
findAdminByToken(token): Promise<AdminDoc | null>
setAdminToken(adminId, token | null): Promise<void>
countAdmins(): Promise<number>
createAdmin({ name, phone, passwordHash }): Promise<AdminDoc>
listAdmins(): Promise<AdminDoc[]>

// lib/data/restaurants.ts
listRestaurants(): Promise<RestaurantDoc[]>
listPublishedRestaurants(): Promise<RestaurantDoc[]>
getRestaurant(id): Promise<RestaurantDoc | null>
createRestaurant({ name, phone?, coverImageUrl?, createdBy }): Promise<RestaurantDoc>
updateRestaurant(id, { name?, phone?, coverImageUrl? }): Promise<void>
deleteRestaurant(id): Promise<void>
saveDraftMenu(id, menu, sourceFiles): Promise<void>      // menuStatus -> "draft" unless already published
saveMenuEdits(id, menu): Promise<void>                     // updates draftMenu
publishMenu(id): Promise<void>                             // menu = draftMenu, menuStatus "published"

// lib/data/participants.ts
findParticipantByToken(token): Promise<ParticipantDoc | null>
upsertParticipantByPhone({ name, phone }): Promise<ParticipantDoc> // reuses token, updates name
getParticipantsByIds(ids): Promise<ParticipantDoc[]>

// lib/data/groupOrders.ts
createGroupOrder({ restaurantId, title, multiplier, createdBy }): Promise<GroupOrderDoc> // generates shortCode
getGroupOrder(id): Promise<GroupOrderDoc | null>
getGroupOrderByShortCode(code): Promise<GroupOrderDoc | null>
getOpenOrderForRestaurant(restaurantId): Promise<GroupOrderDoc | null>
listOpenGroupOrders(): Promise<GroupOrderDoc[]>
listRecentClosedGroupOrders(limit): Promise<GroupOrderDoc[]>
setGroupOrderStatus(id, status): Promise<void>             // sets/clears closedAt
updateGroupOrder(id, { title?, multiplier? }): Promise<void>
setPayment(id, participantId, { paidMethod, amountAtPayment } | null): Promise<void>

// lib/data/orderLines.ts
listLinesForOrder(groupOrderId): Promise<OrderLineDoc[]>
listLinesForParticipant(groupOrderId, participantId): Promise<OrderLineDoc[]>
addLine(input: Omit<OrderLineDoc, "_id" | "createdAt" | "updatedAt">): Promise<OrderLineDoc>
updateLine(lineId, participantId, { quantity?, note? }): Promise<boolean>  // false if not owner
removeLine(lineId, participantId): Promise<boolean>
countParticipantsInOrder(groupOrderId): Promise<number>
```

### Agent 3: parsing

```ts
// lib/parse/index.ts
export async function parseMenu(input: ParseInput, onProgress?: (done: number, total: number) => void): Promise<ParseResult>;
```

- `lib/parse/nvidia.ts`: OpenAI-compatible call to `https://integrate.api.nvidia.com/v1/chat/completions`, `Authorization: Bearer ${process.env.NVIDIA_API_KEY}`, model `process.env.NVIDIA_MODEL`. Sends images as base64 `image_url` data URLs. Asks for JSON only. Prices come back from the model in **EGP** and are converted to piasters by the parser.
- `lib/parse/pdf.ts` renders PDF pages to images (use `unpdf`), max 15 pages. `lib/parse/link.ts` fetches a URL safely (http/https only, block private IPs, 15 s timeout, 20 MB limit) and handles direct image/PDF links. `sharp` resizes images to max 1600 px on the long edge.
- Validates with zod, retries once on bad JSON, runs up to 4 pages in parallel, merges categories by name, and assigns `nanoid` ids.
- **Route:** `app/api/parse/route.ts` (POST, `multipart/form-data` with `restaurantId`, `kind`, and `files[]` or `url`). It requires an admin: it reads the `admin_token` cookie and calls `findAdminByToken` from `lib/data/admins.ts`. It uploads the source files with `uploadFile` from `lib/storage.ts`, calls `parseMenu`, saves the result via `saveDraftMenu`, and returns `{ ok, pages, itemCount }`. Set `export const maxDuration = 300`.
- Include `scripts/try-parse.ts` (`npx tsx scripts/try-parse.ts <file-or-url>`), which prints the parsed menu so the model can be tested. (Agent 3 may write this one file in `scripts/`.)

### Agent 4: backend logic

```ts
// lib/money.ts
toPiasters(egp: number): number; formatEGP(piasters: number): string /* "124 EGP" or "42.75 EGP" */
// lib/phone.ts
normalizeEgyptPhone(input: string): string | null  // "+20 101 234 5678" -> "01012345678"; null if invalid
// lib/auth.ts
getCurrentAdmin(): Promise<AdminDoc | null>; requireAdmin(): Promise<AdminDoc> /* redirects to /admin/login */
getCurrentParticipant(): Promise<ParticipantDoc | null>
// lib/storage.ts
uploadFile(buffer: Buffer, filename: string, contentType: string): Promise<string /* public url */>
  // Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise writes to public/uploads/ (dev fallback)
// lib/receipts.ts
calculateReceipts(order: GroupOrderDoc, lines: OrderLineDoc[], people: ParticipantDoc[]): Receipt[]
calculateReceipt(order, linesOfOne, person): Receipt
// lib/regroup.ts
regroupOrder(order: GroupOrderDoc, restaurant: RestaurantDoc, lines: OrderLineDoc[], people: ParticipantDoc[]): RegroupedOrder
regroupedToText(restaurant, regrouped): string   // WhatsApp-ready text
```

Server Actions (`"use server"`) in `lib/actions/`. Each one validates its input with zod, checks auth, and returns `{ ok: true, data? } | { ok: false, error: string }`. They never throw for expected errors.

- `lib/actions/admin.ts`: `loginAdmin(formData)`, `logoutAdmin()`
- `lib/actions/restaurants.ts`: `createRestaurantAction(formData)` (with an optional cover image), `updateRestaurantAction(id, formData)`, `deleteRestaurantAction(id)` (blocked if an open order exists), `saveMenuEditsAction(id, menu)`, `publishMenuAction(id)` (blocked if any price ≤ 0)
- `lib/actions/groupOrders.ts`: `createGroupOrderAction({ restaurantId, title?, multiplier })` (one open order per restaurant), `updateGroupOrderAction(id, { title?, multiplier? })`, `closeGroupOrderAction(id)`, `reopenGroupOrderAction(id)`, `setPaymentAction(orderId, participantId, method | null)`
- `lib/actions/participant.ts`: `joinAction({ name, phone })`, `switchParticipantAction()`, `addLineAction({ shortCode, itemId, variantId?, quantity, note? })` (looks up the price and name from the **published** menu; never trusts the client's price), `updateLineAction(lineId, { quantity?, note? })`, `removeLineAction(lineId)`. All line actions are rejected with "This order is closed" when the order is closed.
- **Read helpers for pages** (`lib/actions/queries.ts`, plain server functions, not actions). These return serializable objects (ids as strings, dates as ISO strings):
  - `getHomeData()` → restaurants with an `openOrderShortCode?`
  - `getRestaurantPage(id)`
  - `getOrderPageData(shortCode)` → `{ order, restaurant, participant | null, myLines, myReceipt | null }`
  - `getAdminDashboard()`
  - `getAdminOrderData(id)` → `{ order, restaurant, receipts, regrouped, regroupedText, paidCount, collected, outstanding }`

Receipt rule: `total = ceil(subtotal × multiplier / 100) × 100` (piasters, rounded **up** to a whole EGP). There is no delivery fee. Test with vitest: 100 EGP @1.14 → 114; 200 @1.14 → 228; 100 @1.26 → 126; 37.50 @1.14 → 43; a participant with zero lines is excluded.

### Agent 5: frontend

Pages, as in the PRD: `/` (restaurant cards), `/r/[id]`, `/o/[shortCode]` (join form → menu + cart → receipt when closed), `/admin/login`, `/admin`, `/admin/restaurants`, `/admin/restaurants/new`, `/admin/restaurants/[id]` (edit + menu upload tabs that POST to `/api/parse` + review/edit), `/admin/orders/[id]` (Participants / Regrouped / By person / Payments tabs, polling every 10 s with `router.refresh()`).

- Import data only through `lib/actions/queries.ts` and `lib/actions/*`. Never import `lib/data` or `lib/db` directly.
- If a function you need doesn't exist yet, still import it with the signature above; the other agents are writing it now.
- Style: white, minimalist, mobile-first, `dir="auto"` on menu text, Arabic-capable font (IBM Plex Sans Arabic via `next/font/google`), tabular numbers for prices, 44 px tap targets. You may add shadcn/ui-style components by hand in `components/ui/`; do not run `shadcn init`, because it rewrites shared config.
- The InstaPay QR comes from `process.env.INSTAPAY_QR_URL` and the handle from `INSTAPAY_HANDLE` (read on the server and pass them down as props).
