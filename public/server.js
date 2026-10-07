
require("dotenv").config();
const express=require("express");
const multer=require("multer");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const nodemailer=require("nodemailer");

const app=express(), PORT=Number(process.env.PORT||3000);
const ROOT=__dirname, PUBLIC_DIR=path.join(ROOT,"public"), UPLOAD_DIR=path.join(PUBLIC_DIR,"uploads");
const DATA_DIR=path.join(ROOT,"data"), DATA_FILE=path.join(DATA_DIR,"data.json");
fs.mkdirSync(UPLOAD_DIR,{recursive:true}); fs.mkdirSync(DATA_DIR,{recursive:true});

const DEFAULTS={
 siteName:"ZOUUU",title:"FIRST DROP",target:"",
 message:"ENTER YOUR EMAIL TO RECEIVE DROP INFORMATION.",
 successMessage:"YOU'RE IN.",closedMessage:"SORRY, GA DAPET.",
 placeholder:"YOUR EMAIL",buttonText:"ENTER",logo:"",logoSize:280,maxEmails:30,
 backgrounds:[],paymentInfo:"Payment details will appear here.",shippingInfo:"Production & shipping details will appear here.",
 whatYouGet:"A ZOUUU piece, the full package, and something to remember."
};
const DEFAULT_PRODUCTS=[{
 id:"tee-01",name:"ZOUUU TEE 01",price:175000,description:"Regular fit cotton tee.",
 sizes:["S","M","L","XL"],image:"",active:true,
 whatYouGet:"ZOUUU garment + custom packaging + collector details."
}];
const DEFAULT_FIELDS=[
 {id:"name",label:"FULL NAME",type:"text",required:true},
 {id:"whatsapp",label:"WHATSAPP NUMBER",type:"text",required:true},
 {id:"address",label:"SHIPPING ADDRESS",type:"textarea",required:true},
 {id:"note",label:"NOTE",type:"textarea",required:false}
];

function clone(x){return JSON.parse(JSON.stringify(x))}
function clampInt(v,min,max,fallback){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback}
function cleanText(v,fallback="",max=500){return String(v??fallback).slice(0,max)}
function safeFileName(ext){return `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`}
function parseTargetMs(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);if(Number.isFinite(n))return n;const d=Date.parse(String(v));return Number.isFinite(d)?d:null}

function loadData(){
 try{
  if(!fs.existsSync(DATA_FILE)) return {settings:clone(DEFAULTS),products:clone(DEFAULT_PRODUCTS),fields:clone(DEFAULT_FIELDS),subscribers:[],orders:[]};
  const raw=JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
  const settings={...DEFAULTS,...(raw.settings||{})};
  settings.backgrounds=Array.isArray(settings.backgrounds)?settings.backgrounds:(settings.background?[settings.background]:[]);
  settings.logoSize=clampInt(settings.logoSize,40,800,280);
  settings.maxEmails=clampInt(settings.maxEmails,1,100000,30);
  const products=Array.isArray(raw.products)?raw.products:clone(DEFAULT_PRODUCTS);
  const fields=Array.isArray(raw.fields)?raw.fields:clone(DEFAULT_FIELDS);
  return {settings,products,fields,subscribers:Array.isArray(raw.subscribers)?raw.subscribers:[],orders:Array.isArray(raw.orders)?raw.orders:[]};
 }catch(e){console.error(e);return {settings:clone(DEFAULTS),products:clone(DEFAULT_PRODUCTS),fields:clone(DEFAULT_FIELDS),subscribers:[],orders:[]}}
}
let data=loadData();
function saveData(){const tmp=DATA_FILE+".tmp";fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,DATA_FILE)}
function publicSettings(){
 const count=data.subscribers.length,max=Math.max(1,Number(data.settings.maxEmails)||1);
 return {...data.settings,submittedCount:count,remaining:Math.max(0,max-count),isFull:count>=max};
}
app.disable("x-powered-by");
app.use(express.json({limit:"2mb"})); app.use(express.urlencoded({extended:true}));
app.use(express.static(PUBLIC_DIR,{extensions:["html"]}));

