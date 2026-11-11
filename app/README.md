# GHT portfolio — local prototype

Cloudflare Worker with server-rendered public pages, a project editor, D1 and R2. This is an initial implementation, not a production-ready migration. A local WordPress portfolio import and a separate private contact archive are available; clean installations start with no projects.

## Run locally

Requires Node.js 20.19 or later and npm. No Cloudflare account or credentials are needed.

```sh
cd app
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open the URL printed by Wrangler; `/admin` opens the local editor. D1 and R2 data persist in `app/.wrangler/`. To reset **local data only**, stop the server, remove that directory, and repeat migration and seeding. Local authentication bypass is enabled only by the `dev` script and only for localhost requests. Never set `LOCAL_DEVELOPMENT` in a deployed environment.

### Copy production data locally

To replace local development data with a production snapshot, first stop local Wrangler development servers. Sign in with `npx wrangler login` if needed, then run from `app/`:

```sh
python3 scripts/sync_production_to_local.py --account-id YOUR_CLOUDFLARE_ACCOUNT_ID
npm run dev
```

The account ID is shown by `npx wrangler whoami`; alternatively set the `CLOUDFLARE_ACCOUNT_ID` environment variable. The command reads the D1 database and R2 bucket configured in `wrangler.jsonc`, imports the database into isolated local storage, copies every referenced project and property image and variant, and checks the copy. It does not write to production. D1 export can temporarily make the production database unavailable. Avoid editing production content during the copy, since the database export and R2 reads are not one atomic snapshot; a missing object causes the sync to fail without replacing local data.

After successful verification the command replaces the **entire local Wrangler state**, including locally created projects, property listings and media, and prints the path to the previous state under `app/.wrangler/state-backups/`. Both backups and temporary files are ignored by Git and may contain private data. Ensure sufficient disk space for the staged copy and backup. If an error occurs before replacement, the existing local state is left in place. To try the full transfer without replacing it, add `--verify-only`; this still reads production and uses temporary disk space.

To restore a backup, stop the local server, move `.wrangler/state` to a safe location, then copy the desired printed backup directory to `.wrangler/state`. Keep or delete old backups according to your needs. Linux `/proc` is currently required for checking whether a local Wrangler server is running.

The admin's **Estudio y contacto** tab edits the studio introduction, four team biographies, and contact details. The initial content was extracted from the WordPress dump and should be reviewed with the business. On an existing local database, run `npm run db:migrate` to add these fields without resetting projects.

The contact page includes a form. Local submissions are simulated: no email is sent and no message is stored. Live delivery uses the Resend email API, following the pattern used in Crisalida, and remains unavailable until `CONTACT_FROM_EMAIL` (a verified sender), `CONTACT_TO_EMAIL` (the owner's confirmed recipient), and the `RESEND_API_KEY` secret are configured. These delivery addresses are separate from the public address in the content editor. A successful API response indicates that the provider accepted the email, not that it reached the inbox; submissions are not retained in the application. Review the privacy wording and implement suitable rate limiting or other spam protection before enabling live delivery.

To run the complete test suite, install Python 3 and Pillow and the Playwright Chromium browser once, then run:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-test.txt
npx playwright install chromium
npm test
```

`npm test` runs JavaScript syntax checks, JavaScript unit tests, Python tests, and isolated Worker integration scenarios including the browser smoke test. The integration tests create temporary D1/R2 state; they do not use or change the app's local or production data. On Linux, Playwright may require system browser dependencies; `npx playwright install-deps chromium` describes or installs those dependencies. Run `npm run test:unit`, `npm run test:python`, or `npm run test:integration` to focus on one part. Initial data contains no private contact submissions.

The Worker entry point in `src/index.js` routes requests. Public-page data and request handling live in `src/pages/`, with page markup in `src/page-views.js` and shared markup in `src/components.js` and `src/layout.js`. `src/content-repository.js` holds shared public-content queries; `src/admin-api.js`, `src/media.js`, and the feature modules handle administration and media. Browser-side scripts remain in `public/`.

The admin entry point, `public/admin.js`, connects the tabs to the feature modules in `public/admin/`; image optimization is shared by the project and property editors. `src/admin-api.js` checks authorization and dispatches requests, while project operations and their database queries live in `src/project-api.js` and `src/project-repository.js`.

The project editor lets you update image descriptions, reorder images, select a cover, and remove images. Removing a cover falls back to the first remaining image. If object-storage deletion fails, the image is removed from the project and the deletion is retried on later admin requests. Unpublished projects and their images are only available to authorized administrators.

The **Inmobiliaria** tab in the admin manages separate property listings. An editor can create a draft or publish an apartment with a sale/rental option, availability, location, euro price, size, bedroom and bathroom counts, description, and an ordered photo gallery. Leaving the price empty displays “Consultar precio”; rental prices are monthly. A property page links to the contact form with the listing reference, which is included in delivered enquiries. No sample properties are inserted. The same local email simulation and live-delivery prerequisites apply to property enquiries.

Use **Orden en el portafolio** to set a project's position in the overall portfolio and **Orden en su categoría** to set its position when that category is selected. Lower numbers appear first. Projects without a category-specific position follow those with one, using their overall order as a fallback; overall ties use creation date. Leave either field blank to remove that explicit position. Changing a project's category clears the category position in the editor.

