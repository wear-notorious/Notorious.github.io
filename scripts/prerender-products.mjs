// Build 26 crawlable product HTML pages from verified public catalog data.
// The existing product page CSS, DOM template and ecommerce functions are reused.
import fs from "node:fs";
import vm from "node:vm";
const BASE="https://wear-notorious.github.io/Notorious.github.io/";
const bt=String.fromCharCode(96), dollar=String.fromCharCode(36,123);
const data=JSON.parse(fs.readFileSync("scripts/public-products-snapshot.json","utf8"));
const original=fs.readFileSync("scripts/product-page.html.template","utf8");
const sitemap=fs.readFileSync("sitemap.xml","utf8");
function check(x,msg){if(!x)throw Error(msg);}
function e(x){return String(x??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function clean(x){return String(x??"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();}
function safeJson(x){return JSON.stringify(x).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");}
function webp(x){return String(x||"").replace(/^(images\/[^?#]+)\.(?:png|jpe?g|jfif)(?=([?#].*)?$)/i,"$1.webp");}
function getSeoDescription(p){
 const original=clean(p.description||p.product);
 const placeholder="Premium streetwear T-shirt by NOTORIOUS™. Bold design made for those who wear what they won't.";
 if(original===placeholder && String(p.category||"").toLowerCase()==="tshirts") {
  return (String(p.product)+" — T-shirt graphique streetwear NOTORIOUS™ au Maroc. Livraison gratuite partout au Maroc et paiement à la livraison.").slice(0,160);
 }
 return original.slice(0,160);
}
function url(slug){return BASE+"product-"+encodeURIComponent(slug)+".html";}
const planned=new Map(),slugs=new Set(),modifiedProducts=new Set();
const buildDate=new Date().toISOString().slice(0,10);
check(Array.isArray(data)&&data.length>=26,"Incomplete source catalog");
for(const p of data){check(/^[a-z0-9-]+$/.test(p.slug)&&p.product&&p.mainImage,"Invalid product fields");check(!slugs.has(p.slug),"Duplicate slug");slugs.add(p.slug);}
const listed=[...sitemap.matchAll(/\/product(?:\.html\?slug=|-)([a-z0-9-]+)(?:\.html)?<\/loc>/g)].map(x=>x[1]);
check(listed.length>=26&&listed.every(slug=>slugs.has(slug)),"Sitemap slugs disagree with catalog; abort");
const loadSlug='const slug = params.get("slug");';
const initial='<div id="productPage" class="loading">\n    LOADING PRODUCT...\n  </div>';
const initialCanon='const canonicalUrl = new URL(window.location.pathname, window.location.origin);\n    canonicalUrl.searchParams.set("slug", slug);';
const loadedCanon='const productUrl = new URL(window.location.pathname, window.location.origin);\n    productUrl.searchParams.set("slug", String(product.slug));';
const createCanon='const canonicalLink = document.createElement("link");\n    canonicalLink.rel = "canonical";\n    canonicalLink.href = canonicalUrl.href;\n    document.head.appendChild(canonicalLink);';
for(const marker of [loadSlug,initial,initialCanon,loadedCanon,createCanon])check(original.includes(marker),"Missing source marker: "+marker.slice(0,45));
const lead="productPage.innerHTML = "+bt;
const begin=original.indexOf(lead);
const finish=original.indexOf(bt+";\n\n    const mightLikeGrid",begin+lead.length);
check(begin>=0&&finish>begin,"Cannot locate original product markup template");
const productTemplate=original.slice(begin+lead.length,finish);
// Dynamic catalog may gain new products between scheduled builds.
// Unknown slugs always retain the working legacy product.html?slug= URL.
function links(src){
 const expr=(name)=>dollar+'(NOTORIOUS_SEO_PRODUCT_SLUGS.has(String('+name+').toLowerCase()) ? "product-" + encodeURIComponent('+name+') + ".html" : "product.html?slug=" + encodeURIComponent('+name+'))}';
 let out=src
 .replaceAll("product.html?slug="+dollar+"encodeURIComponent(product.slug)}",expr("product.slug"))
 .replaceAll("product.html?slug="+dollar+"product.slug}",expr("product.slug"))
 .replaceAll("product.html?slug="+dollar+"item.slug}",expr("item.slug"))
 .replaceAll("product-"+dollar+"encodeURIComponent(product.slug)}.html",expr("product.slug"))
 .replaceAll("product-"+dollar+"encodeURIComponent(item.slug)}.html",expr("item.slug"))
 .replace(/product\.html\?slug=([a-z0-9-]+)/g,(_,slug)=>slugs.has(slug) ? "product-"+slug+".html" : "product.html?slug="+slug);
 if(out.includes("NOTORIOUS_SEO_PRODUCT_SLUGS.has")&&!out.includes("const NOTORIOUS_SEO_PRODUCT_SLUGS =")){
   const marker="<\/head>";
   check(out.includes(marker),"No head for static link allowlist");
   out=out.replace(marker,'<script>const NOTORIOUS_SEO_PRODUCT_SLUGS = new Set('+JSON.stringify([...slugs])+');</script>\n'+marker);
 }
 return out;
}
// Keep old query-string URLs functional, with clear canonical toward their static equivalent.
const legacy=original
 .replace(initialCanon,'const canonicalUrl = new URL("product-" + encodeURIComponent(slug.toLowerCase()) + ".html", window.location.href);')
 .replace(loadedCanon,'const productUrl = new URL("product-" + encodeURIComponent(String(product.slug).toLowerCase()) + ".html", window.location.href);');
planned.set("product.html",links(legacy));
// Never silently overwrite a merchant's later changes to the live product page.
// A design/function edit must be copied into the maintained master template first.
const liveProduct=fs.readFileSync("product.html","utf8");
const omitGeneratedSlugList=s=>s.replace(/<script>const NOTORIOUS_SEO_PRODUCT_SLUGS = new Set\(\[[^\]]*\]\);<\/script>\s*/g,"");
const initialMigration=!liveProduct.includes("NOTORIOUS_SEO_PRODUCT_SLUGS")&&liveProduct.includes("product.html?slug=");
check(initialMigration || omitGeneratedSlugList(liveProduct)===omitGeneratedSlugList(planned.get("product.html")),
 "Live product.html changed since the static master template was synced. Refusing to overwrite product design or ecommerce code. Update scripts/product-page.html.template together with product.html before rerunning.");
for(const product of data){
 const images=[product.mainImage,product.image2,product.image3,product.image4].filter(Boolean).map(webp);
 const sizes=String(product.sizes||"").split(",").map(x=>x.trim()).filter(Boolean);
 const markup=vm.runInNewContext(bt+productTemplate+bt,{product,productImages:images,sizes,toWebpImage:webp},{timeout:1500});
 check(markup.includes('<h1>'+product.product+'</h1>')&&markup.includes('id="mainProductImage"')&&markup.includes('onclick="addToCart()"'),"Template not fully rendered: "+product.slug);
 const description=getSeoDescription(product);
 const title=String(product.product)+" | NOTORIOUS™";
 const canonicalUrl=url(product.slug);
 const pic=new URL(webp(product.mainImage),BASE).href;
 const ld={"@context":"https://schema.org","@type":"Product",name:String(product.product),description,image:images.map(img=>new URL(img,BASE).href),url:canonicalUrl,brand:{"@type":"Brand",name:"NOTORIOUS™"}};
 const price=Number(product.price);
 if(Number.isFinite(price)&&price>=0)ld.offers={"@type":"Offer",price,priceCurrency:"MAD",url:canonicalUrl};
 let page=original.replace(initial,'<div id="productPage">'+markup+'</div>\n<script>window.currentProduct = '+safeJson(product)+';</script>');
 page=page.replace(loadSlug,'const slug = '+JSON.stringify(product.slug)+';');
 page=page.replace('canonicalUrl.searchParams.set("slug", slug);','// Static canonical already set in path.');
 page=page.replace('productUrl.searchParams.set("slug", String(product.slug));','// Static canonical already set in path.');
 page=page.replace(createCanon,'const canonicalLink = document.querySelector(\'link[rel="canonical"]\') || document.createElement("link");\n    canonicalLink.rel = "canonical";\n    canonicalLink.href = canonicalUrl.href;\n    if (!canonicalLink.isConnected) document.head.appendChild(canonicalLink);');
 page=page.replace('productPage.innerHTML = "ERROR LOADING PRODUCT";','if (!productPage.querySelector(".product-layout")) productPage.innerHTML = "ERROR LOADING PRODUCT";');
 let at=page.indexOf("</head>");check(at>0,"No head");
 let head=page.slice(0,at),rest=page.slice(at);
 head=head.replace("<title>Streetwear Product | NOTORIOUS™</title>","<title>"+e(title)+"</title>")
 .replace('<meta name="description" content="Explore bold streetwear by NOTORIOUS™. View product details, sizes and pricing.">','<meta name="description" content="'+e(description)+'">')
 .replace('<meta property="og:title" content="Streetwear Product | NOTORIOUS™">','<meta property="og:title" content="'+e(title)+'">')
 .replace('<meta property="og:description" content="Explore bold streetwear by NOTORIOUS™. View product details, sizes and pricing.">','<meta property="og:description" content="'+e(description)+'">')
 .replace('<meta property="og:url" content="'+BASE+'product.html">','<meta property="og:url" content="'+e(canonicalUrl)+'">')
 .replace('<meta property="og:image" content="'+BASE+'images/Favicon-Notorious.webp">','<meta property="og:image" content="'+e(pic)+'">')
 .replace('<meta name="twitter:title" content="Streetwear Product | NOTORIOUS™">','<meta name="twitter:title" content="'+e(title)+'">')
 .replace('<meta name="twitter:description" content="Explore bold streetwear by NOTORIOUS™. View product details, sizes and pricing.">','<meta name="twitter:description" content="'+e(description)+'">');
 head+='<link rel="canonical" href="'+e(canonicalUrl)+'">\n<meta name="twitter:image" content="'+e(pic)+'">\n<script id="product-jsonld" type="application/ld+json">'+safeJson(ld)+'</script>\n';
 page=links(head+rest);
 check(page.includes('href="'+canonicalUrl+'"')&&page.includes('id="mainProductImage"')&&page.includes('function addToCart()')&&page.includes('function orderNow()')&&page.includes('type="application/ld+json"'),"Page validation failed "+product.slug);
 const outputFile="product-"+product.slug+".html";
 if(!fs.existsSync(outputFile)||fs.readFileSync(outputFile,"utf8")!==page) modifiedProducts.add(product.slug);
 planned.set(outputFile,page);
}
const articles=["gym-streetwear-maroc","hoodie-320gsm-maroc","graphic-tshirt-style-maroc","oversized-vs-regular-fit-tshirt-maroc","kifach-tkhtar-hoodie-qualite-maroc","gym-outfits-hommes-maroc","hoodie-vs-sweatshirt-maroc","style-black-graphic-tshirt-maroc"];
for(const path of ["index.html","products.html",...articles.map(a=>"journal/"+a+".html")]){
 const before=fs.readFileSync(path,"utf8"),after=links(before);
 if(before!==after)planned.set(path,after);
}
let newSitemap=sitemap.replace(/<loc>(https:\/\/wear-notorious\.github\.io\/Notorious\.github\.io\/)product\.html\?slug=([a-z0-9-]+)<\/loc>/g,(_,prefix,slug)=>'<loc>'+prefix+'product-'+slug+'.html</loc>');
const urls=new Set([...newSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]));
for(const p of data){if(!urls.has(url(p.slug))){newSitemap=newSitemap.replace('</urlset>','  <url><loc>'+url(p.slug)+'</loc></url>\n</urlset>');urls.add(url(p.slug));}}
check([...newSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].length===urls.size,"Duplicate sitemap URLs");
check(data.every(p=>urls.has(url(p.slug)))&&!newSitemap.includes("product.html?slug="),"Incorrect sitemap migration");
// Mark meaningful product updates in the sitemap, not every daily cron run.
for (const p of data) {
 const locator="<loc>"+url(p.slug)+"</loc>";
 const locIndex=newSitemap.indexOf(locator);
 check(locIndex>=0,"Sitemap missing product: "+p.slug);
 const blockStart=newSitemap.lastIndexOf("<url>",locIndex);
 const blockEnd=newSitemap.indexOf("</url>",locIndex)+6;
 check(blockStart>=0&&blockEnd>locIndex,"Broken sitemap product block: "+p.slug);
 let block=newSitemap.slice(blockStart,blockEnd);
 if(modifiedProducts.has(p.slug)||!block.includes("<lastmod>")) {
   const lastmod="<lastmod>"+buildDate+"</lastmod>";
   if(block.includes("<lastmod>"))block=block.replace(/<lastmod>[^<]*<\/lastmod>/,lastmod);
   else block=block.replace(locator,locator+"\n    "+lastmod);
   newSitemap=newSitemap.slice(0,blockStart)+block+newSitemap.slice(blockEnd);
 }
}
planned.set("sitemap.xml",newSitemap);");
 const block=new RegExp("(<url>\\s*<loc>"+escaped+"<\\/loc>)([\\s\\S]*?)(<\\/url>)","g");
 let matched=false;
 newSitemap=newSitemap.replace(block,(whole,open,mid,close)=>{
  matched=true;
  if(modifiedProducts.has(p.slug)||!/<lastmod>/.test(mid)) {
    const nextMid=/<lastmod>/.test(mid)?mid.replace(/<lastmod>[^<]*<\\/lastmod>/g,"<lastmod>"+buildDate+"</lastmod>"):mid+"\\n    <lastmod>"+buildDate+"</lastmod>";
    return open+nextMid+close;
  }
  return whole;
 });
 check(matched,"Unable to locate sitemap block for "+p.slug);
}
planned.set("sitemap.xml",newSitemap);
// All validation above completes before writing any files.
for(const [file,content] of planned)fs.writeFileSync(file,content,"utf8");
console.log("Generated "+data.length+" product pages and updated "+planned.size+" files in the SEO preview.");
console.log("Verified real product names, canonical tags, static content, Product JSON-LD and commerce handler signatures.");
