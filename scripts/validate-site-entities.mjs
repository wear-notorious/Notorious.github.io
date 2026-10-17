// Validation for non-visual structured data. Run after build-site-entities.mjs.
import fs from "node:fs";
import vm from "node:vm";
const BASE="https://wear-notorious.github.io/Notorious.github.io/";
const products=JSON.parse(fs.readFileSync("scripts/public-products-snapshot.json","utf8"));
function check(ok,msg){if(!ok)throw Error(msg);}
function pageData(path){
 const html=fs.readFileSync(path,"utf8"),head=html.slice(0,html.indexOf("</head>"));
 check(head.length>0,"Missing document head "+path);
 const all=[...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 const ld=all.filter(m=>/type="application\/ld\+json"/.test(m[1])).map(m=>JSON.parse(m[2]));
 for(const m of all)if(!/type="application\/ld\+json"/.test(m[1])&&!/\bsrc=/.test(m[1])&&m[2].trim())new vm.Script(m[2],{filename:path});
 return {html,head,ld};
}
const home=pageData("index.html");
const org=home.ld.find(x=>x["@type"]==="Organization"),web=home.ld.find(x=>x["@type"]==="WebSite");
check(org?.["@id"]===BASE+"#organization","Invalid Organization ID");
check(web?.["@id"]===BASE+"#website"&&web?.publisher?.["@id"]===org["@id"],"Invalid WebSite publisher");
check(["instagram.com","tiktok.com","facebook.com"].every(host=>org.sameAs?.some(url=>url.includes(host))),"Official social profiles missing");
check(org.email==="wear.notorious0@gmail.com","Unverified contact email");
const shop=pageData("products.html");
const collection=shop.ld.find(x=>x["@type"]==="CollectionPage");
const list=collection?.mainEntity;
check(list?.["@type"]==="ItemList"&&list?.numberOfItems===products.length,"Wrong number of products in collection");
check(list.itemListElement.length===products.length,"Wrong number of list items");
const found=new Set();
for(const [i,p] of products.entries()){
 const item=list.itemListElement[i],target=BASE+"product-"+p.slug+".html";
 check(item?.position===i+1&&item.item?.["@type"]==="WebPage"&&item.item?.name===p.product&&item.item.url===target,"Wrong schema entry "+p.slug);
 check(!found.has(target),"Duplicate product entry "+p.slug);
 found.add(target);
 check(fs.existsSync("product-"+p.slug+".html"),"Missing linked product "+p.slug);
}
check(shop.head.includes("T-shirts, Hoodies &amp; Streetwear Maroc | NOTORIOUS™"),"Storefront SEO title not applied");
for(const [path,type] of [["about.html","AboutPage"],["contact.html","ContactPage"],["shipping.html","WebPage"],["legal.html","WebPage"]]){
 const {ld,head}=pageData(path);
 const match=ld.find(x=>x["@type"]===type);
 check(match?.url===BASE+path&&match.isPartOf?.["@id"]===BASE+"#website","Invalid page data "+path);
 if(path==="legal.html")check(head.includes("How NOTORIOUS™ handles customer information"),"Legal SEO snippet did not update");
}
console.log("PASS: Brand WebSite/Organization, 26 catalog ItemList entries, four page types, six intact SEO head structures.");
