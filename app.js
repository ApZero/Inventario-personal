/* ============================================================
   VESTIDOR — lógica de la aplicación
   Todo vive en localStorage. Sin backend, sin tracking.
   ============================================================ */
(function(){
"use strict";

const LS_KEY = "vestidor_v2";
const today = () => new Date().toISOString().slice(0,10);

/* ---------------- estado en memoria ---------------- */
let state = null; // { items, log, tipos, usos, version }

function defaultState(){
  return {
    version: 1,
    items: [],
    log: [],
    tipos: [
      {nombre:"Remera", categoria:"Arriba", codTipo:1, codFormal:1},
      {nombre:"Short", categoria:"Abajo", codTipo:2, codFormal:1},
      {nombre:"Pantalón", categoria:"Abajo", codTipo:3, codFormal:1},
    ],
    usos: [
      {codigo:"T", nombre:"Trabajo"},
      {codigo:"C", nombre:"Casa"},
      {codigo:"D", nombre:"Dormir"},
      {codigo:"S", nombre:"Sport"},
    ]
  };
}

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      state = JSON.parse(raw);
      migrate();
      return;
    }
  }catch(e){ console.warn("No se pudo leer localStorage", e); }

  // primera vez: semilla con los datos del Excel original, si están disponibles
  if(typeof SEED_DATA !== "undefined"){
    state = {
      version: 1,
      items: SEED_DATA.items,
      log: SEED_DATA.log,
      tipos: SEED_DATA.tipos.map(t=>({nombre:t.nombre, categoria:t.categoria, codTipo:t.codTipo, codFormal:t.codFormal})),
      usos: SEED_DATA.usos
    };
  } else {
    state = defaultState();
  }
  save();
}

function migrate(){
  if(!state.tipos) state.tipos = defaultState().tipos;
  if(!state.usos) state.usos = defaultState().usos;
  if(!state.items) state.items = [];
  if(!state.log) state.log = [];
}

function save(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }catch(e){
    toast("No se pudo guardar — almacenamiento lleno. Exportá un respaldo y liberá espacio.");
    console.error(e);
  }
}

/* ---------------- utilidades ---------------- */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

function fmtMoney(n){
  if(n === null || n === undefined || n === "" || isNaN(n)) return "—";
  return new Intl.NumberFormat("es-PY",{maximumFractionDigits:0}).format(n) + " ₲";
}
function fmtDate(iso, opts){
  if(!iso) return "—";
  const d = new Date(iso+"T00:00:00");
  if(isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-PY", opts || {day:"2-digit", month:"short", year:"numeric"}).format(d);
}
function daysBetween(isoA, isoB){
  const a = new Date(isoA+"T00:00:00"), b = new Date(isoB+"T00:00:00");
  return Math.round((b-a)/86400000);
}
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

let toastTimer = null;
function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove("show"), 2600);
}

