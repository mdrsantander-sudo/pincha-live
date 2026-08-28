#!/usr/bin/env node
/**
 * Pincha Live - build-datos.js
 * Pega a ESPN, normaliza y escribe public/datos.json según el contrato de datos.
 *
 * Regla de oro: si algo falla, se conserva la sección anterior del JSON.
 * Nunca se escribe vacío, nunca se falla en silencio.
 *
 * Uso:
 *   node scripts/build-datos.js
 *   node scripts/build-datos.js --dry     (no escribe, imprime el resultado)
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CONFIG = leerJson(path.join(RAIZ, 'config.json'));
const FINALES = leerJson(path.join(RAIZ, 'finales.json')) || [];
const MANUAL = limpiar(leerJson(path.join(RAIZ, 'manual.json')) || {});
const SALIDA = path.join(RAIZ, 'public', 'datos.json');
const PREVIO = leerJson(SALIDA) || {};
const DRY = process.argv.includes('--dry');

const errores = [];
const ID = CONFIG.equipo.id;

// ---------------------------------------------------------------- utilidades

/** Saca las claves que arrancan con guion bajo: son comentarios y ejemplos, no datos. */
function limpiar(v) {
  if (Array.isArray(v)) return v.map(limpiar);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) o[k] = limpiar(x);
    return o;
  }
  return v;
}

function leerJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function yyyymmdd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function rangoFechas() {
  const hoy = new Date();
  const desde = new Date(hoy); desde.setDate(hoy.getDate() - CONFIG.ventanaFixture.diasAtras);
  const hasta = new Date(hoy); hasta.setDate(hoy.getDate() + CONFIG.ventanaFixture.diasAdelante);
  return `${yyyymmdd(desde)}-${yyyymmdd(hasta)}`;
}

async function traer(url, intentos = 3) {
  for (let i = 1; i <= intentos; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'pincha-live/1.0' } });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === intentos) { errores.push(`${url} -> ${e.message}`); return null; }
      await new Promise(res => setTimeout(res, 1000 * i));
    }
  }
}

const num = v => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// ------------------------------------------------------------------ fixture

function esNuestro(ev) {
  const c = ev?.competitions?.[0]?.competitors || [];
  return c.some(x => String(x.id) === String(ID) || String(x.team?.id) === String(ID));
}

function estadoDe(st) {
  const nombre = st?.type?.name || '';
  if (CONFIG.estadosEspn[nombre]) return CONFIG.estadosEspn[nombre];
  return CONFIG.estadosEspn[st?.type?.state] || 'programado';
}

/** Convierte un evento crudo de ESPN al formato que consume la app. */
function normalizarEvento(ev, comp) {
  const c = ev.competitions?.[0];
  if (!c) return null;
  const nosotros = c.competitors.find(x => String(x.team?.id) === String(ID));
  const rival = c.competitors.find(x => String(x.team?.id) !== String(ID));
  const estado = estadoDe(c.status);
  const neutral = c.neutralSite === true;

  return {
    id: ev.id,
    competencia: comp.nombre,
    competenciaId: comp.id,
    instancia: instanciaDe(ev, c),
    rival: rival?.team?.displayName || null,
    rivalTexto: rival ? null : 'A definir',
    rivalEscudo: rival?.team?.logo || null,
    fechaHora: c.date || ev.date,
    estadio: c.venue?.fullName || null,
    condicion: neutral ? 'neutral' : (nosotros?.homeAway === 'home' ? 'local' : 'visitante'),
    estado,
    golesEstudiantes: num(nosotros?.score),
    golesRival: num(rival?.score),
    minuto: c.status?.displayClock || null,
    periodo: c.status?.type?.shortDetail || null
  };
}

function instanciaDe(ev, c) {
  const nota = c?.notes?.find(n => n.headline)?.headline;
  if (nota) return nota;
  const slug = ev.season?.slug || '';
  if (/final|semi|quarter|round/i.test(slug)) return slug.replace(/-/g, ' ');
  return null;
}

async function eventosDe(comp) {
  const url = `${CONFIG.api.site}/${comp.codigo}/scoreboard?dates=${rangoFechas()}&limit=400`;
  const data = await traer(url);
  if (!data) return null;
  return (data.events || [])
    .filter(esNuestro)
    .map(ev => normalizarEvento(ev, comp))
    .filter(Boolean)
    .sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));
}

// ------------------------------------------------------------------- tablas

