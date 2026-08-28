/* Pincha Live — app.js
   Lee datos.json y renderiza. No habla con ESPN salvo durante un partido en vivo. */

const TZ = 'America/Argentina/Buenos_Aires';
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const ARCHIVO = params.get('demo') ? 'datos.demo.json' : 'datos.json';

let DATOS = null;
let tablaActiva = 0;
let tablaExpandida = false;
let timerRegresiva = null;

// ---------------------------------------------------------------- fechas

function partesFecha(iso) {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(iso));
  const g = t => partes.find(p => p.type === t)?.value || '';
  const dow = g('weekday');
  return {
    diaSemana: dow.charAt(0).toUpperCase() + dow.slice(1),
    dia: g('day'), mes: g('month'), hora: g('hour'), min: g('minute')
  };
}

/** Día puro (YYYY-MM-DD) sin conversión de zona: si no hay hora, no hay zona que convertir. */
function partesDia(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  const dow = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(a, m - 1, d)));
  return { diaSemana: dow.charAt(0).toUpperCase() + dow.slice(1), dia: String(d), mes: String(m) };
}

/** "Jueves 27, 19:15" — o "Sábado 26/9, horario a confirmar" si la hora no está cerrada. */
function cuando(obj, horarioConfirmado = true) {
  const conf = typeof obj === 'object' ? obj.horarioConfirmado !== false : horarioConfirmado;
  const iso = typeof obj === 'object' ? obj.fechaHora : obj;
  const dia = typeof obj === 'object' ? obj.fecha : null;
  if (!conf) {
    const p = dia ? partesDia(dia) : partesFecha(iso);
    return `${p.diaSemana} ${p.dia}/${p.mes}, horario a confirmar`;
  }
  const p = partesFecha(iso);
  return `${p.diaSemana} ${p.dia}/${p.mes}, ${p.hora}:${p.min}`;
}

function fechaCorta(obj) {
  if (typeof obj === 'object' && obj.horarioConfirmado === false && obj.fecha) {
    const p = partesDia(obj.fecha);
    return `${p.dia}/${p.mes}`;
  }
  const p = partesFecha(typeof obj === 'object' ? obj.fechaHora : obj);
  return `${p.dia}/${p.mes}`;
}

function haceCuanto(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (min < 1) return { texto: 'recién actualizado', viejo: false };
  if (min < 60) return { texto: `actualizado hace ${min} min`, viejo: false };
  const hs = Math.round(min / 60);
  return { texto: `actualizado hace ${hs} h`, viejo: min > 120 };
}

// ------------------------------------------------------------- encabezado

function pintarHero() {
  const url = DATOS.equipo?.escudo;
  const hero = $('#hero');
  if (url && !hero.querySelector('.escudo-hero')) {
    hero.insertAdjacentHTML('afterbegin', `<img class="escudo-hero" src="${url}" alt="">`);
  }
}

function pintarAviso() {
  const caja = $('#aviso-global');
  const faltan = (DATOS.faltantes || []).length;
  if (!DATOS.aviso && !faltan) { caja.hidden = true; return; }
  caja.hidden = false;
  caja.innerHTML = [
    DATOS.aviso ? `<div>${DATOS.aviso}</div>` : '',
    // El detalle técnico solo se ve con ?admin=1: al hincha no le interesa.
    faltan && params.get('admin')
      ? `<div class="aviso-faltantes"><b>Falta cargar a mano</b><ul>${
          DATOS.faltantes.map(x => `<li>${x}</li>`).join('')}</ul></div>`
      : ''
  ].join('');
}

// -------------------------------------------------- próximo partido (liga)

