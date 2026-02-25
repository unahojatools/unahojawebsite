(function () {
  const ADS = {
    loaded: false,

    // Cuando tengas anuncios, pega aquí el script (AdSense u otra red)
    ADS_SCRIPT_HTML: "",

    loadOnce() {
      if (this.loaded) return;
      if (!this.ADS_SCRIPT_HTML) return;
      const container = document.createElement("div");
      container.innerHTML = this.ADS_SCRIPT_HTML.trim();

      container.querySelectorAll("script").forEach(s => {
        const ns = document.createElement("script");
        for (const a of s.attributes) ns.setAttribute(a.name, a.value);
        ns.textContent = s.textContent || "";
        document.head.appendChild(ns);
      });

      this.loaded = true;
    },

    updateSlots(consented) {
      document.querySelectorAll("[data-adslot]").forEach(slot => {
        slot.textContent = consented
          ? "Espacio de anuncios (activado)"
          : "Espacio de anuncios (desactivado)";
      });
    }
  };

  window.UH_ADS = ADS;
})();
