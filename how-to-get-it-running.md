# How to get it running

The database is hosted on Supabase, so nothing runs "live" on a server. Each person runs the app on their own computer, and every copy talks to the same shared database. A class you add on your laptop shows up on everyone else's.

## One-time setup

1. **Install Node.js** (version 18 or newer) from https://nodejs.org. Check with `node -v`.

2. **Clone the repo**
   ```
   git clone https://github.com/elisa-hermosilla/is401-datamodel_and_backend.git
   cd is401-datamodel_and_backend
   ```

3. **Install dependencies** (they are not stored in the repo)
   ```
   npm install
   ```

4. **Create your `.env` file.** Copy `.env.example` to `.env` in the project root, then fill in the two values:

   | Variable | What to put |
   |---|---|
   | `DATABASE_URL` | The Supabase **session pooler** connection string (Supabase dashboard → Connect → Session pooler, port 5432). Get the password from Jared; it is never committed to GitHub. If the password has special characters, URL-encode them (e.g. `@` → `%40`). |
   | `SESSION_SECRET` | Any long random string. Does not need to match anyone else's. |

   Leave `PORT=3000` as is.

   `.env` is git-ignored. Never commit it, and never paste the connection string into the repo, an issue, or a group chat screenshot.

## Every time you want to run it

```
git pull
npm start
```

Then open http://localhost:3000 and click **Create account** to make your own login. If you want to see sample data (three classes with assignments), sign in as the shared demo account:

| Username | Password |
|---|---|
| `cosmocougar` | `gocougs!` |

Press `Ctrl+C` in the terminal to stop the server.

**Windows only:** if `npm start` fails with "running scripts is disabled on this system", either run `npm.cmd start` instead, or run this once in PowerShell and then use `npm start` normally:
```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
Mac and Linux don't need this.

Run `npm install` again only if `package.json` changed since your last pull (you'll see an error about a missing module if so).

## If something goes wrong

**The server exits right away with a message about `DATABASE_URL` or `SESSION_SECRET`.** Your `.env` file is missing, in the wrong folder, or has an empty value. It must be in the project root next to `package.json`.

**The terminal shows `password authentication failed`.** The database password in `DATABASE_URL` is wrong or needs URL-encoding.

**Something else is already using port 3000.** Change `PORT=3000` in your `.env` to another number (e.g. `3001`) and open that port in the browser instead.

**The terminal shows `ECONNREFUSED`, `ENOTFOUND`, or a timeout.** Check that you copied the *session pooler* string (port 5432), not the direct connection string, and that you're online. Some campus networks block unusual ports; try a hotspot if it persists.

**Page loads but shows no classes after login.** Open the browser dev tools → Network tab and look at the `/api/courses` request. A 401 means the login cookie isn't being set; make sure you're on `http://localhost:3000`, not `127.0.0.1` or a file:// path.

**`Error: Cannot find module ...`** Run `npm install`.

## What's real and what's mock

These go through the backend to the database: **login / logout**, **create account**, **change password** (Settings → Account), and **classes** (add / edit / delete on the Assignments page, including the Learning Suite iCal link and the Canvas class pick).

Everything else is still a front-end mockup: the assignments under each class, the dashboard, the calendar, notification settings, the sync button, and forgot-password. Sample assignments live in `public/js/data.js` and only appear under classes whose course code matches one in that file (IS 401, IS 402, IS 403, IS 404, ACC 200, STAT 121, REL A 275, FIN 201, Personal). The Canvas class list in the add-class modal is also sample data for now.