function pintarProximoLiga() {
  const caja = $('#proximo-liga');
  clearInterval(timerRegresiva);

  const comp = DATOS.competencias.find(c => c.id === DATOS.torneoPrincipal);
  $('#titulo-liga').textContent = comp ? comp.nombre : 'Próximo partido';

  const vivo = DATOS.enVivo;
  if (vivo && (!vivo.competenciaId || vivo.competenciaId === DATOS.torneoPrincipal)) {
    return pintarEnVivo(caja, vivo);
  }

  const p = comp?.proximo
    || (DATOS.proximoPartido?.competenciaId === DATOS.torneoPrincipal ? DATOS.proximoPartido : null);

  if (!p) {
    caja.innerHTML = `<div class="partido">
      <div class="contexto">Próximo partido</div>
      <div class="rival">Sin fecha confirmada</div>
      <div class="donde">Todavía no hay fixture publicado.</div></div>`;
    return;
  }

  const rival = p.rival || p.rivalTexto || 'Rival a definir';
  const lugar = p.estadio || p.sedeTexto || (p.condicion === 'neutral' ? 'Cancha neutral' : null);
  const condicion = p.condicion === 'local' ? 'De local'
    : p.condicion === 'visitante' ? 'De visitante' : 'Cancha neutral';
  const horaOk = p.horarioConfirmado !== false;

  let aviso = '';
  if (p.estado === 'suspendido') aviso = 'Partido suspendido';
  else if (p.estado === 'postergado') aviso = 'Partido postergado, sin nueva fecha';

  caja.innerHTML = `<div class="partido">
    <div class="contexto">${p.instancia || 'Próximo partido'}</div>
    <div class="rival">vs ${rival}</div>
    <div class="cuando">${cuando(p)}</div>
    <div class="donde">${[lugar, condicion].filter(Boolean).join(' · ')}</div>
    ${aviso ? `<div class="aviso">${aviso}</div>` : ''}
    <div id="regresiva"></div></div>`;

  if (horaOk && p.estado !== 'suspendido' && p.estado !== 'postergado') iniciarRegresiva(p.fechaHora);
}

function iniciarRegresiva(iso) {
  const caja = $('#regresiva');
  const tick = () => {
    const falta = new Date(iso) - Date.now();
    if (falta <= 0 || falta > 48 * 3600e3) { caja.innerHTML = ''; return; }
    const h = Math.floor(falta / 3600e3);
    const m = Math.floor(falta % 3600e3 / 60000);
    const sg = Math.floor(falta % 60000 / 1000);
    caja.innerHTML = `<div class="regresiva">
      <div><b>${h}</b><span>HORAS</span></div>
      <div><b>${String(m).padStart(2, '0')}</b><span>MIN</span></div>
      <div><b>${String(sg).padStart(2, '0')}</b><span>SEG</span></div></div>`;
  };
  tick();
  timerRegresiva = setInterval(tick, 1000);
}

function pintarEnVivo(caja, v) {
  const rival = v.rival || 'Rival';
  const local = v.condicion === 'local';
  const izq = local ? 'Estudiantes' : rival;
  const der = local ? rival : 'Estudiantes';
  const gi = local ? v.golesEstudiantes : v.golesRival;
  const gd = local ? v.golesRival : v.golesEstudiantes;
  caja.innerHTML = `<div class="partido vivo">
    <div class="vivo-etiqueta"><i class="vivo-punto"></i>EN VIVO</div>
    <div class="marcador">
      <div class="cifras">${gi ?? 0}–${gd ?? 0}</div>
      <div class="equipos">${izq}<br>${der}</div>
      <div class="minuto">${v.minuto || ''}</div>
    </div>
    ${DATOS.avisoDemora ? '<div class="aviso">Puede haber demora de algunos minutos</div>' : ''}</div>`;
}

// ---------------------------------------------------------------- finales

function pintarFinales() {
  const seccion = $('#finales');
  const lista = DATOS.finalesPendientes || [];
  if (!lista.length) { seccion.hidden = true; return; }
  seccion.hidden = false;
  $('#finales-tira').innerHTML = lista.map(f => `
    <article class="final-chip">
      <div class="n">${f.nombre}</div>
      <div class="r">vs ${f.rival}</div>
      <div class="f">${cuando(f)}</div>
      ${f.estado === 'reprogramado' ? '<div class="nota">reprogramada</div>' : ''}
    </article>`).join('');
}

// ---------------------------------------------------------------- tablas

/** Ventana de 5 filas centrada en Estudiantes, más el líder si quedó afuera. */
function ventana(filas, idEquipo) {
  const i = filas.findIndex(f => f.equipoId === idEquipo);
  if (i < 0) return filas.slice(0, 5).map(f => ({ f }));
  let desde = Math.max(0, i - 2);
  let hasta = Math.min(filas.length, desde + 5);
  desde = Math.max(0, hasta - 5);
  const trozo = filas.slice(desde, hasta).map(f => ({ f }));
  if (desde > 0) trozo.unshift({ f: filas[0], corte: desde > 1 });
  return trozo;
}

