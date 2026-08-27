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
      fecha: Calc.todayInputValue(), lugar: '', precio: '', finDeUso: null, motivo: '', precioVenta: '', notas: ''
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
          <input type="number" name="precio" required min="0" step="1" inputmode="numeric" value="${item.precio || ''}">
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
              <input type="number" id="f-precio-venta" name="precioVenta" min="0" step="1" value="${item.precioVenta || ''}" placeholder="Opcional">
            </div>
          </div>
          <div class="form-group">
            <label class="field-label">Motivo</label>
            <input type="text" name="motivo" list="motivo-list" value="${esc(item.motivo)}" placeholder="Vendido, donado, roto…">
            <datalist id="motivo-list">${MOTIVOS.map(m => `<option value="${m}">`).join('')}</datalist>
          </div>

          <div class="sugeridor-block">
            <div class="sugeridor-title">💡 Sugeridor de precio de venta</div>
            <div class="sugeridor-row">
              <span>Para que te cueste</span>
              <input type="number" id="sug-target" value="5000" min="0" step="500" inputmode="numeric" class="sug-target-input">
              <span>₲/mes</span>
            </div>
            <div class="sugeridor-result">
              Vendelo a: <strong id="sug-price">—</strong>
              <button type="button" id="sug-apply" class="sug-apply-btn">Usar este precio</button>
            </div>
            <div id="sug-detail" class="sugeridor-detail"></div>
          </div>
        </div>

        <div class="form-group">
          <label class="field-label">Notas</label>
          <textarea name="notas" placeholder="Garantía, número de serie, detalles…">${esc(item.notas)}</textarea>
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

        // ---- Sugeridor de precio de venta ----
        function updateSugeridor() {
          const sugBlock = overlay.querySelector('.sugeridor-block');
          if (!sugBlock) return;
          const precioEl = overlay.querySelector('input[name="precio"]');
          const finDeUsoEl = overlay.querySelector('#f-fin-de-uso');
          const fechaEl = overlay.querySelector('input[name="fecha"]');
          const targetEl = overlay.querySelector('#sug-target');
          const priceEl = overlay.querySelector('#sug-price');
          const detailEl = overlay.querySelector('#sug-detail');

          const precio = Number(precioEl?.value) || 0;
          const fechaCompra = fechaEl?.value;
          const finDeUso = finDeUsoEl?.value || Calc.todayInputValue();
          const target = Number(targetEl?.value) || 0;

          if (!precio || !fechaCompra) {
            priceEl.textContent = '—';
            detailEl.textContent = '';
            return;
          }

          // days between purchase and retirement/today
          const dFecha = Calc.parseLocalDate(fechaCompra);
          const dFin = Calc.parseLocalDate(finDeUso);
          const dias = Math.max(Calc.diffDays(dFin, dFecha), 1);
          const meses = dias / 30;

          const sugerido = Math.max(Math.round(precio - target * meses), 0);
          priceEl.textContent = Calc.formatGs(sugerido);

          const costoNeto = Math.max(precio - sugerido, 0) / meses;
          detailEl.textContent = `(${dias} días de uso · costo neto real: ${Calc.formatGs(costoNeto)}/mes)`;
        }

        const sugTargetInput = overlay.querySelector('#sug-target');
        const finDeUsoInput = overlay.querySelector('#f-fin-de-uso');
        const precioInput = overlay.querySelector('input[name="precio"]');
        if (sugTargetInput) {
          sugTargetInput.addEventListener('input', updateSugeridor);
          finDeUsoInput?.addEventListener('input', updateSugeridor);
          precioInput?.addEventListener('input', updateSugeridor);
          overlay.querySelector('input[name="fecha"]')?.addEventListener('input', updateSugeridor);
        }

        overlay.querySelector('#sug-apply')?.addEventListener('click', () => {
          const priceText = overlay.querySelector('#sug-price')?.textContent;
          if (!priceText || priceText === '—') return;
          const numericStr = priceText.replace(/[^\d]/g, '');
          const ventaInput = overlay.querySelector('#f-precio-venta');
          if (ventaInput) {
            ventaInput.value = numericStr;
            ventaInput.focus();
          }
        });

        // Run once on open so it shows up immediately for existing retired items
        updateSugeridor();

        const form = overlay.querySelector('#item-form');
        form.addEventListener('submit', e => {
          e.preventDefault();
          const fd = new FormData(form);
          const enUsoNow = toggle.checked;
          const finDeUsoValue = enUsoNow ? null : (fd.get('finDeUso') || Calc.todayInputValue());
          const data = {
            tipo: fd.get('tipo'),
            marca: fd.get('marca'),
            modelo: fd.get('modelo'),
            categoriaId: fd.get('categoriaId'),
            fecha: fd.get('fecha'),
            lugar: fd.get('lugar'),
            precio: fd.get('precio'),
            finDeUso: finDeUsoValue,
            motivo: enUsoNow ? '' : fd.get('motivo'),
            precioVenta: enUsoNow ? null : fd.get('precioVenta'),
            notas: fd.get('notas')
          };
          if (!data.tipo.trim() || !data.fecha || data.precio === '') {
            Toast.show('Completá los campos obligatorios');
            return;
          }
          if (isEdit) {
            DB.updateItem(existing.id, {
              ...data,
              precio: Number(data.precio),
              precioVenta: data.precioVenta != null && data.precioVenta !== '' ? Number(data.precioVenta) : null
            });
            Toast.show('Objeto actualizado');
          } else {
            DB.addItem(data);
            Toast.show('Objeto agregado');
          }
          Modal.close();
          UI.refresh();
        });

        const deleteBtn = overlay.querySelector('[data-act="delete"]');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            const ok = await Modal.confirm(`¿Eliminar "${existing.tipo}"? Esta acción no se puede deshacer.`, { danger: true, confirmLabel: 'Eliminar' });
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
