const $ = (id) => document.getElementById(id);
const gate = $("gate"), slidesEl = $("slides"), dotsEl = $("dots");
const form = $("emailForm"), email = $("email"), statusBox = $("status"), submitBtn = $("submitBtn");
let targetMs = null, backgrounds = [], current = 0, startX = 0, startY = 0, dragging = false, dropOpen = false, isFull = false;

function pad(n) { return String(Math.max(0, Math.floor(n))).padStart(2, "0"); }
function setCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  $("days").textContent = pad(Math.floor(s / 86400));
  $("hours").textContent = pad(Math.floor(s / 3600) % 24);
  $("minutes").textContent = pad(Math.floor(s / 60) % 60);
  $("seconds").textContent = pad(s % 60);
}
function updateCountdown() {
  const remaining = Number.isFinite(targetMs) ? targetMs - Date.now() : Infinity;
  setCountdown(Number.isFinite(remaining) ? remaining : 0);
  const nowOpen = Number.isFinite(targetMs) && remaining <= 0;
  if (nowOpen !== dropOpen) {
    dropOpen = nowOpen;
    updateSubmitState();
  }
}
function updateSubmitState() {
  const locked = isFull || !dropOpen;
  submitBtn.disabled = locked;
  email.disabled = locked;
  if (isFull) {
    form.classList.add("hidden");
    statusBox.textContent = window.closedMessage || "SORRY, GA DAPET.";
  } else {
    form.classList.remove("hidden");
    if (!dropOpen) {
      statusBox.textContent = "DROP NOT OPEN YET.";
    } else if (statusBox.dataset.persistent !== "1") {
      statusBox.textContent = "";
    }
  }
}
setInterval(updateCountdown, 250);

function renderGallery() {
  slidesEl.innerHTML = "";
  dotsEl.innerHTML = "";
  backgrounds.forEach((url, i) => {
    const slide = document.createElement("div");
    slide.className = "slide" + (i === current ? " active" : "");
    slide.style.backgroundImage = `url("${url.replaceAll('"','%22')}")`;
    slidesEl.appendChild(slide);
    const dot = document.createElement("button");
    dot.type = "button"; dot.className = "dot" + (i === current ? " active" : "");
    dot.setAttribute("aria-label", `Slide ${i + 1}`);
    dot.addEventListener("click", () => goTo(i));
    dotsEl.appendChild(dot);
  });
  const showNav = backgrounds.length > 1;
  $("prevBtn").classList.toggle("hidden", !showNav);
  $("nextBtn").classList.toggle("hidden", !showNav);
  dotsEl.classList.toggle("hidden", !showNav);
}
function goTo(index) {
  if (!backgrounds.length) return;
  current = (index + backgrounds.length) % backgrounds.length;
  [...slidesEl.children].forEach((x, i) => x.classList.toggle("active", i === current));
  [...dotsEl.children].forEach((x, i) => x.classList.toggle("active", i === current));
}
function next() { goTo(current + 1); }
function prev() { goTo(current - 1); }
$("nextBtn").addEventListener("click", next);
$("prevBtn").addEventListener("click", prev);

gate.addEventListener("pointerdown", e => { dragging = true; startX = e.clientX; startY = e.clientY; gate.setPointerCapture?.(e.pointerId); });
gate.addEventListener("pointerup", e => {
  if (!dragging) return; dragging = false;
  const dx = e.clientX - startX, dy = e.clientY - startY;
  if (backgrounds.length > 1 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.15) dx < 0 ? next() : prev();
});
gate.addEventListener("pointercancel", () => dragging = false);

