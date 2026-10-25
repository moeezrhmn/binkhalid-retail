# Bin Khalid Retail Management System: Build Plan

This file is the working plan for Claude Code. Read it fully before writing any code, and re-read the relevant section before starting each phase.

## 1. Project summary

A custom web-based POS, inventory and reporting system for **Bin Khalid**, a single-branch Pakistani retail shop selling:

- Muslim caps (many sizes and colors)
- Perfumes and ittar
- Waistcoats
- Unstitched suits (sold by the piece or by the meter)
- Honey bottles (different weights)

More product types will be added later, so the product model must be **flexible, not hard-coded to these five categories**.

**The most important feature is barcodes.** Every sellable variant gets a unique code and a printable barcode label, so the cashier can bill by scanning. Everything else supports that.

**Contract:** the client approved the _Project Scope Document – Bin Khalid POS_ (15 Oct 2026). That document defines what we deliver. Anything not in it is a change request, so do not build it without asking.

## 2. Fixed decisions (do not change without asking)

| Topic        | Decision                                                                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework    | Next.js (App Router), TypeScript                                                                                                                                                                                                                                  |
| Database     | PostgreSQL                                                                                                                                                                                                                                                        |
| ORM          | Prisma                                                                                                                                                                                                                                                            |
| Users        | Admin and staff accounts in one `User` table, managed in **Settings → Users**. Only two fixed roles: ADMIN (everything) and STAFF (billing only). From Phase 5 any admin can create other admins as well as staff, and every account records who created it. No custom roles or per-feature permissions |
| Devices      | Computer or tablet at the counter. Every screen must work on both. On a phone, the owner can do lookups only: Dashboard, Reports, Inventory stock check, Customers balances, Sales bill lookup. POS, Barcode Labels and product entry are not designed for phones |
| Branches     | Single branch. No multi-branch fields anywhere                                                                                                                                                                                                                    |
| Connectivity | Always online. No offline mode, no service workers                                                                                                                                                                                                                |
| Currency     | PKR, shown as `Rs 1,500`. Store money as **integer rupees**                                                                                                                                                                                                       |
| Language     | English UI only                                                                                                                                                                                                                                                   |
| Hosting      | Single VPS, no Docker. The Next.js app runs under PM2 (`next start`, one instance), PostgreSQL is installed on the server, and a reverse proxy (e.g. Nginx) provides HTTPS. Daily backups |
| Timeline     | 2 to 3 weeks total                                                                                                                                                                                                                                                |

Assumptions I made that are easy to change: Prisma as ORM, Tailwind for styling, Code 128 barcodes, browser printing (no native print driver), signed-cookie session for login. If any of these cause a problem, say so and propose an alternative rather than silently switching.

## 3. Tech stack

- Next.js 14+ App Router, React, TypeScript (strict)
- Tailwind CSS, plus a small set of shared components (button, input, table, dialog, badge)
- Prisma + PostgreSQL
- Server Actions or route handlers for mutations. Pick one pattern and stay consistent
- Zod for input validation on every server mutation
- `bcryptjs` for the password hash, `jose` for a signed session cookie (httpOnly, secure, sameSite=lax)
- `bwip-js` or `jsbarcode` for Code 128 rendering (SVG preferred, prints sharply)
- `exceljs` for Excel export, and print-to-PDF via the browser for reports
- Vitest for unit tests on money, stock and code-generation logic

## 4. Data model

Write this as `prisma/schema.prisma`. Names are guidance, adjust field names if needed but keep the structure.