const upload=multer({
 dest:UPLOAD_DIR,limits:{fileSize:12*1024*1024},
 fileFilter:(req,file,cb)=>cb(/^(image\/jpeg|image\/png|image\/webp|application\/pdf)$/.test(file.mimetype)?null:new Error("Format tidak didukung."),true)
});
function adminOnly(req,res,next){
 const expected=process.env.ADMIN_PASSWORD,supplied=String(req.headers["x-admin-password"]||"");
 if(!expected)return res.status(500).json({error:"ADMIN_PASSWORD belum diatur."});
 if(!supplied||supplied!==expected)return res.status(401).json({error:"PASSWORD SALAH."});
 next();
}
function mailReady(){return Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.OWNER_EMAIL)}
let transporter=null;
function getTransporter(){if(!mailReady())return null;if(!transporter)transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:String(process.env.SMTP_SECURE).toLowerCase()==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});return transporter}
async function notifyOwner(subject,text){const t=getTransporter();if(!t){console.log("[ZOUUU]",subject,text);return}await t.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to:process.env.OWNER_EMAIL,subject,text})}
function removeUploadedUrl(url){if(!url||!url.startsWith("/uploads/"))return;const f=path.join(UPLOAD_DIR,path.basename(url));if(f.startsWith(UPLOAD_DIR)&&fs.existsSync(f))try{fs.unlinkSync(f)}catch{}}

app.get("/api/settings",(req,res)=>res.json(publicSettings()));
app.get("/api/drop",(req,res)=>res.json({settings:publicSettings(),products:data.products.filter(x=>x.active),fields:data.fields}));

app.post("/api/subscribe",async(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase();
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"EMAIL TIDAK VALID."});
 const target=parseTargetMs(data.settings.target);
 if(target===null||Date.now()<target)return res.status(403).json({error:"DROP BELUM DIBUKA.",code:"NOT_OPEN"});
 const exists=data.subscribers.some(x=>String(x.email).toLowerCase()===email),max=Math.max(1,Number(data.settings.maxEmails)||1);
 if(exists)return res.json({ok:true,duplicate:true,email,isFull:data.subscribers.length>=max});
 if(data.subscribers.length>=max)return res.status(409).json({error:"FULL",message:data.settings.closedMessage,isFull:true});
 data.subscribers.unshift({email,createdAt:new Date().toISOString()});saveData();
 try{await notifyOwner("ZOUUU — New Email Submission",`New Drop Gate email:\n${email}`)}catch(e){console.error(e.message)}
 res.json({ok:true,duplicate:false,email,isFull:data.subscribers.length>=max,remaining:Math.max(0,max-data.subscribers.length)});
});

app.get("/api/preorder",(req,res)=>{
 const email=String(req.query.email||"").trim().toLowerCase();
 if(!email||!data.subscribers.some(x=>x.email===email))return res.status(403).json({error:"EMAIL ACCESS REQUIRED."});
 res.json({settings:data.settings,products:data.products.filter(x=>x.active),fields:data.fields});
});

app.post("/api/order",async(req,res)=>{
 const b=req.body||{},email=String(b.email||"").trim().toLowerCase();
 if(!data.subscribers.some(x=>x.email===email))return res.status(403).json({error:"EMAIL ACCESS REQUIRED."});
 const product=data.products.find(x=>x.id===b.productId&&x.active); if(!product)return res.status(400).json({error:"PRODUCT TIDAK DITEMUKAN."});
 const qty=Math.max(1,Number(b.quantity)||1),total=Number(product.price)*qty;
 const payment=b.payment==="dp"?"DP":"FULL";
 const dp=payment==="DP"?Math.ceil(total*.5):total;
 const order={id:"ZOUUU-"+Date.now().toString(36).toUpperCase(),createdAt:new Date().toISOString(),email,productId:product.id,product:product.name,size:cleanText(b.size,"",40),quantity:qty,total,payment,amountDue:dp,customer:b.customer||{},status:"awaiting_payment",proof:""};
 data.orders.unshift(order);saveData();
 try{await notifyOwner("ZOUUU — New Pre-Order",`Order: ${order.id}\nEmail: ${email}\nProduct: ${product.name}\nSize: ${order.size}\nQty: ${qty}\nTotal: Rp ${total.toLocaleString("id-ID")}\nPayment: ${payment}\nDue: Rp ${dp.toLocaleString("id-ID")}`)}catch(e){}
 res.json({ok:true,order,settings:{paymentInfo:data.settings.paymentInfo,shippingInfo:data.settings.shippingInfo}});
});