// intenta extraer un año aproximado de textos como "~2024", "2024/2025", "2017"
function approxYearFrom(text){
  if(!text) return null;
  const m = String(text).match(/(20\d{2}|19\d{2})/g);
  if(!m) return null;
  return parseInt(m[m.length-1],10);
}
// devuelve fecha ISO si "fechaCompra" es parseable como fecha real, o null
function parseFechaCompraISO(text){
  if(!text) return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

/* ---------------- helpers de datos ---------------- */
function activeItems(){ return state.items.filter(i=>i.activo); }
function getItem(id){ return state.items.find(i=>i.id===id); }
function getTipo(nombre){ return state.tipos.find(t=>t.nombre===nombre); }
function getUso(codigo){ return state.usos.find(u=>u.codigo===codigo); }
function usoNombre(codigo){ const u = getUso(codigo); return u ? u.nombre : codigo; }

function nextItemId(tipoNombre){
  const tipo = getTipo(tipoNombre);
  let codTipo, codFormal;
  if(tipo){ codTipo = tipo.codTipo; codFormal = tipo.codFormal; }
  else { codTipo = Math.max(9, ...state.tipos.map(t=>t.codTipo||0)) + 1; codFormal = 1; }
  const prefix = `${codTipo}${codFormal}`;
  let max = 0;
  state.items.forEach(it=>{
    if(it.id.startsWith(prefix)){
      const rest = it.id.slice(prefix.length);
      const n = parseInt(rest,10);
      if(!isNaN(n)) max = Math.max(max, n);
    }
  });
  const seq = String(max+1).padStart(2,"0");
  return `${prefix}${seq}`;
}

/* ---------------- estadísticas por prenda ---------------- */
function statsForItem(id){
  const entries = state.log.filter(l=>l.itemIds.includes(id));
  const count = entries.length;
  let lastDate = null;
  const byAct = {};
  entries.forEach(e=>{
    if(!lastDate || e.fecha > lastDate) lastDate = e.fecha;
    (e.actividades||[]).forEach(a=>{ byAct[a] = (byAct[a]||0)+1; });
  });
  const daysSince = lastDate ? daysBetween(lastDate, today()) : null;
  const item = getItem(id);
  const costoPorUso = (item && item.precio && count>0) ? item.precio/count : null;
  return {id, count, lastDate, daysSince, byAct, costoPorUso};
}

let statsCache = null;
function allStats(){
  // se recalcula cada vez que cambian datos; el dataset es chico (decenas-cientos de prendas)
  const map = {};
  state.items.forEach(it=> map[it.id] = statsForItem(it.id));
  return map;
}

/* ---------------- motor de recomendaciones ---------------- */
const ICONS = {
  alerta: `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 9v4M12 16.5h.01M10.3 4.6 2.9 18a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  info: `<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  bien: `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 12.5 9 17l11-11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const TIPO_ACTIVIDAD_HINTS = {
  trabajo: "T", dormir: "D", sport: "S", deporte: "S", casa: "C",
  patio: "P", visita: "V", iglesia: "I", evento: "E", vestir: "E"
};
function actividadSugeridaParaTipo(tipoNombre){
  const low = tipoNombre.toLowerCase();
  for(const k in TIPO_ACTIVIDAD_HINTS){
    if(low.includes(k)) return TIPO_ACTIVIDAD_HINTS[k];
  }
  return null;
}

function buildRecommendations(){
  const stats = allStats();
  const act = activeItems();
  const cards = [];

  // R1 — nunca usadas
  const nuncaUsadas = act.filter(it=>{
    const s = stats[it.id];
    if(s.count>0) return false;
    const year = approxYearFrom(it.fechaCompra);
    if(!year) return true; // sin fecha, asumimos que ya pasó tiempo suficiente
    const edadDias = (new Date().getFullYear() - year) * 365;
    return edadDias > 45;
  });
  if(nuncaUsadas.length){
    cards.push({
      tipo:"alerta", icono:ICONS.alerta,
      titulo: `${nuncaUsadas.length} prenda${nuncaUsadas.length>1?"s":""} que nunca usaste`,
      desc: "Las tenés en el ropero pero nunca las elegiste. Dales una oportunidad o liberá espacio regalándolas.",
      itemIds: nuncaUsadas.map(i=>i.id)
    });
  }

  // R2 — dormidas hace mucho (usadas alguna vez, pero hace rato no)
  const UMBRAL_DORMIDA = 120;
  const dormidas = act.filter(it=>{
    const s = stats[it.id];
    return s.count>0 && s.daysSince!==null && s.daysSince > UMBRAL_DORMIDA;
  }).sort((a,b)=> stats[b.id].daysSince - stats[a.id].daysSince);
  if(dormidas.length){
    cards.push({
      tipo:"info", icono:ICONS.info,
      titulo: `${dormidas.length} prenda${dormidas.length>1?"s":""} sin usar hace más de ${UMBRAL_DORMIDA} días`,
      desc: "Las usaste antes, pero quedaron afuera de tu rotación actual. ¿Las querés seguir teniendo?",
      itemIds: dormidas.slice(0,8).map(i=>i.id)
    });
  }

  // R3 — costo por uso alto
  const UMBRAL_COSTO = 15000;
  const caras = act.filter(it=>{
    const s = stats[it.id];
    return s.costoPorUso !== null && s.costoPorUso > UMBRAL_COSTO;
  }).sort((a,b)=> stats[b.id].costoPorUso - stats[a.id].costoPorUso);
  if(caras.length){
    const peor = caras[0];
    cards.push({
      tipo:"alerta", icono:ICONS.alerta,
      titulo: `${caras.length} prenda${caras.length>1?"s":""} con costo por uso alto`,
      desc: `La que más te sale cara: ${peor.tipo} ${peor.marca||""} — ${fmtMoney(stats[peor.id].costoPorUso)} por cada vez que la usaste. Usalas más seguido o reconsiderá si valen el espacio.`,
      itemIds: caras.slice(0,8).map(i=>i.id)
    });
  }

  // R4 — mucho uso + desgaste visible
  const porCategoria = {};
  act.forEach(it=>{ (porCategoria[it.categoria] = porCategoria[it.categoria]||[]).push(it); });
  const desgastadas = [];
  Object.values(porCategoria).forEach(lista=>{
    const counts = lista.map(i=>stats[i.id].count).sort((a,b)=>a-b);
    const p75 = counts[Math.floor(counts.length*0.75)] ?? 0;
    lista.forEach(it=>{
      const s = stats[it.id];
      const tieneNotaDesgaste = (it.desgaste && it.desgaste.trim()) || (it.pinta!==null && it.pinta<=2);
      if(s.count>=Math.max(3,p75) && s.count>0 && tieneNotaDesgaste) desgastadas.push(it);
    });
  });
  if(desgastadas.length){
    cards.push({
      tipo:"alerta", icono:ICONS.alerta,
      titulo: `${desgastadas.length} prenda${desgastadas.length>1?"s":""} muy usadas y ya desgastadas`,
      desc: "Son de las más elegidas en su categoría y muestran signos de desgaste. Pensá en reemplazarlas pronto.",
      itemIds: desgastadas.slice(0,8).map(i=>i.id)
    });
  }

  // R5 — pocas opciones para una actividad muy frecuente
  const fechaLimite = (() => { const d=new Date(); d.setDate(d.getDate()-56); return d.toISOString().slice(0,10); })();
  const usosRecientes = state.log.filter(l=>l.fecha >= fechaLimite);
  const freqPorActividad = {};
  usosRecientes.forEach(l=> (l.actividades||[]).forEach(a=> freqPorActividad[a]=(freqPorActividad[a]||0)+1));
  state.usos.forEach(u=>{
    const frecSemanal = (freqPorActividad[u.codigo]||0) / 8;
    if(frecSemanal < 1.5) return;
    const candidatos = act.filter(it=> actividadSugeridaParaTipo(it.tipo) === u.codigo);
    if(candidatos.length>0 && candidatos.length<=2){
      cards.push({
        tipo:"info", icono:ICONS.info,
        titulo: `Pocas prendas para "${u.nombre}"`,
        desc: `La usás unas ${frecSemanal.toFixed(1)} veces por semana pero solo tenés ${candidatos.length} prenda${candidatos.length>1?"s":""} para esa ocasión. Podría convenir comprar más.`,
        itemIds: candidatos.map(i=>i.id)
      });
    }
  });

  // R6 — favoritas (positivo)
  const favoritas = act.filter(it=>stats[it.id].count>0).map(it=>{
    const s = stats[it.id];
    const score = (it.probabilidad??5) + s.count*0.8 + (it.pinta??3)*1.2;
    return {it, score};
  }).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.it);
  if(favoritas.length){
    cards.push({
      tipo:"bien", icono:ICONS.bien,
      titulo: "Tus prendas favoritas",
      desc: "Las elegís seguido y te quedan bien. Bien aprovechadas.",
      itemIds: favoritas.map(i=>i.id)
    });
  }

  const orden = {alerta:0, info:1, bien:2};
  cards.sort((a,b)=>orden[a.tipo]-orden[b.tipo]);
  return cards;
}

/* ---------------- sugeridor de outfit ---------------- */
function sugerirOutfit(actividadCodigo){
  function elegir(categoria){
    let candidatos = activeItems().filter(i=>i.categoria===categoria);
    if(!candidatos.length) return null;
    if(actividadCodigo){
      const filtrados = candidatos.filter(i=>actividadSugeridaParaTipo(i.tipo)===actividadCodigo);
      if(filtrados.length) candidatos = filtrados;
    }
    const stats = allStats();
    const scored = candidatos.map(it=>{
      const s = stats[it.id];
      let score = (it.probabilidad ?? 5) * 2;
      if(s.daysSince === null) score += 1; // nunca usada: pequeño empuje a probar
      else if(s.daysSince < 2) score -= 6; // recién usada: penaliza para rotar
      else if(s.daysSince < 5) score -= 2;
      score += Math.random()*3;
      return {it, score};
    }).sort((a,b)=>b.score-a.score);
    return scored[0].it;
  }
  return { arriba: elegir("Arriba"), abajo: elegir("Abajo") };
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
let currentView = "inicio";
function switchView(view){
  currentView = view;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById("view-"+view).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  document.getElementById("app").scrollTop = 0;
  window.scrollTo(0,0);
  render(view);
}

function render(view){
  if(view==="inicio") renderInicio();
  else if(view==="ropero") renderRopero();
  else if(view==="registro") renderRegistro();
  else if(view==="stats") renderStats();
  else if(view==="ajustes") renderAjustes();
}

/* ============================================================
   INICIO
   ============================================================ */
let outfitActividad = null;
let outfitActual = null;

function renderInicio(){
  const el = document.getElementById("inicio-content");
  const act = activeItems();
  const stats = allStats();
  const totalUsos = state.log.length;
  const last7 = state.log.filter(l=> daysBetween(l.fecha, today()) <= 7).length;

  if(!outfitActual) outfitActual = sugerirOutfit(outfitActividad);

  const usoOptions = state.usos.map(u=>`<option value="${u.codigo}" ${outfitActividad===u.codigo?"selected":""}>${esc(u.nombre)}</option>`).join("");

  el.innerHTML = `
    <div class="hero-card">
      <div class="hero-eyebrow">Tu ropero</div>
      <div class="hero-title">${act.length} prenda${act.length===1?"":"s"} activas</div>
      <div class="hero-sub">${totalUsos} registros de uso en total</div>
      <div class="hero-stats">
        <div class="hero-stat"><b class="num">${last7}</b><span>usos esta semana</span></div>
        <div class="hero-stat"><b class="num">${countNuncaUsadas(stats)}</b><span>nunca usadas</span></div>
        <div class="hero-stat"><b class="num">${countDormidas(stats)}</b><span>dormidas</span></div>
      </div>
    </div>

    <div class="outfit-card">
      <h3>¿Qué me pongo?</h3>
      <select id="outfit-actividad" class="field-select" style="margin-bottom:12px">
        <option value="">Cualquier ocasión</option>
        ${usoOptions}
      </select>
      <div class="outfit-row">
        ${outfitPickHTML("Arriba", outfitActual.arriba, stats)}
        ${outfitPickHTML("Abajo", outfitActual.abajo, stats)}
      </div>
      <div style="display:flex; gap:10px; margin-top:14px">
        <button id="btn-outfit-shuffle" class="btn-secondary btn-small" style="flex:1; margin-bottom:0">🔁 Otra opción</button>
        <button id="btn-outfit-usar" class="btn-primary btn-small" style="flex:1">Marcar como usado hoy</button>
      </div>
    </div>

    <h2 class="section-title" style="margin-top:6px">Accesos rápidos</h2>
    <div class="quick-actions">
      <button class="quick-action" data-go="registro">
        <span class="ico"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        <b>Registrar uso</b><span>Anotá qué usaste hoy</span>
      </button>
      <button class="quick-action" data-go="stats">
        <span class="ico"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 19V11M12 19V5M19 19v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        <b>Ver estadísticas</b><span>Recomendaciones y datos</span>
      </button>
    </div>
  `;

  document.getElementById("outfit-actividad").addEventListener("change", (e)=>{
    outfitActividad = e.target.value || null;
    outfitActual = sugerirOutfit(outfitActividad);
    renderInicio();
  });
  document.getElementById("btn-outfit-shuffle").addEventListener("click", ()=>{
    outfitActual = sugerirOutfit(outfitActividad);
    renderInicio();
  });
  document.getElementById("btn-outfit-usar").addEventListener("click", ()=>{
    const ids = [outfitActual.arriba, outfitActual.abajo].filter(Boolean).map(i=>i.id);
    if(!ids.length){ toast("No hay prendas para registrar."); return; }
    const entry = {id:uid(), fecha: today(), actividades: outfitActividad?[outfitActividad]:["C"], itemIds: ids};
    state.log.push(entry);
    save();
    outfitActual = null;
    toast("Registrado en tu historial de hoy ✓");
    renderInicio();
  });
  el.querySelectorAll("[data-go]").forEach(b=> b.addEventListener("click", ()=>{
    switchView(b.dataset.go);
  }));
}

function outfitPickHTML(cat, item, stats){
  if(!item) return `<div class="outfit-pick"><div class="cat">${cat}</div><div class="nombre">Sin prendas activas</div></div>`;
  const s = stats[item.id];
  const meta = s.count ? `Usada ${s.count} ${s.count===1?"vez":"veces"}` : "Nunca usada";
  return `<div class="outfit-pick">
    <div class="cat">${cat}</div>
    <div class="nombre">${esc(item.tipo)}${item.color?" · "+esc(item.color):""}</div>
    <div class="meta">${meta}</div>
  </div>`;
}

function countNuncaUsadas(stats){
  return activeItems().filter(i=>stats[i.id].count===0).length;
}
function countDormidas(stats){
  return activeItems().filter(i=>{
    const s = stats[i.id];
    return s.count>0 && s.daysSince!==null && s.daysSince>120;
  }).length;
}

/* ============================================================
   ROPERO
   ============================================================ */
let roperoFiltroCategoria = "todas";
let roperoFiltroEstado = "activas";
let roperoOrden = "reciente";
let roperoBusqueda = "";

function renderRopero(){
  const catWrap = document.getElementById("filtro-categoria");
  const categorias = ["todas","Arriba","Abajo","Otro"];
  catWrap.innerHTML = `<span class="filtro-label">Categoría</span><div class="filtro-chips">${
    categorias.map(c=>`<button class="chip chip-filter ${roperoFiltroCategoria===c?"selected":""}" data-cat="${c}">${c==="todas"?"Todas":c}</button>`).join("")
  }</div>`;
  const estWrap = document.getElementById("filtro-estado");
  const estados = [["activas","Activas"],["inactivas","Dadas de baja"],["todas","Todas"]];
  estWrap.innerHTML = `<span class="filtro-label">Estado</span><div class="filtro-chips">${
    estados.map(([v,l])=>`<button class="chip chip-filter ${roperoFiltroEstado===v?"selected":""}" data-est="${v}">${l}</button>`).join("")
  }</div>`;

  catWrap.querySelectorAll("[data-cat]").forEach(b=>b.addEventListener("click",()=>{ roperoFiltroCategoria=b.dataset.cat; renderRopero(); }));
  estWrap.querySelectorAll("[data-est]").forEach(b=>b.addEventListener("click",()=>{ roperoFiltroEstado=b.dataset.est; renderRopero(); }));

  document.getElementById("ropero-orden").value = roperoOrden;

  let lista = state.items.slice();
  if(roperoFiltroEstado==="activas") lista = lista.filter(i=>i.activo);
  else if(roperoFiltroEstado==="inactivas") lista = lista.filter(i=>!i.activo);
  if(roperoFiltroCategoria!=="todas") lista = lista.filter(i=>i.categoria===roperoFiltroCategoria);
  if(roperoBusqueda.trim()){
    const q = roperoBusqueda.toLowerCase();
    lista = lista.filter(i => [i.tipo,i.marca,i.modelo,i.color,i.estampado].some(v=>v && v.toLowerCase().includes(q)));
  }

  const stats = allStats();
  const ordenadores = {
    reciente: (a,b)=> (b.creado||"").localeCompare(a.creado||""),
    "usos-desc": (a,b)=> stats[b.id].count - stats[a.id].count,
    "usos-asc": (a,b)=> stats[a.id].count - stats[b.id].count,
    "sin-uso": (a,b)=> {
      const da = stats[a.id].daysSince ?? 99999, db = stats[b.id].daysSince ?? 99999;
      return db-da;
    },
    probabilidad: (a,b)=> (b.probabilidad??0)-(a.probabilidad??0),
    "precio-desc": (a,b)=> (b.precio??0)-(a.precio??0),
    "costo-uso": (a,b)=> {
      const ca = stats[a.id].costoPorUso ?? -1, cb = stats[b.id].costoPorUso ?? -1;
      return cb-ca;
    },
    tipo: (a,b)=> a.tipo.localeCompare(b.tipo)
  };
  lista.sort(ordenadores[roperoOrden]);

  document.getElementById("ropero-resultados-meta").textContent =
    `${lista.length} prenda${lista.length===1?"":"s"}`;

  const grid = document.getElementById("ropero-grid");
  if(!lista.length){
    grid.innerHTML = "";
    grid.parentElement.querySelector(".empty-state")?.remove();
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<svg viewBox="0 0 24 24" width="40" height="40"><path d="M9 4h6M9 4a3 3 0 0 0 6 0M9 4 4 7l2.5 3L8 9v11h8V9l1.5 1L20 7l-5-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg><p>No hay prendas que coincidan.<br>Probá otro filtro o agregá una nueva.</p>`;
    grid.after(empty);
  } else {
    grid.parentElement.querySelector(".empty-state")?.remove();
    grid.innerHTML = lista.map(it=>itemCardHTML(it, stats[it.id])).join("");
    grid.querySelectorAll(".item-card").forEach(card=>{
      card.addEventListener("click", ()=> openDetalle(card.dataset.id));
    });
  }
}

