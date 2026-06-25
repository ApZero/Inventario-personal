# Inventario

App para registrar lo que tenés, cuánto pagaste y cuánto te cuesta por mes
mantenerlo. Funciona sin conexión y se puede instalar en el teléfono como
una app más (PWA). Todos los datos quedan guardados en el propio teléfono
(localStorage) — nada se manda a ningún servidor.

Este repositorio arranca **vacío** (solo con las categorías base, sin
ningún objeto cargado), porque pensado para ser público en GitHub. Tu
inventario real no va en el código — lo importás vos mismo después de
instalar la app, desde un archivo que solo tenés en tu teléfono/PC.

## Publicar en GitHub Pages

1. Creá un repositorio nuevo en GitHub (puede ser público o privado).
2. Subí todos estos archivos y carpetas tal cual están (mismo nombre,
   misma estructura: `index.html` en la raíz, las carpetas `css/`, `js/`,
   `icons/`, y los archivos `manifest.json` y `sw.js` también en la raíz).
3. En el repositorio: **Settings → Pages → Source → Deploy from a branch**,
   elegí la rama `main` y la carpeta `/ (root)`. Guardá.
4. Esperá uno o dos minutos. GitHub te va a dar una URL del tipo
   `https://tu-usuario.github.io/tu-repositorio/`.
5. Abrí esa URL desde el celular (Chrome en Android, o Safari en iPhone).
   Va a aparecer la opción de "Agregar a pantalla de inicio" /
   "Instalar app". Una vez instalada, se abre como cualquier otra app,
   con su propio ícono, sin la barra del navegador.

## Cargar tu inventario real

Junto a este proyecto recibiste (por separado, fuera del repositorio)
`mis-datos-backup.json` y `mis-datos-backup.xlsx`, con tus 48 objetos
actuales. **No subas esos dos archivos al repositorio público** — son
para vos, guardalos en tu teléfono o Google Drive personal.

Una vez que instales la app:

1. Abrí la pestaña **Backup**.
2. Tocá "Importar JSON" (o "Importar Excel", cualquiera de los dos
   sirve, tienen los mismos datos) y elegí el archivo.
3. Como la app está vacía, te va a preguntar si reemplazar o agregar —
   cualquiera de las dos opciones funciona igual de bien la primera vez.

A partir de ahí, tus datos quedan solamente en ese teléfono. Para
respaldarlos de nuevo más adelante, usá "Exportar" en la misma pestaña.

## Cómo editar la app más adelante

Podés editar cualquier archivo directamente desde GitHub (lápiz ✏️ en la
esquina de cada archivo) sin instalar nada en tu computadora.

**Importante:** cada vez que cambies algo, abrí `sw.js` y subí el número
de la primera línea de verdad (`const CACHE_NAME = 'inventario-v1'` →
`'inventario-v2'`, `'v3'`, etc.). Si no lo hacés, el teléfono va a seguir
mostrando la versión vieja porque queda guardada en caché. Después de
subir el cambio, puede tardar unos segundos en notarse — si no, cerrá la
app del todo y volvé a abrirla.

## Estructura de archivos

```
index.html          La pantalla y estructura de toda la app
manifest.json        Metadata para que se pueda instalar como app
sw.js                Service worker: hace que funcione sin conexión
css/styles.css       Todos los estilos
js/seed.js            Categorías base con las que arranca la app (sin objetos)
js/db.js              Guardado de datos + todos los cálculos (días, costo mensual, etc.)
js/excel.js           Exportar/importar Excel y JSON
js/charts.js          Gráficos de la pantalla Estadísticas
js/forms.js           Las ventanas (modales) para agregar/editar objetos y categorías
js/ui.js              Todo lo que se dibuja en pantalla
js/app.js             Arranque de la app y conexión de botones
icons/                Íconos de la app
```

## Qué incluye la app

- **Inicio**: lo que más te cuesta por mes, arriba de todo. Buscador,
  orden, filtro por categoría y por estado (en uso / retirado / todos).
- **Categorías**: crear, editar (nombre, color, ícono) y borrar las que
  quieras. Las categorías del Excel original ya están cargadas.
- **Estadísticas**: costo mensual por categoría, qué objetos te cuestan
  más, cuánto invertiste por año, e historial de lo que retiraste (con
  motivo y, si lo vendiste, cuánto recuperaste).
- **Backup**: exportar a Excel (mismo formato que tu planilla original,
  más una hoja de categorías) o a JSON (copia exacta, para restaurar sin
  pérdidas). Importar también admite ambos formatos, con opción de
  reemplazar todo o sumar a lo que ya tenés.

## Sobre los cálculos

- **Días**: si el objeto sigue en uso, es la diferencia entre hoy y la
  fecha de compra. Si ya lo retiraste, es la diferencia entre la fecha de
  fin de uso y la de compra. Se recalcula solo, cada vez que abrís la app
  — no queda guardado un número viejo.
- **Costo mensual** = Precio ÷ (Días ÷ 30). Igual a la fórmula que ya
  tenías en el Excel.
- **Costo neto mensual**: si marcás un objeto como retirado y anotás un
  precio de venta, se calcula también cuánto te costó en limpio,
  descontando lo que recuperaste.

## Ideas para más adelante (si querés seguir construyendo)

- Recordatorios de mantenimiento por objeto (ej: "cambiar filtro cada 6 meses").
- Adjuntar una foto a cada objeto (se podría guardar como base64 en
  localStorage para objetos pocos, pero ojo que cada foto pesa bastante).
- Compartir el inventario entre varios dispositivos (necesitaría un
  backend tipo Supabase, como en tus otros proyectos).
