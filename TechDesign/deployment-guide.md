# TechDesign — Deployment Guide

**Builds on:** [system-architecture.md](system-architecture.md) (_Deployment_, _Operations_, _Security and access_), [data-model.md](data-model.md) (_Operations_, _Privileges and immutability_), [accounts-roles.md](accounts-roles.md)
**Kind:** System-level. It has no Requirements counterpart.

This guide puts UPlan on the internet. **Part A** is a demo site: seeded test data, no backups, not for real planner data. **Part B** is the pilot: what must be built first, then the go-live steps. Part A's steps are the pilot's steps too, so Part B refers back to them.

## What has been checked

| Piece                                                                                              | State                                          |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| The `web`, `worker`, and `postgres` images build; `web` starts as a non-root user and serves pages | Checked on an x86 machine                      |
| Migrations apply to the production `postgres` image (PostGIS 3.6.4)                                | Checked                                        |
| The seed script runs from the `build` image against a migrated database                            | Checked                                        |
| The worker starts from its image with the crontab mounted                                          | Checked. The first heartbeat wasn't waited for |
| Object Storage with real OCI credentials, Caddy with Let's Encrypt, and a build on an Arm VM       | **Not checked.** First run is on the VM        |
| Everything in Part B's build list                                                                  | **Designed here, not built**                   |

## Part A — Demo site

### A0. What a demo is

- Sign-in works with an email address and a password through Supabase Auth. Email confirmation stays off, because Supabase's built-in email service can't reach real users (B2.4).
- The data is the seed script's: illustrative evidence layers and one decision marked "test data". No real planner data goes on it.
- **`GET /api/health` returns 503, and that is correct.** It names `backup_freshness` because no backup exists. Nothing hides it, and the site works regardless.
- The database connection uses the schema owner, not the restricted `uplan_app` role (B2.1).

### A1. Collect these first

| Item                                                   | Where it comes from       |
| ------------------------------------------------------ | ------------------------- |
| A hostname, such as `uplan.example.org`                | A domain you control      |
| An Oracle Cloud account                                | oracle.com/cloud/free     |
| A GitHub account that owns or can read the repository  | —                         |
| A Supabase account                                     | supabase.com              |
| A strong Postgres password                             | `openssl rand -base64 24` |

### A2. Oracle Cloud

1. **Upgrade to Pay As You Go.** Always Free resources stay free, and the design gives the reasons (_Deployment_). Add a budget alert at $1.
2. **Network.** Create a VCN with one public subnet. Its security list allows inbound TCP 80 and 443 and UDP 443 from anywhere, and nothing else.
3. **VM.** Create a `VM.Standard.A1.Flex` instance with 2 OCPUs, 12 GB of memory, a 200 GB boot volume, and Ubuntu Server 24.04. In the instance's Oracle Cloud Agent settings, turn on the **Bastion** plugin.
4. **Reserved public IP.** Reserve one and attach it to the VM's VNIC. A rebuilt VM keeps the IP, so the DNS record never changes.
5. **Bastion.** Create a Bastion in the subnet. To work on the VM, create a **Managed SSH session** to the instance and use the SSH command Oracle shows. Sessions expire, so make a new one each time.

Arm capacity is sometimes exhausted in a region. If the create fails with "out of capacity", try again later; don't change the shape.

### A3. Object Storage

1. Create two buckets in the home region: `uplan-objects` and `uplan-reports`. (Demo only. The pilot adds `backups` and the `reports` retention rule; see B2.)
2. Create an IAM user `uplan-app` and a group with a policy that lets it **create and read** objects in those two buckets, and not overwrite or delete them. The exact verbs are in Oracle's Object Storage policy reference; the design (_Security and access_) requires create-and-read only.
3. On the user, generate a **Customer Secret Key**. Copy the secret when it's shown; it can't be shown again.
4. The S3 endpoint is `https://<namespace>.compat.objectstorage.<region>.oci.customer-oci.com`. The namespace is on the tenancy details page. The app addresses buckets by path, which this endpoint supports.

### A4. Supabase project

UPlan's only use of Supabase is sign-in (D14). Create a free project, then:

1. **Authentication → Providers → Email:** leave it enabled, and turn **Confirm email** off. With it on, registration needs a working email sender, and the built-in one only reaches your own team members (B2.4).
2. **Authentication → URL Configuration:** set the Site URL to `https://<hostname>`, and add `https://<hostname>/auth/callback` to the redirect URLs. Add `http://localhost:3000/auth/callback` too if you develop locally.
3. **Project Settings → API:** copy the project URL and the publishable key. The key is designed to be public, but UPlan only ever uses it on the server.

A free project pauses after a week without use. While it's paused, the sign-in page says it can't reach the sign-in service; restore the project from the dashboard.

### A5. DNS

Add an `A` record from the hostname to the reserved IP. Wait until `nslookup <hostname>` returns it. Caddy asks Let's Encrypt for a certificate on first start and fails if DNS doesn't resolve yet.

### A6. Set up the VM

1. Open a Bastion session, SSH in, and become root with `sudo -i`. Every command from here to A10 runs as root, because the deploy key, `/opt/uplan`, and `/etc/uplan` all belong to root.
2. Make a read-only deploy key so the VM can fetch the repository: `ssh-keygen -t ed25519 -f ~/.ssh/uplan_deploy -N ""`, then add `~/.ssh/uplan_deploy.pub` under the repository's Settings → Deploy keys, without write access. Tell git to use it: `git config --global core.sshCommand "ssh -i /root/.ssh/uplan_deploy"`.
3. Fetch and run the setup script. It installs Docker and Compose, clones the repository to `/opt/uplan`, and creates two empty root-only files:
   ```sh
   git clone git@github.com:<owner>/<repo>.git /tmp/uplan-bootstrap
   REPO_URL=git@github.com:<owner>/<repo>.git bash /tmp/uplan-bootstrap/deploy/setup.sh
   rm -rf /tmp/uplan-bootstrap
   ```

### A7. Fill in the configuration

Three files hold all configuration. None is committed.

**`/etc/uplan/postgres.env`** (root-only, for the `postgres` container):

```
POSTGRES_USER=uplan
POSTGRES_PASSWORD=<the Postgres password>
POSTGRES_DB=uplan
```

**`/etc/uplan/app.env`** (root-only, for `web`, `worker`, and `migrate`). The app validates every variable at startup and exits if one is missing or malformed:

```
NODE_ENV=production
DATABASE_URL=postgres://uplan:<the Postgres password>@postgres:5432/uplan
APP_URL=https://<hostname>
SUPABASE_URL=<project URL from A4>
SUPABASE_PUBLISHABLE_KEY=<publishable key from A4>
OCI_S3_ENDPOINT=https://<namespace>.compat.objectstorage.<region>.oci.customer-oci.com
OCI_S3_REGION=<region, such as us-phoenix-1>
OCI_S3_ACCESS_KEY_ID=<from A3>
OCI_S3_SECRET_ACCESS_KEY=<from A3>
OCI_BUCKET_OBJECTS=uplan-objects
OCI_BUCKET_REPORTS=uplan-reports
LOG_LEVEL=info
```

**`/opt/uplan/deploy/.env`** (not secret; read by Compose):

```
UPLAN_HOSTNAME=<hostname>
```

`compose.yaml` refuses to start without it.

### A8. The basemap

The map's background is one `.pmtiles` file that Caddy serves from `deploy/basemap/`. Get the `pmtiles` command-line tool for Linux arm64 from the go-pmtiles releases, then extract the pilot area. Use a recent daily-build date from build.protomaps.com:

```sh
mkdir -p /opt/uplan/deploy/basemap
pmtiles extract https://build.protomaps.com/<yyyymmdd>.pmtiles /opt/uplan/deploy/basemap/basemap.pmtiles --bbox=-122.10,47.50,-121.90,47.70 --maxzoom=15
```

The file is a few megabytes. The app requests it at `/basemap/basemap.pmtiles`.

### A9. Deploy

From a machine with the repository, tag a commit and push the tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

`deploy.sh` takes a lock, checks out the tag, builds the images, runs `migrate`, then starts `worker` and `web`. It never starts `postgres` or `caddy`, so the **first** deploy on a new VM has two extra steps around it. On the VM, as root:

```sh
cd /opt/uplan && git fetch --tags && git checkout v0.1.0
TAG=v0.1.0 docker compose -f deploy/compose.yaml up -d postgres
deploy/deploy.sh v0.1.0
TAG=v0.1.0 docker compose -f deploy/compose.yaml up -d --no-deps caddy
```