app.post("/api/order/proof",upload.single("proof"),async(req,res)=>{
 const id=String(req.body.orderId||""),email=String(req.body.email||"").trim().toLowerCase(),o=data.orders.find(x=>x.id===id&&x.email===email);
 if(!o)return res.status(404).json({error:"ORDER TIDAK DITEMUKAN."});
 if(!req.file)return res.status(400).json({error:"BUKTI PEMBAYARAN BELUM DIPILIH."});
 const ext=path.extname(req.file.originalname).toLowerCase()||".bin",name=safeFileName(ext),dest=path.join(UPLOAD_DIR,name);fs.renameSync(req.file.path,dest);
 o.proof="/uploads/"+name;o.status="payment_submitted";o.proofAt=new Date().toISOString();saveData();
 try{await notifyOwner("ZOUUU — Payment Proof",`Payment proof submitted.\nOrder: ${o.id}\nEmail: ${o.email}\nFile: ${o.proof}`)}catch(e){}
 res.json({ok:true,order:o});
});

app.get("/api/admin/stats",adminOnly,(req,res)=>res.json({count:data.subscribers.length,maxEmails:data.settings.maxEmails,remaining:Math.max(0,data.settings.maxEmails-data.subscribers.length),orders:data.orders.length}));
app.get("/api/admin/subscribers",adminOnly,(req,res)=>res.json(data.subscribers));
app.get("/api/admin/orders",adminOnly,(req,res)=>res.json(data.orders));

app.post("/api/admin/settings",adminOnly,(req,res)=>{
 const b=req.body||{};
 data.settings={...data.settings,
  siteName:cleanText(b.siteName,DEFAULTS.siteName,80),title:cleanText(b.title,DEFAULTS.title,160),
  target:cleanText(b.target,"",80),message:cleanText(b.message,DEFAULTS.message,500),
  successMessage:cleanText(b.successMessage,DEFAULTS.successMessage,200),closedMessage:cleanText(b.closedMessage,DEFAULTS.closedMessage,200),
  placeholder:cleanText(b.placeholder,DEFAULTS.placeholder,100),buttonText:cleanText(b.buttonText,DEFAULTS.buttonText,60),
  logo:cleanText(b.logo,"",500),logoSize:clampInt(b.logoSize,40,800,280),maxEmails:clampInt(b.maxEmails,1,100000,30),
  backgrounds:Array.isArray(b.backgrounds)?b.backgrounds.map(x=>cleanText(x,"",500)).filter(Boolean).slice(0,100):data.settings.backgrounds,
  paymentInfo:cleanText(b.paymentInfo,DEFAULTS.paymentInfo,1000),shippingInfo:cleanText(b.shippingInfo,DEFAULTS.shippingInfo,1000),
  whatYouGet:cleanText(b.whatYouGet,DEFAULTS.whatYouGet,1000)
 };
 saveData();res.json({ok:true,settings:publicSettings()});
});

app.post("/api/admin/product",adminOnly,(req,res)=>{
 const b=req.body||{},p={id:b.id||"p-"+Date.now(),name:cleanText(b.name,"NEW PRODUCT",100),price:Number(b.price)||0,description:cleanText(b.description,"",500),sizes:Array.isArray(b.sizes)?b.sizes:String(b.sizes||"S,M,L,XL").split(",").map(x=>x.trim()).filter(Boolean),image:cleanText(b.image,"",500),active:b.active!==false,whatYouGet:cleanText(b.whatYouGet,data.settings.whatYouGet,1000)};
 data.products.push(p);saveData();res.json({ok:true,product:p});
});
app.put("/api/admin/product/:id",adminOnly,(req,res)=>{const i=data.products.findIndex(x=>x.id===req.params.id);if(i<0)return res.sendStatus(404);data.products[i]={...data.products[i],...req.body,price:Number(req.body.price??data.products[i].price)||0};saveData();res.json({ok:true,product:data.products[i]})});
app.delete("/api/admin/product/:id",adminOnly,(req,res)=>{data.products=data.products.filter(x=>x.id!==req.params.id);saveData();res.sendStatus(204)});

