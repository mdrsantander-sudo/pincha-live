# Pincha Live

PWA con el próximo partido, el resultado y las tablas de Estudiantes de La Plata.
Sin servidor, sin base de datos, sin costo: GitHub Actions arma un JSON cada 10 minutos y GitHub Pages lo sirve.

---

## Estado por fase

| Fase | Qué es | Estado |
|---|---|---|
| 1 | Reconocimiento de la API | Hecha para `arg.1`. Faltan las copas (ver abajo) |
| 2 | `build-datos.js` | Escrito, falta correrlo con red |
| 3 | La web | Hecha, con datos reales y de prueba |
| 4 | Workflows | Escritos, faltan probar en GitHub |
| 5 | PWA | Hecha: manifest, íconos, service worker |

### Lo que quedó confirmado contra la API real

- **ID de Estudiantes: `8`.** El brief traía `2432`, que no corresponde. Ojo con `19685`, que es Estudiantes de Río Cuarto.
- `arg.1` responde y es la Liga Profesional (ESPN id 745). Temporada 2026: Apertura enero–mayo, Clausura julio–noviembre, playoffs después.
- Tablas: **solo** por `/apis/v2/`. Confirmado, con `/apis/site/v2/` no anda.
- El Clausura viene partido en `Group A` y `Group B`. Estudiantes está en la A, 7º con 6 puntos (5 jugados).
- **Las filas de la tabla no vienen ordenadas por posición**, vienen por id de equipo. Hay que ordenarlas.
- **El scoreboard sin `?dates=` no devuelve el día de hoy**, devuelve el día del calendario que ESPN tenga cargado. Siempre pasar `?dates=YYYYMMDD-YYYYMMDD`.
- ESPN **no publica la tabla anual**. Se arma sumando Apertura (`seasontype=1`) y Clausura (`seasontype=6`). Si falla una mitad, la pestaña Anual no se muestra: mejor ausente que mal.

### Lo que falta validar (primer paso al clonar)

Los códigos de las copas están en `config.json` con `"verificado": false`. Correr:

```bash
node scripts/validar-endpoints.js
```

Prueba `arg.copa`, `conmebol.libertadores`, `conmebol.sudamericana` y algunas variantes, dice cuál responde y si Estudiantes aparece. Los que anden, marcarlos `verificado: true` y `activa: true` en `config.json`.

---

## Poner en marcha

```bash
node scripts/validar-endpoints.js   # confirmar códigos de copas
node scripts/build-datos.js --dry   # ver el JSON sin escribirlo
node scripts/build-datos.js         # escribir public/datos.json
```

Para ver la web:

```bash
cd public && python3 -m http.server 8000
```

- `http://localhost:8000` → datos reales
- `http://localhost:8000/?demo=1` → datos de prueba con los casos difíciles: rival a definir, torneo sin empezar, final reprogramada, hora sin confirmar

### Publicar

1. Subir el repo a GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Actions → General → Workflow permissions: **Read and write**.
4. Correr el workflow "Actualizar datos" a mano una vez para verificar.

El workflow commitea solo, así que el repo nunca queda 60 días inactivo y GitHub no apaga el cron.

### Instalar en el celular

iPhone: abrir la URL en Safari → Compartir → Agregar a inicio. Abre a pantalla completa y muestra el último dato guardado sin conexión.

---

## Carga manual: `manual.json`

Todo lo que pongas en `manual.json` **le gana a ESPN**. Lo que dejes en `null` o vacío, lo maneja el script solo. No hace falta tocar código.

Sirve para:

- Una copa que ESPN no tenga en su feed (cargás la llave a mano).
- La tabla anual, si el cálculo automático falla.
- Corregir un horario o una sede que ESPN tiene mal.
- Avisar algo puntual: "partido del domingo postergado por lluvia".

Las claves que empiezan con guion bajo (`_aviso`, `_ejemplo_llave`) son comentarios y ejemplos: el script las ignora. Están ahí para copiar y pegar.

**Cómo se usa, en tres pasos:**

1. Editás `manual.json` en GitHub, directo desde el navegador (botón del lápiz).
2. Guardás. Eso dispara el workflow solo.
3. En un par de minutos está en la app.

Cuando ESPN empiece a traer bien esa competencia, vaciás la clave y vuelve al automático.

---

## Las dos finales

Están en `finales.json`, cargadas a mano porque ESPN no las tiene: son partidos únicos de AFA, fuera de los torneos regulares.

Reglas que respeta la app:

- `horarioConfirmado: false` → muestra "Sábado 26/9, horario a confirmar" y no pone cuenta regresiva. Una hora inventada es peor que nada.
- La fecha sin hora se guarda en `fecha` (día puro) y **no se convierte de zona horaria**. Si se guardara `T00:00:00Z`, el 26/9 aparecería como viernes 25 a las 21:00 en Argentina.
- `sede: null` → "Sede a confirmar", nunca un estadio supuesto.
- `estado: "reprogramado"` → muestra en chico desde cuándo se movió.

Cuando se juegue, se carga el resultado a mano en el mismo archivo (`estado: "jugado"`, `resultado: "2-1"`). Son dos partidos al año.

Si Estudiantes gana las dos y se habilita la **Recopa de Campeones**, se agrega una entrada más al array. No hay que tocar código.

---

## Estructura

```
config.json                    códigos, IDs, trampas de la API
finales.json                   las dos finales, a mano
scripts/validar-endpoints.js   Paso 0
scripts/build-datos.js         arma public/datos.json
scripts/seed.js                foto inicial con las tablas reales
public/                        lo que sirve GitHub Pages
  datos.json                   lo genera el workflow
  datos.demo.json              casos de prueba
.github/workflows/             actualizar.yml (cron) y deploy.yml (Pages)
```

## Límites conocidos

- El cron de GitHub no baja de 5 minutos y en horario pico se demora. Durante un partido en vivo la app recarga cada 60 segundos e intenta pegarle a ESPN directo; si CORS lo bloquea, avisa "puede haber demora" en vez de mostrar un marcador viejo como si fuera actual.
- La API de ESPN no es oficial y la pueden cambiar sin aviso. Por eso, si un endpoint falla, el script conserva la sección anterior del JSON y anota el error en `errores`. La app queda desactualizada, nunca en blanco.
- Los escudos son de ESPN y las marcas de los clubes. Para uso personal está bien; si esto se publica en serio o se monetiza, hay que cambiarlos por íconos propios y revisar el tema.
