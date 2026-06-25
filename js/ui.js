// ui.js — todo lo que dibuja en pantalla. Se vuelve a llamar UI.refresh()
// cada vez que cambian los datos o los filtros.

const UI = (() => {
  const state = {
    status: 'activos', // activos | retirados | todos
    categoriaId: null, // null = todas
    search: '',
    sort: 'costoMensualDesc',
    view: 'inicio'
  };

  // ---------- Helpers ----------
  function tierColor(costoMensual, maxCosto) {
    if (maxCosto <= 0) return 'var(--accent-low)';
    const r = costoMensual / maxCosto;
    if (r >= 0.66) return 'var(--accent-high)';
    if (r >= 0.33) return 'var(--accent-mid)';
    return 'var(--accent-low)';
  }

  function getFilteredItems() {
    const items = DB.getItems();
    const withDerived = items.map(it => ({ it, d: Calc.derive(it) }));

    let filtered = withDerived.filter(({ d }) => {
      if (state.status === 'activos') return d.activo;
      if (state.status === 'retirados') return !d.activo;
      return true;
    });

    if (state.categoriaId) {
      filtered = filtered.filter(({ it }) => it.categoriaId === state.categoriaId);
    }

    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      filtered = filtered.filter(({ it }) =>
        [it.tipo, it.marca, it.modelo, it.lugar].some(v => (v || '').toLowerCase().includes(q))
      );
    }

    const sorters = {
      costoMensualDesc: (a, b) => b.d.costoMensual - a.d.costoMensual,
      costoMensualAsc: (a, b) => a.d.costoMensual - b.d.costoMensual,
      fechaDesc: (a, b) => (b.it.fecha || '').localeCompare(a.it.fecha || ''),
      fechaAsc: (a, b) => (a.it.fecha || '').localeCompare(b.it.fecha || ''),
      precioDesc: (a, b) => b.it.precio - a.it.precio,
      alfabetico: (a, b) => a.it.tipo.localeCompare(b.it.tipo)
    };
    filtered.sort(sorters[state.sort] || sorters.costoMensualDesc);
    return filtered;
  }

  // ---------- Vista Inicio ----------
  function renderKpis() {
    const items = DB.getItems();
    const derived = items.map(it => ({ it, d: Calc.derive(it) }));
    const activos = derived.filter(x => x.d.activo);
    const retirados = derived.filter(x => !x.d.activo);

    const costoMensualActivo = activos.reduce((s, x) => s + x.d.costoMensual, 0);
    const totalInvertido = items.reduce((s, x) => s + Number(x.precio || 0), 0);
    const promedioDias = activos.length ? activos.reduce((s, x) => s + x.d.dias, 0) / activos.length : 0;

    document.getElementById('kpi-row').innerHTML = `
      <div class="kpi-card kpi-hero">
        <div class="kpi-label">Te cuesta por mes</div>
        <div class="kpi-value">${Calc.formatGs(costoMensualActivo)}</div>
        <div class="kpi-sub">${activos.length} objeto${activos.length === 1 ? '' : 's'} en uso</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Invertido total</div>
        <div class="kpi-value">${Calc.formatGs(totalInvertido)}</div>
        <div class="kpi-sub">${items.length} objetos en total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Antigüedad prom.</div>
        <div class="kpi-value">${Calc.humanizeDays(Math.round(promedioDias))}</div>
        <div class="kpi-sub">objetos en uso</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Retirados</div>
        <div class="kpi-value">${retirados.length}</div>
        <div class="kpi-sub">vendidos, donados, etc.</div>
      </div>
    `;
  }

  function renderStatusChips() {
    document.querySelectorAll('#status-chip-row .chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.status === state.status);
    });
  }

  function renderCategoryChips() {
    const cats = DB.getCategories();
    const counts = {};
    DB.getItems().forEach(it => { counts[it.categoriaId] = (counts[it.categoriaId] || 0) + 1; });
    const row = document.getElementById('category-chip-row');
    row.innerHTML = `<button class="chip ${state.categoriaId === null ? 'active' : ''}" data-cat="">Todas</button>` +
      cats.filter(c => counts[c.id]).map(c => `
        <button class="chip chip-cat ${state.categoriaId === c.id ? 'active' : ''}" data-cat="${c.id}">
          <span>${c.icono}</span><span>${c.nombre}</span>
        </button>
      `).join('');
    row.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.cat;
        state.categoriaId = (id === state.categoriaId) ? null : (id || null);
        renderInicio();
      });
    });
  }

  function itemCardHTML({ it, d }, maxCosto) {
    const cat = DB.getCategoryById(it.categoriaId);
    const color = tierColor(d.costoMensual, maxCosto);
    const widthPct = maxCosto > 0 ? Math.max(4, Math.min(100, (d.costoMensual / maxCosto) * 100)) : 0;
    const subtitle = [it.marca, it.modelo].filter(Boolean).join(' · ');

    let bottomInfo = `Comprado ${Calc.formatDate(it.fecha)} · hace ${d.antiguedadTexto}`;
    if (!d.activo) {
      bottomInfo = `Usado ${d.antiguedadTexto} · retirado ${Calc.formatDate(it.finDeUso)}${it.motivo ? ' · ' + esc(it.motivo) : ''}`;
    }

    return `
      <div class="item-card ${d.activo ? '' : 'is-retired'}" data-id="${it.id}">
        <div class="item-top">
          <div>
            <div class="item-name">${esc(it.tipo)}</div>
            ${subtitle ? `<div class="item-meta">${esc(subtitle)}</div>` : ''}
            <span class="item-cat-badge" style="background:${cat.color}">${cat.icono} ${esc(cat.nombre)}</span>
          </div>
          <div class="item-cost">
            <div class="item-cost-value">${Calc.formatGs(d.costoMensual)}</div>
            <div class="item-cost-label">por mes</div>
          </div>
        </div>
        <div class="cost-bar-track"><div class="cost-bar-fill" style="width:${widthPct}%;background:${color}"></div></div>
        <div class="item-bottom-row">
          <span class="item-meta">${bottomInfo}</span>
        </div>
      </div>
    `;
  }

  function renderItemList() {
    const filtered = getFilteredItems();
    const allActive = DB.getItems().map(Calc.derive).filter(d => d.activo);
    const maxCosto = Math.max(0, ...allActive.map(d => d.costoMensual), ...filtered.map(x => x.d.costoMensual));

    const list = document.getElementById('item-list');
    const empty = document.getElementById('empty-state');
    if (filtered.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = filtered.map(x => itemCardHTML(x, maxCosto)).join('');
      list.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', () => {
          const item = DB.getItems().find(i => i.id === card.dataset.id);
          if (item) ItemForm.open(item);
        });
      });
    }
  }

  function renderInicio() {
    renderKpis();
    renderStatusChips();
    renderCategoryChips();
    renderItemList();
  }

  // ---------- Vista Categorías ----------
  function renderCategorias() {
    const cats = DB.getCategories();
    const items = DB.getItems();
    const list = document.getElementById('category-list');
    list.innerHTML = cats.map(c => {
      const catItems = items.filter(i => i.categoriaId === c.id);
      const activos = catItems.filter(i => Calc.derive(i).activo);
      const costoMensual = activos.reduce((s, i) => s + Calc.derive(i).costoMensual, 0);
      return `
        <div class="category-row" data-id="${c.id}">
          <div class="category-swatch" style="background:${c.color}33;color:${c.color}">${c.icono}</div>
          <div class="category-info">
            <div class="category-name">${esc(c.nombre)}</div>
            <div class="category-stats">${catItems.length} objeto${catItems.length === 1 ? '' : 's'} · ${Calc.formatGs(costoMensual)}/mes</div>
          </div>
          <div class="category-chevron">›</div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('.category-row').forEach(row => {
      row.addEventListener('click', () => {
        const cat = DB.getCategoryById(row.dataset.id);
        CategoryForm.open(cat);
      });
    });
  }

  // ---------- Vista Estadísticas ----------
  function renderEstadisticas() {
    const items = DB.getItems();
    const derived = items.map(it => ({ it, d: Calc.derive(it) }));
    const activos = derived.filter(x => x.d.activo);
    const retirados = derived.filter(x => !x.d.activo);
    const costoMensualActivo = activos.reduce((s, x) => s + x.d.costoMensual, 0);
    const totalInvertido = items.reduce((s, x) => s + Number(x.precio || 0), 0);
    const promedioPorObjeto = activos.length ? costoMensualActivo / activos.length : 0;

    document.getElementById('kpi-row-stats').innerHTML = `
      <div class="kpi-card kpi-hero">
        <div class="kpi-label">Costo mensual activo</div>
        <div class="kpi-value">${Calc.formatGs(costoMensualActivo)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Invertido total</div>
        <div class="kpi-value">${Calc.formatGs(totalInvertido)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Promedio / objeto</div>
        <div class="kpi-value">${Calc.formatGs(promedioPorObjeto)}</div>
      </div>
    `;

    Charts.destroyAll();
    Charts.renderCategoria('chart-categoria', items, DB.getCategories());
    Charts.renderTop('chart-top', items);
    Charts.renderAnual('chart-anual', items);

    const retiredList = document.getElementById('retired-list');
    if (retirados.length === 0) {
      retiredList.innerHTML = '<p class="hint">Todavía no retiraste ningún objeto.</p>';
    } else {
      retiredList.innerHTML = retirados
        .sort((a, b) => (b.it.finDeUso || '').localeCompare(a.it.finDeUso || ''))
        .map(({ it, d }) => {
          let extra = '';
          if (it.precioVenta != null) {
            extra = ` · recuperaste ${Calc.formatGs(it.precioVenta)} (costo neto ${Calc.formatGs(d.costoMensualNeto)}/mes)`;
          }
          return `
            <div class="retired-row">
              <div class="r-title">${esc(it.tipo)}${it.marca ? ' · ' + esc(it.marca) : ''}</div>
              <div class="r-detail">Usado ${d.antiguedadTexto} · costaba ${Calc.formatGs(d.costoMensual)}/mes${it.motivo ? ' · ' + esc(it.motivo) : ''}${extra}</div>
            </div>
          `;
        }).join('');
    }
  }

  // ---------- Navegación ----------
  function showView(view) {
    state.view = view;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${view}`).classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    refresh();
  }

  function refresh() {
    if (state.view === 'inicio') renderInicio();
    else if (state.view === 'categorias') renderCategorias();
    else if (state.view === 'estadisticas') renderEstadisticas();
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  return { state, showView, refresh, renderInicio, renderCategorias, renderEstadisticas };
})();
