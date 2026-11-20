// Hairline UI components, MIT License. Copyright (c) 2026 Hairline UI.
// https://hairlineui.com/license#components
export type EmptyStateScene = 'inbox' | 'search' | 'done' | 'offline' | 'chart' | 'music' | 'calendar' | 'notes';

/** What a face is filled with; the component maps these to theme tokens. */
export type SceneFill = 'top' | 'left' | 'right' | 'hole' | 'glass' | 'accent' | 'accent-side' | 'none';
export type SceneStroke = 'line' | 'faint' | 'accent';

export interface SceneShape {
  d: string;
  fill: SceneFill;
  stroke: SceneStroke;
  /** Dashed outlines are ghosts (nothing there yet); they fade in instead of drawing. */
  dashed?: boolean;
  /** Even-odd fill, for faces with a hole in them (the tray's rim, the lens). */
  ring?: boolean;
  /** Clipped to this outline (the inside of the tray). */
  clip?: string;
  /** Moves with the action's poses. */
  hero?: boolean;
}

type Vec3 = [number, number, number];

export interface SceneDef {
  shapes: SceneShape[];
  /** Where the hero part stands while the action runs and once it has worked, in tile units. */
  poses?: { pending?: Vec3; success?: Vec3 };
}

/** One tile unit in px. */
export const UNIT = 14;
const C = Math.cos(Math.PI / 6);
/** The drawing's box: the tile and everything that stands on it, same for every scene so the tile never moves. */
export const VIEW = { x: -78, y: -36, width: 156, height: 130 };

