// Static checks for product SEO output. Never changes the live store.
import fs from "node:fs";
import vm from "node:vm";
const BASE="https://wear-notorious.github.io/Notorious.github.io/";
const products=JSON.parse(fs.readFileSync("scripts/public-products-snapshot.json","utf8"));
const sitemap=fs.readFileSync("sitemap.xml","utf8");
const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);
function test(x,msg){if(!x)throw Error(msg);}
test(new Set(urls).size===urls.length,"Duplicate sitemap entries");
test(products.length===26,"Unexpected catalog size: "+products.length);
test(urls.length===41,"Expected 41 entries in sitemap");
for(const p of products){
 const path="product-"+p.slug+".html";
 const page=fs.readFileSync(path,"utf8");
 const head=page.slice(0,page.indexOf("</head>"));
 const expected=BASE+path;
 test(urls.includes(expected),"Product missing from sitemap "+p.slug);
 test((head.match(/<link rel="canonical"/g)||[]).length===1&&head.includes('href="'+expected+'"'),"Wrong canonical "+p.slug);
 test(page.includes('<h1>'+p.product+'</h1>')&&page.includes('id="mainProductImage"'),"Missing static product content "+p.slug);
 test(page.includes('function addToCart()')&&page.includes('function orderNow()'),"Missing ecommerce controls "+p.slug);
 test(page.includes('window.currentProduct = '),"Static fallback data missing "+p.slug);
 test(head.includes('name="description"')&&head.includes("twitter:image"),"Missing social/SEO metadata "+p.slug);
 const schema=head.match(/<script id="product-jsonld" type="application\/ld\+json">([\s\S]*?)<\/script>/);
 test(schema,"Product schema not found "+p.slug);
 const obj=JSON.parse(schema[1]);
 test(obj["@type"]==="Product"&&obj.name===p.product&&obj.url===expected,"Invalid Product schema "+p.slug);
 test(obj.offers?.price===Number(p.price)&&obj.offers?.priceCurrency==="MAD","Incorrect price "+p.slug);
 for(const [_,attrs,code] of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(/type="application\/ld\+json"/.test(attrs))JSON.parse(code);
   else if(code.trim()&&!/\bsrc=/.test(attrs))new vm.Script(code,{filename:path});
 }
 for(const key of ["mainImage","image2","image3","image4"]){
   const image=p[key];if(!image)continue;
   const webp=image.replace(/^(images\/[^?#]+)\.(?:png|jpe?g|jfif)(?=([?#].*)?$)/i,"$1.webp");
   test(fs.existsSync(webp),"Image missing "+path+" "+webp);
 }
}
for(const pagePath of ["index.html","products.html","product.html"]){
 const c=fs.readFileSync(pagePath,"utf8");
 test(c.includes("NOTORIOUS_SEO_PRODUCT_SLUGS"),"Missing safe links routing "+pagePath);
 test(c.includes("product.html?slug="),"New product link fallback not retained "+pagePath);
}
console.log("PASS: 26 HTML product pages, canonical/schema/price, images, JavaScript syntax, links and sitemap.");