```
Category
  id, name (unique), codePrefix (unique), defaultUnit, isActive, sortOrder

CategoryAttribute
  id, categoryId, name, type (TEXT | OPTION), options String[], codeAbbrevs Json,
  usedInCode Boolean, sortOrder

Product
  id, categoryId, name, description?, imageUrl?, unit (PIECE | METER | ML | GRAM | BOTTLE ...),
  codeSeq Int, discountType? (AMOUNT | PERCENT), discountValue Int?, isActive, createdAt

Variant
  id, productId, code (unique), attributes Json, costPrice Int, salePrice Int,
  stockQty Decimal(12,3), minStock Decimal(12,3), isActive

Supplier
  id, name, phone?, notes?

StockMovement
  id, variantId, type (STOCK_IN | SALE | RETURN | ADJUSTMENT),
  qty Decimal(12,3), unitCost Int?, reason?, supplierId?, saleId?, saleReturnId?, createdAt

Customer
  id, name, phone? (unique), notes?, createdAt

Sale
  id, billNo Int? (unique), status (COMPLETED | HELD), customerId?, userId,
  subtotal Int, discount Int, total Int, cashReceived Int?, changeGiven Int?,
  note?, createdAt, completedAt?

SaleItem
  id, saleId, variantId, nameSnapshot, codeSnapshot, costSnapshot Int, priceSnapshot Int,
  qty Decimal(12,3), discount Int, lineTotal Int, billDiscountShare Int, netTotal Int

CashFlow
  id, type (SALE | REFUND | CREDIT_RECEIVED | OPENING_BALANCE | CASH_OUT | EXPENSE),
  method (CASH | CARD | BANK_TRANSFER | JAZZCASH | EASYPAISA | CREDIT | EXCHANGE),
  amount Int, saleId?, saleReturnId?, customerId?, userId, note?, createdAt

SaleReturn
  id, returnNo Int (unique), originalSaleId?, exchangeSaleId?, type (RETURN | EXCHANGE), refundAmount Int, createdAt

SaleReturnItem
  id, saleReturnId, saleItemId?, variantId, qty Decimal(12,3), amount Int, restock Boolean

CashSession
  id, openedAt, openingCash Int, closedAt?, expectedCash Int?, countedCash Int?, note?

User
  id, name, type (ADMIN | STAFF), username (unique), passwordHash, isActive,
  createdById? (→ User, who created this account), sessionVersion Int, createdAt

Counter
  key (unique), value Int

Setting
  key, value
```

Rules for the model:

- Every `id` and every foreign key is a **UUID v7** (`@default(uuid(7)) @db.Uuid`), which is time-ordered and so keeps indexes fast. Numbers people read stay integers: `billNo`, `returnNo` and `codeSeq`.
- Never edit a completed sale's items in place. Use a return/exchange.
- `stockQty` on `Variant` is a cache. It must always equal the sum of `StockMovement.qty` for that variant. Every stock change writes a movement **in the same transaction**. Movement `qty` is signed (+ in, − out).
- `Variant.code` is the barcode value. `Product.codeSeq` is the running number per category.
- `Sale.customerId` is nullable only so a held bill can be saved early. A `COMPLETED` sale must always have a customer.
- Money is always integer rupees. If a percentage discount creates a fraction, round to the nearest rupee in one shared helper, `lib/money.ts`, and use it everywhere.
- `CashFlow` is append-only, like `StockMovement`. Never edit or delete a row. Corrections are new rows. `amount` is signed (+ money in or owed to us, − money out).
  - `SALE` needs `saleId`: one row per payment method, adding up to `Sale.total`.
  - `REFUND` needs `saleReturnId`: rows adding up to `−SaleReturn.refundAmount`.
  - `CASH_OUT` and `EXPENSE` are admin only and need a note.
  - `customerId` is required only for udhaar: any row with method `CREDIT`, plus every `CREDIT_RECEIVED` and `OPENING_BALANCE` row.
  - Udhaar balance = sum of `CREDIT` rows − sum of `CREDIT_RECEIVED` rows for the customer. It is never stored.
- `CashSession.expectedCash` = `openingCash` + sum of `CASH` rows in `CashFlow` between `openedAt` and `closedAt`. Only one session can be open at a time.
- `User`: the first ADMIN is created by the seed (its `createdById` is empty). Any admin can create admins and staff, and `createdById` records who did. There must always be at least one active admin. Accounts with history are deactivated, not deleted. Each request checks that the user is still active and that the session's `sessionVersion` is current, so deactivating someone, resetting their password or changing their role logs them out at once.
- **Counters:** bill numbers, return numbers and each category's product number come from the `Counter` table (keys like `bill`, `return`, `product:<categoryId>`; keyed by id so changing a prefix never restarts the numbering).
  - Increment them atomically inside the same transaction (`value = value + 1`). Never use "max + 1".
  - A held bill has no `billNo`. It gets one only when completed, so bill numbers have no gaps.
  - Add a unique index on `(categoryId, codeSeq)` on `Product`.