export const project = ([x, y, z]: Vec3): [number, number] => [(x - y) * C * UNIT, (x + y) * 0.5 * UNIT - z * UNIT];

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const path = (points: Vec3[], close = true) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${n(project(p)[0])} ${n(project(p)[1])}`).join(' ') + (close ? ' Z' : '');

type Style = { fills?: [SceneFill, SceneFill, SceneFill]; stroke?: SceneStroke; dashed?: boolean; hero?: boolean };

/** The three faces you can see of an upright box: the left-front, the right-front and the top. */
function box(x: number, y: number, z: number, w: number, d: number, h: number, style: Style = {}): SceneShape[] {
  const [X, Y, Z] = [x + w, y + d, z + h];
  const [left, right, top] = style.fills ?? ['left', 'right', 'top'];
  const base = { stroke: style.stroke ?? 'line', dashed: style.dashed, hero: style.hero };
  return [
    {
      ...base,
      fill: left,
      d: path([
        [x, Y, z],
        [X, Y, z],
        [X, Y, Z],
        [x, Y, Z],
      ]),
    },
    {
      ...base,
      fill: right,
      d: path([
        [X, y, z],
        [X, Y, z],
        [X, Y, Z],
        [X, y, Z],
      ]),
    },
    {
      ...base,
      fill: top,
      d: path([
        [x, y, Z],
        [X, y, Z],
        [X, Y, Z],
        [x, Y, Z],
      ]),
    },
  ];
}

const line = (points: Vec3[], stroke: SceneStroke = 'line', hero = false): SceneShape => ({
  d: path(points, false),
  fill: 'none',
  stroke,
  hero,
});

/** A circle standing upright and turned to face you (the plane x + y = constant), so it reads round. */
const facingCircle = (cx: number, cy: number, cz: number, r: number): Vec3[] =>
  Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const u = (r * Math.cos(a)) / Math.SQRT2;
    return [cx + u, cy - u, cz + r * Math.sin(a)];
  });

/** The tile everything stands on, with a faint drafting grid. Drawn once; scenes change on top of it. */
export const TILE: SceneShape[] = [
  ...box(0, 0, -0.45, 6, 6, 0.45),
  ...[2, 4].flatMap((v) => [
    line(
      [
        [v, 0, 0],
        [v, 6, 0],
      ],
      'faint',
    ),
    line(
      [
        [0, v, 0],
        [6, v, 0],
      ],
      'faint',
    ),
  ]),
];

/** Nothing here yet: an open tray, and the first sheet waiting above it. */
function inbox(): SceneDef {
  const [x0, x1, top, floor, inset] = [1.3, 4.7, 0.8, 0.25, 0.3];
  const [i0, i1] = [x0 + inset, x1 - inset];
  const hole = path([
    [i0, i0, top],
    [i1, i0, top],
    [i1, i1, top],
    [i0, i1, top],
  ]);
  const outer = path([
    [x0, x0, top],
    [x1, x0, top],
    [x1, x1, top],
    [x0, x1, top],
  ]);
  const sheet: [number, number, number] = [2.0, 1.95, 2.05];
  const textTop = sheet[2] + 0.06;
  return {
    shapes: [
      ...box(x0, x0, 0, x1 - x0, x1 - x0, top).slice(0, 2),
      { d: `${outer} ${hole}`, fill: 'top', stroke: 'line', ring: true },
      {
        d: path([
          [i0, i0, floor],
          [i1, i0, floor],
          [i1, i1, floor],
          [i0, i1, floor],
        ]),
        fill: 'hole',
        stroke: 'faint',
        clip: hole,
      },
      {
        d: path([
          [i0, i0, top],
          [i0, i1, top],
          [i0, i1, floor],
          [i0, i0, floor],
        ]),
        fill: 'right',
        stroke: 'line',
        clip: hole,
      },
      {
        d: path([
          [i0, i0, top],
          [i1, i0, top],
          [i1, i0, floor],
          [i0, i0, floor],
        ]),
        fill: 'left',
        stroke: 'line',
        clip: hole,
      },
      ...box(sheet[0], sheet[1], sheet[2], 2.0, 2.5, 0.06, { hero: true }),
      ...[2.45, 2.95, 3.45].map((y, i) =>
        line(
          [
            [2.35, y, textTop],
            [i === 2 ? 3.1 : 3.65, y, textTop],
          ],
          'accent',
          true,
        ),
      ),
    ],
    // It hovers a little lower while the action runs, then lands on the rim.
    poses: { pending: [0, 0, -0.55], success: [0, 0, top - sheet[2]] },
  };
}

/** No results: a lens held over three empty result rows. */
function search(): SceneDef {
  const [cx, cy, cz, r, t] = [3.15, 2.85, 1.85, 1.3, 0.26];
  const outer = facingCircle(cx, cy, cz, r);
  const inner = facingCircle(cx, cy, cz, r - t);
  // The handle leaves the rim down and to the right, in the lens's own plane.
  const a = -0.95;
  const along = (d: number): Vec3 => {
    const u = (d * Math.cos(a)) / Math.SQRT2;
    return [cx + u, cy - u, cz + d * Math.sin(a)];
  };
  const side = (p: Vec3, w: number): Vec3 => {
    const u = (w * Math.cos(a + Math.PI / 2)) / Math.SQRT2;
    return [p[0] + u, p[1] - u, p[2] + w * Math.sin(a + Math.PI / 2)];
  };
  const [h0, h1] = [along(r - 0.05), along(r + 1.15)];
  const rows = [0.9, 2.35, 3.8].flatMap((y, i) =>
    box(0.9, y, 0, i === 2 ? 3.3 : 4.2, 1.05, 0.1, { fills: ['none', 'none', 'none'], stroke: 'line', dashed: true }),
  );
  return {
    shapes: [
      ...rows,
      {
        d: path([side(h0, 0.16), side(h1, 0.16), side(h1, -0.16), side(h0, -0.16)]),
        fill: 'right',
        stroke: 'line',
        hero: true,
      },
      { d: path(inner), fill: 'glass', stroke: 'faint', hero: true },
      { d: `${path(outer)} ${path(inner)}`, fill: 'left', stroke: 'accent', ring: true, hero: true },
    ],
    // The lens sweeps across the empty rows while a search runs again.
    poses: { pending: [-0.7, 0.7, 0] },
  };
}

/** All caught up: a thick check standing on a low platform, turned to face you. */
const unit = (v: [number, number]): [number, number] => {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
};

function done(): SceneDef {
  const [A, B, Cp]: [number, number][] = [
    [-1.35, 1.95],
    [-0.45, 1.0],
    [1.7, 3.15],
  ];
  const h = 0.26;
  const d1 = unit([B[0] - A[0], B[1] - A[1]]);
  const d2 = unit([Cp[0] - B[0], Cp[1] - B[1]]);
  const n1: [number, number] = [-d1[1], d1[0]];
  const n2: [number, number] = [-d2[1], d2[0]];
  const m0 = unit([n1[0] + n2[0], n1[1] + n2[1]]);
  const mLen = h / (m0[0] * n1[0] + m0[1] * n1[1]);
  const m: [number, number] = [m0[0] * mLen, m0[1] * mLen];
  // The outline in the check's own plane (u across, z up), with each edge's outward normal.
  const outline: [number, number][] = [
    [A[0] + n1[0] * h, A[1] + n1[1] * h],
    [B[0] + m[0], B[1] + m[1]],
    [Cp[0] + n2[0] * h, Cp[1] + n2[1] * h],
    [Cp[0] - n2[0] * h, Cp[1] - n2[1] * h],
    [B[0] - m[0], B[1] - m[1]],
    [A[0] - n1[0] * h, A[1] - n1[1] * h],
  ];
  const normals: [number, number][] = [n1, n2, d2, [-n2[0], -n2[1]], [-n1[0], -n1[1]], [-d1[0], -d1[1]]];
  // Its plane is x + y = 6 through the platform's middle; the thickness runs toward you, so the faces that look up show.
  const at = (depth: number) =>
    outline.map(([u, z]): Vec3 => [3 + u / Math.SQRT2 + depth, 3 - u / Math.SQRT2 + depth, z]);
  const [front, back] = [0.16, -0.16];
  const edge = (p: [number, number], q: [number, number]): Vec3[] => {
    const [pb, qb] = [at(back), at(back)];
    const [pf, qf] = [at(front), at(front)];
    const i = outline.indexOf(p);
    const j = outline.indexOf(q);
    return [pb[i], qb[j], qf[j], pf[i]];
  };
  const sides = outline
    .map((p, i) => ({ p, q: outline[(i + 1) % outline.length], nrm: normals[i] }))
    .filter(({ nrm }) => nrm[1] > 0.02)
    .map(({ p, q }): SceneShape => ({ d: path(edge(p, q)), fill: 'accent-side', stroke: 'accent', hero: true }));
  return {
    shapes: [
      ...box(1.3, 1.3, 0, 3.4, 3.4, 0.55),
      { d: path(at(back)), fill: 'accent-side', stroke: 'accent', hero: true },
      ...sides,
      { d: path(at(front)), fill: 'accent', stroke: 'accent', hero: true },
    ],
  };
}

/** Can't connect: a plug lying short of its socket, its cable loose on the tile. */
function offline(): SceneDef {
  const face = 2.2;
  const slot = (x: number): SceneShape => ({
    d: path([
      [x, face, 0.8],
      [x + 0.2, face, 0.8],
      [x + 0.2, face, 1.2],
      [x, face, 1.2],
    ]),
    fill: 'hole',
    stroke: 'line',
  });
  const prong = (x: number) =>
    line(
      [
        [x, 3.9, 1.0],
        [x, 2.9, 1.0],
      ],
      'accent',
      true,
    );
  return {
    shapes: [
      ...box(3.1, 0.7, 0, 2.3, face - 0.7, 2.0),
      slot(3.75),
      slot(4.55),
      prong(3.85),
      prong(4.65),
      ...box(3.5, 3.9, 0, 1.5, 1.2, 1.6, { hero: true }),
      line(
        [
          [4.25, 5.1, 0.55],
          [4.25, 5.5, 0.03],
          [3.1, 5.6, 0.03],
          [2.0, 5.15, 0.03],
          [0.8, 5.4, 0.03],
        ],
        'line',
        true,
      ),
    ],
    // It slides toward the socket while you retry, and goes in when it works.
    poses: { pending: [0, -0.4, 0], success: [0, -0.72, 0] },
  };
}

/** No data yet: a chart's back wall with ghost bars waiting to be filled. */
function chart(): SceneDef {
  const wall = 0.8;
  return {
    shapes: [
      ...box(0.6, wall - 0.2, 0, 4.8, 0.2, 2.2),
      ...[0.75, 1.5].map((z) =>
        line(
          [
            [0.8, wall, z],
            [5.2, wall, z],
          ],
          'faint',
        ),
      ),
      ...[
        [0.9, 0.9],
        [2.05, 1.6],
        [3.2, 1.2],
        [4.35, 2.1],
      ].flatMap(([x, h]) => box(x, 2.2, 0, 0.85, 0.85, h, { stroke: 'line', dashed: true, hero: true })),
    ],
    // Ghost bars rise a touch while the first data is fetched.
    poses: { pending: [0, 0, 0.3] },
  };
}

const flatCircle = (cx: number, cy: number, z: number, r: number, steps = 48): Vec3[] =>
  Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), z];
  });

type DiscStyle = { top?: SceneFill; side?: SceneFill; stroke?: SceneStroke; hero?: boolean };

function disc(cx: number, cy: number, z: number, r: number, h: number, style: DiscStyle = {}): SceneShape[] {
  const steps = 28;
  const a0 = -Math.PI / 4;
  const a1 = (3 * Math.PI) / 4;
  const bottom: Vec3[] = [];
  const top: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    bottom.push([x, y, z]);
    top.push([x, y, z + h]);
  }
  const side: SceneShape = {
    d: path([...bottom, ...top.toReversed()]),
    fill: style.side ?? 'right',
    stroke: style.stroke ?? 'line',
    hero: style.hero,
  };
  const lid: SceneShape = {
    d: path(flatCircle(cx, cy, z + h, r)),
    fill: style.top ?? 'top',
    stroke: style.stroke ?? 'line',
    hero: style.hero,
  };
  return h > 0 ? [side, lid] : [lid];
}

/** Nothing playing: a minimal turntable with a vinyl platter, accent label and hovering tonearm. */
function music(): SceneDef {
  const px = 2.65;
  const py = 3.05;
  const pz = 0.48;
  const grooveArc = (r: number, aStart: number, aEnd: number): Vec3[] =>
    Array.from({ length: 24 }, (_, i) => {
      const a = aStart + ((aEnd - aStart) * i) / 23;
      return [px + r * Math.cos(a), py + r * Math.sin(a), pz + 0.19];
    });
  return {
    shapes: [
      ...box(0.85, 0.85, 0, 4.3, 4.3, pz),
      ...disc(px, py, pz, 1.5, 0.18, { top: 'hole', side: 'right', stroke: 'line' }),
      { d: path(grooveArc(1.22, -0.4, 2.2), false), fill: 'none', stroke: 'faint' },
      { d: path(grooveArc(0.9, 1.6, 4.3), false), fill: 'none', stroke: 'faint' },
      { d: path(flatCircle(px, py, pz + 0.19, 0.46)), fill: 'accent', stroke: 'accent' },
      { d: path(flatCircle(px, py, pz + 0.2, 0.12)), fill: 'hole', stroke: 'line' },
      ...disc(4.55, 1.45, pz, 0.34, 0.14, { top: 'top', side: 'right', stroke: 'line' }),
      ...disc(4.55, 1.45, pz + 0.14, 0.13, 0.28, { top: 'top', side: 'right', stroke: 'line' }),
      ...box(1.15, 4.45, pz, 0.42, 0.42, 0.08, { fills: ['left', 'right', 'top'], stroke: 'faint' }),
      line(
        [
          [4.65, 1.25, pz + 0.56],
          [4.55, 1.45, pz + 0.52],
          [4.05, 3.35, pz + 0.44],
          [3.65, 3.62, pz + 0.4],
        ],
        'accent',
        true,
      ),
      ...box(3.52, 3.55, pz + 0.33, 0.24, 0.16, 0.14, {
        fills: ['accent-side', 'accent-side', 'accent'],
        stroke: 'accent',
        hero: true,
      }),
    ],
    poses: { pending: [0, 0, -0.1], success: [-0.22, 0.08, -0.18] },
  };
}

/** Nothing scheduled: an isometric month card with binder tabs and a hovering empty day slot. */
function calendar(): SceneDef {
  const [x0, y0, w, d, h] = [1.0, 1.25, 4.0, 3.6, 0.44];
  return {
    shapes: [
      ...box(x0, y0, 0, w, d, h),
      ...box(x0, y0, h, w, 0.72, 0.06, { fills: ['accent-side', 'accent-side', 'accent'], stroke: 'accent' }),
      ...box(1.85, y0 + 0.14, h + 0.06, 0.28, 0.42, 0.26, { fills: ['left', 'right', 'top'], stroke: 'line' }),
      ...box(3.85, y0 + 0.14, h + 0.06, 0.28, 0.42, 0.26, { fills: ['left', 'right', 'top'], stroke: 'line' }),
      ...[2.0, 3.0, 4.0].map((gx) =>
        line(
          [
            [gx, y0 + 0.85, h + 0.01],
            [gx, y0 + d - 0.15, h + 0.01],
          ],
          'faint',
        ),
      ),
      ...[2.9, 3.85].map((gy) =>
        line(
          [
            [x0 + 0.2, gy, h + 0.01],
            [x0 + w - 0.2, gy, h + 0.01],
          ],
          'faint',
        ),
      ),
      ...box(2.9, 3.45, h + 0.38, 0.9, 0.88, 0.14, {
        fills: ['accent-side', 'accent-side', 'glass'],
        stroke: 'accent',
        dashed: true,
        hero: true,
      }),
    ],
    poses: { pending: [0, 0, -0.18], success: [0, 0, -0.37] },
  };
}

/** No notes yet: a stack of sticky notes with a lifted angled sheet waiting on top. */
function notes(): SceneDef {
  const [x0, y0, w, h] = [1.35, 1.35, 3.2, 0.4];
  const lift = 0.62;
  return {
    shapes: [
      ...box(x0, y0, 0, w, w, h),
      ...box(x0 + 0.06, y0 + 0.06, h, w, w, 0.08, { fills: ['left', 'right', 'top'], stroke: 'faint' }),
      {
        d: path([
          [x0 + 0.18, y0 - 0.08, h + lift],
          [x0 + w + 0.22, y0 + 0.18, h + lift + 0.08],
          [x0 + w + 0.05, y0 + w + 0.16, h + lift + 0.36],
          [x0 - 0.04, y0 + w - 0.08, h + lift + 0.14],
        ]),
        fill: 'glass',
        stroke: 'line',
        hero: true,
      },
      ...[0, 1].map((i) =>
        line(
          [
            [x0 + 0.55 - i * 0.04, y0 + 0.85 + i * 0.75, h + lift + 0.1 + i * 0.06],
            [x0 + w - 0.45 - i * 0.6, y0 + 0.98 + i * 0.75, h + lift + 0.15 + i * 0.06],
          ],
          'accent',
          true,
        ),
      ),
    ],
    poses: { pending: [0, 0, -0.3], success: [0, 0, -lift] },
  };
}

export const SCENES: Record<EmptyStateScene, () => SceneDef> = {
  inbox,
  search,
  done,
  offline,
  chart,
  music,
  calendar,
  notes,
};

/** A pose in tile units, as a screen offset in px. */
export const poseOffset = ([x, y, z]: Vec3): [number, number] => [(x - y) * C * UNIT, (x + y) * 0.5 * UNIT - z * UNIT];
