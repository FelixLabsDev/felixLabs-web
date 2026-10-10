# Deploying the Felix Labs site

The live site is **Vercel**. Pushing to `main` updates [www.felixlabs.net](https://www.felixlabs.net) after the project is linked.

Local preview is unchanged:

```
npm run dev
```

http://localhost:8080 — form submissions are printed in the terminal, not emailed.

## Vercel (current)

1. Import `aquerym/felixLabs-web` in the Vercel dashboard. Framework: Other. Build command and output directory come from `vercel.json`.
2. Add environment variables (Production and Preview):

   | Name | Value |
   | --- | --- |
   | `SITE_URL` | `https://www.felixlabs.net` |
   | `MAIL_TO` | inbox for consultation requests |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | Gmail address |
   | `SMTP_PASS` | Gmail App Password |
   | `MAIL_FROM` | usually the same as `SMTP_USER` |
   | `MAIL_DRY_RUN` | `1` for the first test, then `0` |

3. Add domains `www.felixlabs.net` and `felixlabs.net` (redirect the apex to www).
4. In Namecheap, replace the A records to `34.241.10.58` with the records Vercel shows.

The consultation form posts to `/api/consult`. That function lives in `api/consult.js` and emails `MAIL_TO`.

## Linux server (optional)

`.github/workflows/deploy.yml` no longer runs on push. Use **Actions → Deploy site → Run workflow** only if you want the VM at `34.241.10.58` again. Setup for that path is `server-setup.sh` plus `/opt/felixlabs/.env` from `.env.example`.
