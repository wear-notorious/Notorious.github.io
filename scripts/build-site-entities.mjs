// Strengthen Google-readable site identity and catalog associations.
// Only modifies <head> metadata of pages; NEVER alters storefront body, CSS or checkout.
import fs from "node:fs";
const BASE="https://wear-notorious.github.io/Notorious.github.io/";
const ORG=BASE+"#organization",WEBSITE=BASE+"#website";
const productData=JSON.parse(fs.readFileSync("scripts/public-products-snapshot.json","utf8"));
const catalog=fs.readFileSync("products.html","utf8"),home=fs.readFileSync("index.html","utf8"),contact=fs.readFileSync("contact.html","utf8"),about=fs.readFileSync("about.html","utf8");
function test(ok,msg){if(!ok)throw Error(msg);}
function json(x){return JSON.stringify(x).replace(/</g,"\\u003c");}
function safeHTML(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");}
function webp(s){return String(s||"").replace(/^(images\/[^?#]+)\.(?:png|jpe?g|jfif)(?=([?#].*)?$)/i,"$1.webp");}
function getSchema(page){const head=page.slice(0,page.indexOf("</head>"));const m=head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);test(m,"Existing schema missing");return {text:m[0],data:JSON.parse(m[1])};}
function headOnly(path,transform){
 const before=fs.readFileSync(path,"utf8");
 const split=before.indexOf("</head>");test(split>0,"Missing </head> "+path);
 const head=before.slice(0,split),body=before.slice(split);
 const edited=transform(head);
 test(!edited.includes("</head>"),"Nested head "+path);
 const output=edited+body;
 test(output.slice(output.indexOf("</head>"))===body,"Body changed "+path);
 fs.writeFileSync(path,output,"utf8");
}
function addSchema(head,id,object){
 const marker='data-notorious-schema="'+id+'"';
 const value='<script type="application/ld+json" '+marker+'>'+json(object)+'</script>';
 const rx=new RegExp('<script type="application\\/ld\\+json" '+marker+'>[\\s\\S]*?<\\/script>');
 return rx.test(head)?head.replace(rx,value):head+"\n  "+value+"\n";
}
const socialRefs=[
 "https://www.instagram.com/wear_notorious/",
 "https://www.tiktok.com/@wear_notorious",
 "https://www.facebook.com/wearnotorious"
];
for(const url of socialRefs)test(contact.includes(url),"Official social media link absent from contact page: "+url);
const email="wear.notorious0@gmail.com";
test(contact.includes("mailto:"+email),"Published contact email missing");
test(about.includes("EST. 2026"),"Brand establishment date not verified");
test(productData.length>=26,"Catalog unexpectedly incomplete");
const productUrls=new Set();
const listItems=productData.map((p,index)=>{
 test(p.slug&&p.product&&p.mainImage,"Incomplete product "+index);
 const target="product-"+p.slug+".html";
 test(fs.existsSync(target),"Static product page missing "+target);
 const absolute=BASE+target;
 test(!productUrls.has(absolute),"Duplicate product "+absolute);
 productUrls.add(absolute);
 const image=webp(p.mainImage);
 test(fs.existsSync(image),"Product image missing "+p.slug);
 return {"@type":"ListItem",position:index+1,item:{"@type":"Product",name:p.product,url:absolute,image:BASE+image}};
});
const webSchema={"@context":"https://schema.org","@type":"WebSite","@id":WEBSITE,url:BASE,name:"NOTORIOUS™",alternateName:"NOTORIOUS",publisher:{"@id":ORG}};
headOnly("index.html",h=>{
 const old=getSchema(home),next={...old.data,"@id":ORG,foundingDate:"2026",email,sameAs:socialRefs};
 test(next["@type"]==="Organization","Homepage schema was not Organization");
 let out=h.replace(old.text,'<script type="application/ld+json">'+json(next)+'</script>');
 out=addSchema(out,"website",webSchema);
 return out;
});
const shortName="T-shirts, Hoodies & Streetwear Maroc | NOTORIOUS™";
headOnly("products.html",h=>{
 const old=getSchema(catalog);
 test(old.data["@type"]==="CollectionPage","Expected collection schema");
 const schema={...old.data,name:shortName,isPartOf:{"@id":WEBSITE},mainEntity:{
  "@type":"ItemList",numberOfItems:listItems.length,itemListElement:listItems
 }};
 let out=h.replace(old.text,'<script type="application/ld+json">'+json(schema)+'</script>');
 const oldTitle="T-shirts graphiques, Hoodies &amp; Streetwear au Maroc | NOTORIOUS™";
 const newTitle=safeHTML(shortName);
 if(out.includes("<title>"+oldTitle+"</title>")) {
  test(out.includes('content="'+oldTitle+'"'),"Unexpected products og:title");
  out=out.replace("<title>"+oldTitle+"</title>","<title>"+newTitle+"</title>")
    .replace('property="og:title" content="'+oldTitle+'"','property="og:title" content="'+newTitle+'"');
 } else {
  test(out.includes("<title>"+newTitle+"</title>"),"Unexpected products title");
  test(out.includes('property="og:title" content="'+newTitle+'"'),"Unexpected products og:title");
 }
 return out;
});
const pages=[
 ["about.html","AboutPage","About NOTORIOUS™ | Our Streetwear Brand","Learn about NOTORIOUS™, a Morocco-based streetwear brand established in 2026."],
 ["contact.html","ContactPage","Contact NOTORIOUS™ | Customer Support","Get in touch with NOTORIOUS™ for sizing, order support and shipping questions in Morocco."],
 ["shipping.html","WebPage","Shipping & Returns | NOTORIOUS™","NOTORIOUS™ shipping and returns information for Morocco, including free delivery and order support."],
 ["legal.html","WebPage","Privacy Policy & Terms | NOTORIOUS™","How NOTORIOUS™ handles customer information, orders and delivery terms for shoppers in Morocco."]
];
for(const [path,type,name,desc] of pages){
 headOnly(path,h=>{
  const url=BASE+path;
  const obj={"@context":"https://schema.org","@type":type,"@id":url+"#webpage",url,name,description:desc,inLanguage:"en",isPartOf:{"@id":WEBSITE},publisher:{"@id":ORG}};
  if(type==="ContactPage")obj.about={"@id":ORG};
  let out=addSchema(h,"webpage",obj);
  if(path==="legal.html"){
    const prior="Read the NOTORIOUS™ privacy policy, terms and legal information.";
    const updated=desc;
    if(out.includes('name="description" content="'+prior+'"')){
      out=out.replace('name="description" content="'+prior+'"','name="description" content="'+safeHTML(updated)+'"');
      out=out.replace('property="og:description" content="'+prior+'"','property="og:description" content="'+safeHTML(updated)+'"');
    } else {
      test(out.includes('name="description" content="'+safeHTML(updated)+'"'),"Legal meta description changed");
    }
  }
  return out;
 });
}
console.log("PASS: product item-list count",listItems.length,"official brand identity, metadata and 6 head-only updates.");