app.post("/api/admin/field",adminOnly,(req,res)=>{const b=req.body||{},f={id:b.id||"f-"+Date.now(),label:cleanText(b.label,"FIELD",100),type:["text","textarea","number","select"].includes(b.type)?b.type:"text",required:Boolean(b.required),options:Array.isArray(b.options)?b.options:String(b.options||"").split(",").map(x=>x.trim()).filter(Boolean)};data.fields.push(f);saveData();res.json({ok:true,field:f})});
app.put("/api/admin/field/:id",adminOnly,(req,res)=>{const i=data.fields.findIndex(x=>x.id===req.params.id);if(i<0)return res.sendStatus(404);data.fields[i]={...data.fields[i],...req.body};saveData();res.json({ok:true,field:data.fields[i]})});
app.delete("/api/admin/field/:id",adminOnly,(req,res)=>{data.fields=data.fields.filter(x=>x.id!==req.params.id);saveData();res.sendStatus(204)});

app.post("/api/admin/order-status",adminOnly,(req,res)=>{const o=data.orders.find(x=>x.id===req.body.id);if(!o)return res.sendStatus(404);o.status=cleanText(req.body.status,"",50);saveData();res.json({ok:true,order:o})});

app.post("/api/admin/logo",adminOnly,upload.single("logo"),(req,res)=>{if(!req.file)return res.status(400).json({error:"FILE LOGO TIDAK DITEMUKAN."});const ext=path.extname(req.file.originalname).toLowerCase();if(![".jpg",".jpeg",".png",".webp"].includes(ext)){try{fs.unlinkSync(req.file.path)}catch{};return res.status(400).json({error:"FORMAT LOGO HARUS JPG, PNG, WEBP."})}const name=safeFileName(ext);fs.renameSync(req.file.path,path.join(UPLOAD_DIR,name));removeUploadedUrl(data.settings.logo);data.settings.logo="/uploads/"+name;saveData();res.json({ok:true,logo:data.settings.logo})});
app.post("/api/admin/logo/delete",adminOnly,(req,res)=>{removeUploadedUrl(data.settings.logo);data.settings.logo="";saveData();res.json({ok:true})});
app.post("/api/admin/backgrounds",adminOnly,upload.array("backgrounds",50),(req,res)=>{const added=[];for(const f of req.files||[]){const ext=path.extname(f.originalname).toLowerCase();if(![".jpg",".jpeg",".png",".webp"].includes(ext)){try{fs.unlinkSync(f.path)}catch{};continue}const name=safeFileName(ext);fs.renameSync(f.path,path.join(UPLOAD_DIR,name));added.push("/uploads/"+name)}data.settings.backgrounds=[...data.settings.backgrounds,...added].slice(0,100);saveData();res.json({ok:true,added,backgrounds:data.settings.backgrounds})});
app.post("/api/admin/backgrounds/delete",adminOnly,(req,res)=>{const url=cleanText(req.body?.url,"",500);data.settings.backgrounds=data.settings.backgrounds.filter(x=>x!==url);removeUploadedUrl(url);saveData();res.json({ok:true,backgrounds:data.settings.backgrounds})});

app.get("/admin",(req,res)=>res.sendFile(path.join(PUBLIC_DIR,"admin.html")));
app.get("/",(req,res)=>res.sendFile(path.join(PUBLIC_DIR,"index.html")));
app.use((err,req,res,next)=>{console.error(err);if(err instanceof multer.MulterError)return res.status(400).json({error:"UPLOAD ERROR: "+err.message});res.status(400).json({error:err.message||"REQUEST ERROR"})});
app.listen(PORT,"0.0.0.0",()=>console.log("ZOUUU TEST V9 — SERVER.JS TERBARU"));
