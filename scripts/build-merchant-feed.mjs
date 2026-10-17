// Generate a Google Merchant Center UTF-8 tab-separated data source (TSV).
// Source of truth: the same verified storefront catalog used to build product pages.
// No design, price, image or checkout files are changed by this script.
import fs from "node:fs";

const BASE="https://wear-notorious.github.io/Notorious.github.io/";
const products=JSON.parse(fs.readFileSync("scripts/public-products-snapshot.json","utf8"));
const inputCols=[
"id","item_group_id","title","description","link","image_link",
"additional_image_link","availability","price","condition","brand",
"color","size","gender","age_group","product_type","material"
];
const allowedSizes=new Set(["XS","S","M","L","XL","XXL","XXXL","3XL","4XL"]);
const rows=[],keys=new Set(),ids=new Set();
let skipped=0;

function assert(ok,msg){if(!ok)throw Error(msg);}
function text(x){return String(x??"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim();}
function webp(s){return String(s||"").replace(/^(images\/[^?#]+)\.(?:png|jpe?g|jfif)(?=([?#].*)?$)/i,"$1.webp");}
function merchantColor(title) {
 const matches=[...String(title).toUpperCase().matchAll(/\b(BLACK|WHITE)\b/g)];
 const colors=[...new Set(matches.map(m=>m[1]))];
 return colors.length===1 ? (colors[0]==="BLACK"?"Black":"White") : null;
}
function type(category) {
 const k=String(category||"").toLowerCase();
 if(k==="tshirts")return "Clothing > T-shirts";
 if(k==="hoodies")return "Clothing > Hoodies";
 if(k==="muscle-tee")return "Clothing > Tank tops";
 if(k==="hooded-tank-top")return "Clothing > Hooded tank tops";
 return null;
}
function gender(fit) {
 const k=String(fit||"").toLowerCase();
 if(k==="unisex")return "unisex";
 if(k==="men"||k==="male")return "male";
 if(k==="women"||k==="female")return "female";
 return null;
}
assert(Array.isArray(products)&&products.length>=26,"Public catalog missing expected product families");
for(const p of products){
 assert(/^[a-z0-9-]+$/.test(String(p.slug||"")),"Invalid slug");
 assert(!keys.has(p.slug),"Duplicate product slug");
 keys.add(p.slug);
 const color=merchantColor(p.product),category=type(p.category),sex=gender(p.fit);
 const sizes=String(p.sizes||"").split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);
 const price=Number(p.price);
 if(!color||!category||!sex||!sizes.length) {
   console.warn("Skipping feed product with unverified apparel details:",p.slug);
   skipped++;continue;
 }
 assert(Number.isFinite(price)&&price>0,"Price missing for "+p.slug);
 assert(p.mainImage&&p.product&&p.description,"Product required details missing for "+p.slug);
 const images=[p.mainImage,p.image2,p.image3,p.image4].filter(Boolean).map(webp);
 for(const img of images)assert(fs.existsSync(img),"Missing image for "+p.slug+": "+img);
 for(const size of sizes){
   if(!allowedSizes.has(size)){console.warn("Skipping unverified apparel size",p.slug,size);continue;}
   const id="NOTORIOUS-"+p.slug+"-"+size;
   assert(!ids.has(id),"Duplicate variant ID "+id);ids.add(id);
   const link=BASE+"product-"+p.slug+".html?size="+encodeURIComponent(size);
   const row={
     id,item_group_id:"NOTORIOUS-"+p.slug,
     title:text(p.product)+" - "+size,
     description:text(p.description).slice(0,5000),
     link,
     image_link:new URL(images[0],BASE).href,
     additional_image_link:images.slice(1).map(s=>new URL(s,BASE).href).join(","),
     // The live store currently accepts online orders for every listed size,
     // with stated delivery in about 2-5 business days.
     // Merchant must change this if any size becomes unavailable.
     availability:"in_stock",
     price:price.toFixed(2)+" MAD",
     condition:"new",
     brand:"NOTORIOUS™",
     color,size,gender:sex,age_group:"adult",product_type:category,
     material:text(p.material||"")
   };
   for(const key of inputCols)assert(!/[\t\r\n]/.test(String(row[key]??"")),"Unsafe cell "+key+" "+id);
   rows.push(inputCols.map(key=>String(row[key]??"")).join("\t"));
 }
}
assert(rows.length>=130,"Incomplete feed: expected at least 130 active variants, got "+rows.length);
const output=inputCols.join("\t")+"\n"+rows.join("\n")+"\n";
fs.writeFileSync("merchant-feed.txt",output,"utf8");
const parsed=fs.readFileSync("merchant-feed.txt","utf8").trimEnd().split("\n");
assert(parsed.length===rows.length+1,"Feed row count mismatch");
assert(parsed.every(line=>line.split("\t").length===inputCols.length),"TSV column mismatch");
console.log("Merchant feed validated:",products.length,"products,",rows.length,"size variants,",skipped,"skipped. No storefront design changes.");