Every later deploy is only `deploy/deploy.sh <tag>`. After that, `restart: unless-stopped` brings everything back after a reboot.

- Always set `TAG` on a Compose command that creates containers. Without it Compose looks for images tagged `latest`, which don't exist, and builds them.
- The first build takes several minutes on two OCPUs. `postgres` needs a few seconds after it starts; if `migrate` can't connect, wait and run `deploy.sh` again. It is safe to repeat.
- This sequence hasn't been run on a VM. The images, migrations, and `deploy.sh` steps have each been run separately.
- The design says a tag comes from a commit whose CI passed. There is no CI yet (B2.5), so for a demo you tag by hand.

### A10. Load the demo data

1. Open `https://<hostname>/register`, create your account, and let it sign you in. This creates your `app_user` row. The seed needs it. If the database was used before sign-in moved to Supabase, its old `app_user` rows don't match any Supabase user and a matching email will be rejected: start from an empty database, or delete those rows and the rows that reference them.
2. Build the tools image from the repository's `build` stage and run the seed inside the Compose network. Check the network name first with `docker network ls`; Compose names it after the folder, `deploy_default`:
   ```sh
   sudo docker build --target build -t uplan-tools /opt/uplan
   sudo docker run --rm --network deploy_default --env-file /etc/uplan/app.env uplan-tools npx tsx scripts/seed-local.ts <the email you registered with>
   ```
3. The seed grants that email UPlan-staff and planner access to a "Sammamish" jurisdiction. It also creates an approved profile, eight illustrative evidence datasets, and one decision with a computed analysis run. It's safe to run again.

The demo decision's report stays a draft. Releasing it renders a PDF in the worker, which the `worker` container does.

### A11. Check it

- `https://<hostname>` shows the landing page over HTTPS.
- Registering, or signing in, returns to the app. If it doesn't, check A4's site URL and redirect list.
- Open the demo decision: the map draws its basemap and the evidence layers.
- `curl https://<hostname>/api/health` returns `{"ok":false,"failing":["backup_freshness"]}` with status 503, plus `worker_heartbeat` for the first five minutes.
- `sudo docker compose -f /opt/uplan/deploy/compose.yaml ps` shows `caddy`, `web`, `worker`, and `postgres` running.

### A12. Update, and go back

- **Update:** tag a new commit and run `deploy.sh <tag>`. Deploy outside the city's working hours; recreating `web` takes a few seconds.
- **Go back:** run `deploy.sh <previous tag>`. Migrations are expand-then-contract (_Deploying_ in the architecture), so the old code runs against the newer schema.
- **Logs:** `sudo docker compose -f /opt/uplan/deploy/compose.yaml logs --tail 200 web` (or `worker`). They are JSON lines.

### A13. When something goes wrong

| Symptom                                                              | Likely cause                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `docker compose` says `set UPLAN_HOSTNAME in deploy/.env`            | `deploy/.env` is missing or empty (A7)                                                                     |
| The browser shows a certificate error, and Caddy's logs mention ACME | DNS doesn't resolve to the reserved IP yet, or ports 80 and 443 aren't open in the security list (A2, A5)  |
| `web` restarts in a loop, and its logs list Zod errors               | A variable in `/etc/uplan/app.env` is missing or malformed. The logs name it                               |
| The sign-in page says it can't reach the sign-in service             | `SUPABASE_URL` is wrong, or the free Supabase project is paused (A4)                                       |
| The map is grey                                                      | `deploy/basemap/basemap.pmtiles` is missing (A8)                                                           |
| Profile upload or report release fails                               | The Object Storage credentials, endpoint, or bucket names are wrong (A3), or the user can't create objects |
| `/api/health` names `worker_heartbeat` for more than 15 minutes      | `worker` isn't running or can't reach the database; read its logs                                          |

## Part B — Pilot

The pilot is Sammamish's planners using UPlan on real applications. That is a different promise from the demo. The design already describes the finished system; this part lists what the repository doesn't yet do, and the order to do it in. **Each item needs its own design before code**, as the spec-first workflow requires. The sketches below are the design starting point, not tested work.

### B1. Differences between the demo and the pilot

