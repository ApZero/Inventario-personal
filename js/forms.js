// forms.js — modales: agregar/editar objeto, agregar/editar categoría, confirmaciones.
// No usa alert()/confirm() nativos (no son confiables en PWA instalada en iOS).

const Modal = (() => {
  const root = () => document.getElementById('modal-root');

  function open(innerHTML, { onMount } = {}) {
    close();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'active-modal-overlay';
    overlay.innerHTML = `<div class="modal-sheet">${innerHTML}</div>`;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
    root().appendChild(overlay);
    if (onMount) onMount(overlay);
    return overlay;
  }

  function close() {
    const existing = document.getElementById('active-modal-overlay');
    if (existing) existing.remove();
  }

  function confirm(message, { confirmLabel = 'Confirmar', danger = false, title = '¿Estás seguro?' } = {}) {
    return new Promise(resolve => {
      open(`
        <div class="modal-head"><h2>${title}</h2>
          <button class="modal-close" data-act="cancel">×</button>
        </div>
        <p class="hint">${message}</p>
        <div class="modal-actions">
          <button class="btn-secondary" data-act="cancel" style="flex:1">Cancelar</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok" style="flex:1">${confirmLabel}</button>
        </div>
      `, {
        onMount: overlay => {
          overlay.querySelectorAll('[data-act="cancel"]').forEach(b => b.addEventListener('click', () => { close(); resolve(false); }));
          overlay.querySelector('[data-act="ok"]').addEventListener('click', () => { close(); resolve(true); });
        }
      });
    });
  }

  return { open, close, confirm };
})();

const Toast = (() => {
  function show(message) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
  return { show };
})();