async function loadSettings() {
  try {
    const res = await fetch("/api/public", { cache: "no-store" });
    const s = await res.json();
    document.title = `${s.siteName || "ZOUUU"} — Drop Gate`;
    $("brandText").textContent = s.siteName || "ZOUUU";
    $("title").textContent = s.title || "FIRST DROP";
    $("message").textContent = s.message || "";
    email.placeholder = s.placeholder || "YOUR EMAIL";
    submitBtn.textContent = s.buttonText || "ENTER";
    window.closedMessage = s.closedMessage || "SORRY, GA DAPET.";
    backgrounds = Array.isArray(s.backgrounds) ? s.backgrounds : [];
    current = 0;
    renderGallery();
    const logo = $("logo");
    if (s.logo) {
      logo.src = s.logo;
      logo.style.width = `${Math.min(800, Math.max(40, Number(s.logoSize) || 280))}px`;
      logo.classList.remove("hidden");
      $("brandText").classList.add("hidden");
    } else {
      logo.classList.add("hidden");
      $("brandText").classList.remove("hidden");
    }
    targetMs = s.target ? Number(s.target) : null;
    if (!Number.isFinite(targetMs)) {
      const parsed = Date.parse(String(s.target || ""));
      targetMs = Number.isFinite(parsed) ? parsed : null;
    }
    isFull = Boolean(s.isFull);
    dropOpen = Number.isFinite(targetMs) && targetMs <= Date.now();
    updateCountdown();
    updateSubmitState();
  } catch {
    statusBox.textContent = "FAILED TO LOAD SETTINGS.";
  }
}

async function showPreorder(emailValue){
  const gateContent=document.querySelector('.content'); const preorder=$('preorder'); gateContent.classList.add('hidden'); preorder.classList.remove('hidden');
  try{const s=await fetch('/api/public',{cache:'no-store'}).then(r=>r.json());$('preorderTitle').textContent=s.title||'PREORDER';$('paymentInfo').textContent=s.paymentInfo||'';$('shippingInfo').textContent=s.shippingInfo||'';$('whatYouGet').textContent=s.whatYouGet||'';if(s.qrisImage)$('qrisWrap').innerHTML=`<img src="${s.qrisImage}" style="max-width:320px;width:100%;display:block;margin:12px auto">`;const f=$('orderForm');f.innerHTML='';for(const field of (s.formFields||[])){const wrap=document.createElement('div');wrap.style.margin='12px 0';const lab=document.createElement('label');lab.textContent=field.label;lab.style.display='block';lab.style.marginBottom='6px';let input;if(field.type==='select'){input=document.createElement('select');for(const o of field.options||[]){const opt=document.createElement('option');opt.value=o;opt.textContent=o;input.appendChild(opt)}}else if(field.type==='textarea')input=document.createElement('textarea');else {input=document.createElement('input');input.type=field.type==='upload'?'file':field.type;}input.name=field.id;input.required=Boolean(field.required);input.style.width='100%';input.style.padding='12px';wrap.append(lab,input);f.appendChild(wrap)}const emailInput=document.createElement('input');emailInput.type='hidden';emailInput.name='email';emailInput.value=emailValue;f.appendChild(emailInput);const b=document.createElement('button');b.type='submit';b.textContent='SUBMIT PREORDER';b.style.width='100%';b.style.padding='14px';f.appendChild(b);f.onsubmit=async e=>{e.preventDefault();b.disabled=true;$('orderStatus').textContent='SUBMITTING...';const fd=new FormData(f);const r=await fetch('/api/order',{method:'POST',body:fd});const j=await r.json();$('orderStatus').textContent=r.ok?(j.message||'ORDER RECEIVED.'):(j.error||'FAILED');b.disabled=!r.ok};}catch(e){$('orderStatus').textContent='FAILED TO LOAD PREORDER FORM.'}}

form.addEventListener("submit", async e => {
  e.preventDefault(); if (!dropOpen || isFull) { updateSubmitState(); return; }
  const value=email.value.trim(); if(!value)return; submitBtn.disabled=true; statusBox.textContent='SENDING...';
  try{const res=await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:value})});const result=await res.json();if(res.status===403){statusBox.textContent=result.error||'DROP NOT OPEN YET.';dropOpen=false;updateSubmitState();return}if(!res.ok)throw new Error(result.error||'FAILED');await showPreorder(value);}catch(err){statusBox.textContent=err.message||'SOMETHING WENT WRONG.'}finally{if(!isFull)submitBtn.disabled=false}
});
loadSettings();
