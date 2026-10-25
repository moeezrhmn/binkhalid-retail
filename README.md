# Bin Khalid Retail Management System

POS, inventory and reporting for Bin Khalid. The build plan is in
[binkhalid-retail-plan.md](binkhalid-retail-plan.md).

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Prisma 7, PostgreSQL.

## Local setup

1. Create a PostgreSQL database named `binkhalid_retail`.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `SESSION_SECRET`
   (`openssl rand -base64 32`) and `ADMIN_PASSWORD`. Product images are saved in
   `UPLOAD_DIR` (default `./uploads`); include that folder in backups.
3. Install, migrate and seed:

   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. Start the app with `npm run dev` and log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## Scripts

| Script               | What it does                               |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Development server                         |
| `npm run build`      | Generate Prisma client and build           |
| `npm test`           | Unit tests (Vitest)                        |
| `npm run test:db`    | Database tests, in a separate `test` schema |
| `npm run lint`       | ESLint                                     |
| `npm run typecheck`  | TypeScript check                           |
| `npm run db:migrate` | Create and apply a migration (development) |
| `npm run db:deploy`  | Apply migrations (production)              |
| `npm run db:seed`    | Admin, settings, categories, sample data   |

Sample products are only seeded outside production and only into an empty
product table. Set `SEED_SAMPLE_DATA=false` to skip them.

## Production (VPS with PM2)

The app runs with `next start` under PM2, with PostgreSQL on the same server
and a reverse proxy (e.g. Nginx) in front for HTTPS.

First deploy:

```bash
npm ci
npm run db:deploy
npm run db:seed        # creates the admin; no sample data in production
npm run build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup   # restart the app after a server reboot
```

Each release:

```bash
git pull
npm ci
npm run db:deploy
npm run build
pm2 reload binkhalid-retail
```
