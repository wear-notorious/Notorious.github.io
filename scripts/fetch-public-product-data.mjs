// Build-time snapshot of public storefront product fields only.
// Fail closed: never create an empty or incomplete catalog.
import fs from "node:fs";
const URL_BASE = "https://script.google.com/macros/s/AKfycbx90N-BQoq68gskAzmCC_J144d6hg3FMAYIIQd1hevkUa-6aNxNjM4cqBRuCAJNGF0D/exec";
const callback = "notoriousSeoSnapshotCallback";
// Google Apps Script occasionally times out under GitHub Actions. Retry transient
// outages but never publish partial or stale product data after repeated failures.
let response;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    response = await fetch(URL_BASE + "?callback=" + callback, {
      signal: AbortSignal.timeout(30000), redirect:"follow"
    });
    if (!response.ok) {
      const error = Error("Product feed HTTP " + response.status);
      if (response.status >= 400 && response.status < 500) throw error;
      throw error;
    }
    break;
  } catch (error) {
    const clientError = response && response.status >= 400 && response.status < 500;
    if (attempt === 3 || clientError) throw error;
    console.warn("Transient product feed error, retrying attempt "+(attempt+1)+"/3: "+error.message);
    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    response = undefined;
  }
}

const text = (await response.text()).trim();
let payload;
try { payload = JSON.parse(text); }
catch {
  const m = text.match(/^\s*(?:\/\*\*\/\s*)?notoriousSeoSnapshotCallback\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*$/);
  if (!m) throw Error("Expected JSON or callback JSONP. First 120 chars: " + text.slice(0,120));
  payload = JSON.parse(m[1]);
}
if (payload?.products && Array.isArray(payload.products)) payload = payload.products;
if (!Array.isArray(payload)) throw Error("Product feed is not an array");
const keys = ["slug","product","description","price","sizes","material","fit","category","mainImage","image2","image3","image4"];
const products = payload.map(item=>Object.fromEntries(keys.filter(key=>item?.[key]!==undefined&&item[key]!==null).map(key=>[key,item[key]])));
const slugs=new Set();
for (const p of products) {
  if (!/^[a-z0-9-]{1,80}$/.test(String(p.slug||""))) throw Error("Invalid product slug");
  if (!p.product || !p.mainImage) throw Error("Missing public product fields: " + p.slug);
  if (slugs.has(p.slug)) throw Error("Duplicate slug: " + p.slug);
  slugs.add(p.slug);
}
const sitemap = fs.readFileSync("sitemap.xml","utf8");
const known=[...sitemap.matchAll(/product\.html\?slug=([^<\s]+)/g)].map(x=>x[1]);
for(const slug of known) if(!slugs.has(slug)) throw Error("Missing catalog product in sitemap: "+slug);
if(products.length<known.length) throw Error("Incomplete catalog "+products.length+" < "+known.length);
fs.mkdirSync("scripts",{recursive:true});
fs.writeFileSync("scripts/public-products-snapshot.json",JSON.stringify(products,null,2)+"\n");
console.log("Validated "+products.length+" storefront products, "+known.length+" sitemap slugs. Snapshot only includes public product fields.");