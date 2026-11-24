import { readWallet, setOfflineEnabled } from "/offline-store.js";

const element = (id) => document.getElementById(id);
const walletRoute = ["/", "/my-codes", "/my-codes/", "/offline.html"].includes(location.pathname);
function text(tag, content, parent, className) {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  parent.append(node);
  return node;
}
function render() {
  let wallet = null;
  try { wallet = readWallet(localStorage); } catch { /* Storage is optional. */ }
  element("codes").replaceChildren();
  element("saved-at").hidden = !wallet || !walletRoute;
  element("privacy").hidden = !wallet || !walletRoute;
  element("remove").hidden = !wallet || !walletRoute;
  element("view-codes").hidden = !wallet || walletRoute;
  element("heading").textContent = wallet && walletRoute ? "Your saved codes." : "You're offline.";
  element("description").textContent = wallet && walletRoute
    ? "Already claimed and ready to copy. Reconnect to claim or redeem credits."
    : "Reconnect to claim credits. No saved codes are available on this page.";
  if (!wallet || !walletRoute) return;
  element("saved-at").textContent = `Last synced ${new Date(wallet.savedAt).toLocaleString()}. Changes since then may not be reflected.`;
  for (const item of wallet.codes) {
    const card = document.createElement("article");
    text("h2", item.eventName, card);
    if (item.codeType) text("p", item.codeType, card);
    if (item.value) text("p", item.value, card);
    if (item.detail) text("p", item.detail, card);
    if (item.expiresAt !== undefined) text("p", `Redeem by ${new Date(item.expiresAt).toLocaleDateString()}`, card);
    text("code", item.code, card, "code");
    const copy = text("button", "Copy code", card);
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.code);
        element("status").textContent = "Code copied.";
      } catch {
        element("status").textContent = "Select the code above and copy it manually.";
      }
    });
    element("codes").append(card);
  }
}

element("retry").addEventListener("click", () => {
  // This dependency-free static document deliberately has no Next.js router.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (location.pathname === "/offline.html") location.assign("/my-codes");
  else location.reload();
});
element("remove").addEventListener("click", () => {
  try {
    const removed = setOfflineEnabled(localStorage, false);
    render();
    element("status").textContent = removed
      ? "Offline copies removed. You can save them again from My codes when online."
      : "Browser storage is unavailable. Clear this site's data in your browser settings.";
  } catch { element("status").textContent = "Clear this site's data in your browser settings."; }
});
window.addEventListener("storage", render);
window.addEventListener("pageshow", render);
// No auto-reload: an online event does not mean event Wi-Fi really works, and
// must not interrupt someone reading or copying their code.
setInterval(render, 60_000);
render();
