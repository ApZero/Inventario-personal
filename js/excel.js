// excel.js — exportar e importar copias de seguridad en Excel (.xlsx) y JSON.
// Usa la librería SheetJS (cargada desde CDN en index.html).

const Backup = (() => {
  const COLUMNS = [
    'Objeto', 'Marca', 'Modelo', 'Categoría', 'Fecha de compra', 'Lugar',
    'Precio', 'Fin de uso', 'Motivo', 'Precio de venta', 'Notas'
  ];

  function itemsToRows(items, categories) {
    const byId = {};
    categories.forEach(c => { byId[c.id] = c.nombre; });
    return items.map(it => ({
      'Objeto': it.tipo,
      'Marca': it.marca || '',
      'Modelo': it.modelo || '',
      'Categoría': byId[it.categoriaId] || 'Sin categoría',
      'Fecha de compra': it.fecha || '',
      'Lugar': it.lugar || '',
      'Precio': it.precio,
      'Fin de uso': it.finDeUso || '',
      'Motivo': it.motivo || '',
      'Precio de venta': it.precioVenta != null ? it.precioVenta : '',
      'Notas': it.notas || ''
    }));
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      throw new Error('XLSX no está disponible (sin conexión la primera vez que se usa)');
    }
    const items = DB.getItems();
    const categories = DB.getCategories();
    const rows = itemsToRows(items, categories);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
    ws['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

    const catRows = categories
      .filter(c => c.id !== 'sin-categoria')
      .map(c => ({ Nombre: c.nombre, Color: c.color, Icono: c.icono }));
    const wsCat = XLSX.utils.json_to_sheet(catRows, { header: ['Nombre', 'Color', 'Icono'] });
    XLSX.utils.book_append_sheet(wb, wsCat, 'Categorías');

    const fecha = Calc.todayInputValue();
    XLSX.writeFile(wb, `inventario-backup-${fecha}.xlsx`);
  }

  function excelDateToISO(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'number') {
      const d = XLSX.SSF.parse_date_code(value);
      if (!d) return null;
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${d.y}-${mm}-${dd}`;
    }
    // string: intenta varios formatos comunes
    const s = String(value).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    return null;
  }

  function findOrCreateCategory(nombre, categories) {
    if (!nombre) return 'sin-categoria';
    const found = categories.find(c => c.nombre.toLowerCase() === String(nombre).trim().toLowerCase());
    if (found) return found.id;
    const palette = ['#A6512E', '#C79A3D', '#5E7A4F', '#6E8FA3', '#8C6647', '#9C6B47', '#7E6A8C', '#B97A8C'];
    const color = palette[categories.length % palette.length];
    const cat = { id: DB.uid(), nombre: String(nombre).trim(), color, icono: '🏷️' };
    categories.push(cat);
    return cat.id;
  }

  function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === 'undefined') {
        reject(new Error('XLSX no está disponible (sin conexión la primera vez que se usa)'));
        return;
      }
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('inventario')) || wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

          const catSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('categor'));
          let importedCategories = [];
          if (catSheetName) {
            const wsCat = wb.Sheets[catSheetName];
            const catRows = XLSX.utils.sheet_to_json(wsCat, { defval: '' });
            importedCategories = catRows
              .filter(r => r.Nombre)
              .map(r => ({ id: DB.uid(), nombre: String(r.Nombre).trim(), color: r.Color || '#8A8276', icono: r.Icono || '🏷️' }));
          }

          const categories = importedCategories.length ? importedCategories : DB.getCategories().slice();

          const items = rows
            .filter(r => r['Objeto'] || r['Tipo'])
            .map(r => {
              const categoriaNombre = r['Categoría'] || r['Categoria'] || '';
              const categoriaId = findOrCreateCategory(categoriaNombre, categories);
              return {
                id: DB.uid(),
                tipo: String(r['Objeto'] || r['Tipo'] || '').trim(),
                marca: String(r['Marca'] || '').trim(),
                modelo: String(r['Modelo'] || '').trim(),
                categoriaId,
                fecha: excelDateToISO(r['Fecha de compra'] || r['Fecha']),
                lugar: String(r['Lugar'] || '').trim(),
                precio: Number(r['Precio']) || 0,
                finDeUso: excelDateToISO(r['Fin de uso']),
                motivo: String(r['Motivo'] || '').trim(),
                precioVenta: r['Precio de venta'] !== '' && r['Precio de venta'] != null ? Number(r['Precio de venta']) : null,
                notas: String(r['Notas'] || '').trim()
              };
            });

          resolve({ items, categories });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function exportJSON() {
    const data = {
      version: 1,
      exportado: new Date().toISOString(),
      categories: DB.getCategories(),
      items: DB.getItems()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = Calc.todayInputValue();
    a.href = url;
    a.download = `inventario-backup-${fecha}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function parseJSONFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          resolve({ items: data.items || [], categories: data.categories || [] });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  return { exportExcel, exportJSON, parseExcelFile, parseJSONFile };
})();