function filaDe(entry) {
  const m = CONFIG.mapaStats;
  const val = n => {
    const s = entry.stats.find(x => x.name === n);
    return s ? num(s.value) : null;
  };
  return {
    pos: val(m.pos),
    equipo: entry.team.displayName,
    equipoId: String(entry.team.id),
    escudo: entry.team.logos?.[0]?.href || null,
    pj: val(m.pj), g: val(m.g), e: val(m.e), p: val(m.p),
    gf: val(m.gf), gc: val(m.gc), dg: val(m.dg), pts: val(m.pts)
  };
}

function ordenar(filas) {
  const conPos = filas.every(f => f.pos > 0);
  const orden = conPos
    ? (a, b) => a.pos - b.pos
    : (a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf;
  return filas.sort(orden).map((f, i) => ({ ...f, pos: conPos ? f.pos : i + 1 }));
}

async function tablasDe(comp) {
  const url = `${CONFIG.api.standings}/${comp.codigo}/standings`;
  const data = await traer(url);
  if (!data) return null;

  const grupos = data.children?.length ? data.children : [data];
  const tablas = grupos
    .map(gr => {
      const entries = gr.standings?.entries || [];
      if (!entries.length) return null;
      const nombre = comp.nombresZonas?.[gr.name] || gr.name || 'Posiciones';
      return { titulo: nombre, destacado: CONFIG.equipo.nombre, filas: ordenar(entries.map(filaDe)) };
    })
    .filter(Boolean);

  return tablas.length ? tablas : null;
}

/** Tabla anual: ESPN no la publica, se suma Apertura + Clausura. */
async function tablaAnual(comp) {
  const cfg = comp.tablaAnual;
  if (!cfg || cfg.modo !== 'suma_seasontypes') return null;
  const acumulado = new Map();

  for (const st of cfg.seasontypes) {
    const url = `${CONFIG.api.standings}/${comp.codigo}/standings?seasontype=${st}`;
    const data = await traer(url);
    if (!data) return null; // si falta una mitad, la anual sale mal: mejor no mostrarla
    const grupos = data.children?.length ? data.children : [data];
    for (const gr of grupos) {
      for (const e of gr.standings?.entries || []) {
        const f = filaDe(e);
        const prev = acumulado.get(f.equipoId);
        if (!prev) { acumulado.set(f.equipoId, { ...f, pos: 0 }); continue; }
        for (const k of ['pj', 'g', 'e', 'p', 'gf', 'gc', 'dg', 'pts']) prev[k] = (prev[k] || 0) + (f[k] || 0);
      }
    }
  }
  if (!acumulado.size) return null;
  const filas = ordenar([...acumulado.values()].map(f => ({ ...f, pos: 0 })));
  return { titulo: 'Tabla anual', destacado: CONFIG.equipo.nombre, filas };
}

// -------------------------------------------------------------------- llave

function llaveDe(eventos) {
  const ahora = Date.now();
  // Solo lo que viene: los partidos ya jugados no se muestran.
  const proximos = eventos.filter(ev =>
    ev.estado !== 'jugado' && ev.estado !== 'cancelado' &&
    new Date(ev.fechaHora).getTime() > ahora - 3 * 3600e3);

  return proximos.map(ev => ({
    instancia: ev.instancia || 'Fase',
    rival: ev.rival,
    rivalTexto: ev.rival ? null : 'A definir',
    fechaHora: ev.fechaHora,
    resultado: ev.estado === 'jugado' && ev.golesEstudiantes !== null
      ? `${ev.golesEstudiantes}-${ev.golesRival}`
      : null,
    estado: ev.estado === 'jugado' ? 'jugado' : 'pendiente'
  }));
}

// ------------------------------------------------------------------ finales

function competenciaDeFinal(f) {
  return {
    id: f.id,
    nombre: f.nombre,
    tipo: 'final_unica',
    tablas: [],
    llave: null,
    final: {
      rival: f.rival,
      rivalEscudo: f.rivalEscudo || null,
      fechaHora: f.fechaHora,
      fecha: f.fecha || (f.fechaHora || '').slice(0, 10),
      horarioConfirmado: !!f.horarioConfirmado,
      sedeTexto: f.sedeTexto || 'Sede a confirmar',
      estado: f.estado,
      reprogramadaDesde: f.reprogramadaDesde || null,
      resultado: f.resultado || null,
      nota: f.nota || null
    }
  };
}

/** Una final vale como próximo partido si todavía no se jugó y cae antes que lo de ESPN. */
function finalComoPartido(f) {
  return {
    competencia: f.nombre,
    competenciaId: f.id,
    instancia: 'Final',
    rival: f.rival,
    rivalTexto: null,
    rivalEscudo: f.rivalEscudo || null,
    fechaHora: f.fechaHora,
    fecha: f.fecha || (f.fechaHora || '').slice(0, 10),
    estadio: null,
    sedeTexto: f.sedeTexto || 'Sede a confirmar',
    condicion: 'neutral',
    estado: f.estado,
    horarioConfirmado: !!f.horarioConfirmado,
    reprogramadaDesde: f.reprogramadaDesde || null
  };
}

// --------------------------------------------------------------------- main

/** Revisa qué quedó sin datos y arma avisos en castellano, listos para leer. */
function detectarFaltantes(datos) {
  const f = [];
  const ahora = Date.now();
  const cargado = k => MANUAL[k] && Object.keys(MANUAL[k]).length;

  if (!datos.proximoPartido && !cargado('proximoPartido'))
    f.push('No hay próximo partido. Cargalo en manual.json → proximoPartido.');

  if (!datos.ultimoPartido && !cargado('ultimoPartido'))
    f.push('No hay último resultado. Cargalo en manual.json → ultimoPartido.');

  for (const c of datos.competencias) {
    if (c.tipo === 'final_unica') continue;
    if (c.manual) continue;
    const vacia = !c.tablas?.length && !c.llave?.length;
    if (vacia && !c.mensajeVacio)
      f.push(`"${c.nombre}" quedó sin tabla ni llave. Cargala en manual.json → competencias → "${c.id}".`);
  }

  const liga = datos.competencias.find(c => c.id === CONFIG.torneoPrincipal);
  if (liga && liga.tipo === 'liga_zonas' && !liga.tablas?.some(t => t.titulo === 'Tabla anual'))
    f.push('No se pudo armar la tabla anual (ESPN no la publica y falló la suma). Se puede cargar a mano en manual.json.');

  // Finales que ya se jugaron y siguen sin resultado: hay que cargarlo a mano
  for (const fin of FINALES) {
    const paso = new Date(fin.fechaHora).getTime() < ahora - 6 * 3600e3;
    if (paso && fin.estado !== 'jugado')
      f.push(`La ${fin.nombre} vs ${fin.rival} ya se jugó y sigue sin resultado. Cargalo en finales.json (estado: "jugado", resultado: "2-1").`);
  }

  for (const e of errores) f.push(`Endpoint caído: ${e}`);

  return f;
}

/** Lo cargado a mano en manual.json le gana a ESPN, campo por campo. */
function aplicarManual(datos) {
  const m = MANUAL;
  if (!m || !Object.keys(m).length) return;

  if (m.aviso) datos.aviso = m.aviso;
  if (m.proximoPartido) { datos.proximoPartido = m.proximoPartido; datos.proximoPartidoManual = true; }
  if (m.ultimoPartido) { datos.ultimoPartido = m.ultimoPartido; datos.ultimoPartidoManual = true; }

  for (const [id, parche] of Object.entries(m.competencias || {})) {
    if (!parche || !Object.keys(parche).length) continue;
    const i = datos.competencias.findIndex(c => c.id === id);
    if (i >= 0) {
      datos.competencias[i] = { ...datos.competencias[i], ...parche, id, manual: true };
    } else {
      datos.competencias.push({
        id, nombre: parche.nombre || id, tipo: parche.tipo || 'eliminacion',
        tablas: [], llave: null, ...parche, manual: true
      });
    }
  }

  // Si lo manual adelanta al próximo partido de ESPN, manda lo manual.
  const proximaFinal = datos.finalesPendientes?.[0];
  if (m.proximoPartido && proximaFinal &&
      new Date(proximaFinal.fechaHora) < new Date(m.proximoPartido.fechaHora)) {
    datos.proximoPartido = finalComoPartido(FINALES.find(f => f.id === proximaFinal.id));
  }
}

async function main() {
  const ahora = new Date();
  const competencias = [];
  let todos = [];

  for (const comp of CONFIG.competencias.filter(c => c.activa)) {
    const eventos = await eventosDe(comp);
    if (eventos === null) {
      const prev = (PREVIO.competencias || []).find(c => c.id === comp.id);
      if (prev) { competencias.push(prev); }
      continue;
    }
    todos = todos.concat(eventos);

    const salida = { id: comp.id, nombre: comp.nombre, tipo: comp.tipo, tablas: [], llave: null };

    if (comp.tipo === 'liga_zonas' || comp.tipo === 'grupos_llave') {
      const tablas = await tablasDe(comp);
      const prev = (PREVIO.competencias || []).find(c => c.id === comp.id);
      salida.tablas = tablas || prev?.tablas || [];
      if (comp.tipo === 'liga_zonas') {
        const anual = await tablaAnual(comp);
        if (anual) salida.tablas.push(anual);
        else if (prev?.tablas?.some(t => t.titulo === 'Tabla anual')) {
          salida.tablas.push(prev.tablas.find(t => t.titulo === 'Tabla anual'));
        }
      }
    }
    if (comp.tipo === 'eliminacion' || comp.tipo === 'grupos_llave') {
      salida.llave = llaveDe(eventos);
    }
    if (!salida.tablas.length && !salida.llave?.length) {
      const jugoAlgo = eventos.some(e => e.estado === 'jugado');
      salida.mensajeVacio = jugoAlgo
        ? `${comp.nombre}: no quedan partidos por jugar.`
        : `${comp.nombre}: todavía sin fixture publicado.`;
    }
    competencias.push(salida);
  }

  // Finales cargadas a mano (ESPN no las tiene)
  for (const f of FINALES) competencias.push(competenciaDeFinal(f));

  // Próximo / último / en vivo
  const jugados = todos.filter(e => e.estado === 'jugado' && e.golesEstudiantes !== null);
  const pendientes = todos.filter(e => ['programado', 'postergado', 'suspendido'].includes(e.estado));
  const vivo = todos.find(e => e.estado === 'en_vivo') || null;

  const finalesPendientes = FINALES
    .filter(f => f.estado !== 'jugado' && new Date(f.fechaHora) > ahora)
    .sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));

  let proximo = pendientes.find(e => new Date(e.fechaHora) > ahora) || null;
  const proximaFinal = finalesPendientes[0];
  if (proximaFinal && (!proximo || new Date(proximaFinal.fechaHora) < new Date(proximo.fechaHora))) {
    proximo = finalComoPartido(proximaFinal);
  }

  const ultimo = jugados.length ? jugados[jugados.length - 1] : null;
  const ultimoPartido = ultimo ? {
    competencia: ultimo.competencia,
    rival: ultimo.rival,
    rivalEscudo: ultimo.rivalEscudo,
    golesEstudiantes: ultimo.golesEstudiantes,
    golesRival: ultimo.golesRival,
    resultado: ultimo.golesEstudiantes > ultimo.golesRival ? 'victoria'
      : ultimo.golesEstudiantes < ultimo.golesRival ? 'derrota' : 'empate',
    fecha: ultimo.fechaHora
  } : null;

  const datos = {
    actualizado: ahora.toISOString(),
    equipo: { id: ID, nombre: CONFIG.equipo.nombre, escudo: CONFIG.equipo.escudo },
    proximoPartido: proximo || PREVIO.proximoPartido || null,
    ultimoPartido: ultimoPartido || PREVIO.ultimoPartido || null,
    enVivo: vivo,
    torneoPrincipal: CONFIG.torneoPrincipal,
    finalesPendientes: finalesPendientes.map(f => ({
      id: f.id, nombre: f.nombre, rival: f.rival, fechaHora: f.fechaHora,
      fecha: f.fecha || (f.fechaHora || '').slice(0, 10),
      horarioConfirmado: !!f.horarioConfirmado, sedeTexto: f.sedeTexto,
      estado: f.estado, reprogramadaDesde: f.reprogramadaDesde || null
    })),
    competencias,
    errores
  };

  aplicarManual(datos);
  datos.faltantes = detectarFaltantes(datos);

  if (errores.length) console.error('Endpoints con problemas:\n- ' + errores.join('\n- '));

  if (datos.faltantes.length) {
    console.log('\nFalta cargar a mano:');
    for (const x of datos.faltantes) console.log('  - ' + x);
  } else {
    console.log('Nada pendiente de carga manual.');
  }

  if (DRY) { console.log(JSON.stringify(datos, null, 2)); return; }
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(datos, null, 2));
  console.log(`Listo: ${SALIDA} (${competencias.length} competencias, ${errores.length} errores)`);
}

main().catch(e => { console.error('Falló el build:', e); process.exit(1); });