function itemCardHTML(it, s){
  const titulo = [it.tipo, it.marca].filter(Boolean).join(" · ");
  const sub = [it.color, it.talle].filter(Boolean).join(" · ");
  const pillClass = s.count===0 ? "usos-pill cero" : "usos-pill";
  const pillText = s.count===0 ? "sin usar" : `${s.count} uso${s.count===1?"":"s"}`;
  return `<div class="item-card ${it.activo?"":"inactivo"}" data-id="${it.id}">
    <div class="thumb">${it.fotoUrl ? `<img src="${it.fotoUrl}" alt="">` : thumbPlaceholderSVG(it.categoria)}</div>
    <div class="tag-badge" style="align-self:flex-start">${esc(it.id)}</div>
    <div class="titulo">${esc(titulo)||"(sin tipo)"}</div>
    ${sub?`<div class="sub">${esc(sub)}</div>`:""}
    <div class="footer-row">
      <span class="${pillClass}">${pillText}</span>
    </div>
  </div>`;
}

function thumbPlaceholderSVG(categoria){
  if(categoria==="Abajo"){
    return `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 4h14l1 6-3 10h-4l-1-7-1 7H7L4 10Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  }
  if(categoria==="Otro"){
    return `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M9 4 6 6 3 9l3 3 2-1.5V20h8v-9.5L18 12l3-3-3-3-3-2a3 3 0 0 1-6 0Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

function esc(s){
  if(s===null||s===undefined) return "";
  return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/* ============================================================
   REGISTRO (registrar uso de hoy / cualquier fecha)
   ============================================================ */
let regFecha = today();
let regActividadesSel = [];
let regCategoriaTab = "Arriba";
let regTipoFiltro = null;
let regItemsSel = [];
let regEditingId = null;

function renderRegistro(){
  document.getElementById("reg-fecha").value = regFecha;

  const banner = document.getElementById("reg-edit-banner");
  banner.classList.toggle("hidden", !regEditingId);
  document.getElementById("btn-guardar-registro").textContent = regEditingId ? "Guardar cambios" : "Guardar registro";

  const actWrap = document.getElementById("reg-actividades");
  actWrap.innerHTML = state.usos.map(u=>
    `<button class="chip ${regActividadesSel.includes(u.codigo)?"selected":""}" data-act="${u.codigo}">${esc(u.nombre)}</button>`
  ).join("") || `<span class="field-hint">Agregá actividades en Ajustes.</span>`;
  actWrap.querySelectorAll("[data-act]").forEach(b=>b.addEventListener("click",()=>{
    const c = b.dataset.act;
    const i = regActividadesSel.indexOf(c);
    if(i>-1) regActividadesSel.splice(i,1); else regActividadesSel.push(c);
    renderRegistro();
  }));

  const cats = ["Arriba","Abajo","Otro"];
  document.getElementById("reg-categorias-tabs").innerHTML = cats.map(c=>
    `<button class="subtab ${regCategoriaTab===c?"active":""}" data-tab="${c}">${c}</button>`
  ).join("");
  document.getElementById("reg-categorias-tabs").querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{
    regCategoriaTab = b.dataset.tab; regTipoFiltro = null; renderRegistro();
  }));

  const tiposEnCategoria = [...new Set(
    state.items.filter(i=>i.activo && i.categoria===regCategoriaTab).map(i=>i.tipo)
  )].sort((a,b)=>a.localeCompare(b));
  const tipoWrap = document.getElementById("reg-tipo-filtro");
  if(tiposEnCategoria.length > 1){
    tipoWrap.innerHTML = `<button class="chip-sm ${!regTipoFiltro?"selected":""}" data-tipo="">Todos</button>` +
      tiposEnCategoria.map(t=>`<button class="chip-sm ${regTipoFiltro===t?"selected":""}" data-tipo="${esc(t)}">${esc(t)}</button>`).join("");
    tipoWrap.querySelectorAll("[data-tipo]").forEach(b=>b.addEventListener("click",()=>{
      regTipoFiltro = b.dataset.tipo || null; renderRegistro();
    }));
  } else {
    tipoWrap.innerHTML = "";
  }

  const stats = allStats();
  let itemsCat = activeItems().filter(i=>i.categoria===regCategoriaTab);
  if(regTipoFiltro) itemsCat = itemsCat.filter(i=>i.tipo===regTipoFiltro);
  itemsCat = itemsCat.sort((a,b)=> (stats[a.id].daysSince??99999) > (stats[b.id].daysSince??99999) ? -1 : 1);
  const picker = document.getElementById("reg-items-picker");
  picker.innerHTML = itemsCat.length ? itemsCat.map(it=>{
    const sub = [it.marca, it.color, it.talle].filter(Boolean).join(" · ") || "Sin más detalles";
    return `
    <div class="picker-row ${regItemsSel.includes(it.id)?"selected":""}" data-id="${it.id}">
      <div class="thumb-sm">${it.fotoUrl?`<img src="${it.fotoUrl}" alt="">`:thumbPlaceholderSVG(it.categoria)}</div>
      <div class="info">
        <div class="top-line"><span class="tag-badge">${esc(it.id)}</span><span class="name">${esc(it.tipo)}</span></div>
        <div class="sub">${esc(sub)}</div>
      </div>
      <div class="check">✓</div>
    </div>`;
  }).join("") : `<span class="field-hint">No tenés prendas activas en esta categoría.</span>`;
  picker.querySelectorAll(".picker-row").forEach(el=>el.addEventListener("click",()=>{
    const id = el.dataset.id;
    const i = regItemsSel.indexOf(id);
    if(i>-1) regItemsSel.splice(i,1); else regItemsSel.push(id);
    renderRegistro();
  }));

  const wrap = document.getElementById("reg-seleccionados-wrap");
  if(regItemsSel.length){
    wrap.style.display = "block";
    document.getElementById("reg-seleccionados").innerHTML = regItemsSel.map(id=>{
      const it = getItem(id);
      const etiqueta = it ? [it.tipo, it.marca||it.color].filter(Boolean).join(" · ") : id;
      return `<span class="chip selected" data-remove="${id}">${esc(etiqueta)} ✕</span>`;
    }).join("");
    document.getElementById("reg-seleccionados").querySelectorAll("[data-remove]").forEach(el=>el.addEventListener("click",()=>{
      regItemsSel = regItemsSel.filter(id=>id!==el.dataset.remove);
      renderRegistro();
    }));
  } else {
    wrap.style.display = "none";
  }

  renderHistorialReciente();
}

function historialItemHTML(l){
  const nombres = l.itemIds.map(id=>{
    const it = getItem(id);
    return it ? [it.tipo, it.marca||it.color].filter(Boolean).join(" · ") : id;
  }).join(", ");
  const acts = (l.actividades||[]).map(usoNombre).join(", ");
  return `<div class="historial-item" data-id="${l.id}">
    <span class="fecha mono">${fmtDate(l.fecha,{day:"2-digit",month:"2-digit"})}</span>
    <span class="detalle"><b>${esc(acts)}</b> — ${esc(nombres)}</span>
    <button data-edit="${l.id}" title="Editar">✎</button>
    <button data-del="${l.id}" title="Eliminar">✕</button>
  </div>`;
}

function wireHistorialButtons(scope){
  scope.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",(e)=>{
    e.stopPropagation();
    startEditEntry(b.dataset.edit);
  }));
  scope.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",(e)=>{
    e.stopPropagation();
    confirmDialog("¿Eliminar este registro de uso?", ()=>{
      state.log = state.log.filter(l=>l.id!==b.dataset.del);
      if(regEditingId===b.dataset.del){ regEditingId=null; }
      save();
      renderRegistro();
      toast("Registro eliminado");
    });
  }));
}