Migration `0009_restore_project_order.sql` restores the WordPress panel order for projects already present when it runs. It does not automatically set positions for projects imported afterward, including on a fresh installation; those positions can be set in the editor.

New project and property uploads generate responsive WebP versions automatically in the administrator's browser, at widths up to 480, 960 and 1600 pixels without enlarging the original. The editor reports optimization failures and offers an **Optimizar imagen/foto** retry action. The website chooses an appropriate version using `srcset`; originals remain available from gallery images. Older images keep their existing thumbnail/original fallback until optimized. Browser caching requires revalidation so that unpublished or deleted images are not served from a fresh cache without checking access.

For an existing local library, install Pillow in your Python environment and run `python3 app/scripts/generate_image_variants.py --port 8787` from the repository root while the local app is running. It only connects to localhost, handles project and property images, skips existing variants, and can be rerun after a failure. Use `--workers 1` to reduce memory usage. Run `npm run db:migrate` before starting the updated app when upgrading an existing local database.

For an existing deployed library, first apply `0008_image_variants.sql` with `npx wrangler d1 migrations apply ght --remote` **before deploying the updated Worker**. After verifying the target Cloudflare account, database and bucket, run `python3 app/scripts/backfill_remote_images.py --account-id YOUR_ACCOUNT_ID --execute` from the repository root. This explicitly writes optimized variants to the configured remote D1/R2 using a temporary Worker bound only to localhost; it does not replace original images. Wrangler authentication, access to the configured resources, and Pillow are required. Backfill can be run before or after deploying the updated Worker and safely resumes missing variants. Back up production data and use a separate preview environment when appropriate.

For an isolated gallery integration test, run `python3 app/tests/gallery_integration.py` from the repository root. It starts a temporary Wrangler instance and does not touch your local project data.

## Production prerequisites

Before deploying, replace the placeholder D1 ID and configure separate D1/R2 resources. Protect `/admin` and `/api/admin/*` with Cloudflare Access; configure `ACCESS_TEAM_DOMAIN`, `ACCESS_AUDIENCE`, and `ADMIN_EMAIL`. The Worker verifies the Access JWT and fails closed without this configuration. Complete the migration, legal content, image optimization, testing and backup/restore work before publishing.

Search metadata and `sitemap.xml` use the trusted `PUBLIC_SITE_URL` origin when configured; otherwise they use `https://ghtarquitectura.com` for deployed hosts and the local request origin on localhost. Set `PUBLIC_SITE_URL` to the intended HTTPS origin when deploying to a different domain. Requests on another deployed hostname receive a noindex directive and a disallow-all `robots.txt`, so preview URLs do not advertise themselves for indexing. The sitemap contains public pages and published projects only; project metadata uses its description or, if empty, its title and project details. The selected cover image is used for social sharing where available.

## WordPress portfolio import

The importer reads the supplied dump and uploads without modifying either. Python 3 is required. From the repository root, inspect the inventory:

```sh
python3 app/scripts/import_wordpress.py > /tmp/ght-inventory.json
```

Start the local app, then import the complete portfolio from a second terminal:

```sh
cd app
npm run db:migrate
npm run dev -- --port 8787
# In a second terminal, from the repository root:
python3 app/scripts/import_wordpress.py --import-local --all > /tmp/ght-import.json
```

The importer connects only to `127.0.0.1`; use `--port` if Wrangler is running elsewhere. Use `--ids 142 407` instead of `--all` for a selected import. Projects are created as drafts, gallery files are uploaded in source order, the original featured image is selected as cover, and the project is published. The first available gallery image is used as the cover if WordPress had none.

A repeated import leaves published projects untouched. If a new import is interrupted, rerun the same command: it verifies the saved draft fields and the bytes and alt text of every existing gallery image before continuing. If a draft was modified, it is skipped for manual review. Projects created by the original sample importer are also left untouched, except that an unmodified sample with no explicitly selected cover receives its WordPress cover. Inspect output and warnings; the importer does not yet migrate page layouts, project descriptions, or historical form submissions.

Run importer checks with `python3 -m unittest discover -s app/tests -p 'test_*.py'` from the repository root.

## Historical contact submissions

`python3 app/scripts/archive_submissions.py` reads the sole `.sql` file in `db/` and creates a private SQLite archive in the repository's `private-archive/` directory. Pass `--dump PATH` to select a specific dump. The archive contains the original Elementor submissions, field values, and action logs, including personal data, IP addresses, and metadata. It is separate from the application and is not exposed through the Worker or admin interface.

The directory and archive are restricted to the local OS user (permissions `700` and `600` respectively) and excluded from Git. They are not encrypted. Store any backup in an appropriately private location and control who has access. Archive filenames contain the SHA-256 of the source dump; rerunning with the same dump refuses to overwrite the existing archive. A newer dump produces a separate snapshot. The script checks row relationships and SQLite integrity before creating the final file.

To inspect the archive locally, use a SQLite client to open the `.sqlite3` file read-only. The `e_submissions`, `e_submissions_values`, and `e_submissions_actions_log` tables use their original column names; join the latter two on `submission_id = e_submissions.id`. Avoid copying query output into logs or public files. The archive is a snapshot, so submissions received after the dump date are not included.
