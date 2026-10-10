# is401-datamodel_and_backend
<h2>APP SUMMARY:</h2>

BYU students often struggle to keep track of assignments and deadlines because their coursework can be spread across multiple classes, platforms, and tools. Week by week, professors are adding and updating assignments, requiring students to repeatedly check different locations to understand what is due and when it is due, which leads to a lot of stress and confusion. There is not one centralized dashboard to clearly show upcoming deadlines, and no platform to directly notify computers or cellphones with due dates and reminders for assignments. This app is designed to integrate Canvas and Learning Suite assignments into one place automatically and provide the user with a simple dashboard or calendar to see assignments. The app also permits BYU Students to set up notifications to be alerted about deadlines and changes in assignments. 

<h2>ERD:</h2>
<img width="3360" height="2580" alt="image" src="https://github.com/user-attachments/assets/bf7e813b-8073-4589-b2b8-4fe5d8dc6767" />


<h2>TECH STACK:</h2>

Front End - HTML/CSS/JavaScript: This was used to create the user interface and interaction with the user

Back End - Node/Express: This is used to manage communication and applications between the front end and the database

Database - This is where we will store data and changes made

This approach fits our team and project because, between the four core classes, these are the ones we are learning about and have the most experience with.

<h2>HOW TO GET IT RUNNING:</h2>
*The database is hosted on Supabase, meaning that each person runs the app on their own computer. Everything is shared to the same database.
<br>
<h3>One-time setup:</h3>
<ol>
  <li>Install Node.js (version 18 or newer) from https://nodejs.org. Check with <code>node -v</code>.</li>
  <li>Clone the repo: <br> <code>git clone https://github.com/elisa-hermosilla/is401-datamodel_and_backend.git cd is401-datamodel_and_backend</code></li>
  <li>Install dependencies (they are not stored in the repo) <br> <code>npm install</code></li>
  <li>Create your <code>.env</code> file. Copy <code>.env.example</code> to <code>.env</code> in the project root, then change the SESSION_SECRET to a long random string</li>
</ol>
<br>
Note: We know that having the credentials in the <code>.env.example</code> file isn't the greatest idea. We currently have them there for the sake of easy testing, but they will be removed later on
<br>
<h3>Every Time you Want to Run It</h3>
<ol>
  <li>Run: <br><code>git pull</code><br><code>npm start</code></li>
  <li>Then open <a href="http://localhost:3000">http://localhost:3000</a> and click Create account to make your own login. If you want to see sample data (three classes with assignments), sign in as the shared demo account:</li>
  <img width="230" height="94" alt="image" src="https://github.com/user-attachments/assets/2b0c9100-454d-4ae3-a77b-3bb4a60ae7f4" />
  <li>Press <code>Ctrl+C</code> in the terminal to stop the server</li>
</ol>
Windows Only: if <code>npm start</code> fails with "running scripts is disabled on this system", either run <code>npm.cmd start</code> instead, or run this once in PowerShell and then use <code>npm start</code> normally: <br><code>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</code>
<br>
Mac & Linux don't need this!
<br>
Run <code>npm install</code> again only if <code>package.json</code> changed since your last pull (you'll see an error about a missing module if so).
<br>
<h3>If something goes wrong or isn't working, please see how-to-get-it-running.md for specific details</h3>

<h2>VERIFYING THE VERTICAL SLICE:</h2>
<ol>
  <li>Login via this test account: user <code>cosmocougar</code>, password <code>gocougs!</code></li>
  <li>On the left sidebar, click on "Assignments"</li>
  <li>Click the "Add Class" button</li>
  <li>Type in the Course Code, Course Name, and pick a color for the class, then hit "Add Class"</li>
</ol>
<br>
**Claude AI was used for brainstorming and generating the ERD**

**Claude AI was used for developing the Frontend and Backend**
