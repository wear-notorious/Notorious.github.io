// Shared by the private preview, publisher and official repository build.
// The original storefront template is rendered without evaluating merchant input.
export const BASE='https://wear-notorious.github.io/Notorious.github.io/';
export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeJson=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
export const webp=s=>String(s||'').replace(/^(images\/[^?#]+)\.(png|jpe?g|jfif)$/i,'$1.webp');
export const productUrl=slug=>BASE+'product-'+slug+'.html';
function interpolate(text,scope){return text.replace(/\$\{([^{}]+)\}/g,(_,key)=>{key=key.trim();let value;
 if(key==='productImages[0] || ""')value=scope.images[0]||'';
 else if(/^product\.(product|price|description)$/.test(key))value=scope.p[key.split('.')[1]];
 else if(/^product\.(material|fit) \|\| "-"$/.test(key))value=scope.p[key.split('.')[1].split(' ')[0]]||'-';
 else if(key==='image')value=scope.image;else if(key==='size')value=scope.size;else if(key==='index')value=scope.index;
 else if(key==='index + 1')value=scope.index+1;else if(key==='index === 0 ? "active" : ""')value=scope.index===0?'active':'';
 else throw Error('Expression du modèle non reconnue : '+key);
 return escapeHtml(value);
 });}
export function markup(template,p,m={}){
 const lead='productPage.innerHTML = `',start=template.indexOf(lead),end=template.indexOf('`;\n\n    const mightLikeGrid',start+lead.length);
 if(start<0||end<0)throw Error('Modèle du site incompatible.');
 const images=(m.images||[p.mainImage,p.image2,p.image3,p.image4]).filter(Boolean).map(webp),sizes=String(p.sizes||'').split(',').map(x=>x.trim()).filter(Boolean);
 let block=template.slice(start+lead.length,end);
 block=block.replace(/\$\{productImages\.map\(\(image, index\) => `([\s\S]*?)`\)\.join\(""\)\}/g,(_,part)=>images.map((image,index)=>interpolate(part,{p,images,image,index})).join(''));
 block=block.replace(/\$\{sizes\.map\(size => `([\s\S]*?)`\)\.join\(""\)\}/g,(_,part)=>sizes.map(size=>interpolate(part,{p,images,size})).join(''));
 block=interpolate(block,{p,images});if(block.includes('${'))throw Error('Le rendu contient une expression incomplète.');
 let n=0;block=block.replace(/alt="[^"]*"/g,(attr)=>{if(attr==='alt=""')return attr;const alt=(m.alts||[])[n++===0?0:Math.min(n-2,images.length-1)]||p.product;return 'alt="'+escapeHtml(alt)+'"';});
 if(m.hidden||m.stock==='out_of_stock')block=block.replace(/onclick="(?:addToCart|orderNow)\(\)"/g,'disabled aria-disabled="true"').replace('ADD TO CART',m.hidden?'UNAVAILABLE':'OUT OF STOCK').replace('ORDER NOW',m.hidden?'UNAVAILABLE':'OUT OF STOCK');
 if(m.variants?.length>1)block=block.replace('<div class="size-section">','<div class="size-section"><h3>COLOUR</h3><div class="size-options">'+m.variants.map(v=>'<a class="size-btn '+(v.slug===p.slug?'active':'')+'" href="product-'+escapeHtml(v.slug)+'.html">'+escapeHtml(v.color)+'</a>').join('')+'</div></div><div class="size-section">');
 if(m.related?.length)block=block.replace('<!-- Products will load automatically -->',()=>m.related.slice(0,8).map(q=>'<a href="product-'+escapeHtml(q.slug)+'.html" class="might-like-card"><img src="'+escapeHtml(webp(q.mainImage))+'" alt="'+escapeHtml(q.product)+'" loading="lazy"><h3>'+escapeHtml(q.product)+'</h3><div class="might-like-price">'+escapeHtml(q.price)+' MAD</div></a>').join(''));
 return block;
}
export function renderProduct(template,p,m={},preview=false){
 if(!/^[a-z0-9-]{1,80}$/.test(p.slug))throw Error('Lien produit invalide.');
 const canonical=productUrl(p.slug),title=m.title||p.product+' | NOTORIOUS™',description=m.description||String(p.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,160),images=(m.images||[p.mainImage,p.image2,p.image3,p.image4]).filter(Boolean).map(webp);
 const schema={'@context':'https://schema.org','@type':'Product',name:p.product,description,image:images.map(i=>new URL(i,BASE).href),url:canonical,sku:m.sku||'NOTORIOUS-'+p.slug,brand:{'@type':'Brand',name:'NOTORIOUS™'},offers:{'@type':'Offer',price:Number(p.price),priceCurrency:'MAD',url:canonical,...(m.stock?{availability:'https://schema.org/'+(m.hidden?'Discontinued':m.stock==='out_of_stock'?'OutOfStock':'InStock')}:{})}};
 let html=template.replace('<div id="productPage" class="loading">\n    LOADING PRODUCT...\n  </div>',()=>'<div id="productPage">'+markup(template,p,m)+'</div>');
 // Use the exact original styles and commerce functions. Replace only the asynchronous
 // product loader: static data is already validated and does not depend on stale cache.
 const begin=html.indexOf('async function loadProduct()'),end=html.indexOf('let selectedSize = "";',begin);
 if(begin<0||end<0)throw Error('Chargeur du modèle incompatible.');
 html=html.slice(0,begin)+'async function loadProduct(){\n window.currentProduct='+safeJson(p)+';\n}\n'+html.slice(end);
 html=html.replace(/<title>[\s\S]*?<\/title>/,()=>'<title>'+escapeHtml(title)+'</title>')
 .replace(/(<meta name="description" content=")[^"]*(">)/,(_,a,b)=>a+escapeHtml(description)+b)
 .replace(/(<meta name="robots" content=")[^"]*(">)/,(_,a,b)=>a+(m.hidden?'noindex,follow':'index,follow')+b);
 for(const [name,value] of Object.entries({'og:title':title,'og:description':description,'og:url':canonical,'og:image':new URL(images[0]||'',BASE).href,'twitter:title':title,'twitter:description':description}))html=html.replace(new RegExp('(<meta (?:property|name)="'+name+'" content=")[^"]*(">)'),(_,a,b)=>a+escapeHtml(value)+b);
 html=html.replace('</head>','<link rel="canonical" href="'+canonical+'">\n<script id="product-jsonld" type="application/ld+json">'+safeJson(schema)+'</script>\n</head>');
 html=html.replace('loadProduct();', 'loadProduct();\nconst requestedSize=new URLSearchParams(location.search).get("size");if(requestedSize){const button=[...document.querySelectorAll(".size-btn")].find(b=>b.textContent.trim()===requestedSize.toUpperCase());if(button)button.click();}');
 if(m.hidden||m.stock==='out_of_stock')html=html.replace('function addToCart() {','function addToCart() { return;').replace('function orderNow() {','function orderNow() { return;');
 // Legacy recommendation lists remain compatible with the catalog; stock is enforced
 // only on this product page. Existing baskets and the payment system are untouched.
 if(preview){html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\s+on[a-z]+=(?:"[^"]*"|'[^']*')/gi,'').replace('</head>','<base href="'+BASE+'"><meta name="robots" content="noindex,nofollow"></head>');}
 if(!html.includes('id="mainProductImage"')||!html.includes('<h1>'+escapeHtml(p.product)+'</h1>'))throw Error('Fiche incomplète.');return html;
}
export function sitemapUpdate(xml,items,date){for(const {product:p,metadata:m} of items){const url=productUrl(p.slug),escaped=url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');xml=xml.replace(new RegExp('\\s*<url>\\s*<loc>'+escaped+'<\\/loc>[\\s\\S]*?<\\/url>','g'),'');if(!m.hidden)xml=xml.replace('</urlset>','  <url><loc>'+url+'</loc><lastmod>'+date+'</lastmod></url>\n</urlset>');}return xml;}
export function feedUpdate(text,items){const lines=text.trimEnd().split('\n'),headers=lines[0].split('\t'),link=headers.indexOf('link');if(link<0)throw Error('Flux marchand incompatible.');const slugs=new Set(items.map(x=>x.product.slug));const kept=lines.slice(1).filter(line=>{const url=line.split('\t')[link]||'';return ![...slugs].some(s=>url.includes('product-'+s+'.html')||url.includes('slug='+s+'&')||url.endsWith('slug='+s));});for(const {product:p,metadata:m}of items){if(m.hidden)continue;for(const size of m.sizes){const values={id:'NOTORIOUS-'+p.slug+'-'+size,item_group_id:'NOTORIOUS-'+p.slug,title:p.product+' — '+size,description:m.description,link:productUrl(p.slug)+'?size='+encodeURIComponent(size),image_link:new URL(webp(m.images[0]),BASE).href,additional_image_link:m.images.slice(1).map(i=>new URL(webp(i),BASE).href).join(','),availability:m.stock==='out_of_stock'?'out_of_stock':'in_stock',price:Number(p.price).toFixed(2)+' MAD',condition:'new',brand:'NOTORIOUS™',identifier_exists:'no',size,color:m.color||'',gender:'unisex',age_group:'adult',product_type:p.category,material:p.material||''};kept.push(headers.map(h=>String(values[h]??'').replace(/[\t\r\n]/g,' ')).join('\t'));}}return [lines[0],...kept].join('\n')+'\n';}