- **Bill discount split:** when a sale completes, split `Sale.discount` across the items in proportion to their `lineTotal`, and save each item's part as `billDiscountShare`.
  - Shares must add up exactly to the bill discount: round down in `lib/money.ts`, then give the leftover rupees one each to the lines with the largest remainders, so no line ever gets more discount than its own total.
  - `netTotal = lineTotal − billDiscountShare`, and it is what the customer actually paid for that line.
  - Product, category and profit reports, and refunds, all use `netTotal`.
- **Returns:**
  - A return item from a known bill links to its `saleItemId`. Returned qty can never exceed sold qty minus what was already returned.
  - The refund defaults to the item's `netTotal` per unit × returned qty.
  - Restock movements link to the return through `saleReturnId`.
- **Stock updates** are atomic (`stockQty = stockQty − qty`), never read-then-write. Stock may go negative, because selling at zero is allowed with confirmation.
- **Quantities:** PIECE and BOTTLE units take whole numbers only, while METER, ML and GRAM allow decimals. Validate this in one helper. Every price × qty calculation is rounded through `lib/money.ts`.
- **Stock-in cost:** a `STOCK_IN` movement stores the `unitCost` paid, so cost history is kept even when the variant's cost price changes.
- **Time:** the business runs on Pakistan time (`Asia/Karachi`, UTC+5).
  - Store timestamps in UTC (`timestamptz`). Every app connection runs with `TimeZone=UTC` (set in `lib/db.ts`), because the Prisma adapter sends timestamps without a zone; on a server set to Asia/Karachi they would otherwise be stored 5 hours off.
  - Calculate every "Today / This week / This month" boundary and every date filter in `Asia/Karachi`, through one helper in `lib/dates.ts`.
  - Sales reports filter on `completedAt`, not `createdAt`.
- **Normalizing input:**
  - Variant codes are stored and looked up in uppercase.
  - Phone numbers are normalized before saving (`0300-1234567`, `+92 300 1234567` → `03001234567`). An empty phone becomes null.
  - Two variants of the same product cannot have the same attribute values (checked on save).
- **Indexes:** Prisma does not index foreign keys on PostgreSQL, so add them explicitly:
  - `Product(categoryId)`, `Variant(productId)`
  - `StockMovement(variantId, createdAt)`
  - `Sale(status, completedAt)`, `Sale(customerId)`
  - `SaleItem(saleId)`, `SaleItem(variantId)`
  - `SaleReturnItem(saleReturnId)`
  - `CashFlow(createdAt, method)`, `CashFlow(customerId)`, `CashFlow(saleId)`, `CashFlow(saleReturnId)`
  - `Customer(name)`

## 5. Product code and barcode system (the priority feature)

### Code format

The final format will be decided later. Build with this default:

```
{CATEGORY_PREFIX}-{PRODUCT_SEQ}-{ATTRIBUTE_ABBREVS}
CAP-0012-BLK-M
```

Main rules (these stay the same whatever the format becomes):

- All code generation lives in one function, `lib/codes.ts`, so changing the format later is a one-file change.
- Every variant gets a unique code when it is saved. A duplicate fails with a clear error and is never fixed silently.
- Codes are never regenerated automatically, so printed labels keep working.
- The barcode value is exactly the `code` string, encoded as **Code 128**.

### Variant creation

When the admin creates a product, they pick a category, the attribute fields appear, and the UI offers a **"generate all combinations"** action (e.g. 4 sizes × 3 colors = 12 variants), each with its own code, price and stock. A single-variant product (e.g. a perfume bottle) must be possible without any attribute friction. Opening stock entered here writes a `STOCK_IN` movement (reason "Opening stock") in the same transaction, so the ledger rule holds from day one. See 6.2 for fast entry.

### Label printing

- Page: Barcode Labels. Search or pick variants, set copies per variant, preview, print.
- A **"labels for newly received stock"** shortcut: after a stock-in, offer one click to print one label per unit received.
- Label content: shop name, price, product name, variant text, barcode, code text.
- Default label size **50 × 30 mm**, configurable in settings. Use a dedicated print stylesheet with `@page { size: 50mm 30mm; margin: 0 }` and one label per page, so a thermal label printer works with the standard browser print dialog.
- Barcodes are rendered as SVG so they stay crisp at any print resolution.