const ItemForm = (() => {
  const MOTIVOS = ['Vendido', 'Donado', 'Roto / descartado', 'Robado', 'Cambio / reemplazo', 'Otro'];

  function categoryOptions(selectedId) {
    return DB.getCategories().map(c =>
      `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.icono} ${c.nombre}</option>`
    ).join('');
  }

  function open(existing = null) {
    const isEdit = !!existing;
    const item = existing || {
      tipo: '', marca: '', modelo: '', categoriaId: DB.getCategories()[0]?.id || 'sin-categoria',
      fecha: Calc.todayInputValue(), lugar: '', precio: '', finDeUso: null, motivo: '',
      precioVenta: '', notas: '', usosFrequencia: '', usosPeriodo: 'semana'
    };
    const enUso = !item.finDeUso;

    Modal.open(`
      <div class="modal-head">
        <h2>${isEdit ? 'Editar objeto' : 'Nuevo objeto'}</h2>
        <button class="modal-close" data-act="close">×</button>
      </div>
      <form id="item-form">

        <div class="form-group">
          <label class="field-label">Objeto <span class="req">*</span></label>
          <input type="text" name="tipo" required value="${esc(item.tipo)}" placeholder="Ej: Silla, Smartphone, Heladera…">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="field-label">Marca</label>
            <input type="text" name="marca" value="${esc(item.marca)}">
          </div>
          <div class="form-group">
            <label class="field-label">Modelo</label>
            <input type="text" name="modelo" value="${esc(item.modelo)}">
          </div>
        </div>
        <div class="form-group">
          <label class="field-label">Categoría</label>
          <select name="categoriaId">${categoryOptions(item.categoriaId)}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="field-label">Fecha de compra <span class="req">*</span></label>
            <input type="date" name="fecha" required value="${item.fecha || ''}">
          </div>
          <div class="form-group">
            <label class="field-label">Lugar</label>
            <input type="text" name="lugar" value="${esc(item.lugar)}" placeholder="Ferretería, Nissei…">
          </div>
        </div>
        <div class="form-group">
          <label class="field-label">Precio (₲) <span class="req">*</span></label>
          <input type="number" name="precio" id="f-precio" required min="0" step="1" inputmode="numeric" value="${item.precio || ''}">
        </div>

        <div id="f-preview" class="form-preview"></div>

        <div class="form-group">
          <label class="field-label">Usos estimados <span class="field-hint">(opcional — activa el costo por uso)</span></label>
          <div class="uso-row">
            <input type="number" name="usosFrequencia" id="f-usos-freq"
              min="0" step="any" inputmode="decimal"
              value="${item.usosFrequencia || ''}"
              placeholder="Ej: 3"
              class="uso-freq-input">
            <span class="uso-sep">veces por</span>
            <select name="usosPeriodo" id="f-usos-periodo" class="uso-periodo-select">
              <option value="semana" ${(item.usosPeriodo||'semana')==='semana'?'selected':''}>semana</option>
              <option value="mes"    ${item.usosPeriodo==='mes'   ?'selected':''}>mes</option>
              <option value="año"    ${item.usosPeriodo==='año'   ?'selected':''}>año</option>
            </select>
          </div>
        </div>

        <div class="toggle-row">
          <label class="field-label" style="margin-bottom:0">Lo sigo usando</label>
          <label class="switch">
            <input type="checkbox" id="toggle-en-uso" ${enUso ? 'checked' : ''}>
            <span class="switch-track"></span>
          </label>
        </div>

        <div id="retiro-fields" class="${enUso ? 'hidden' : ''}">
          <div class="form-row">
            <div class="form-group">
              <label class="field-label">Fin de uso</label>
              <input type="date" id="f-fin-de-uso" name="finDeUso" value="${item.finDeUso || ''}">
            </div>
            <div class="form-group">
              <label class="field-label">Precio de venta (₲)</label>
              <input type="number" id="f-precio-venta" name="precioVenta" min="0" step="1"
                value="${item.precioVenta || ''}" placeholder="Opcional">
            </div>
          </div>
          <div class="form-group">
            <label class="field-label">Motivo</label>
            <input type="text" name="motivo" list="motivo-list" value="${esc(item.motivo)}"
              placeholder="Vendido, donado, roto…">
            <datalist id="motivo-list">${MOTIVOS.map(m => `<option value="${m}">`).join('')}</datalist>
          </div>
        </div>

        <div class="form-group">
          <label class="field-label">Notas</label>
          <textarea name="notas" placeholder="Garantía, número de serie, detalles…">${esc(item.notas)}</textarea>
        </div>

        <!-- Sugeridor: siempre visible en cuanto hay precio y fecha -->
        <div class="sugeridor-block" id="sugeridor-block">
          <div class="sugeridor-title">💡 Precio de venta sugerido</div>

          <div class="sug-section">
            <div class="sug-section-label">Por costo mensual</div>
            <div class="sugeridor-row">
              <span>Para que cueste</span>
              <input type="number" id="sug-target-mes" value="5000" min="0" step="500"
                inputmode="numeric" class="sug-target-input">
              <span>₲/mes</span>
            </div>
            <div class="sugeridor-result">
              Vendelo a: <strong id="sug-price-mes">—</strong>
              <button type="button" id="sug-apply-mes" class="sug-apply-btn">Usar</button>
            </div>
          </div>

          <div class="sug-section" id="sug-section-uso">
            <div class="sug-section-label">Por costo por uso <span id="sug-uso-hint" class="sug-uso-hint"></span></div>
            <div class="sugeridor-row">
              <span>Para que cueste</span>
              <input type="number" id="sug-target-uso" value="500" min="0" step="100"
                inputmode="numeric" class="sug-target-input">
              <span>₲/uso</span>
            </div>
            <div class="sugeridor-result">
              Vendelo a: <strong id="sug-price-uso">—</strong>
              <button type="button" id="sug-apply-uso" class="sug-apply-btn">Usar</button>
            </div>
          </div>

          <div id="sug-detail" class="sugeridor-detail"></div>
        </div>

        <div class="modal-actions">
          ${isEdit ? '<button type="button" class="btn-danger" data-act="delete">Eliminar</button>' : ''}
          <button type="submit" class="btn-primary">${isEdit ? 'Guardar cambios' : 'Agregar objeto'}</button>
        </div>

      </form>
    `, {
      onMount: overlay => {
        overlay.querySelector('[data-act="close"]').addEventListener('click', Modal.close);
        const toggle = overlay.querySelector('#toggle-en-uso');
        const retiroFields = overlay.querySelector('#retiro-fields');
        toggle.addEventListener('change', () => {
          retiroFields.classList.toggle('hidden', toggle.checked);
          updateSugeridor();
        });

        // ---- Sugeridor ----
        function getDias() {
          const fechaVal  = overlay.querySelector('input[name="fecha"]')?.value;
          const finDeUso  = overlay.querySelector('#f-fin-de-uso')?.value;
          const enUsoNow  = toggle.checked;
          if (!fechaVal) return null;
          const dCompra   = Calc.parseLocalDate(fechaVal);
          const dRef      = Calc.parseLocalDate(enUsoNow ? Calc.todayInputValue() : (finDeUso || Calc.todayInputValue()));
          return Math.max(Calc.diffDays(dRef, dCompra), 0);
        }

        function getUsosEstimados(dias) {
          const freq   = parseFloat(overlay.querySelector('#f-usos-freq')?.value) || 0;
          const period = overlay.querySelector('#f-usos-periodo')?.value || 'semana';
          if (!freq || dias == null) return null;
          const periodoDias = { semana: 7, mes: 30, año: 365 }[period] || 7;
          return Math.max(Math.round(freq * (dias / periodoDias)), 1);
        }

        function updateSugeridor() {
          const precio      = Number(overlay.querySelector('#f-precio')?.value) || 0;
          const priceMesEl  = overlay.querySelector('#sug-price-mes');
          const priceUsoEl  = overlay.querySelector('#sug-price-uso');
          const detailEl    = overlay.querySelector('#sug-detail');
          const usoHint     = overlay.querySelector('#sug-uso-hint');
          const applyMes    = overlay.querySelector('#sug-apply-mes');
          const applyUso    = overlay.querySelector('#sug-apply-uso');

          if (!precio || !overlay.querySelector('input[name="fecha"]')?.value) {
            priceMesEl.textContent = '—';
            priceUsoEl.textContent = '—';
            detailEl.textContent   = '';
            return;
          }

          const dias  = getDias();
          const meses = Math.max(dias / 30, 1);

          // -- Por mes --
          const targetMes  = Number(overlay.querySelector('#sug-target-mes')?.value) || 0;
          const sugMes     = Math.max(Math.round(precio - targetMes * meses), 0);
          priceMesEl.textContent = Calc.formatGs(sugMes);

          // -- Por uso --
          const usos = getUsosEstimados(dias);
          if (usos) {
            usoHint.textContent = `(${usos} usos estimados)`;
            const targetUso = Number(overlay.querySelector('#sug-target-uso')?.value) || 0;
            const sugUso    = Math.max(Math.round(precio - targetUso * usos), 0);
            priceUsoEl.textContent = Calc.formatGs(sugUso);
            applyUso.disabled = false;
          } else {
            usoHint.textContent  = '— agregá frecuencia de uso arriba';
            priceUsoEl.textContent = '—';
            applyUso.disabled = true;
          }

          // Detail line
          const parts = [`${dias} días de uso`];
          if (usos) parts.push(`~${usos} usos totales`);
          detailEl.textContent = parts.join(' · ');
        }

        // ---- Preview en vivo de costos actuales ----
        function updatePreview() {
          const previewEl = overlay.querySelector('#f-preview');
          if (!previewEl) return;
          const precio  = Number(overlay.querySelector('#f-precio')?.value) || 0;
          const fechaV  = overlay.querySelector('input[name="fecha"]')?.value;
          if (!precio || !fechaV) { previewEl.innerHTML = ''; return; }

          const dias    = getDias();
          const meses   = Math.max(dias / 30, 1);
          const enUsoNow = overlay.querySelector('#toggle-en-uso')?.checked;

          // Precio de venta ingresado (puede estar en retiro-fields)
          const pvRaw   = overlay.querySelector('#f-precio-venta')?.value;
          const pv      = (!enUsoNow && pvRaw !== '' && pvRaw != null) ? Number(pvRaw) : null;
          const netoGs  = (pv != null) ? Math.max(precio - pv, 0) : precio;
          const costoMes = netoGs / meses;

          const usos    = getUsosEstimados(dias);
          const cpu     = usos ? netoGs / usos : null;

          const chips = [];
          chips.push(`<span class="prev-age">${Calc.humanizeDays(dias)}</span>`);
          chips.push(`<span class="prev-cost">${Calc.formatGs(costoMes)}<span class="prev-unit">/mes${pv != null ? ' neto' : ''}</span></span>`);
          if (cpu != null) {
            const periodoLabel = { semana: 'sem', mes: 'mes', año: 'año' }[overlay.querySelector('#f-usos-periodo')?.value] || 'sem';
            chips.push(`<span class="prev-cpu">${Calc.formatGs(cpu)}<span class="prev-unit">/uso · ${overlay.querySelector('#f-usos-freq')?.value}×/${periodoLabel}</span></span>`);
          }
          previewEl.innerHTML = chips.join('<span class="prev-sep">·</span>');
        }

        // Wire all inputs that affect the sugeridor and preview
        ['input[name="fecha"]', '#f-fin-de-uso', '#f-precio', '#f-precio-venta',
         '#f-usos-freq', '#f-usos-periodo',
         '#sug-target-mes', '#sug-target-uso'].forEach(sel => {
          overlay.querySelector(sel)?.addEventListener('input', () => { updateSugeridor(); updatePreview(); });
        });
        overlay.querySelector('#toggle-en-uso')?.addEventListener('change', () => { updateSugeridor(); updatePreview(); });

        function applyPrice(sugEl) {
          const txt = overlay.querySelector(sugEl)?.textContent;
          if (!txt || txt === '—') return;
          const ventaInput = overlay.querySelector('#f-precio-venta');
          if (!ventaInput) return;
          ventaInput.value = txt.replace(/[^\d]/g, '');
          // Open retiro section if it was hidden
          if (toggle.checked) {
            toggle.checked = false;
            retiroFields.classList.remove('hidden');
          }
          ventaInput.focus();
        }
        overlay.querySelector('#sug-apply-mes')?.addEventListener('click', () => applyPrice('#sug-price-mes'));
        overlay.querySelector('#sug-apply-uso')?.addEventListener('click', () => applyPrice('#sug-price-uso'));

        updateSugeridor();
        updatePreview();

        // ---- Submit ----
        const form = overlay.querySelector('#item-form');
        form.addEventListener('submit', e => {
          e.preventDefault();
          const fd        = new FormData(form);
          const enUsoNow  = toggle.checked;
          const finDeUsoV = enUsoNow ? null : (fd.get('finDeUso') || Calc.todayInputValue());
          const freqRaw   = fd.get('usosFrequencia');
          const data = {
            tipo:           fd.get('tipo'),
            marca:          fd.get('marca'),
            modelo:         fd.get('modelo'),
            categoriaId:    fd.get('categoriaId'),
            fecha:          fd.get('fecha'),
            lugar:          fd.get('lugar'),
            precio:         Number(fd.get('precio')),
            finDeUso:       finDeUsoV,
            motivo:         enUsoNow ? '' : fd.get('motivo'),
            precioVenta:    enUsoNow ? null : (fd.get('precioVenta') !== '' ? Number(fd.get('precioVenta')) : null),
            notas:          fd.get('notas'),
            usosFrequencia: freqRaw !== '' && freqRaw != null ? Number(freqRaw) : null,
            usosPeriodo:    fd.get('usosPeriodo') || 'semana'
          };
          if (!data.tipo.trim() || !data.fecha || !data.precio) {
            Toast.show('Completá los campos obligatorios');
            return;
          }
          if (isEdit) {
            DB.updateItem(existing.id, data);
            Toast.show('Objeto actualizado');
          } else {
            DB.addItem(data);
            Toast.show('Objeto agregado');
          }
          Modal.close();
          UI.refresh();
        });

        // ---- Delete ----
        const deleteBtn = overlay.querySelector('[data-act="delete"]');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            const ok = await Modal.confirm(
              `¿Eliminar "${existing.tipo}"? Esta acción no se puede deshacer.`,
              { danger: true, confirmLabel: 'Eliminar' }
            );
            if (ok) {
              DB.deleteItem(existing.id);
              Modal.close();
              UI.refresh();
              Toast.show('Objeto eliminado');
            }
          });
        }
      }
    });
  }

  function esc(s) {
    return (s || '').toString().replace(/"/g, '&quot;');
  }

  return { open };
})();

