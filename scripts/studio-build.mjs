import fs from 'node:fs';
import crypto from 'node:crypto';
import {renderProduct,sitemapUpdate,feedUpdate,webp} from './studio-render.mjs';
const read=p=>fs.readFileSync(p,'utf8'),before=new Map(['cart.html','checkout.html','success.html'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
// Studio commits this versioned catalogue together with the product pages.
// Never overwrite an approved publication with an asynchronous Apps Script cache.
const products=JSON.parse(read('catalog/studio-products.json'));
if(!Array.isArray(products)||!products.length)throw Error('Empty catalog; refusing to publish.');
const metadata=JSON.parse(read('catalog/studio-meta.json'));if(metadata.version!==1)throw Error('Unsupported Studio metadata');
for(const p of products)if(metadata.products[p.slug]?.hidden)p.status='Inactive';
const seen=new Set();for(const p of products){if(!/^[a-z0-9-]{1,80}$/.test(p.slug)||seen.has(p.slug)||!p.product||!p.mainImage||!Number.isFinite(Number(p.price)))throw Error('Invalid or duplicate product');seen.add(p.slug);}
const template=read('scripts/product-page.html.template'),items=products.map(p=>({product:p,metadata:{title:p.product+' | NOTORIOUS™',description:String(p.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,160),images:[p.mainImage,p.image2,p.image3,p.image4].filter(Boolean).map(webp),sizes:String(p.sizes||'').split(',').map(s=>s.trim()).filter(Boolean),hidden:String(p.status||'active').toLowerCase()==='inactive',...(metadata.products[p.slug]||{})}}));
const planned=new Map();for(const item of items){for(const image of item.metadata.images){if(!image.startsWith('https:')&&!fs.existsSync(webp(image)))throw Error('Missing image '+image);}planned.set('product-'+item.product.slug+'.html',renderProduct(template,item.product,{...item.metadata,related:products.filter(p=>p.slug!==item.product.slug&&p.status!=='Inactive')}));}
// Preserve lastmod on unchanged pages for repeatable scheduled builds.
let xml=read('sitemap.xml');for(const item of items){const file='product-'+item.product.slug+'.html',changed=!fs.existsSync(file)||read(file)!==planned.get(file);if(changed||item.metadata.hidden||!xml.includes('/'+file+'</loc>'))xml=sitemapUpdate(xml,[item],new Date().toISOString().slice(0,10));}
planned.set('sitemap.xml',xml);planned.set('merchant-feed.txt',feedUpdate(read('merchant-feed.txt'),items));planned.set('catalog/studio-products.json',JSON.stringify(products,null,2)+'\n');
for(const [p,hash]of before){if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==hash)throw Error('Protected commerce file changed: '+p);}
for(const [p,text]of planned)fs.writeFileSync(p,text);console.log('Built '+items.length+' product pages; protected cart, checkout and success files unchanged.');
