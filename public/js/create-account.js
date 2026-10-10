/* Create-account page: POST /api/register, which also signs the new user in. */

const form = document.getElementById("create-form");
const errorBox = document.getElementById("create-error");
const btn = document.getElementById("create-btn");

function showError(msg) { errorBox.textContent = msg; errorBox.classList.add("show"); }
function clearError() { errorBox.textContent = ""; errorBox.classList.remove("show"); }
const val = id => document.getElementById(id).value;

form.addEventListener("submit", async e => {
  e.preventDefault();
  clearError();

  const fields = {
    first_name: val("first").trim(),
    last_name: val("last").trim(),
    username: val("username").trim(),
    email: val("email").trim(),
    password: val("pass"),
  };

  /* Inline checks; the server repeats all of them. */
  if (!fields.first_name || !fields.last_name) return showError("Enter your first and last name.");
  if (!fields.username) return showError("Choose a username.");
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(fields.username)) return showError("Username must be 3 to 50 characters: letters, numbers, dots, dashes, or underscores.");
  if (!fields.email) return showError("Enter your email.");
  if (fields.password.length < 8) return showError("Password must be at least 8 characters.");
  if (fields.password !== val("pass2")) return showError("Passwords do not match.");

  btn.disabled = true;
  btn.textContent = "Creating account";
  try {
    await API.register(fields);
    window.location.href = "dashboard.html";
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = "Create account";
  }
});
