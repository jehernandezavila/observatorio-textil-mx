# Observatorio Textil, Moda y Calzado MX — Fase 1

App web estática para explorar los 447,048 establecimientos del DENUE 05/2026
de la cadena textil, de la moda y el calzado (54 clases SCIAN).

## Abrir la app
Doble clic en `iniciar_app.bat`. Abre http://localhost:8765 en el navegador.
(Los navegadores no permiten leer los datos abriendo `index.html` directamente.)
Requiere conexión a internet para las bibliotecas (MapLibre, deck.gl) y el mapa base.

## Apartados
- **Panorama**: indicadores, establecimientos por eslabón, entidades o municipios
  principales, tamaño, año de incorporación al DENUE y tabla de municipios con
  cociente de localización (CL).
- **Mapa territorial**: puntos (cada establecimiento; clic = nombre y localidad),
  coropleta por entidad y mapa de especialización (CL).
- **Cadena de valor**: diagrama de eslabones; clic en una caja para filtrar.
  Debajo, desglose por clase SCIAN.

Los filtros (entidad, eslabones, personal ocupado) aplican a los tres apartados.
La URL guarda la vista, p. ej. `#mapa&capas=4&modo=cl` (especialización en calzado).

## Manual breve de operación
La guía completa está en la propia app: enlace **Ayuda e interpretación**
(arriba a la derecha) o `web/ayuda.html`.

1. **Filtros (barra superior):** entidad, eslabones y personal ocupado.
   Aplican a todas las pestañas. Ctrl+clic (⌘+clic en Mac) en un eslabón
   lo deja como único activo; *todos* los reactiva; *Restablecer* limpia todo.
2. **Panorama:** pasa el cursor sobre las barras para ver los valores;
   *Ver datos* despliega la tabla. En la tabla de municipios puedes buscar
   (sin acentos), ordenar por establecimientos o por CL, y hacer clic en
   una fila para ir al mapa.
3. **Mapa:** elige *Puntos*, *Por entidad* o *Especialización*. Cursor
   encima = detalle; clic en un punto = nombre del establecimiento; clic en
   un estado = filtrar por él.
4. **Cadena de valor:** clic en una caja para incluir o excluir ese eslabón.
5. **Compartir:** copia la URL; guarda la pestaña y los filtros.

**Para interpretar:** el número de establecimientos mide presencia, no
tamaño económico. El CL (cociente de localización) solo tiene sentido con
uno o pocos eslabones seleccionados: CL > 1.25 indica especialización y
CL ≥ 2, una vocación marcada (p. ej., calzado en Guanajuato = 6.5;
en León = 11.5).

## Actualizar los datos
Si cambia `../DENUE_textil_moda.gpkg`:
```
python preparar_datos.py
```
Regenera `web/data/` (requiere pandas, numpy, geopandas).

## Notas metodológicas
- Recuentos de establecimientos, no de empresas.
- CL = (eslabones seleccionados / total textil-moda del territorio) ÷ (mismo cociente nacional).
  Mide especialización dentro del sector, no frente al total de la economía.
  Municipios con menos de 30 establecimientos del sector no reciben CL.
- "Año de incorporación al DENUE" no es el año de apertura.
- 541490 incluye otros diseños especializados: se trata como candidatos.
- Solo se exportan nombre del establecimiento, actividad, tamaño y ubicación;
  no se incluyen teléfono, correo ni razón social.

## En Mac
Doble clic en `iniciar_app.command`. La primera vez, si macOS lo bloquea:
clic derecho > Abrir > Abrir.

**Si el doble clic no funciona** (lo normal cuando el archivo llega por
Dropbox desde Windows, que no conserva el permiso de ejecución), abre
Terminal, escribe `bash ` (con un espacio), arrastra `iniciar_app.command`
a la ventana y pulsa Enter. Para que el doble clic funcione en adelante:
```
chmod +x iniciar_app.command
xattr -d com.apple.quarantine iniciar_app.command
```
La ventana de Terminal debe quedar abierta mientras se usa la app.

Problemas frecuentes:
- *"iniciar_app.command está dañado y no se puede abrir"*: no está dañado; es
  la cuarentena de macOS para archivos recibidos por WhatsApp, navegador o
  correo. Pulsa **Cancelar** (no "Mover a la papelera"), abre Terminal,
  escribe `xattr -cr ` (con espacio), arrastra la carpeta `app_observatorio`
  y pulsa Enter. Luego `bash ` + arrastrar `iniciar_app.command` + Enter.
- *"No se encontró Python 3"*: instala Python desde python.org o ejecuta
  `xcode-select --install`.
- *"Faltan los datos"*: en Dropbox, marca `app_observatorio` como
  "Disponible sin conexión" y espera a que termine de sincronizar.
- *Página en blanco o sin mapa*: hace falta internet para las bibliotecas y
  el mapa base. Usa Safari 15 o más reciente, Chrome o Firefox.