function filaHTML(f, destacada, corte) {
  return `<tr class="${destacada ? 'destacada' : ''} ${corte ? 'corte' : ''}">
    <td class="pos">${f.pos}</td>
    <td class="eq">${f.escudo ? `<img class="escudo" src="${f.escudo}" alt="" loading="lazy">` : ''}${f.equipo}</td>
    <td>${f.pj}</td><td>${f.dg > 0 ? '+' + f.dg : f.dg}</td><td class="pts">${f.pts}</td></tr>`;
}

function tablaHTML(tabla, idEquipo, expandida) {
  const filas = expandida ? tabla.filas.map(f => ({ f })) : ventana(tabla.filas, idEquipo);
  return `<table class="posiciones">
    <thead><tr><th class="pos">#</th><th class="eq">Equipo</th><th>PJ</th><th>DG</th><th>Pts</th></tr></thead>
    <tbody>${filas.map(x => filaHTML(x.f, x.f.equipoId === idEquipo, x.corte)).join('')}</tbody>
  </table>`;
}

function pintarTablaHome() {
  const comp = DATOS.competencias.find(c => c.id === DATOS.torneoPrincipal);
  const seccion = $('#tabla-seccion');
  if (!comp) { seccion.hidden = true; return; }
  seccion.hidden = false;
  $('#tabla-titulo').textContent = 'Posiciones';

  if (!comp.tablas?.length) {
    $('#selector-tablas').innerHTML = '';
    $('#tabla-contenedor').innerHTML = `<div class="vacio">${comp.mensajeVacio || 'Todavía sin tabla publicada.'}</div>`;
    return;
  }

  const tablas = comp.tablas;
  if (tablaActiva >= tablas.length) tablaActiva = 0;

  $('#selector-tablas').innerHTML = tablas.length > 1
    ? tablas.map((t, i) => `<button role="tab" aria-selected="${i === tablaActiva}" data-i="${i}">${t.titulo}</button>`).join('')
    : '';
  $('#selector-tablas').querySelectorAll('button').forEach(b => b.onclick = () => {
    tablaActiva = +b.dataset.i; tablaExpandida = false; pintarTablaHome();
  });

  const t = tablas[tablaActiva];
  const completa = tablaExpandida || t.filas.length <= 6;
  $('#tabla-contenedor').innerHTML = tablaHTML(t, DATOS.equipo.id, completa) +
    (t.filas.length > 6 ? `<button class="ver-completa" id="btn-completa">${tablaExpandida ? 'Ver menos' : 'Ver tabla completa'}</button>` : '');
  const btn = $('#btn-completa');
  if (btn) btn.onclick = () => { tablaExpandida = !tablaExpandida; pintarTablaHome(); };
}

// ---------------------------------------------------------------- accesos

function resumenDe(c) {
  if (c.tipo === 'final_unica') return `vs ${c.final.rival} · ${fechaCorta(c.final)}`;
  if (c.llave?.length) {
    const prox = c.llave.find(s => s.estado === 'pendiente');
    return prox ? `${prox.instancia} · ${prox.rival || prox.rivalTexto}` : 'Serie completa';
  }
  if (c.tablas?.length) return c.tablas.map(t => t.titulo).join(' · ');
  return c.mensajeVacio || 'Sin datos todavía';
}

function pintarAccesos() {
  const otras = DATOS.competencias.filter(c => c.id !== DATOS.torneoPrincipal);
  $('#accesos').innerHTML = otras.map(c => `
    <button class="acceso" data-id="${c.id}">
      <span>${c.nombre}<br><span class="sub">${resumenDe(c)}</span></span>
      <span class="flecha">›</span>
    </button>`).join('');
  $('#accesos').querySelectorAll('.acceso').forEach(b => b.onclick = () => abrirCompetencia(b.dataset.id));
}

// ------------------------------------------------------- vista competencia

function abrirCompetencia(id) {
  $('#pantalla-home').hidden = true;
  $('#pantalla-competencia').hidden = false;
  window.scrollTo(0, 0);
  const tabs = $('#tabs-competencias');
  tabs.innerHTML = DATOS.competencias.map(c =>
    `<button role="tab" aria-selected="${c.id === id}" data-id="${c.id}">${c.nombre}</button>`).join('');
  tabs.querySelectorAll('button').forEach(b => b.onclick = () => abrirCompetencia(b.dataset.id));
  $('#detalle-competencia').innerHTML = detalleHTML(DATOS.competencias.find(c => c.id === id));
}