### Scanner behavior

- A USB scanner acts like a keyboard: it types the code and presses Enter.
- On the POS page, a search input is **always focused** (re-focus after every action). On Enter, look up an exact `Variant.code` match first, then fall back to name search.
- Scanning the same code again increments quantity by 1.
- Unknown code: show a clear error and play a short error tone. Never add anything silently.
- Inactive variants cannot be sold. Zero stock shows a warning but is allowed with confirmation (shops often have uncounted stock).

### Barcode lookup

- Outside billing, the Products and Inventory pages have a scan/search box. Scanning a code opens that variant straight away (price, stock, details), so the shop can do a quick price or stock check without starting a bill.

## 6. Modules and screens

Sidebar navigation: Dashboard, POS / Billing, Sales (bill history, reprint, returns), Cash Register, Products, Barcode Labels, Inventory, Customers, Reports, Settings (shop details, receipt text, label size, staff accounts). Staff users see only POS / Billing. A reference mockup image of all screens exists (`bin-khalid-screens.jpg`). Follow its layout and style, which is a dark green sidebar with a gold active item and clean white cards, but do not copy its sample data.

### 6.1 Login

- One screen: username and password. On success, redirect the admin to Dashboard and staff to POS.
- All routes except `/login` require a valid session. Add basic rate limiting on login attempts.
- Admin credentials come from the seed script, with the initial password from an environment variable.
- The session stores the user id and type. Every page, server action and route handler checks the type on the server, not just the sidebar.

### 6.1a Access by user type

- **ADMIN:** everything.
- **STAFF:** POS / Billing only. That covers scanning, cart, discounts, payments, completing sales, hold/resume, reprinting receipts, and finding or quick-adding the customer. Staff cannot see cost price or profit, and cannot open Products, Inventory, Customers, Reports, Dashboard, Settings, returns, the cash register, or cash out and expenses.
- **Users (Settings → Users tab, admin only):** create admin or staff accounts, edit, reset password, deactivate or reactivate, delete an account that never served a bill. See Phase 5 for the full rules and the access checks.

### 6.2 Products

- Category list management (add, edit, deactivate), including the attribute definitions per category, so new product types need no code changes.
- Product list with search, category filter chips, stock total, and low-stock highlighting.
- Product detail: edit product, see all variants with code, color, size, price, stock. Actions: add variant, print labels, deactivate.
- Purchase (cost) price and sale price per variant, plus an optional discount per product (fixed rupees or percent).
- Optional product image.
- Units: piece, bottle, meter, ml, gram, and others added later.

#### Fast product entry

The client enters hundreds of products by hand, with no import. Entry speed is a core requirement, not polish.

- **Quick add grid** (for single-variant products like perfumes and honey): a spreadsheet-style table.
  - One row per product: name, category, variant text (e.g. 6ml), cost, sale price, opening stock, min stock.
  - Tab moves between cells. Enter on the last cell adds a new row. Each new row copies the category, unit and prices from the row above, so similar items only need a new name.
  - "Save all" saves every valid row in one go and highlights invalid rows without losing them.
- **Product form with variants** (for caps, waistcoats and suits):
  - Attribute options are clickable chips with "Select all", e.g. click S, M, L, XL and Black, White, Grey to get 12 variants.
  - A new option (e.g. a new color) can be typed straight into the form, with its code abbreviation auto-suggested.
  - **Fill all** sets cost, sale price, opening stock and min stock once for every variant. Individual rows can still be edited afterwards.
- **Duplicate product:** copies a product with all its variants and prices, then the admin changes only the name. For example, "Velvet Cap" becomes "Cotton Cap".
- **Keyboard first:** the name field gets focus on open, Ctrl+Enter saves, and **Save and add another** keeps the last category.
- **Labels after entry:** the Barcode Labels page has an "Added today" filter, to print labels for everything entered in the session in one go.

### 6.3 POS / Billing

