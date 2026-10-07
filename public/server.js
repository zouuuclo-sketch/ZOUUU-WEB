require("dotenv").config();

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULTS = {
  siteName: "ZOUUU",
  title: "FIRST DROP",
  target: "",
  message: "ENTER YOUR EMAIL TO RECEIVE DROP INFORMATION.",
  successMessage: "YOU'RE IN.",
  closedMessage: "SORRY, GA DAPET.",
  placeholder: "YOUR EMAIL",
  buttonText: "ENTER",
  logo: "",
  logoSize: 280,
  maxEmails: 30,
  backgrounds: [],
  paymentInfo: "PEMBAYARAN VIA QRIS.",
  shippingInfo: "PRODUKSI DAN PENGIRIMAN AKAN DIINFORMASIKAN SETELAH ORDER.",
  whatYouGet: "1× ZOUUU ITEM + PACKAGING + STICKER PACK.",
  qrisImage: "",
  products: [],
  formFields: [
    { id: "name", label: "FULL NAME", type: "text", required: true, options: [] },
    { id: "phone", label: "WHATSAPP NUMBER", type: "text", required: true, options: [] },
    { id: "address", label: "SHIPPING ADDRESS", type: "textarea", required: true, options: [] },
    { id: "product", label: "PRODUCT", type: "select", required: true, options: [] },
    { id: "size", label: "SIZE", type: "select", required: true, options: ["S", "M", "L", "XL"] },
    { id: "quantity", label: "QUANTITY", type: "number", required: true, options: [] },
    { id: "payment", label: "PAYMENT", type: "select", required: true, options: ["FULL PAYMENT", "50% DP"] },
    { id: "proof", label: "PAYMENT PROOF", type: "upload", required: true, options: [] }
  ]
};

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { settings: clone(DEFAULTS), subscribers: [] };
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const settings = { ...DEFAULTS, ...(raw.settings || {}) };
    if (!Array.isArray(settings.backgrounds)) {
      settings.backgrounds = settings.background ? [settings.background] : [];
    }
    delete settings.background;
    if (!Array.isArray(settings.products)) settings.products = [];
    if (!Array.isArray(settings.formFields)) settings.formFields = clone(DEFAULTS.formFields);
    settings.formFields = settings.formFields.map((f,i)=>({id: cleanText(f?.id, `field_${i+1}`, 80), label: cleanText(f?.label, `FIELD ${i+1}`, 100), type: ["text","select","textarea","number","upload"].includes(f?.type) ? f.type : "text", required: Boolean(f?.required), options: Array.isArray(f?.options) ? f.options.map(x=>cleanText(x,"",100)).filter(Boolean).slice(0,50) : []}));
    settings.products = settings.products.map((x,i)=>({id: cleanText(x?.id, `product_${i+1}`,80), name: cleanText(x?.name, `PRODUCT ${i+1}`,120), price: Number(x?.price)||0, description: cleanText(x?.description,"",500), sizes:Array.isArray(x?.sizes)?x.sizes.map(v=>cleanText(v,"",20)).filter(Boolean).slice(0,20):[], image:cleanText(x?.image,"",500), active:x?.active!==false}));
    settings.paymentInfo = cleanText(settings.paymentInfo, DEFAULTS.paymentInfo, 1000);
    settings.shippingInfo = cleanText(settings.shippingInfo, DEFAULTS.shippingInfo, 1000);
    settings.whatYouGet = cleanText(settings.whatYouGet, DEFAULTS.whatYouGet, 1500);
    settings.qrisImage = cleanText(settings.qrisImage, "", 500);
    settings.logoSize = clampInt(settings.logoSize, 40, 800, 280);
    settings.maxEmails = clampInt(settings.maxEmails, 1, 100000, 30);
    return { settings, subscribers: Array.isArray(raw.subscribers) ? raw.subscribers : [], orders: Array.isArray(raw.orders) ? raw.orders : [] };
  } catch (e) {
    console.error("data.json rusak/tidak terbaca:", e.message);
    return { settings: clone(DEFAULTS), subscribers: [] };
  }
}
function saveData() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function cleanText(v, fallback = "", max = 500) {
  return String(v ?? fallback).slice(0, max);
}
function safeFileName(ext) {
  return `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;
}
function parseTargetMs(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function publicSettings() {
  const s = data.settings;
  const count = data.subscribers.length;
  const max = Math.max(1, Number(s.maxEmails) || 1);
  return {
    ...s,
    logoSize: clampInt(s.logoSize, 40, 800, 280),
    maxEmails: max,
    submittedCount: count,
    remaining: Math.max(0, max - count),
    isFull: count >= max
  };
}

let data = loadData();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/jpeg|image\/png|image\/webp)$/.test(file.mimetype);
    cb(ok ? null : new Error("Format harus JPG, PNG, atau WEBP."), ok);
  }
});

function adminOnly(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  const supplied = String(req.headers["x-admin-password"] || "");
  if (!expected) return res.status(500).json({ error: "ADMIN_PASSWORD belum diatur di .env" });
  if (!supplied || supplied !== expected) return res.status(401).json({ error: "PASSWORD SALAH." });
  next();
}

function mailReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.OWNER_EMAIL);
}
let transporter = null;
function getTransporter() {
  if (!mailReady()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}
async function notifyOwner(email) {
  const t = getTransporter();
  if (!t) {
    console.log(`[ZOUUU] SMTP belum diatur. Customer email: ${email}`);
    return;
  }
  await t.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.OWNER_EMAIL,
    replyTo: email,
    subject: "ZOUUU — New Email Submission",
    text: `Ada customer baru yang masuk ke Drop Gate ZOUUU.\n\nEmail customer:\n${email}\n\nBalas email ini / kirim instruksi preorder ke customer tersebut.`
  });
}

app.get("/api/settings", (req, res) => res.json(publicSettings()));

app.post("/api/subscribe", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "EMAIL TIDAK VALID." });
  }

  // Drop Gate: email submission is locked until the countdown reaches zero.
  // This check is server-side so the gate cannot be bypassed by calling the API directly.
  const targetMs = parseTargetMs(data.settings.target);
  if (targetMs === null || Date.now() < targetMs) {
    return res.status(403).json({ error: "DROP BELUM DIBUKA.", code: "NOT_OPEN" });
  }

  const exists = data.subscribers.some(x => String(x.email).toLowerCase() === email);
  const max = Math.max(1, Number(data.settings.maxEmails) || 1);

  if (exists) {
    return res.json({ ok: true, duplicate: true, successMessage: data.settings.successMessage, isFull: data.subscribers.length >= max });
  }
  if (data.subscribers.length >= max) {
    return res.status(409).json({ error: "FULL", message: data.settings.closedMessage, isFull: true });
  }

  data.subscribers.unshift({ email, createdAt: new Date().toISOString() });
  saveData();

  try { await notifyOwner(email); } catch (e) { console.error("Gagal mengirim notifikasi email:", e.message); }

  res.json({
    ok: true,
    duplicate: false,
    successMessage: data.settings.successMessage,
    isFull: data.subscribers.length >= max,
    remaining: Math.max(0, max - data.subscribers.length)
  });
});

app.get("/api/public", (req, res) => res.json(publicSettings()));

app.post("/api/order", upload.any(), async (req, res) => {
  const targetMs = parseTargetMs(data.settings.target);
  if (targetMs === null || Date.now() < targetMs) return res.status(403).json({error:"DROP BELUM DIBUKA.",code:"NOT_OPEN"});
  const email = String(req.body?.email||"").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"EMAIL TIDAK VALID."});
  const activeProducts = data.settings.products.filter(p=>p.active!==false);
  const fields = data.settings.formFields;
  const values = {...req.body};
  for (const f of fields) {
    if (f.required && !String(values[f.id]||"").trim() && !(req.files||[]).some(x=>x.fieldname===f.id)) return res.status(400).json({error:`${f.label} WAJIB DIISI.`});
    if (f.type === "select" && f.options.length && values[f.id] && !f.options.includes(String(values[f.id]))) return res.status(400).json({error:`PILIHAN ${f.label} TIDAK VALID.`});
  }
  if (fields.some(f=>f.id==='product') && activeProducts.length) {
    const chosen=String(values.product||""); if (!activeProducts.some(p=>p.id===chosen || p.name===chosen)) return res.status(400).json({error:"PRODUCT TIDAK VALID."});
  }
  const files=(req.files||[]).map(f=>({field:f.fieldname,url:"/uploads/"+path.basename(f.filename||f.path),name:f.originalname}));
  const order={id:crypto.randomUUID(),email,values,files,createdAt:new Date().toISOString()};
  if (!Array.isArray(data.orders)) data.orders=[];
  data.orders.unshift(order); saveData();
  try { const t=getTransporter(); if(t) await t.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to:process.env.OWNER_EMAIL,replyTo:email,subject:"ZOUUU — New Preorder",text:`New preorder from ${email}\n\n${JSON.stringify(values,null,2)}\n\nFiles:\n${files.map(x=>x.field+": "+x.url).join("\n")}`}); } catch(e){console.error("Gagal kirim order email:",e.message)}
  res.json({ok:true,message:data.settings.successMessage,orderId:order.id});
});

app.get("/api/admin/orders", adminOnly, (req,res)=>res.json(data.orders||[]));
app.post("/api/admin/products", adminOnly, (req,res)=>{ const b=req.body||{}; const product={id:crypto.randomUUID(),name:cleanText(b.name,"PRODUCT",120),price:Number(b.price)||0,description:cleanText(b.description,"",500),sizes:Array.isArray(b.sizes)?b.sizes.map(x=>cleanText(x,"",20)).filter(Boolean):[],image:cleanText(b.image,"",500),active:b.active!==false}; data.settings.products.push(product); saveData(); res.json({ok:true,product,products:data.settings.products}); });
app.post("/api/admin/products/delete", adminOnly, (req,res)=>{ data.settings.products=data.settings.products.filter(x=>x.id!==String(req.body?.id)); saveData(); res.json({ok:true,products:data.settings.products}); });
app.post("/api/admin/form-fields", adminOnly, (req,res)=>{ const b=req.body||{}; const field={id:crypto.randomUUID(),label:cleanText(b.label,"FIELD",100),type:["text","select","textarea","number","upload"].includes(b.type)?b.type:"text",required:Boolean(b.required),options:Array.isArray(b.options)?b.options.map(x=>cleanText(x,"",100)).filter(Boolean):[]}; data.settings.formFields.push(field); saveData(); res.json({ok:true,field,formFields:data.settings.formFields}); });
app.post("/api/admin/form-fields/delete", adminOnly, (req,res)=>{ data.settings.formFields=data.settings.formFields.filter(x=>x.id!==String(req.body?.id)); saveData(); res.json({ok:true,formFields:data.settings.formFields}); });

app.get("/api/admin/stats", adminOnly, (req, res) => {
  res.json({ count: data.subscribers.length, maxEmails: data.settings.maxEmails, remaining: Math.max(0, data.settings.maxEmails - data.subscribers.length), isFull: data.subscribers.length >= data.settings.maxEmails });
});
app.get("/api/admin/subscribers", adminOnly, (req, res) => res.json(data.subscribers));
app.post("/api/admin/settings", adminOnly, (req, res) => {
  const b = req.body || {};
  data.settings = {
    ...data.settings,
    siteName: cleanText(b.siteName, DEFAULTS.siteName, 80),
    title: cleanText(b.title, DEFAULTS.title, 160),
    target: cleanText(b.target, "", 80),
    message: cleanText(b.message, DEFAULTS.message, 500),
    successMessage: cleanText(b.successMessage, DEFAULTS.successMessage, 200),
    closedMessage: cleanText(b.closedMessage, DEFAULTS.closedMessage, 200),
    placeholder: cleanText(b.placeholder, DEFAULTS.placeholder, 100),
    buttonText: cleanText(b.buttonText, DEFAULTS.buttonText, 60),
    logo: cleanText(b.logo, "", 500),
    logoSize: clampInt(b.logoSize, 40, 800, 280),
    maxEmails: clampInt(b.maxEmails, 1, 100000, 30),
    backgrounds: Array.isArray(b.backgrounds) ? b.backgrounds.map(x => cleanText(x, "", 500)).filter(Boolean).slice(0, 100) : data.settings.backgrounds,
    paymentInfo: cleanText(b.paymentInfo, DEFAULTS.paymentInfo, 1000),
    shippingInfo: cleanText(b.shippingInfo, DEFAULTS.shippingInfo, 1000),
    whatYouGet: cleanText(b.whatYouGet, DEFAULTS.whatYouGet, 1500),
    qrisImage: cleanText(b.qrisImage, data.settings.qrisImage || "", 500),
    products: Array.isArray(b.products) ? b.products.slice(0,100).map((x,i)=>({id:cleanText(x?.id,`product_${i+1}`,80),name:cleanText(x?.name,`PRODUCT ${i+1}`,120),price:Number(x?.price)||0,description:cleanText(x?.description,"",500),sizes:Array.isArray(x?.sizes)?x.sizes.map(v=>cleanText(v,"",20)).filter(Boolean).slice(0,20):[],image:cleanText(x?.image,"",500),active:x?.active!==false})) : data.settings.products,
    formFields: Array.isArray(b.formFields) ? b.formFields.slice(0,100).map((f,i)=>({id:cleanText(f?.id,`field_${i+1}`,80),label:cleanText(f?.label,`FIELD ${i+1}`,100),type:["text","select","textarea","number","upload"].includes(f?.type)?f.type:"text",required:Boolean(f?.required),options:Array.isArray(f?.options)?f.options.map(v=>cleanText(v,"",100)).filter(Boolean).slice(0,50):[]})) : data.settings.formFields
  };
  saveData();
  res.json({ ok: true, settings: publicSettings() });
});

function removeUploadedUrl(url) {
  if (!url || !url.startsWith("/uploads/")) return;
  const filename = path.basename(url);
  const full = path.join(UPLOAD_DIR, filename);
  if (full.startsWith(UPLOAD_DIR) && fs.existsSync(full)) { try { fs.unlinkSync(full); } catch {} }
}

app.post("/api/admin/logo", adminOnly, upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "FILE LOGO TIDAK DITEMUKAN." });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(400).json({ error: "FORMAT LOGO HARUS JPG, PNG, ATAU WEBP." }); }
  const filename = safeFileName(ext);
  const dest = path.join(UPLOAD_DIR, filename);
  fs.renameSync(req.file.path, dest);
  removeUploadedUrl(data.settings.logo);
  data.settings.logo = "/uploads/" + filename;
  saveData();
  res.json({ ok: true, logo: data.settings.logo });
});

app.post("/api/admin/backgrounds", adminOnly, upload.array("backgrounds", 50), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "PILIH MINIMAL 1 BACKGROUND." });
  const added = [];
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) { try { fs.unlinkSync(file.path); } catch {} continue; }
    const filename = safeFileName(ext);
    fs.renameSync(file.path, path.join(UPLOAD_DIR, filename));
    added.push("/uploads/" + filename);
  }
  data.settings.backgrounds = [...data.settings.backgrounds, ...added].slice(0, 100);
  saveData();
  res.json({ ok: true, added, backgrounds: data.settings.backgrounds });
});

app.post("/api/admin/backgrounds/delete", adminOnly, (req, res) => {
  const url = cleanText(req.body?.url, "", 500);
  data.settings.backgrounds = data.settings.backgrounds.filter(x => x !== url);
  removeUploadedUrl(url);
  saveData();
  res.json({ ok: true, backgrounds: data.settings.backgrounds });
});

app.post("/api/admin/qris", adminOnly, upload.single("qris"), (req,res)=>{if(!req.file)return res.status(400).json({error:"FILE QRIS TIDAK DITEMUKAN."});const ext=path.extname(req.file.originalname).toLowerCase();const filename=safeFileName(ext);fs.renameSync(req.file.path,path.join(UPLOAD_DIR,filename));removeUploadedUrl(data.settings.qrisImage);data.settings.qrisImage="/uploads/"+filename;saveData();res.json({ok:true,qrisImage:data.settings.qrisImage});});
app.post("/api/admin/qris/delete", adminOnly, (req,res)=>{removeUploadedUrl(data.settings.qrisImage);data.settings.qrisImage="";saveData();res.json({ok:true});});

app.post("/api/admin/logo/delete", adminOnly, (req, res) => {
  removeUploadedUrl(data.settings.logo);
  data.settings.logo = "";
  saveData();
  res.json({ ok: true });
});

app.get("/admin", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: `UPLOAD ERROR: ${err.message}` });
  if (err) return res.status(400).json({ error: err.message || "REQUEST ERROR" });
  next();
});

app.listen(PORT, "0.0.0.0", () => console.log(`ZOUUU Drop Gate v8 running on port ${PORT}`));
