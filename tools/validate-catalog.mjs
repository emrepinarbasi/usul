import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const manifestPath = join(root, "public", "veri", "manifest.json");
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));

assert(manifest.schemaVersion === 1, "Manifest şeması 1 olmalı");
assert(Number.isInteger(manifest.catalogVersion) && manifest.catalogVersion > 0,
  "Manifest katalog sürümü geçersiz");

const relativeCatalogPath = String(manifest.catalog?.url ?? "");
assert(!relativeCatalogPath.startsWith("/") && !relativeCatalogPath.includes(".."),
  "Katalog yolu veri klasörü içinde bağıl olmalı");
const catalogPath = join(dirname(manifestPath), relativeCatalogPath);
const catalogBytes = await readFile(catalogPath);
const catalogSha = createHash("sha256").update(catalogBytes).digest("hex");

assert(catalogBytes.length === manifest.catalog.size, "Katalog boyutu manifest ile uyuşmuyor");
assert(catalogSha === manifest.catalog.sha256, "Katalog SHA-256 özeti manifest ile uyuşmuyor");

const catalog = JSON.parse(catalogBytes.toString("utf8"));
assert(catalog.schemaVersion === 1, "Katalog şeması 1 olmalı");
assert(catalog.catalogVersion === manifest.catalogVersion,
  "Manifest ve katalog sürümleri aynı olmalı");
assert(Array.isArray(catalog.patterns) && catalog.patterns.length > 0,
  "Katalog boş olamaz");
assert(catalog.patterns.length === manifest.catalog.recordCount,
  "Kayıt sayısı manifest ile uyuşmuyor");

const ids = new Set();
for (const pattern of catalog.patterns) {
  assert(typeof pattern.id === "string" && pattern.id.length > 0, "Boş usûl kimliği var");
  assert(!ids.has(pattern.id), `Yinelenen usûl kimliği: ${pattern.id}`);
  ids.add(pattern.id);
  assert(Number.isInteger(pattern.zaman) && pattern.zaman >= 2 && pattern.zaman <= 300,
    `${pattern.id}: zaman geçersiz`);
  assert([2, 4, 8, 16].includes(pattern.denominator), `${pattern.id}: mertebe geçersiz`);
  assert(Number.isInteger(pattern.cycleBars) && pattern.cycleBars > 0,
    `${pattern.id}: ölçü çevrimi geçersiz`);
  assert(["ismail_hakki_ozkan", "hursit_ungay"].includes(pattern.source),
    `${pattern.id}: kaynak geçersiz`);
  assert(Array.isArray(pattern.hits) && pattern.hits.length > 0,
    `${pattern.id}: vuruş bulunamadı`);

  let total = 0;
  for (const [index, hit] of pattern.hits.entries()) {
    assert(["dum", "tek", "both"].includes(hit.sound),
      `${pattern.id} #${index + 1}: ses geçersiz`);
    assert(["upper", "lower", "both"].includes(hit.notationLine),
      `${pattern.id} #${index + 1}: nota çizgisi geçersiz`);
    assert(typeof hit.syllable === "string" && hit.syllable.trim().length > 0,
      `${pattern.id} #${index + 1}: hece boş`);
    assert(Number.isFinite(hit.lengthInZaman) && hit.lengthInZaman > 0,
      `${pattern.id} #${index + 1}: ses süresi geçersiz`);
    assert(Number.isFinite(hit.notationLengthInZaman) && hit.notationLengthInZaman > 0,
      `${pattern.id} #${index + 1}: nota süresi geçersiz`);
    total += hit.lengthInZaman;
  }
  const expected = pattern.zaman * pattern.cycleBars;
  assert(Math.abs(total - expected) < 0.001,
    `${pattern.id}: vuruş toplamı ${total}, beklenen ${expected}`);
}

console.log(`Doğrulandı: katalog v${catalog.catalogVersion}, ${catalog.patterns.length} usûl, ${catalogBytes.length} bayt`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

