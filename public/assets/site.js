const manifestSummary = document.querySelector("#manifest-summary");
const catalogState = document.querySelector("#catalog-state");

async function loadCatalogStatus() {
  try {
    const manifestResponse = await fetch("veri/manifest.json", { cache: "no-store" });
    if (!manifestResponse.ok) throw new Error(`Manifest HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const catalogResponse = await fetch(new URL(manifest.catalog.url, manifestResponse.url), { cache: "no-store" });
    if (!catalogResponse.ok) throw new Error(`Katalog HTTP ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    const patterns = Array.isArray(catalog.patterns) ? catalog.patterns : [];
    const sources = new Map();
    for (const pattern of patterns) {
      const key = pattern.source || "bilinmeyen";
      const item = sources.get(key) || { name: pattern.sourceDisplayName || key, count: 0 };
      item.count += 1;
      sources.set(key, item);
    }

    document.querySelector("#pattern-count").textContent = String(patterns.length);
    document.querySelector("#source-count").textContent = String(sources.size);
    document.querySelector("#record-count").textContent = String(manifest.catalog.recordCount);
    document.querySelector("#catalog-version").textContent = `v${manifest.catalogVersion}`;
    document.querySelector("#published-at").textContent = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(manifest.publishedAt));
    catalogState.textContent = patterns.length === manifest.catalog.recordCount ? "Geçerli" : "Kayıt farkı";
    manifestSummary.textContent = `v${manifest.catalogVersion} · ${manifest.catalog.recordCount} doğrulanmış kayıt`;

    const sourceList = document.querySelector("#source-list");
    sourceList.replaceChildren(...[...sources.values()].sort((a, b) => a.name.localeCompare(b.name, "tr")).map(source => {
      const row = document.createElement("div");
      row.className = "source-row";
      const name = document.createElement("span");
      name.textContent = source.name;
      const count = document.createElement("strong");
      count.textContent = `${source.count} kayıt`;
      row.append(name, count);
      return row;
    }));
  } catch (error) {
    manifestSummary.textContent = "Katalog çevrimdışı; GitHub yedeği kullanılabilir";
    catalogState.textContent = "Erişilemiyor";
    console.warn("Katalog durumu okunamadı", error);
  }
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  }
}, { threshold: .12 });
document.querySelectorAll(".reveal").forEach(element => observer.observe(element));

const dialog = document.querySelector("#image-dialog");
const dialogImage = dialog.querySelector("img");
document.querySelectorAll(".shot").forEach(button => {
  button.addEventListener("click", () => {
    dialogImage.src = button.dataset.image;
    dialogImage.alt = button.dataset.alt || "Uygulama ekran görüntüsü";
    dialog.showModal();
  });
});
dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => {
  if (event.target === dialog) dialog.close();
});

loadCatalogStatus();
