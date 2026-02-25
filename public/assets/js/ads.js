(function () {
  const ADS = {
    loaded: false,

    // Script oficial de AdSense (ya tienes el ID correcto)
    ADS_SCRIPT_SRC: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4355648452058446",

    loadOnce() {
      if (this.loaded) return;
      this.loaded = true;

      const s = document.createElement("script");
      s.async = true;
      s.src = this.ADS_SCRIPT_SRC;
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);

      s.onload = () => {
        this.renderSlots();
      };
    },

    renderSlots() {
      document.querySelectorAll("[data-adslot]").forEach(el => {
        // Evita renderizar dos veces
        if (el.dataset.filled) return;
        el.dataset.filled = "1";

        el.innerHTML = `
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-4355648452058446"
     data-ad-slot="1234567890"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
        `;

        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {}
      });
    }
  };

  // SOLO cargamos anuncios si el usuario aceptó cookies
  if (localStorage.getItem("ads_consent") === "accepted") {
    if (document.readyState === "complete") {
      ADS.loadOnce();
    } else {
      window.addEventListener("load", () => ADS.loadOnce());
    }
  }
})();
