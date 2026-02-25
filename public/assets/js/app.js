(function () {
  document.querySelectorAll("[data-year]").forEach(el => el.textContent = String(new Date().getFullYear()));

  const path = location.pathname.replace(/\/+$/, "") + "/";
  document.querySelectorAll(".nav a").forEach(a => {
    const href = new URL(a.getAttribute("href"), location.origin).pathname.replace(/\/+$/, "") + "/";
    if (href === path) a.classList.add("active");
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-share]");
    if (!btn) return;
    const url = location.href;
    navigator.clipboard?.writeText(url)
      .then(() => alert("Enlace copiado."))
      .catch(() => prompt("Copia el enlace:", url));
  });

  const key = "unahojatools_consent_ads_v1";
  const bar = document.getElementById("consentbar");
  const accept = document.getElementById("consentAccept");
  const reject = document.getElementById("consentReject");
  const manage = document.querySelectorAll("[data-manage-consent]");

  function getConsent() {
    const v = localStorage.getItem(key);
    if (v === "yes") return true;
    if (v === "no") return false;
    return null;
  }
  function setConsent(v) {
    localStorage.setItem(key, v ? "yes" : "no");
    render();
  }
  function render() {
    const c = getConsent();
    if (!bar) return;

    bar.style.display = (c === null) ? "block" : "none";

    if (c === true && window.UH_ADS) window.UH_ADS.loadOnce();
    if (window.UH_ADS) window.UH_ADS.updateSlots(c === true);
  }

  accept?.addEventListener("click", () => setConsent(true));
  reject?.addEventListener("click", () => setConsent(false));
  manage.forEach(el => el.addEventListener("click", () => {
    if (!bar) return;
    bar.style.display = "block";
  }));

  window.UH = window.UH || {};
  window.UH.getAdsConsent = getConsent;
  window.UH.setAdsConsent = setConsent;

  render();
})();