- Big scan/search field at the top (scan, or search by name or code), cart table below (item, price, qty stepper, line discount, line total, remove item).
- When a product has a discount, it fills in as the line discount automatically. The cashier can change it.
- Right panel: customer (required on every sale), salesperson (the logged-in user, shown, not editable), subtotal, bill discount, total, payment method buttons, cash received and change, **Complete sale and print receipt**, **Hold this bill**.
- Payment methods: Cash, Card, Bank transfer, JazzCash, Easypaisa, Credit (udhaar). Mobile wallet and bank payments are recorded manually, with no gateway.
- **Every sale needs a customer**, not only udhaar sales. There is no walk-in option. A sale cannot be completed without one, though a held bill can be saved before the customer is picked.
  - The customer box takes a phone number or name. Typing the phone number finds an existing customer instantly.
  - If no match is found, **quick add** right there: name (required) and phone (optional, unique when entered), saved without leaving the POS. Staff can quick-add too.
  - When quick-adding without a phone, show existing customers with a similar name first, to avoid duplicates.
- The udhaar part of a sale is a `CashFlow` row (`SALE`, method `CREDIT`, with `customerId`).
- Split payments are allowed (e.g. part cash, part credit). Each method is its own `SALE` row in `CashFlow`, and the rows must add up to the total.
- Hold and resume: held bills persist in the database, show in a list, and do not touch stock until completed. A held bill can be discarded.
- Completing a sale runs in **one database transaction**: create sale and items, write the `CashFlow` rows, write stock movements, decrease stock, and increment the bill number safely. If any step fails, nothing is saved.
- Receipt: 80 mm thermal layout via a print stylesheet (shop header, bill no, date, items, discount, total, payments, footer). Include a **reprint** option on any past bill.
- Returns and exchanges: find the original bill (or proceed without one), select items, choose restock yes or no, refund or adjust against a new sale. Restocking writes a `RETURN` movement. A completed sale is never cancelled or voided. All corrections go through a return.
- Refunds: every refund writes `REFUND` rows in `CashFlow` (negative amounts) in the same transaction as the return. The method defaults to the original sale's method, and the admin can change it.
  - If the item was bought on udhaar, the refund uses method `CREDIT` with the customer, which lowers their balance.
  - An exchange writes `EXCHANGE −X` on the return and `EXCHANGE +X` on the new sale, so only the price difference is paid or refunded.
- Daily cash register (admin only):
  - **Open the day:** enter the opening cash in the drawer.
  - **Cash out / expense:** during the day the admin can record money taken from the drawer, either a cash out (owner withdrawal) or an expense, with an amount and a required note. Each one writes a negative `CashFlow` row (`CASH_OUT` or `EXPENSE`, method `CASH`).
  - **Close the day:** see expected cash (opening + cash sales + udhaar received in cash − cash refunds − cash out − expenses), enter the counted cash, and see the difference.
  - Past sessions can be viewed and printed.

### 6.4 Inventory

- Stock levels table with search, a Low stock filter, status badge, and last-updated.
- **Stock in:** pick variants and quantities, optional supplier, optional new cost price, then offer label printing.
- **Adjust stock:** quantity change with a **required reason** (damage, loss, count correction).
- Movement history (every stock change, filterable).
- Low-stock alert when `stockQty <= minStock`, shown on Dashboard and Inventory.
- Supplier records (simple list).

### 6.5 Customers and credit (udhaar)

- Customer list with search by name or phone, and balance due.
- Customer detail: purchase history, statement (udhaar sales, returns and payments received, in date order), **receive payment** action (writes a `CREDIT_RECEIVED` row with the method used), printable statement.
- Balance is derived from `CashFlow`, never stored separately. When creating a customer, the admin can enter their old udhaar from the previous system. It is saved as an `OPENING_BALANCE` row.

### 6.6 Dashboard and reports

- Date range controls: Today, This week, This month, custom.
- KPIs: sales, number of bills, profit (sale price minus snapshot cost), credit outstanding.
- Charts: sales over the last 7 days, sales by category.
- Tables: top-selling products, low-stock alerts.
- Reports: sales by product, by category, by payment method, **by staff member**, top-selling products, **slow-moving products** (lowest or no sales in the range, with stock still on hand), profit report, current stock report, low-stock report, **daily cash summary** (opening cash, cash sales, udhaar received, other methods, credit given, refunds, cash out, expenses, expected cash, counted cash, difference), **cash flow report** (every `CashFlow` row in the range, filterable by type and method).
- Export to Excel and print-friendly PDF for each report.
- Returned items must be deducted correctly in all totals.