const CategoryForm = (() => {
  const COLORS = ['#A6512E', '#C79A3D', '#5E7A4F', '#6E8FA3', '#8C6647', '#9C6B47', '#7E6A8C', '#B97A8C', '#5A5A52', '#7A6B57'];
  const ICONS = ['📦', '🏠', '🚗', '🍳', '🧹', '🌿', '💻', '🛋️', '🚿', '👟', '🏋️', '🔒', '💈', '🔨', '🎮', '📚', '🐔', '🐾', '🛏️', '🧰'];

  function open(existing = null) {
    const isEdit = !!existing;
    const cat = existing || { nombre: '', color: COLORS[0], icono: ICONS[0] };

    Modal.open(`
      <div class="modal-head">
        <h2>${isEdit ? 'Editar categoría' : 'Nueva categoría'}</h2>
        <button class="modal-close" data-act="close">×</button>
      </div>
      <form id="category-form">
        <div class="form-group">
          <label class="field-label">Nombre <span class="req">*</span></label>
          <input type="text" name="nombre" required value="${cat.nombre.replace(/"/g, '&quot;')}" placeholder="Ej: Cocina, Jardín…">
        </div>
        <div class="form-group">
          <label class="field-label">Color</label>
          <div class="color-grid" id="color-grid">
            ${COLORS.map(c => `<button type="button" class="color-swatch-btn ${c === cat.color ? 'selected' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="field-label">Ícono</label>
          <div class="icon-grid" id="icon-grid">
            ${ICONS.map(i => `<button type="button" class="icon-btn ${i === cat.icono ? 'selected' : ''}" data-icon="${i}">${i}</button>`).join('')}
          </div>
        </div>
        <input type="hidden" name="color" value="${cat.color}">
        <input type="hidden" name="icono" value="${cat.icono}">
        <div class="modal-actions">
          ${isEdit && existing.id !== 'sin-categoria' ? '<button type="button" class="btn-danger" data-act="delete">Eliminar</button>' : ''}
          <button type="submit" class="btn-primary">${isEdit ? 'Guardar' : 'Crear categoría'}</button>
        </div>
      </form>
    `, {
      onMount: overlay => {
        overlay.querySelector('[data-act="close"]').addEventListener('click', Modal.close);
        const colorInput = overlay.querySelector('input[name="color"]');
        const iconInput = overlay.querySelector('input[name="icono"]');

        overlay.querySelectorAll('.color-swatch-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            overlay.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            colorInput.value = btn.dataset.color;
          });
        });
        overlay.querySelectorAll('.icon-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            overlay.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            iconInput.value = btn.dataset.icon;
          });
        });

        const form = overlay.querySelector('#category-form');
        form.addEventListener('submit', e => {
          e.preventDefault();
          const fd = new FormData(form);
          const data = { nombre: fd.get('nombre'), color: fd.get('color'), icono: fd.get('icono') };
          if (!data.nombre.trim()) { Toast.show('Poné un nombre'); return; }
          if (isEdit) {
            DB.updateCategory(existing.id, data);
            Toast.show('Categoría actualizada');
          } else {
            DB.addCategory(data);
            Toast.show('Categoría creada');
          }
          Modal.close();
          UI.refresh();
        });

        const deleteBtn = overlay.querySelector('[data-act="delete"]');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            const count = DB.getItems().filter(i => i.categoriaId === existing.id).length;
            const msg = count > 0
              ? `${count} objeto(s) usan esta categoría y pasarán a "Sin categoría". ¿Continuar?`
              : '¿Eliminar esta categoría?';
            const ok = await Modal.confirm(msg, { danger: true, confirmLabel: 'Eliminar' });
            if (ok) {
              DB.deleteCategory(existing.id);
              Modal.close();
              UI.refresh();
              Toast.show('Categoría eliminada');
            }
          });
        }
      }
    });
  }

  return { open };
})();
