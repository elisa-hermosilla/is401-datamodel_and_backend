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

These go through the backend to the database: **login / logout**, **create account**, **change password** (Settings → Account), **classes** (add / edit / delete), **assignments** (add / edit / delete / check off / notes / drag order, on every page), and **Canvas sync**.

**Canvas sync** works like this: in Canvas go to Account → Settings → Approved Integrations → "+ New Access Token", copy the token, and paste it into Settings → Connected accounts in DueList. Then on the Assignments page add a class with Source = Canvas and pick it from your live Canvas course list. "Sync now" (sidebar or Settings) pulls that class's assignments, due dates, submission status, and links. Only classes you add are synced. Assignments you check off by hand stay checked off; assignments with no due date in Canvas are skipped.

**Category mapping.** Adding or editing a Canvas or Learning Suite class is two steps. Step 1 is the class itself. Step 2 lists the class's categories (Canvas assignment groups, or for Learning Suite the keyword groups Readings, Homework, Quizzes, Exams, Papers, Projects, Discussions, Other) and lets you choose which assignment type each one shows as, whether to include it at all, and for Learning Suite a default due time for all-day items. Finish syncs that class right away. Sync never changes a mapping you've made.

**Learning Suite sync** has no API, so it reads each class's iCalendar feed. In Learning Suite open the course, go to Schedule, and copy the iCal link. On the Assignments page add a class with Source = Learning Suite and paste the link; "Check link" confirms it works and shows what's on it. "Sync now" pulls every dated item on the schedule except the "Topic: ..." lecture rows. Items come in as all-day (due 11:59 PM) unless the schedule has a time, and there's no submission status, so checking them off is up to you. Anything the professor wrote beyond the title becomes the item's starting note.

Still mock: notification settings (the form works but nothing is saved), the streak numbers, and forgot-password.
