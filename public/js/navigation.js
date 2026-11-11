/* Shared mobile drawer: keyboard access, focus return, and a non-interactive background. */
(() => {
  document.querySelectorAll("[data-mobile-disclosure]").forEach(button => {
    const panel = document.getElementById(button.dataset.mobileDisclosure);
    if (!panel) return;
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      panel.classList.toggle("is-open", open);
    });
  });
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  const opener = document.getElementById("menu-open");
  const closer = document.getElementById("menu-close");
  const scrim = document.getElementById("nav-scrim");
  const main = document.getElementById("main-content");
  const header = document.querySelector(".mobile-header");
  const mobile = window.matchMedia("(max-width: 760px)");
  let open = false;

  function setOpen(value, returnFocus = true) {
    open = value && mobile.matches;
    sidebar.classList.toggle("is-open", open);
    sidebar.inert = mobile.matches && !open;
    document.body.classList.toggle("navigation-open", open);
    scrim.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    main.inert = open;
    header.inert = open;
    if (open) {
      sidebar.setAttribute("role", "dialog");
      sidebar.setAttribute("aria-modal", "true");
      closer.focus();
    } else {
      sidebar.removeAttribute("role");
      sidebar.removeAttribute("aria-modal");
      if (returnFocus && mobile.matches) opener.focus();
    }
  }
  opener.addEventListener("click", () => setOpen(true));
  closer.addEventListener("click", () => setOpen(false));
  scrim.addEventListener("click", () => setOpen(false));
  sidebar.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setOpen(false, false)));
  document.addEventListener("keydown", event => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
    if (event.key === "Tab") {
      const items = [...sidebar.querySelectorAll('a[href], button:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  mobile.addEventListener("change", () => {
    const focusedInside = sidebar.contains(document.activeElement);
    setOpen(false, focusedInside);
  });
  setOpen(false, false);
})();