function startEditEntry(id){
  const entry = state.log.find(l=>l.id===id);
  if(!entry) return;
  regEditingId = id;
  regFecha = entry.fecha;
  regActividadesSel = [...(entry.actividades||[])];
  regItemsSel = [...(entry.itemIds||[])];
  const firstItem = getItem(regItemsSel[0]);
  regCategoriaTab = firstItem ? firstItem.categoria : "Arriba";
  regTipoFiltro = null;
  switchView("registro");
  toast("Editando registro — hacé los cambios y guardá.");
}

function renderHistorialReciente(){
  const lista = state.log.slice().sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,12);
  const wrap = document.getElementById("reg-historial");
  if(!lista.length){
    wrap.innerHTML = `<p class="field-hint">Todavía no registraste ningún uso.</p>`;
    return;
  }
  wrap.innerHTML = lista.map(historialItemHTML).join("");
  wireHistorialButtons(wrap);
}

function wireRegistroStatic(){
  document.getElementById("reg-fecha").addEventListener("change", e=>{ regFecha = e.target.value; });
  document.getElementById("btn-cancelar-edicion").addEventListener("click", ()=>{
    regEditingId = null;
    regItemsSel = [];
    regActividadesSel = [];
    regFecha = today();
    toast("Edición cancelada");
    renderRegistro();
  });
  document.getElementById("btn-guardar-registro").addEventListener("click", ()=>{
    if(!regActividadesSel.length){ toast("Elegí al menos una actividad."); return; }
    if(!regItemsSel.length){ toast("Elegí al menos una prenda."); return; }
    if(regEditingId){
      const entry = state.log.find(l=>l.id===regEditingId);
      if(entry){
        entry.fecha = regFecha;
        entry.actividades = [...regActividadesSel];
        entry.itemIds = [...regItemsSel];
      }
      toast("Registro actualizado ✓");
    } else {
      state.log.push({id:uid(), fecha:regFecha, actividades:[...regActividadesSel], itemIds:[...regItemsSel]});
      toast("Registro guardado ✓");
    }
    save();
    regEditingId = null;
    regItemsSel = [];
    regActividadesSel = [];
    outfitActual = null;
    renderRegistro();
  });
}