|                 | Demo                                             | Pilot                                                                                      |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Data            | Seeded illustrative layers, "test data" decision | Real public datasets ingested through F3, and the city's own profile uploaded and approved |
| Database access | `web` and `worker` connect as the schema owner   | They connect as `uplan_app`, with the grants in the data model                             |
| Backups         | None; `/api/health` fails                        | Nightly pgBackRest to Object Storage, restore rehearsed                                    |
| Email addresses | Unconfirmed; staff check who someone is          | Confirmed through a custom SMTP sender                                                     |
| Users           | You                                              | Staff, planners, and reviewers, each granted by staff                                      |
| Releases        | Hand-tagged                                      | Tags from commits whose CI passed                                                          |
| Monitoring      | You look                                         | An external monitor and alarms email UPlan staff                                           |
| `/api/health`   | 503                                              | 200                                                                                        |

### B2. Build list, in order

**1. The restricted database role.** The data model (_Privileges and immutability_) says `migrate` runs as the schema owner and `web` and `worker` connect as `uplan_app`. The migrations create neither the role nor its grants, so the immutability the architecture promises isn't enforced by the database yet.

- Create the role when the database is first initialized: an init script in the `postgres` image that reads its password from `postgres.env`, so no secret enters a migration.
- Add a migration with the grants and the three `forbid_final_row_change` triggers from the data model.
- Give `migrate` the owner's `DATABASE_URL` and `app.env` the `uplan_app` one. One way with no extra file: put the owner's URL in `postgres.env`, and list it after `app.env` in the `migrate` service's `env_file`, since later files win.
- Test: as `uplan_app`, an `update` on `report` after release, and a `delete` on `profile_version`, both fail.

**2. Backups.** `deploy/` contains the timer and service units and the `pgbackrest` package is in the image. Nothing else is connected.

- **A `backups` bucket** and a **third IAM user** whose policy reaches only that bucket, as the architecture requires. Also give `reports` its retention rule now (Oracle: Object Storage retention rules).
- **Configure pgBackRest with environment variables**, in `postgres.env`, so there is no config file to keep: `PGBACKREST_STANZA=uplan`, `PGBACKREST_PG1_PATH=/var/lib/postgresql/18/docker`, `PGBACKREST_REPO1_TYPE=s3`, `PGBACKREST_REPO1_S3_ENDPOINT`, `PGBACKREST_REPO1_S3_BUCKET`, `PGBACKREST_REPO1_S3_REGION`, `PGBACKREST_REPO1_S3_KEY`, `PGBACKREST_REPO1_S3_KEY_SECRET`, `PGBACKREST_REPO1_S3_URI_STYLE=path`, `PGBACKREST_REPO1_PATH=/uplan`, `PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc`, `PGBACKREST_REPO1_CIPHER_PASS`, and `PGBACKREST_REPO1_RETENTION_FULL=2`. Check the option names against the pgBackRest version the image installs.
- **Turn on WAL archiving** by passing settings to Postgres in the `postgres` service's `command`: `archive_mode=on`, `archive_command='pgbackrest --stanza=uplan archive-push %p'`, and `archive_timeout=15min`.
- **Create the stanza once**, after first start: `docker compose exec -u postgres postgres pgbackrest --stanza=uplan stanza-create`.
- **Record every run.** Extend `uplan-backup.service` so it notes the start time, runs `pgbackrest` as the `postgres` user, and inserts a `backup_run` row as the schema owner whether the run succeeded or failed:
  ```sql
  insert into backup_run (kind, status, started_at, finished_at, error_detail)
  values ($kind, $status, $started, now(), $error);  -- error_detail is required when status = 'failed'
  ```
  A failed backup that writes no row would leave the health check reading an old success, so the failure path is what needs the test.
- **Keep the cipher passphrase somewhere outside the VM** (a password manager the UPlan staff share). Backups can't be read without it, and a lost VM loses `postgres.env` too.
- Test: after a backup, `backup_run` has a `succeeded` row and `/api/health` no longer names `backup_freshness` or `wal_archiving`. Stop the archive destination and confirm `wal_archiving` fails.

**3. A way to onboard a city and its people.** The seed is the only entry point that creates a jurisdiction and grants access. `createJurisdiction` and `grantMembership` already exist as module functions and already require a staff actor.

