# GHT Arquitectura

A portfolio and real estate website for GHT Arquitectura y Urbanismo, with a private administration interface for managing projects, property listings, photos, and studio information.

The application lives in [`app/`](app/README.md). It uses a Cloudflare Worker with server-rendered pages, D1 for structured data, and R2 for images. The project is under development and is not yet ready for production.

## Local development

You need Node.js 20.19 or later and npm. Local development uses Wrangler's local D1 and R2 storage and does not require a Cloudflare account.

```sh
cd app
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open the URL printed by Wrangler. The public site includes the portfolio and real estate section; `/admin` opens the local editor. A clean installation has no projects or properties. Local contact-form submissions are simulated and do not send email.

After installing Python test dependencies and Playwright's Chromium browser as described in the [application README](app/README.md), run the complete test suite with:

```sh
npm test
```

The [application README](app/README.md) covers local data, WordPress migration, image processing, the contact form, deployment prerequisites, and additional integration tests.

## Repository layout

- `app/src/` — Worker routes, domain validation, authentication, and delivery logic.
- `app/public/` — browser-side scripts and styles.
- `app/migrations/` — versioned D1 schema and initial studio content.
- `app/scripts/` and `app/tests/` — migration utilities and tests.

WordPress files and exports, archived contact submissions, local Wrangler state, dependencies, and secrets are excluded from Git. The WordPress import and archive utilities require the corresponding source files to be supplied separately; those files are not part of this repository.
