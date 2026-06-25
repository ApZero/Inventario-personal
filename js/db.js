// db.js — capa de datos: guarda y lee todo desde localStorage.
// No depende de ninguna librería externa.

const DB = (() => {
  const KEY_ITEMS = 'inv_items_v1';
  const KEY_CATEGORIES = 'inv_categories_v1';
  const KEY_META = 'inv_meta_v1';

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error leyendo', key, e);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---------- Inicialización / semilla ----------
  function init() {
    const hasData = localStorage.getItem(KEY_ITEMS) !== null;
    if (!hasData) {
      // Primera vez: cargamos el inventario inicial (tu Excel ya importado).
      writeJSON(KEY_ITEMS, SEED_DATA.items);
      writeJSON(KEY_CATEGORIES, SEED_DATA.categories);
      writeJSON(KEY_META, { creado: new Date().toISOString() });
    }
    // Asegura que siempre exista la categoría "Sin categoría"
    const cats = getCategories();
    if (!cats.some(c => c.id === 'sin-categoria')) {
      cats.push({ id: 'sin-categoria', nombre: 'Sin categoría', color: '#8A8276', icono: '📦' });
      writeJSON(KEY_CATEGORIES, cats);
    }
  }

  // ---------- Categorías ----------
  function getCategories() {
    return readJSON(KEY_CATEGORIES, []);
  }

  function saveCategories(cats) {
    writeJSON(KEY_CATEGORIES, cats);
  }

  function addCategory({ nombre, color, icono }) {
    const cats = getCategories();
    const cat = { id: uid(), nombre: nombre.trim(), color: color || '#8A8276', icono: icono || '📦' };
    cats.push(cat);
    saveCategories(cats);
    return cat;
  }

  function updateCategory(id, patch) {
    const cats = getCategories();
    const idx = cats.findIndex(c => c.id === id);
    if (idx === -1) return null;
    cats[idx] = { ...cats[idx], ...patch };
    saveCategories(cats);
    return cats[idx];
  }

  function deleteCategory(id) {
    if (id === 'sin-categoria') return false;
    let cats = getCategories();
    cats = cats.filter(c => c.id !== id);
    saveCategories(cats);
    // Reasignar objetos de esa categoría a "Sin categoría"
    const items = getItems();
    let changed = false;
    items.forEach(it => {
      if (it.categoriaId === id) {
        it.categoriaId = 'sin-categoria';
        changed = true;
      }
    });
    if (changed) saveItems(items);
    return true;
  }

  function getCategoryById(id) {
    return getCategories().find(c => c.id === id) || getCategories().find(c => c.id === 'sin-categoria');
  }

  // ---------- Objetos (items) ----------
  function getItems() {
    return readJSON(KEY_ITEMS, []);
  }

  function saveItems(items) {
    writeJSON(KEY_ITEMS, items);
  }

  function addItem(data) {
    const items = getItems();
    const item = {
      id: uid(),
      tipo: data.tipo.trim(),
      marca: data.marca || '',
      modelo: data.modelo || '',
      categoriaId: data.categoriaId || 'sin-categoria',
      fecha: data.fecha,
      lugar: data.lugar || '',
      precio: Number(data.precio) || 0,
      finDeUso: data.finDeUso || null,
      motivo: data.motivo || '',
      precioVenta: data.precioVenta != null && data.precioVenta !== '' ? Number(data.precioVenta) : null,
      notas: data.notas || ''
    };
    items.push(item);
    saveItems(items);
    return item;
  }

  function updateItem(id, patch) {
    const items = getItems();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch };
    saveItems(items);
    return items[idx];
  }

  function deleteItem(id) {
    let items = getItems();
    items = items.filter(i => i.id !== id);
    saveItems(items);
  }

  function replaceAll({ items, categories }) {
    if (items) saveItems(items);
    if (categories) saveCategories(categories);
  }

  function mergeAll({ items, categories }) {
    // remapIds traduce el id de una categoría importada que ya existía
    // (por nombre) al id real que ya tenemos guardado, para que los
    // objetos importados no queden apuntando a una categoría descartada.
    const remapIds = {};
    if (categories && categories.length) {
      const existing = getCategories();
      const existingIds = new Set(existing.map(c => c.id));
      const byName = new Map(existing.map(c => [c.nombre.toLowerCase(), c]));
      categories.forEach(c => {
        const match = byName.get((c.nombre || '').toLowerCase());
        if (match) {
          if (c.id !== match.id) remapIds[c.id] = match.id;
        } else if (!existingIds.has(c.id)) {
          existing.push(c);
          byName.set((c.nombre || '').toLowerCase(), c);
        }
      });
      saveCategories(existing);
    }
    if (items && items.length) {
      const existing = getItems();
      const existingIds = new Set(existing.map(i => i.id));
      items.forEach(it => {
        if (existingIds.has(it.id)) {
          it = { ...it, id: uid() }; // evitar choque de id
        }
        if (it.categoriaId && remapIds[it.categoriaId]) {
          it = { ...it, categoriaId: remapIds[it.categoriaId] };
        }
        existing.push(it);
      });
      saveItems(existing);
    }
  }

  return {
    uid, init,
    getCategories, addCategory, updateCategory, deleteCategory, getCategoryById,
    getItems, addItem, updateItem, deleteItem,
    replaceAll, mergeAll
  };
})();

// ---------- Cálculos derivados (no se guardan, se calculan al vuelo) ----------
const Calc = (() => {
  function parseLocalDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function todayUTC() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  function diffDays(a, b) {
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  // Devuelve todos los valores derivados de un objeto.
  function derive(item) {
    const fechaCompra = parseLocalDate(item.fecha);
    const fechaFin = parseLocalDate(item.finDeUso);
    const activo = !item.finDeUso;
    let dias = 0;
    if (fechaCompra) {
      const referencia = fechaFin || todayUTC();
      dias = Math.max(diffDays(referencia, fechaCompra), 0);
    }
    const diasParaCalculo = Math.max(dias, 1); // evita división por cero el día 0
    const costoDiario = item.precio / diasParaCalculo;
    const costoMensual = item.precio / (diasParaCalculo / 30);
    const costoAnual = costoMensual * 12;
    let costoMensualNeto = null;
    if (!activo && item.precioVenta != null) {
      const neto = Math.max(item.precio - item.precioVenta, 0);
      costoMensualNeto = neto / (diasParaCalculo / 30);
    }
    return {
      dias, costoDiario, costoMensual, costoAnual, costoMensualNeto, activo,
      antiguedadTexto: humanizeDays(dias)
    };
  }

  function humanizeDays(dias) {
    if (dias < 30) return `${dias} día${dias === 1 ? '' : 's'}`;
    const years = Math.floor(dias / 365);
    const months = Math.floor((dias % 365) / 30);
    const parts = [];
    if (years > 0) parts.push(`${years} año${years === 1 ? '' : 's'}`);
    if (months > 0) parts.push(`${months} mes${months === 1 ? '' : 'es'}`);
    if (parts.length === 0) parts.push(`${dias} días`);
    return parts.join(', ');
  }

  function formatGs(n) {
    if (n == null || isNaN(n)) return '—';
    const rounded = Math.round(n);
    return '₲ ' + new Intl.NumberFormat('es-PY').format(rounded);
  }

  function formatDate(str) {
    if (!str) return '—';
    const d = parseLocalDate(str);
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function todayInputValue() {
    const t = todayUTC();
    return t.toISOString().slice(0, 10);
  }

  return { derive, formatGs, formatDate, parseLocalDate, todayUTC, diffDays, humanizeDays, todayInputValue };
})();
