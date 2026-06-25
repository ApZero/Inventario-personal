// charts.js — gráficos de la vista Estadísticas, usando Chart.js (CDN).

const Charts = (() => {
  let chartCategoria = null;
  let chartTop = null;
  let chartAnual = null;

  function showUnavailable(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const wrap = ctx.closest('.chart-wrap');
    if (wrap) wrap.innerHTML = '<p class="hint">No se pudo cargar el gráfico (necesitás conexión la primera vez).</p>';
  }

  function destroyAll() {
    [chartCategoria, chartTop, chartAnual].forEach(c => c && c.destroy());
    chartCategoria = chartTop = chartAnual = null;
  }

  function renderCategoria(canvasId, items, categories) {
    if (typeof Chart === 'undefined') return showUnavailable(canvasId);
    const activos = items.filter(it => Calc.derive(it).activo);
    const porCategoria = {};
    activos.forEach(it => {
      const d = Calc.derive(it);
      porCategoria[it.categoriaId] = (porCategoria[it.categoriaId] || 0) + d.costoMensual;
    });
    const entries = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(([id]) => DB.getCategoryById(id).nombre);
    const colors = entries.map(([id]) => DB.getCategoryById(id).color);
    const data = entries.map(([, v]) => Math.round(v));

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    chartCategoria = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#FAF7F0' }] },
      options: {
        plugins: {
          legend: { position: 'bottom', labels: { color: '#2E2A24', font: { family: 'Work Sans', size: 11 }, boxWidth: 12 } },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.label}: ${Calc.formatGs(ctx.raw)} / mes` }
          }
        }
      }
    });
  }

  function renderTop(canvasId, items, n = 8) {
    if (typeof Chart === 'undefined') return showUnavailable(canvasId);
    const activos = items.filter(it => Calc.derive(it).activo);
    const conCosto = activos.map(it => ({ it, d: Calc.derive(it) }))
      .sort((a, b) => b.d.costoMensual - a.d.costoMensual)
      .slice(0, n);

    const labels = conCosto.map(({ it }) => it.tipo + (it.marca ? ` (${it.marca})` : ''));
    const data = conCosto.map(({ d }) => Math.round(d.costoMensual));
    const colors = conCosto.map(({ it }) => DB.getCategoryById(it.categoriaId).color);

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    chartTop = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${Calc.formatGs(ctx.raw)} / mes` } }
        },
        scales: {
          x: { ticks: { color: '#7A7164', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: '#E4DCCB' } },
          y: { ticks: { color: '#2E2A24', font: { family: 'Work Sans', size: 11 } }, grid: { display: false } }
        }
      }
    });
  }

  function renderAnual(canvasId, items) {
    if (typeof Chart === 'undefined') return showUnavailable(canvasId);
    const porAnio = {};
    items.forEach(it => {
      if (!it.fecha) return;
      const anio = it.fecha.slice(0, 4);
      porAnio[anio] = (porAnio[anio] || 0) + Number(it.precio || 0);
    });
    const anios = Object.keys(porAnio).sort();
    const data = anios.map(a => Math.round(porAnio[a]));

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    chartAnual = new Chart(ctx, {
      type: 'bar',
      data: { labels: anios, datasets: [{ data, backgroundColor: '#A6512E', borderRadius: 4 }] },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${Calc.formatGs(ctx.raw)}` } }
        },
        scales: {
          x: { ticks: { color: '#2E2A24', font: { family: 'JetBrains Mono', size: 11 } }, grid: { display: false } },
          y: { ticks: { color: '#7A7164', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: '#E4DCCB' } }
        }
      }
    });
  }

  return { renderCategoria, renderTop, renderAnual, destroyAll };
})();
