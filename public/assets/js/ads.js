(function () {
  const ADS = {
    loaded: false,
    client: "ca-pub-4355648452058446",
    slot: "5742263608",
    scriptSrc: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4355648452058446",

    loadOnce() {
      if (this.loaded) return;
      this.loaded = true;

      const s = document.createElement("script");
      s.async = true;
      s.src = this.scriptSrc;
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);

      s.onload = () => this.renderSlots();
    },

    renderSlots() {
      document.querySelectorAll("[data-adslot]").forEach((el) => {
        if (el.dataset.filled) return;
        el.dataset.filled = "1";

        el.innerHTML = `
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="${this.client}"
     data-ad-slot="${this.slot}"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>`;

        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {}
      });
    },
  };

  // ✅ ESTA es tu clave real del banner (app.js)
  const consentKey = "unahojatools_consent_ads_v1";
  const consentValue = localStorage.getItem(consentKey); // "yes" | "no" | null
  const consented = consentValue === "yes";

  if (consented) {
    // Cargar AdSense solo si hay consentimiento
    if (document.readyState === "complete") ADS.loadOnce();
    else window.addEventListener("load", () => ADS.loadOnce());
  } else {
    // Placeholder si no hay consentimiento
    document.querySelectorAll("[data-adslot]").forEach((el) => {
      el.textContent = "Espacio de anuncios (desactivado)";
      el.removeAttribute("data-filled");
    });
  }
})();