## 7. Build phases (2 to 3 weeks)

Work phase by phase. Finish and verify each phase before starting the next. Commit at the end of each phase with a clear message. Each phase ends with a client review and approval (milestone).

### Phase 1: Foundation (days 1 to 3)

- [ ] Send the client the minimum requirements for the barcode scanner, label printer and receipt printer. The client chooses and buys the models; they must arrive before Phase 6 testing. Everything else (computer, internet, power) is already in place at the shop.
- [x] Create Next.js + TypeScript + Tailwind project, ESLint, Prettier
- [x] Local PostgreSQL database `binkhalid_retail` for development
- [x] Prisma schema, first migration, seed script (admin user, settings, the five starting categories with attributes, sample products)
- [x] Login, session, route protection by user type (admin / staff), logout
- [x] App shell: sidebar layout (drawer on phones), shared UI components
- [x] `lib/money.ts` (rounding, bill discount split), `lib/codes.ts`, `lib/dates.ts` (Pakistan time ranges) with unit tests

### Phase 2: Products and barcodes (days 4 to 6)

- [x] Category and attribute management
- [x] Product create/edit with variant combination generator, automatic codes, optional product discount and image
- [x] Fast entry: quick add grid, fill all, duplicate product, save and add another, keyboard shortcuts
- [x] Product list and detail screens, barcode lookup box
- [x] Barcode Labels page, SVG barcodes, print stylesheet, copies per variant
- [x] Verify (automated): generated barcodes decode correctly in tests, and printed labels rendered at 300 dpi scan 6/6 (203 dpi: 5/6, see open questions)
- [ ] Verify with a real scanner or a phone scanner app on a printed label

### Phase 3: POS and stock (days 7 to 11)

- [x] Inventory: stock levels, stock in, adjustments, movement ledger, low-stock logic, suppliers
- [x] POS cart with scan flow and focus handling
- [x] Discounts (line, bill, product default), payment methods, split payments, cash and change
- [x] Staff accounts in Settings (create, reset password, deactivate), salesperson recorded on every sale
- [x] Transactional sale completion, bill numbering
- [x] Hold, resume and discard
- [x] Thermal receipt layout, sales history and reprint
- [x] `CashFlow` rows written by the sales, returns and cash register services (`server/services/sales.ts`, `returns.ts`, `cash.ts`), with tests for every type used so far
- [x] Returns and exchanges with refunds (with or without the original bill)
- [x] Cash register open and close, cash out and expenses
- [x] Tests: sale completion, stock never going out of sync with movements, split payments, return restocking
- [ ] Test with the real barcode scanner and receipt printer (when the hardware arrives)

### Phase 4: Customers, credit and reporting (days 12 to 15)

- [x] Customers CRUD, credit charge and payment flows, statements
- [x] Dashboard KPIs, charts and tables
- [x] All reports with date filters, Excel export and print/PDF view (including sales by staff and slow-moving products)
- [x] Daily cash summary

### Phase 5: Users and access control

Changes requested after Phase 4. These replace the earlier "one admin only" rule.

**User management (Settings → Users tab)**

- [ ] Move user management back into **Settings** as its own tab ("Users"), not a separate sidebar item. The old Settings → Staff accounts address keeps working.
- [ ] Any admin can create **another admin** as well as staff accounts.
- [ ] Every account records **who created it** (`User.createdById`, empty for the first admin from the seed). The users list shows "Created by".
- [ ] Edit name, username and role (admin / staff), reset password, deactivate and reactivate.
- [ ] Delete an account only if it never served a bill, never recorded money, has no held bills and never created other accounts. Otherwise deactivate it, so the records keep their history.
- [ ] Safety rules:
  - There is always at least one active admin: the last active admin cannot be deactivated, deleted or changed to staff.
  - An admin cannot deactivate, delete or demote their own account (another admin must do it).
- [ ] Deactivating someone, resetting their password or changing their role ends their sessions on every device (`User.sessionVersion`, checked on each request).
- [ ] The users list shows role, status, bills served, last sale, created by and created date.
- [ ] POS shows **"Served by: Name (Role)"** for the logged-in user. Receipts show the name.

**Access control: what staff can access and view**