/* ============================================================
   ESTADÍSTICAS
   ============================================================ */
function renderStats(){
  const stats = allStats();
  const act = activeItems();
  const totalRegistros = state.log.length;
  const totalInvertido = act.reduce((s,i)=>s+(i.precio||0),0);
  const promedioUsos = act.length ? (act.reduce((s,i)=>s+stats[i.id].count,0)/act.length) : 0;

  document.getElementById("stats-resumen").innerHTML = `
    <div class="stat-box"><b class="num">${act.length}</b><span>prendas activas</span></div>
    <div class="stat-box"><b class="num">${totalRegistros}</b><span>registros de uso</span></div>
    <div class="stat-box"><b class="num">${fmtMoney(totalInvertido)}</b><span>invertido en tu ropero</span></div>
    <div class="stat-box"><b class="num">${promedioUsos.toFixed(1)}</b><span>usos promedio por prenda</span></div>
  `;

  const recos = buildRecommendations();
  const recoWrap = document.getElementById("stats-recomendaciones");
  recoWrap.innerHTML = recos.length ? recos.map(r=>`
    <div class="reco-card tipo-${r.tipo}">
      <span class="ico">${r.icono}</span>
      <div>
        <div class="titulo">${esc(r.titulo)}</div>
        <div class="desc">${esc(r.desc)}</div>
        <div class="items-afectados">${r.itemIds.slice(0,8).map(id=>`<span class="tag-badge" data-detalle="${id}">${esc(id)}</span>`).join("")}${r.itemIds.length>8?`<span class="field-hint">+${r.itemIds.length-8} más</span>`:""}</div>
      </div>
    </div>
  `).join("") : `<p class="field-hint">Todavía no hay suficientes datos para generar recomendaciones. Registrá unos días de uso primero.</p>`;
  recoWrap.querySelectorAll("[data-detalle]").forEach(el=>el.addEventListener("click",()=>openDetalle(el.dataset.detalle)));

  // top 5 más usadas
  const topUsadas = act.map(i=>({i, c:stats[i.id].count})).filter(x=>x.c>0).sort((a,b)=>b.c-a.c).slice(0,5);
  const maxC = topUsadas.length ? topUsadas[0].c : 1;
  document.getElementById("stats-top-usadas").innerHTML = topUsadas.length ? topUsadas.map(({i,c})=>rankRowHTML(i,c,maxC,`${c} uso${c===1?"":"s"}`)).join("")
    : `<p class="field-hint">Aún no registraste usos.</p>`;
  document.querySelectorAll("#stats-top-usadas .rank-row").forEach(el=>el.addEventListener("click",()=>openDetalle(el.dataset.id)));

  // sin uso hace más tiempo
  const sinUso = act.map(i=>({i, d:stats[i.id].daysSince})).filter(x=>x.d!==null).sort((a,b)=>b.d-a.d).slice(0,5);
  const maxD = sinUso.length ? sinUso[0].d : 1;
  document.getElementById("stats-sin-uso").innerHTML = sinUso.length ? sinUso.map(({i,d})=>rankRowHTML(i,d,maxD,`${d} días`)).join("")
    : `<p class="field-hint">Todavía no hay suficiente historial.</p>`;
  document.querySelectorAll("#stats-sin-uso .rank-row").forEach(el=>el.addEventListener("click",()=>openDetalle(el.dataset.id)));

  renderChartActividad();
  renderCalendar();
}

function rankRowHTML(it,val,max,label){
  const pct = clamp((val/max)*100,4,100);
  return `<div class="rank-row" data-id="${it.id}">
    <div class="bar-wrap">
      <div class="bar-label"><span>${esc(it.tipo)}${it.marca?" · "+esc(it.marca):""}</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>
    <span class="val mono">${esc(label)}</span>
  </div>`;
}

function renderChartActividad(){
  const counts = {};
  state.usos.forEach(u=>counts[u.codigo]=0);
  state.log.forEach(l=> (l.actividades||[]).forEach(a=> counts[a]=(counts[a]||0)+1));
  const canvas = document.getElementById("chart-actividad");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio||1;
  const w = canvas.clientWidth || 300, h = 180;
  canvas.width = w*dpr; canvas.height = h*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);

  const entries = state.usos.map(u=>[u.nombre, counts[u.codigo]||0]);
  const max = Math.max(1, ...entries.map(e=>e[1]));
  const padBottom = 26, padTop = 20;
  const barW = w/entries.length;
  ctx.font = "11px Inter, sans-serif";
  entries.forEach(([nombre,val],idx)=>{
    const barH = (val/max) * (h-padBottom-padTop);
    const x = idx*barW + barW*0.22;
    const bw = barW*0.56;
    const y = h-padBottom-barH;
    ctx.fillStyle = val>0 ? "#AE5A37" : "#E2D4BC";
    roundRect(ctx, x, y, bw, Math.max(barH,2), 5);
    ctx.fillStyle = "#6E5E4F";
    ctx.textAlign = "center";
    ctx.fillText(nombre.length>6?nombre.slice(0,5)+"…":nombre, x+bw/2, h-10);
    if(val>0){
      ctx.fillStyle = "#3A2E27";
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.fillText(val, x+bw/2, y-6);
      ctx.font = "11px Inter, sans-serif";
    }
  });
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
  ctx.fill();
}

