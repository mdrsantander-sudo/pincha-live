// Genera public/datos.json con la foto real del 23/8/2026 (validada contra ESPN).
// Sirve para que la app tenga algo que mostrar antes de la primera corrida del workflow.
const fs = require('fs');
const path = require('path');

const esc = id => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
const fila = (pos, equipo, id, pj, g, e, p, gf, gc, pts) => ({
  pos, equipo, equipoId: String(id), escudo: esc(id), pj, g, e, p, gf, gc, dg: gf - gc, pts
});

const zonaA = [
  fila(1, 'Instituto', 2975, 5, 4, 0, 1, 5, 2, 12),
  fila(2, 'Vélez', 21, 5, 3, 2, 0, 7, 3, 11),
  fila(3, 'Independiente', 11, 5, 3, 0, 2, 6, 3, 9),
  fila(4, 'Gimnasia (M)', 11972, 5, 3, 0, 2, 6, 3, 9),
  fila(5, 'Defensa y Justicia', 8950, 5, 2, 2, 1, 6, 7, 8),
  fila(6, "Newell's", 14, 5, 2, 1, 2, 6, 5, 7),
  fila(7, 'Estudiantes LP', 8, 5, 2, 0, 3, 7, 5, 6),
  fila(8, 'Riestra', 17702, 5, 2, 0, 3, 6, 5, 6),
  fila(9, 'Lanús', 12, 5, 2, 0, 3, 6, 6, 6),
  fila(10, 'Boca', 5, 5, 1, 3, 1, 5, 7, 6),
  fila(11, 'Central Córdoba', 11989, 5, 2, 0, 3, 3, 5, 6),
  fila(12, 'San Lorenzo', 18, 5, 2, 0, 3, 2, 4, 6),
  fila(13, 'Platense', 7764, 5, 1, 2, 2, 5, 9, 5),
  fila(14, 'Unión', 20, 5, 1, 1, 3, 5, 8, 4),
  fila(15, 'Talleres', 19, 5, 1, 0, 4, 6, 10, 3)
];

const zonaB = [
  fila(1, 'Argentinos', 3, 5, 4, 0, 1, 9, 5, 12),
  fila(2, 'Belgrano', 4, 5, 3, 1, 1, 6, 2, 10),
  fila(3, 'Rosario Central', 17, 5, 3, 1, 1, 5, 3, 10),
  fila(4, 'Sarmiento', 10158, 5, 3, 0, 2, 10, 8, 9),
  fila(5, 'Barracas Central', 10060, 5, 3, 0, 2, 3, 3, 9),
  fila(6, 'Gimnasia LP', 9, 5, 3, 0, 2, 6, 7, 9),
  fila(7, 'Atlético Tucumán', 9785, 5, 2, 2, 1, 4, 2, 8),
  fila(8, 'Tigre', 7767, 5, 2, 2, 1, 4, 2, 8),
  fila(9, 'Huracán', 10, 5, 2, 1, 2, 4, 4, 7),
  fila(10, 'Independiente Rivadavia', 9744, 5, 2, 1, 2, 5, 6, 7),
  fila(11, 'Banfield', 235, 5, 2, 1, 2, 4, 5, 7),
  fila(12, 'Racing', 15, 5, 1, 1, 3, 4, 7, 4),
  fila(13, 'Estudiantes (RC)', 19685, 5, 1, 1, 3, 2, 6, 4),
  fila(14, 'River', 16, 5, 1, 0, 4, 2, 4, 3),
  fila(15, 'Aldosivi', 9739, 5, 0, 2, 3, 3, 6, 2)
];

const finales = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'finales.json'), 'utf8'));

const datos = {
  actualizado: '2026-08-23T18:40:00Z',
  origen: 'seed',
  equipo: { id: '8', nombre: 'Estudiantes LP', escudo: esc(8) },
  proximoPartido: null,
  ultimoPartido: null,
  enVivo: null,
  torneoPrincipal: 'liga',
  finalesPendientes: finales.map(f => ({
    id: f.id, nombre: f.nombre, rival: f.rival, fechaHora: f.fechaHora, fecha: f.fecha,
    horarioConfirmado: f.horarioConfirmado, sedeTexto: f.sedeTexto,
    estado: f.estado, reprogramadaDesde: f.reprogramadaDesde
  })),
  competencias: [
    {
      id: 'liga',
      nombre: 'Liga Profesional',
      tipo: 'liga_zonas',
      tablas: [
        { titulo: 'Zona A', destacado: 'Estudiantes LP', filas: zonaA },
        { titulo: 'Zona B', destacado: null, filas: zonaB }
      ],
      llave: null
    },
    ...finales.map(f => ({
      id: f.id, nombre: f.nombre, tipo: 'final_unica', tablas: [], llave: null,
      final: {
        rival: f.rival, rivalEscudo: f.rivalEscudo, fechaHora: f.fechaHora, fecha: f.fecha,
        horarioConfirmado: f.horarioConfirmado, sedeTexto: f.sedeTexto,
        estado: f.estado, reprogramadaDesde: f.reprogramadaDesde,
        resultado: null, nota: f.nota
      }
    }))
  ],
  errores: []
};

fs.writeFileSync(path.join(__dirname, '..', 'public', 'datos.json'), JSON.stringify(datos, null, 2));
console.log('public/datos.json generado (seed real del Clausura 2026)');