- [ ] Write the access matrix into section 6.1a: every page, action and print view, marked Admin or Staff. Staff today: POS / Billing only (scan, cart, discounts, payments, complete, hold/resume/discard, today's bills and receipt reprint, customer search and quick add).
- [ ] Audit every page, server action, route handler and print page: each must check the role on the server (`requireAdmin` or `requireUser`), not just hide a menu item.
- [ ] Decide and enforce what staff see inside the POS: no cost price or profit anywhere; customer search shows name and phone only (no udhaar balances, no purchase history).
- [ ] Automated tests:
  - Every admin-only server action and route handler refuses a staff session.
  - Every admin page sends staff back to the POS.
  - The data sent to the POS never includes cost price or profit.
  - A deactivated or role-changed user is logged out on their next request.
- [ ] Re-check the POS customer quick add **without** a phone number (a test run stalled there; confirm whether it is an app bug).

### Phase 6: Polish and launch

- [ ] Empty states, loading states, error messages, confirm dialogs for destructive actions
- [ ] Set up and test the client's barcode scanner, label printer and receipt printer at the shop. Integration stays model-independent:
  - **Scanner:** read as keyboard input.
  - **Printers:** use the browser print with the model's own driver. Adjust the label and receipt sizes in Settings to match the actual paper.
- [ ] Production setup on the VPS:
  - PM2 with `ecosystem.config.cjs`: restart on crash and after a server reboot (`pm2 startup` + `pm2 save`).
  - Environment variables in `.env` on the server.
  - HTTPS through the reverse proxy.
  - Each release runs `npm ci`, `npm run db:deploy`, `npm run build`, `pm2 reload`.
- [ ] Daily database backup script (`pg_dump`) that copies backups and product images off the server, plus a backup restore test
- [ ] Launch walkthrough with the client

After launch: 15 days of free bug fixes. New features or changes after that are change requests.

## 8. Engineering rules

- **Money and stock logic is high-stakes.** Keep it in plain, testable functions in `lib/` or `server/services/`, not scattered through components. Write tests before trusting it.
- Use database transactions for anything touching more than one table (sales, returns, stock in, adjustments, credit payments).
- Validate all input with Zod on the server, even if the form also validates.
- Never trust the client for prices. The server reads prices from `Variant` when completing a sale and snapshots them into `SaleItem`.
- Snapshot names, codes, prices and cost on `SaleItem` so renaming or repricing a product never alters old bills or reports.
- Soft-delete only (`isActive`). Do not hard-delete products, variants or customers that have history.
- Pagination on every list that can grow (sales, movements, customers).
- Keep the UI fast at the counter: no full-page reloads while billing, keyboard-friendly, large touch targets. Test every screen at tablet width, and the lookup screens at phone width (375px): cards stack, tables scroll sideways inside their card, and the page itself never scrolls sideways. On phones the sidebar becomes a drawer opened from the top bar.
- **Compact, dense UI.** The system has many features, but every screen stays tight and efficient: as much useful information on screen as possible without scrolling, while staying easy to read and click.
  - Use the shared components and their sizes (`components/ui`): 36px inputs and buttons, 34px table rows, small uppercase table headers, 12px form labels, tight card padding and section gaps.
  - Hide what isn't always needed (extra discounts, notes, rare actions) behind a small link or a "More" menu.
  - The POS fits one screen at 1366 × 768 with no page scrolling; only the cart list scrolls. Its key actions (Complete sale, payment buttons, total) stay large.
- **Premium raised buttons.** Every button uses the shared `Button` / `buttonClasses` component, never one-off button styles.
  - Primary: brand green with a soft sheen, a light top edge and a darker bottom edge, so it looks raised.
  - Secondary: white with a soft shadow outline.
  - Every button visibly presses in when clicked.
  - Semibold labels and 8px corners.
  - The shadows are the `--shadow-btn*` tokens in `app/globals.css`.
- Accessible markup: real `<button>`, `<label>`, visible focus styles.
- No secrets in the repo. Use `.env` with a committed `.env.example`.
- Small commits, made directly on `main` for now. Tag the end of each phase (`phase-1`, `phase-2`, …). Update the checklist in this file as items are done.

## 9. Suggested folder structure

```
/app
  /(auth)/login
  /(app)/dashboard
  /(app)/pos
  /(app)/products
  /(app)/barcodes
  /(app)/inventory
  /(app)/customers
  /(app)/reports
/components        shared UI
/lib               money.ts, codes.ts, dates.ts, auth.ts, db.ts, format.ts
/server/services   sales.ts, stock.ts, cashflow.ts, reports.ts
/prisma            schema.prisma, migrations, seed.ts
/tests             unit tests for services and lib
```

## 10. Out of scope (do not build, even if easy)

- Custom roles, per-feature permissions, or an audit-log screen (more than one admin is allowed from Phase 5)
- Multiple branches or shops
- Online store or customer-facing website
- Mobile app
- Offline mode
- Payment gateways (JazzCash, Easypaisa and cards are recorded manually)
- Accounting, tax filing, or payroll
- SMS or WhatsApp notifications
- Urdu interface
- Voiding or cancelling completed sales (use returns)
- Data import from files (products, customers and old udhaar are entered manually)
- Hardware supply

If something seems necessary but is on this list, or is not in the approved scope document, stop and ask instead of building it. It is a change request.

## 11. Acceptance checks (the project is done when all of these pass)

1. Create a product "Velvet Prayer Cap" with 4 sizes × 3 colors and get 12 variants, each with a unique code.
2. Print a label for one variant on the label printer, scan it with the USB scanner, and it appears in the POS cart.
3. Scan 5 different items and complete a cash sale. The receipt prints, stock drops by the sold quantities, and a movement row exists for each item.
4. Complete a split sale (cash plus credit) for a named customer. The customer's balance increases by the credit part. Receive a payment, and the balance decreases.
5. Hold a bill, make another sale, then resume the held bill and complete it.
6. Return one item from an old bill with restock. Stock and the dashboard totals update correctly.
7. Stock in 50 units, print 50 labels, then adjust stock by −1 with a reason. The movement ledger shows both entries.
8. Change a product's price, and old bills and reports still show the old prices.
9. The Dashboard numbers for a date range match the sum of the bills in that range (verify with a manual count).
10. Excel export opens correctly. Open the day with an opening cash amount, make cash sales and a cash refund, then close the day. The expected cash matches the physical cash in the drawer for a test day.
11. A database backup can be restored on a clean machine, and the app starts with the data intact.
12. Anyone not logged in cannot reach any page or API route except login. A staff user cannot reach any admin page or admin server action, even by typing the URL.
13. Give a product a discount. Scanning it fills in the line discount automatically.
14. The admin creates two staff accounts, and each makes sales. The sales-by-staff report splits the totals correctly. A deactivated staff account cannot log in.
15. The slow-moving report lists an in-stock product with no sales in the selected range.
16. Scanning a code in the Products lookup box opens that variant without touching the POS.
17. Refund a returned cash item, record a Rs 10,000 cash out and a Rs 500 expense, then close the day. Expected cash drops by all three, and the cash flow report lists each row with its note.
18. Return an item bought on udhaar. The customer's balance drops by the item's value.
19. A sale cannot be completed without a customer. A new customer quick-added at the POS by phone and name appears in the Customers list with that purchase in their history.
20. Using only the keyboard, add 20 single-variant products in the quick add grid in under 5 minutes. Then create a cap with 12 variants (prices filled once) in under 1 minute.

## 12. Open questions for the client (confirm before Phase 2 ends)

- Final barcode and code format. Not blocking: the default format is used until then.
- Label printer model and exact label size. **Prefer a 300 dpi label printer.** A code like `CAP-0012-BLK-M` makes a Code 128 barcode about 47 mm wide at 0.25 mm bars, which does not fit a 50 mm label with its blank margins. Squeezed onto a 203 dpi printer, the bars come out uneven (1 of 6 test labels failed to scan; 300 dpi: 6 of 6). Alternatives: a wider label (60 mm or more), or a shorter numeric barcode value with the readable code printed under it.
- Receipt printer model and paper width (assumed 80 mm).
- Receipt header and footer text, shop name, address and phone.
- Whether unstitched suits are sold by the piece, by the meter, or both.
- Whether existing products already have barcodes that must be kept.
- Staff names for their accounts, and whether staff should also handle returns or the cash register (default: admin only).
- Product discount: a fixed rupee amount, a percent, or both.
- How "slow-moving" should be defined (default: no sales in the selected range while stock > 0).