let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
function renderCalendar(){
  document.getElementById("cal-label").textContent =
    new Intl.DateTimeFormat("es-PY",{month:"long",year:"numeric"}).format(new Date(calYear,calMonth,1));

  const firstDay = new Date(calYear,calMonth,1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(calYear,calMonth+1,0).getDate();
  const dias = ["D","L","M","M","J","V","S"];

  const logByDate = {};
  state.log.forEach(l=> (logByDate[l.fecha]=(logByDate[l.fecha]||0)+1));

  let html = dias.map(d=>`<div class="cal-cell-head">${d}</div>`).join("");
  for(let i=0;i<startOffset;i++) html += `<div class="cal-cell empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const iso = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const isToday = iso===today();
    const tieneRegistro = !!logByDate[iso];
    html += `<div class="cal-cell ${isToday?"hoy":""} ${tieneRegistro?"con-registro":""}" data-fecha="${iso}">${day}${tieneRegistro?'<span class="dot"></span>':""}</div>`;
  }
  document.getElementById("calendar-grid").innerHTML = html;
  document.querySelectorAll("#calendar-grid .cal-cell[data-fecha]").forEach(el=>{
    el.addEventListener("click", ()=> showDayDetail(el.dataset.fecha));
  });
}
function showDayDetail(fecha){
  const entries = state.log.filter(l=>l.fecha===fecha);
  const wrap = document.getElementById("calendar-day-detail");
  if(!entries.length){
    wrap.innerHTML = `<p class="field-hint">Sin registros el ${fmtDate(fecha)}.</p>`;
    return;
  }
  wrap.innerHTML = `<h4 style="font-size:13px; color:var(--ink-soft); margin-bottom:8px">${fmtDate(fecha)}</h4>` +
    entries.map(historialItemHTML).join("");
  wireHistorialButtons(wrap);
}

/* ============================================================
   AJUSTES
   ============================================================ */
function renderAjustes(){
  const actWrap = document.getElementById("ajustes-actividades");
  actWrap.innerHTML = state.usos.map((u,idx)=>`
    <div class="edit-row" data-idx="${idx}">
      <input type="text" value="${esc(u.nombre)}" data-field="nombre" maxlength="24">
      <input type="text" value="${esc(u.codigo)}" data-field="codigo" maxlength="2" style="max-width:34px; text-align:center" class="mono">
      <button data-del title="Eliminar">✕</button>
    </div>
  `).join("");
  wireEditList(actWrap, state.usos, ()=>renderAjustes());

  const tiposWrap = document.getElementById("ajustes-tipos");
  tiposWrap.innerHTML = state.tipos.map((t,idx)=>`
    <div class="edit-row" data-idx="${idx}">
      <input type="text" value="${esc(t.nombre)}" data-field="nombre" maxlength="30">
      <select data-field="categoria">
        ${["Arriba","Abajo","Otro"].map(c=>`<option value="${c}" ${t.categoria===c?"selected":""}>${c}</option>`).join("")}
      </select>
      <button data-del title="Eliminar">✕</button>
    </div>
  `).join("");
  wireEditList(tiposWrap, state.tipos, ()=>renderAjustes());

  renderStorageUsage();
}

function wireEditList(wrap, arr, onChange){
  wrap.querySelectorAll(".edit-row").forEach(row=>{
    const idx = parseInt(row.dataset.idx,10);
    row.querySelectorAll("[data-field]").forEach(inp=>{
      inp.addEventListener("change", ()=>{
        arr[idx][inp.dataset.field] = inp.value.trim();
        save();
      });
    });
    row.querySelector("[data-del]").addEventListener("click", ()=>{
      confirmDialog("¿Eliminar este elemento? Las prendas o registros que lo usan no se borran, pero quedará sin nombre asociado.", ()=>{
        arr.splice(idx,1);
        save();
        onChange();
      });
    });
  });
}

function renderStorageUsage(){
  let bytes = 0;
  try{ bytes = new Blob([localStorage.getItem(LS_KEY)||""]).size; }catch(e){}
  const kb = (bytes/1024).toFixed(0);
  const pct = clamp((bytes/(5*1024*1024))*100, 1, 100);
  document.getElementById("storage-usage").innerHTML = `
    Usando aproximadamente <b class="mono">${kb} KB</b> de almacenamiento local en este dispositivo.
    <div class="storage-bar"><div class="storage-bar-fill" style="width:${pct}%"></div></div>
  `;
}

/* ============================================================
   MODAL: agregar / editar prenda
   ============================================================ */
function openModal(id){ const m=document.getElementById(id); m.classList.remove("hidden"); requestAnimationFrame(()=>m.classList.add("open")); }
function closeModal(id){ const m=document.getElementById(id); m.classList.remove("open"); setTimeout(()=>m.classList.add("hidden"),220); }

function openItemForm(existingId){
  const it = existingId ? getItem(existingId) : null;
  document.getElementById("modal-item-title").textContent = it ? "Editar prenda" : "Nueva prenda";
  const body = document.getElementById("modal-item-body");

  const tipoOptions = state.tipos.map(t=>`<option value="${esc(t.nombre)}" ${it&&it.tipo===t.nombre?"selected":""}>${esc(t.nombre)}</option>`).join("");
  const estadoOptions = ["Nuevo","Usado"].map(s=>`<option ${it&&it.estado===s?"selected":""}>${s}</option>`).join("");

  body.innerHTML = `
    <div class="photo-input-row">
      <div class="photo-preview" id="form-photo-preview">${it&&it.fotoUrl?`<img src="${it.fotoUrl}">`:thumbPlaceholderSVG(it?it.categoria:"Arriba")}</div>
      <div>
        <button type="button" class="btn-secondary btn-small" id="btn-form-photo" style="margin-bottom:4px">📷 ${it&&it.fotoUrl?"Cambiar foto":"Agregar foto"}</button>
        <div class="field-hint">Opcional. Se guarda comprimida en este dispositivo.</div>
      </div>
      <input type="file" accept="image/*" id="form-photo-file" hidden>
    </div>

    <label class="field-label">Tipo de prenda</label>
    <select id="f-tipo" class="field-select">${tipoOptions || `<option value="">Agregá tipos en Ajustes</option>`}</select>

    <div class="field-row">
      <div>
        <label class="field-label">Marca</label>
        <input class="field-input" id="f-marca" value="${esc(it?.marca||"")}">
      </div>
      <div>
        <label class="field-label">Modelo</label>
        <input class="field-input" id="f-modelo" value="${esc(it?.modelo||"")}">
      </div>
    </div>

    <div class="field-row">
      <div>
        <label class="field-label">Color</label>
        <input class="field-input" id="f-color" value="${esc(it?.color||"")}">
      </div>
      <div>
        <label class="field-label">Talle</label>
        <input class="field-input" id="f-talle" value="${esc(it?.talle||"")}">
      </div>
    </div>

    <label class="field-label">Estampado / detalles</label>
    <input class="field-input" id="f-estampado" value="${esc(it?.estampado||"")}">

    <label class="field-label">Material</label>
    <input class="field-input" id="f-material" value="${esc(it?.material||"")}" placeholder="ej. 100% Algodón">

    <div class="field-row">
      <div>
        <label class="field-label">Estado</label>
        <select class="field-select" id="f-estado">${estadoOptions}</select>
      </div>
      <div>
        <label class="field-label">Precio (₲)</label>
        <input class="field-input" id="f-precio" type="number" inputmode="numeric" value="${it?.precio??""}">
      </div>
    </div>

    <div class="field-row">
      <div>
        <label class="field-label">Fecha de compra</label>
        <input class="field-input" id="f-fecha" value="${esc(it?.fechaCompra||"")}" placeholder="2025-03 o ~2024">
      </div>
      <div>
        <label class="field-label">Lugar de compra</label>
        <input class="field-input" id="f-lugar" value="${esc(it?.lugarCompra||"")}">
      </div>
    </div>

    <label class="field-label">Probabilidad de uso (0–10)</label>
    <div class="range-row">
      <input type="range" id="f-probabilidad" min="0" max="10" value="${it?.probabilidad??5}">
      <span class="range-val mono" id="f-probabilidad-val">${it?.probabilidad??5}</span>
    </div>
    <div class="field-hint">Qué tan probable es que la elijas cuando te vestís.</div>

    <label class="field-label">Pinta / qué tan bien te queda (1–5)</label>
    <div class="range-row">
      <input type="range" id="f-pinta" min="1" max="5" value="${it?.pinta??3}">
      <span class="range-val mono" id="f-pinta-val">${it?.pinta??3}</span>
    </div>

    <label class="field-label">Notas (gusto, desgaste, fit, razón para no tirar…)</label>
    <textarea class="field-input" id="f-gusto" placeholder="Cualquier nota libre">${esc(it?.gusto||"")}</textarea>

    <div class="toggle-row">
      <span>Prenda activa (en uso)</span>
      <div class="switch ${it&&!it.activo?"":"on"}" id="f-activo-switch"></div>
    </div>

    <div class="form-actions">
      <button class="btn-primary" id="btn-guardar-item">Guardar</button>
      ${it?'<button class="btn-danger" id="btn-eliminar-item">Eliminar</button>':""}
    </div>
  `;

  let fotoDataUrl = it?.fotoUrl || null;
  document.getElementById("btn-form-photo").addEventListener("click", ()=>document.getElementById("form-photo-file").click());
  document.getElementById("form-photo-file").addEventListener("change", (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    resizeImageToDataURL(file, 480, 0.6).then(durl=>{
      fotoDataUrl = durl;
      document.getElementById("form-photo-preview").innerHTML = `<img src="${durl}">`;
    }).catch(()=>toast("No se pudo procesar la imagen."));
  });

  document.getElementById("f-probabilidad").addEventListener("input", e=>document.getElementById("f-probabilidad-val").textContent=e.target.value);
  document.getElementById("f-pinta").addEventListener("input", e=>document.getElementById("f-pinta-val").textContent=e.target.value);
  const sw = document.getElementById("f-activo-switch");
  sw.addEventListener("click", ()=>sw.classList.toggle("on"));

  document.getElementById("btn-guardar-item").addEventListener("click", ()=>{
    const tipoVal = document.getElementById("f-tipo").value;
    if(!tipoVal){ toast("Elegí un tipo de prenda (creá uno en Ajustes si falta)."); return; }
    const tipoObj = getTipo(tipoVal);
    const data = {
      tipo: tipoVal,
      categoria: tipoObj ? tipoObj.categoria : "Otro",
      marca: document.getElementById("f-marca").value.trim(),
      modelo: document.getElementById("f-modelo").value.trim(),
      color: document.getElementById("f-color").value.trim(),
      talle: document.getElementById("f-talle").value.trim(),
      estampado: document.getElementById("f-estampado").value.trim(),
      material: document.getElementById("f-material").value.trim(),
      estado: document.getElementById("f-estado").value,
      precio: document.getElementById("f-precio").value ? parseFloat(document.getElementById("f-precio").value) : null,
      fechaCompra: document.getElementById("f-fecha").value.trim(),
      lugarCompra: document.getElementById("f-lugar").value.trim(),
      probabilidad: parseInt(document.getElementById("f-probabilidad").value,10),
      pinta: parseInt(document.getElementById("f-pinta").value,10),
      gusto: document.getElementById("f-gusto").value.trim(),
      activo: sw.classList.contains("on"),
      fotoUrl: fotoDataUrl
    };
    if(it){
      Object.assign(it, data);
      toast("Prenda actualizada ✓");
    } else {
      const newItem = Object.assign({
        id: nextItemId(tipoVal),
        madeIn:"", indicaciones:"", desgaste:"", fit:"", largo:null, ancho:null,
        razonNoTirar:"", etiqueta:null, creado: new Date().toISOString()
      }, data);
      state.items.push(newItem);
      toast("Prenda agregada ✓");
    }
    save();
    closeModal("modal-item");
    render(currentView);
  });

  if(it){
    document.getElementById("btn-eliminar-item").addEventListener("click", ()=>{
      confirmDialog(`¿Eliminar definitivamente "${it.tipo}"? Se borrará también su historial de uso. Si solo querés dejar de usarla, mejor desactivá la prenda.`, ()=>{
        state.items = state.items.filter(i=>i.id!==it.id);
        state.log.forEach(l=> l.itemIds = l.itemIds.filter(id=>id!==it.id));
        state.log = state.log.filter(l=>l.itemIds.length>0);
        save();
        closeModal("modal-item");
        closeModal("modal-detalle");
        render(currentView);
        toast("Prenda eliminada");
      });
    });
  }

  openModal("modal-item");
}

function resizeImageToDataURL(file, maxW, quality){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = ()=>{ img.onload = ()=>{
      const scale = Math.min(1, maxW/img.width);
      const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    }; img.onerror = reject; img.src = reader.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   MODAL: detalle de prenda
   ============================================================ */
function openDetalle(id){
  const it = getItem(id);
  if(!it) return;
  const s = statsForItem(id);
  const body = document.getElementById("modal-detalle-body");
  const actBreak = Object.entries(s.byAct).sort((a,b)=>b[1]-a[1])
    .map(([cod,n])=>`<span class="chip" style="padding:5px 10px; font-size:11.5px">${esc(usoNombre(cod))}: ${n}</span>`).join(" ") || `<span class="field-hint">Sin registros</span>`;

  body.innerHTML = `
    <div class="detalle-header">
      <div class="detalle-thumb">${it.fotoUrl?`<img src="${it.fotoUrl}">`:thumbPlaceholderSVG(it.categoria)}</div>
      <div>
        <div class="tag-badge lg" style="margin-bottom:6px">${esc(it.id)}</div>
        <div class="detalle-titulo">${esc(it.tipo)}</div>
        <div class="detalle-sub">${[it.marca,it.modelo,it.color].filter(Boolean).map(esc).join(" · ")}</div>
      </div>
    </div>

    <div class="detalle-stats-row">
      <div class="detalle-stat"><b class="num">${s.count}</b><span>usos</span></div>
      <div class="detalle-stat"><b class="num">${s.daysSince??"—"}</b><span>días sin usar</span></div>
      <div class="detalle-stat"><b class="num">${s.costoPorUso?fmtMoneyShort(s.costoPorUso):"—"}</b><span>₲ / uso</span></div>
    </div>

    <div class="detalle-section">
      <h4>Uso por actividad</h4>
      <div style="display:flex; flex-wrap:wrap; gap:6px">${actBreak}</div>
    </div>

    <div class="detalle-section">
      <h4>Datos</h4>
      <div class="kv-grid">
        <div><div class="k">Talle</div><div class="v">${esc(it.talle)||"—"}</div></div>
        <div><div class="k">Estado</div><div class="v">${esc(it.estado)||"—"}</div></div>
        <div><div class="k">Precio</div><div class="v">${fmtMoney(it.precio)}</div></div>
        <div><div class="k">Comprado</div><div class="v">${esc(it.fechaCompra)||"—"}</div></div>
        <div><div class="k">Lugar</div><div class="v">${esc(it.lugarCompra)||"—"}</div></div>
        <div><div class="k">Material</div><div class="v">${esc(it.material)||"—"}</div></div>
        <div><div class="k">Probabilidad</div><div class="v">${it.probabilidad??"—"}/10</div></div>
        <div><div class="k">Pinta</div><div class="v">${it.pinta??"—"}/5</div></div>
      </div>
      ${it.gusto?`<div class="field-hint" style="margin-top:10px; font-size:13px; color:var(--ink)">${esc(it.gusto)}</div>`:""}
    </div>

    <div class="detalle-acciones">
      <button class="btn-secondary" id="btn-detalle-editar">Editar</button>
      <button class="btn-primary" id="btn-detalle-registrar">Registrar uso</button>
    </div>
  `;
  document.getElementById("btn-detalle-editar").addEventListener("click", ()=>{
    closeModal("modal-detalle");
    setTimeout(()=>openItemForm(id), 200);
  });
  document.getElementById("btn-detalle-registrar").addEventListener("click", ()=>{
    closeModal("modal-detalle");
    regEditingId = null;
    regItemsSel = [id];
    regActividadesSel = [];
    regFecha = today();
    switchView("registro");
  });
  openModal("modal-detalle");
}
function fmtMoneyShort(n){ return new Intl.NumberFormat("es-PY",{maximumFractionDigits:0}).format(Math.round(n)); }

/* ============================================================
   CONFIRMACIÓN GENÉRICA
   ============================================================ */
function confirmDialog(msg, onConfirm){
  const body = document.getElementById("modal-confirm-body");
  body.innerHTML = `
    <p style="font-size:14.5px; margin:14px 0 18px">${esc(msg)}</p>
    <div class="form-actions">
      <button class="btn-secondary" id="confirm-cancel" style="margin-bottom:0">Cancelar</button>
      <button class="btn-danger" id="confirm-ok">Confirmar</button>
    </div>
  `;
  document.getElementById("confirm-cancel").addEventListener("click", ()=>closeModal("modal-confirm"));
  document.getElementById("confirm-ok").addEventListener("click", ()=>{ closeModal("modal-confirm"); onConfirm(); });
  openModal("modal-confirm");
}

/* ============================================================
   IMPORTAR / EXPORTAR
   ============================================================ */
function exportarJSON(){
  const blob = new Blob([JSON.stringify(state,null,1)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vestidor-respaldo-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("Respaldo exportado ✓");
}

function importarJSON(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!data.items || !data.usos || !data.tipos) throw new Error("formato inválido");
      confirmDialog("Esto va a REEMPLAZAR todos los datos actuales con el respaldo importado. ¿Continuar?", ()=>{
        state = data;
        migrate();
        save();
        toast("Respaldo importado ✓");
        render(currentView);
      });
    }catch(e){
      toast("El archivo no parece un respaldo válido de Vestidor.");
    }
  };
  reader.readAsText(file);
}

function exportarExcel(){
  if(typeof XLSX === "undefined"){ toast("La función de Excel necesita conexión la primera vez. Probá de nuevo con internet."); return; }
  const wb = XLSX.utils.book_new();
  const itemsSheet = XLSX.utils.json_to_sheet(state.items.map(it=>({
    "#": it.id, Tipo: it.tipo, Categoria: it.categoria, Marca: it.marca, Modelo: it.modelo,
    Color: it.color, Talle: it.talle, Estado: it.estado, Precio: it.precio,
    "Fecha de compra": it.fechaCompra, "Lugar de compra": it.lugarCompra,
    Material: it.material, Probabilidad: it.probabilidad, Pinta: it.pinta,
    Notas: it.gusto, Activo: it.activo ? "Sí" : "No"
  })));
  XLSX.utils.book_append_sheet(wb, itemsSheet, "Vestimenta");

  const logRows = [];
  state.log.forEach(l=> l.itemIds.forEach(id=>{
    logRows.push({Fecha: l.fecha, Actividades: (l.actividades||[]).map(usoNombre).join(", "), Prenda: id, Tipo: getItem(id)?.tipo||""});
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), "Registro de uso");

  XLSX.writeFile(wb, `vestidor-${today()}.xlsx`);
  toast("Excel exportado ✓");
}

function importarExcelOriginal(file){
  if(typeof XLSX === "undefined"){ toast("La función de Excel necesita conexión la primera vez. Probá de nuevo con internet."); return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const wb = XLSX.read(e.target.result, {type:"array"});
      if(!wb.SheetNames.includes("Vestimenta")) throw new Error("no tiene hoja Vestimenta");
      const rows = XLSX.utils.sheet_to_json(wb.Sheets["Vestimenta"], {defval:""});
      confirmDialog(`Se encontraron ${rows.length} prendas en el Excel. Esto las AGREGARÁ a tu ropero actual (no se borra nada existente). ¿Continuar?`, ()=>{
        let agregadas = 0;
        rows.forEach(r=>{
          const id = String(r["#"]||"").trim();
          if(!id || state.items.some(i=>i.id===id)) return;
          const tipoNombre = r["Tipo"] || "Otro";
          if(!getTipo(tipoNombre)){
            const codTipo = Math.max(9, ...state.tipos.map(t=>t.codTipo||0))+1;
            state.tipos.push({nombre:tipoNombre, categoria: r["Uso"]==="Abajo"?"Abajo":(r["Uso"]==="Arriba"?"Arriba":"Otro"), codTipo, codFormal:1});
          }
          state.items.push({
            id, tipo: tipoNombre, categoria: getTipo(tipoNombre).categoria,
            marca: r["Marca"]||"", modelo: r["Modelo"]||"", color: r["Color"]||"",
            estampado: r["Estampado, extras"]||"", etiqueta:null, material: r["Material"]||"",
            probabilidad: r["Probabilidad"]!==""?Number(r["Probabilidad"]):5,
            madeIn: r["Made in"]||"", indicaciones: r["Indicaciones"]||"", talle: r["Size"]||"",
            lugarCompra: r["Lugar de compra"]||"", fechaCompra: String(r["Fecha de compra"]||""),
            estado: r["Estado"]||"", precio: r["Precio"]?Number(r["Precio"]):null,
            desgaste: r["Trato del tiempo"]||"", pinta: r["Pinta"]!==""?Number(r["Pinta"]):3,
            fit: r["Fit"]||"", gusto: r["Gusto"]||"", largo:null, ancho:null,
            razonNoTirar: r["Razón para no tirar"]||"", activo:true, fotoUrl:null,
            creado: new Date().toISOString()
          });
          agregadas++;
        });
        save();
        toast(`${agregadas} prendas importadas ✓`);
        render(currentView);
      });
    }catch(err){
      toast("No se pudo leer ese Excel. ¿Tiene una hoja llamada 'Vestimenta'?");
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
function wireGlobal(){
  document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click", ()=>switchView(b.dataset.view)));
  document.getElementById("btn-quick-log").addEventListener("click", ()=>switchView("registro"));
  document.getElementById("btn-add-item").addEventListener("click", ()=>openItemForm(null));

  document.getElementById("modal-item-close").addEventListener("click", ()=>closeModal("modal-item"));
  document.getElementById("modal-detalle-close").addEventListener("click", ()=>closeModal("modal-detalle"));
  [["modal-item"],["modal-detalle"],["modal-confirm"]].forEach(([id])=>{
    document.getElementById(id).addEventListener("click", (e)=>{ if(e.target.id===id) closeModal(id); });
  });

  document.getElementById("ropero-search").addEventListener("input", (e)=>{ roperoBusqueda = e.target.value; renderRopero(); });
  document.getElementById("btn-ropero-filtros").addEventListener("click", (e)=>{
    const w = document.getElementById("ropero-filtros");
    w.classList.toggle("hidden");
    e.currentTarget.setAttribute("aria-expanded", !w.classList.contains("hidden"));
  });
  document.getElementById("ropero-orden").addEventListener("change", (e)=>{ roperoOrden = e.target.value; renderRopero(); });

  wireRegistroStatic();

  document.getElementById("btn-add-actividad").addEventListener("click", ()=>{
    state.usos.push({codigo:"?", nombre:"Nueva actividad"});
    save(); renderAjustes();
  });
  document.getElementById("btn-add-tipo").addEventListener("click", ()=>{
    state.tipos.push({nombre:"Nuevo tipo", categoria:"Arriba", codTipo: Math.max(9,...state.tipos.map(t=>t.codTipo||0))+1, codFormal:1});
    save(); renderAjustes();
  });

  document.getElementById("btn-exportar-json").addEventListener("click", exportarJSON);
  document.getElementById("btn-importar-json").addEventListener("click", ()=>document.getElementById("file-import-json").click());
  document.getElementById("file-import-json").addEventListener("change", (e)=>{ if(e.target.files[0]) importarJSON(e.target.files[0]); e.target.value=""; });
  document.getElementById("btn-exportar-excel").addEventListener("click", exportarExcel);
  document.getElementById("btn-importar-excel").addEventListener("click", ()=>document.getElementById("file-import-excel").click());
  document.getElementById("file-import-excel").addEventListener("change", (e)=>{ if(e.target.files[0]) importarExcelOriginal(e.target.files[0]); e.target.value=""; });

  document.getElementById("btn-borrar-todo").addEventListener("click", ()=>{
    confirmDialog("Esto borra TODAS tus prendas y registros de este dispositivo, sin posibilidad de deshacer. Exportá un respaldo antes si no estás seguro. ¿Borrar todo?", ()=>{
      localStorage.removeItem(LS_KEY);
      state = defaultState();
      save();
      toast("Datos borrados");
      switchView("inicio");
    });
  });

  document.getElementById("cal-prev").addEventListener("click", ()=>{ calMonth--; if(calMonth<0){calMonth=11; calYear--;} renderCalendar(); });
  document.getElementById("cal-next").addEventListener("click", ()=>{ calMonth++; if(calMonth>11){calMonth=0; calYear++;} renderCalendar(); });
}

function registerSW(){
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{
      navigator.serviceWorker.register("sw.js").catch(e=>console.warn("SW falló", e));
    });
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  load();
  wireGlobal();
  registerSW();
  switchView("inicio");
});

})();
