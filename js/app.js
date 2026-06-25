// app.js — arranca todo: inicializa datos, conecta los botones fijos
// de la pantalla y registra el service worker para que funcione offline.

(function () {
  DB.init();

  // ---------- Botón agregar objeto ----------
  document.getElementById('btn-add').addEventListener('click', () => ItemForm.open());

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => UI.showView(tab.dataset.view));
  });

  // ---------- Inicio: búsqueda y orden ----------
  document.getElementById('search-input').addEventListener('input', e => {
    UI.state.search = e.target.value;
    UI.renderInicio();
  });
  document.getElementById('sort-select').addEventListener('change', e => {
    UI.state.sort = e.target.value;
    UI.renderInicio();
  });
  document.querySelectorAll('#status-chip-row .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      UI.state.status = chip.dataset.status;
      UI.renderInicio();
    });
  });

  // ---------- Categorías ----------
  document.getElementById('btn-add-categoria').addEventListener('click', () => CategoryForm.open());

  // ---------- Backup: exportar ----------
  document.getElementById('btn-export-excel').addEventListener('click', () => {
    try {
      Backup.exportExcel();
      Toast.show('Excel exportado');
    } catch (err) {
      console.error(err);
      Toast.show('No se pudo exportar el Excel');
    }
  });
  document.getElementById('btn-export-json').addEventListener('click', () => {
    Backup.exportJSON();
    Toast.show('JSON exportado');
  });

  // ---------- Backup: importar ----------
  function handleImport(promise) {
    promise.then(async ({ items, categories }) => {
      if (!items.length && !categories.length) {
        Toast.show('No se encontraron datos en el archivo');
        return;
      }
      const replace = await Modal.confirm(
        `Se encontraron ${items.length} objeto(s) y ${categories.length} categoría(s). ¿Reemplazar todos tus datos actuales, o agregarlos a lo que ya tenés?`,
        { confirmLabel: 'Reemplazar todo', title: 'Importar datos' }
      );
      if (replace) {
        DB.replaceAll({ items, categories });
        Toast.show('Datos reemplazados');
      } else {
        DB.mergeAll({ items, categories });
        Toast.show('Datos agregados');
      }
      UI.refresh();
    }).catch(err => {
      console.error(err);
      Toast.show('No se pudo leer el archivo');
    });
  }

  document.getElementById('input-import-excel').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleImport(Backup.parseExcelFile(file));
    e.target.value = '';
  });
  document.getElementById('input-import-json').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleImport(Backup.parseJSONFile(file));
    e.target.value = '';
  });

  // ---------- Backup: borrar todo ----------
  document.getElementById('btn-wipe').addEventListener('click', async () => {
    const ok = await Modal.confirm(
      'Esto borra todos los objetos y categorías guardados en este teléfono. Hacé una copia antes si no estás seguro.',
      { danger: true, confirmLabel: 'Borrar todo', title: 'Borrar todos los datos' }
    );
    if (ok) {
      DB.replaceAll({ items: [], categories: DB.getCategories().filter(c => c.id === 'sin-categoria') });
      UI.refresh();
      Toast.show('Datos borrados');
    }
  });

  // ---------- Vista inicial ----------
  UI.showView('inicio');

  // ---------- Service worker (offline + instalable) ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.error('SW error:', err));
    });
  }
})();