function detalleHTML(c) {
  if (!c) return '<div class="vacio">Competencia no encontrada.</div>';

  if (c.tipo === 'final_unica') {
    const f = c.final;
    return `<div class="ficha-final">
      <h3>vs ${f.rival}</h3>
      <div class="dato"><span>Cuándo</span><span>${cuando(f)}</span></div>
      <div class="dato"><span>Dónde</span><span>${f.sedeTexto || 'Sede a confirmar'}</span></div>
      <div class="dato"><span>Estado</span><span>${etiquetaEstado(f)}</span></div>
      ${f.resultado ? `<div class="dato"><span>Resultado</span><span>${f.resultado}</span></div>` : ''}
      ${f.nota ? `<p class="nota">${f.nota}</p>` : ''}
    </div>`;
  }

  const partes = [];
  if (c.nota) partes.push(`<p class="nota-comp">${c.nota}</p>`);
  for (const t of (c.tablas || [])) {
    partes.push(`<h2 class="rotulo" style="margin:16px 0 8px">${t.titulo}</h2>` +
      tablaHTML(t, DATOS.equipo.id, true));
  }
  if (c.llave?.length) {
    partes.push('<h2 class="rotulo" style="margin:16px 0 8px">Próximos partidos</h2>' + c.llave.map(s => `
      <div class="serie ${s.estado}">
        <div>
          <div class="instancia">${s.instancia}</div>
          <div class="rival">${s.rival || s.rivalTexto || 'A definir'}</div>
        </div>
        ${s.resultado
          ? `<div class="marcador-chico">${s.resultado}</div>`
          : `<div class="fecha">${s.fechaHora ? cuando(s.fechaHora) : 'sin fecha'}</div>`}
      </div>`).join(''));
  }
  if (!partes.length) partes.push(`<div class="vacio">${c.mensajeVacio || 'Todavía no arrancó. Volvé cuando empiece.'}</div>`);
  return partes.join('');
}

function etiquetaEstado(f) {
  if (f.estado === 'reprogramado') {
    const d = f.reprogramadaDesde ? ` (desde el ${f.reprogramadaDesde.split('-').reverse().slice(0, 2).join('/')})` : '';
    return 'Reprogramada' + d;
  }
  return { programado: 'Programada', suspendido: 'Suspendida', jugado: 'Jugada' }[f.estado] || 'Programada';
}

$('#volver').onclick = () => {
  $('#pantalla-competencia').hidden = true;
  $('#pantalla-home').hidden = false;
  window.scrollTo(0, 0);
};

// ---------------------------------------------------------------- frescura

function pintarFrescura() {
  const { texto, viejo } = haceCuanto(DATOS.actualizado);
  const pie = $('#pie-actualizado');
  pie.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
  pie.classList.toggle('demorado', viejo);
}

// ---------------------------------------------------------------- arranque

function pintarTodo() {
  pintarHero();
  pintarAviso();
  pintarProximoLiga();
  pintarTablaHome();
  pintarFinales();
  pintarAccesos();
  pintarFrescura();
}

async function cargar() {
  try {
    const r = await fetch(ARCHIVO + '?v=' + Date.now(), { cache: 'no-store' });
    DATOS = await r.json();
    pintarTodo();
    if (DATOS.enVivo) seguirEnVivo(); else frenarEnVivo();
  } catch (e) {
    if (!DATOS) $('#proximo-liga').innerHTML =
      '<div class="partido"><div class="contexto">Sin conexión</div>' +
      '<div class="rival">No se pudieron cargar los datos</div>' +
      '<div class="donde">Probá de nuevo cuando tengas señal.</div></div>';
  }
}

/* Durante un partido el cron de 10 min queda corto: recargamos cada 60 s.
   Además probamos una vez si el navegador puede pegarle a ESPN directo (CORS).
   Si no puede, lo decimos en pantalla en vez de fingir que está al día. */
let timerVivo = null;
let corsProbado = false;

function seguirEnVivo() {
  if (!timerVivo) timerVivo = setInterval(cargar, 60000);
  if (corsProbado) return;
  corsProbado = true;
  fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard')
    .then(r => { if (!r.ok) throw new Error(); })
    .catch(() => { DATOS.avisoDemora = true; pintarProximoLiga(); });
}

function frenarEnVivo() {
  if (timerVivo) { clearInterval(timerVivo); timerVivo = null; }
}

cargar();
setInterval(() => { if (!document.hidden) cargar(); }, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
