# Deploying the Felix Labs site

Pushing to `main` runs `.github/workflows/deploy.yml`. The workflow builds the site, copies it to the server, and restarts two containers:

- **caddy** serves the site and gets the HTTPS certificate automatically.
- **mailer** receives the consultation forms at `/api/consult` and emails them to you.

## Local preview

```
npm run dev
```

This opens http://localhost:8080 and rebuilds on every save. Form submissions are printed in the terminal instead of being emailed.

## One-time server setup

You need an Ubuntu or Debian server and, ideally, a domain whose DNS A record points at the server's IP address.

1. **Make a deploy key** on your own computer:

   ```
   ssh-keygen -t ed25519 -f felixlabs-deploy -N "" -C github-actions-deploy
   ```

   This creates `felixlabs-deploy` (private) and `felixlabs-deploy.pub` (public).

2. **Prepare the server.** SSH in as root and run:

   ```
   curl -fsSL https://raw.githubusercontent.com/aquerym/felixLabs-web/main/projects/Felix%20Labs/deploy/server-setup.sh -o server-setup.sh
   bash server-setup.sh "<contents of felixlabs-deploy.pub>"
   ```

   This installs Docker and creates a `deploy` user and the `/opt/felixlabs` folder.

3. **Add the settings file** on the server. Copy `.env.example` to `/opt/felixlabs/.env` and fill in the domain, the address that should receive requests, and an SMTP login. For Gmail, use an App Password, not your normal password. Then run:

   ```
   chown deploy:deploy /opt/felixlabs/.env
   chmod 600 /opt/felixlabs/.env
   ```

4. **Add GitHub secrets.** In the repo, open Settings > Secrets and variables > Actions.

   | Secret | Value |
   | --- | --- |
   | `SSH_HOST` | server IP or hostname |
   | `SSH_USER` | `deploy` |
   | `SSH_KEY` | contents of `felixlabs-deploy` (the private key) |
   | `SSH_KNOWN_HOSTS` | output of `ssh-keyscan -H <server>` |
   | `SSH_PORT` | only if SSH is not on port 22 |

   Under the **Variables** tab, add `SITE_URL`, for example `https://felixlabs.com`. It fills in the canonical and social-preview tags, and the workflow uses it to check the live site after each deploy.

5. **Deploy.** Push to `main`, or open Actions > Deploy site > Run workflow.

## Testing the form safely

Set `MAIL_DRY_RUN=1` in `/opt/felixlabs/.env`, deploy, and submit the form. The request is logged instead of emailed:

```
docker compose -f /opt/felixlabs/docker-compose.yml logs mailer
```

Set it back to `0` and run `docker compose up -d` in `/opt/felixlabs` to start sending real email.

## Changing what ships

`build.mjs` copies `landing-structure.html` to `index.html`, plus every file the page references. Nothing else in `projects/Felix Labs` is published. If the page references a file that doesn't exist, the build fails, so a broken image never reaches the server.
