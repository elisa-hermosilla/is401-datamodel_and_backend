/* Sign-in page: POST /api/login, then go to the dashboard. */

const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");
const btn = document.getElementById("login-btn");

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("show");
}
function clearError() {
  errorBox.textContent = "";
  errorBox.classList.remove("show");
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  clearError();

  const identifier = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value;
  if (!identifier && !password) return showError("Enter your username or email and your password.");
  if (!identifier) return showError("Enter your username or email.");
  if (!password) return showError("Enter your password.");

  btn.disabled = true;
  btn.textContent = "Signing in";
  try {
    await API.login(identifier, password);
    window.location.href = "/dashboard";
  } catch (err) {
    showError(err.status === 401 ? "Wrong username or password." : err.message);
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});