- Recommended: a staff-run script that calls them, run from the same `build` image as A10, with no user interface. It is less code than a page, and only UPlan staff need it.
- The first staff member has to exist before staff can grant anything, so the script also covers that one case: it inserts a `staff_member` row for an email that has registered and signed in.
- The decision to make: a script for the pilot, or a staff page. Either needs its own section in `accounts-roles.md` first.

**4. Verified email addresses.** Registration proves nothing about who owns an address while "Confirm email" is off, and `grantMembership` matches people by address (`accounts-roles.md`). Before real planners register, choose an email sender that fits the zero-cost rule, write its decision record (a new external service), configure it under Supabase's Authentication → SMTP Settings, and turn on **Confirm email**. The register page already handles that setting: it tells the person to check their inbox, and `/auth/callback` finishes the sign-in. Then check that a new address gets its email, that a person with no membership sees no city data, and that a planner lands in the right jurisdiction once granted.

**5. CI and release tags.** Add a GitHub Actions workflow that runs typecheck, lint, unit, integration (Testcontainers), and end-to-end with axe on every pull request, within the 2,000 free minutes a month. A release tag goes only on a commit whose run passed.

**6. Monitoring and alarms.** Create the OCI APM synthetic monitor for `GET /api/health` every 10 minutes, the two alarms, and the notification topic that emails UPlan staff (_Health check and alarms_ in the architecture). Turn on unattended security upgrades on the VM. Add container health checks to `compose.yaml` once `/api/health` can return 200, since a check on today's 503 would mark `web` unhealthy forever.

**7. Browser security headers.** The architecture calls for a Content Security Policy that allows MapLibre's blob workers and nothing broader; none is set. Add it, and `Strict-Transport-Security`, in `Caddyfile`. Test it against the map page before deploying, since a policy that is too tight leaves a grey map.

**8. Real data and the city's profile.** Ingest the public datasets the profile needs through F3, upload the Sammamish profile workbook as a planner, and have a reviewer approve it. Start the pilot on a fresh database, never the demo's. Seeded rows carry "illustrative" provenance and must never mix with real evidence (P1), and once B2.1 is in place the application can't delete them.

### B3. Restore rehearsal

A backup that has never been restored is a hope. Before go-live, and every quarter after:

1. Start a scratch `postgres` container from the same image, with an empty data directory and the same `PGBACKREST_*` settings.
2. Restore into it: `pgbackrest --stanza=uplan restore` (as the `postgres` user, with the data directory empty).
3. Start it and compare: the latest `report` rows, their hashes, and `select count(*)` on the main tables against production.
4. Record the date and the result in the same place UPlan staff track operations.

### B4. Rebuilding a lost VM

1. Create a new VM in the same subnet and attach the reserved IP. DNS doesn't change.
2. Run A6 and A7 again. The secrets come from the password manager, including the cipher passphrase.
3. Start `postgres` empty, restore from `backups` (B3's commands, into the real data directory), then run `deploy.sh <last tag>`.
4. Loss is at most 15 minutes of work, because of `archive_timeout`.

### B5. Go-live checklist

Do not open the pilot to planners until every line is true:

- [ ] Every item in B2 is built, tested, and merged. Each has its own design section.
- [ ] `/api/health` has returned 200 for 24 hours.
- [ ] One restore rehearsal has passed (B3).
- [ ] An alarm has been triggered deliberately, and the email arrived.
- [ ] The end-to-end suite passes on the tagged commit, including axe checks and a phone-width viewport.
- [ ] The database rejects an `update` to a released report when connected as `uplan_app`.
- [ ] A planner from the city has registered with a confirmed email address, and a person with no membership sees no city data.
- [ ] The cipher passphrase and every secret in `/etc/uplan/` exist in a password manager, not only on the VM.
- [ ] No seeded row exists in the pilot database.

### B6. Decisions for you

- **Hostname.** A UPlan-owned domain, or a subdomain the city creates, such as `uplan.sammamish.us`. The architecture assumes the city provides the DNS name.
- **Onboarding.** A script or a staff page (B2.3).
- **Who is UPlan staff.** Named people who have registered. They can grant access, so the list is short.
- **The email sender.** Which free sender confirms addresses (B2.4).
- **Charter round 10.** Whether v1 opens to cities beyond Sammamish, who approves profile edits, and whether code tracking stays in release 1 change what the pilot needs, so settle them before B5.
