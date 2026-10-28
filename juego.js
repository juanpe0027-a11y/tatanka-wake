'use strict';
// =====================================================================================
//  TATANKA WAKE — juego de wakeboard en el Pantalán del Puerto de Sagunto
//  Todo en metros y segundos. Mundo: la orilla corre a lo largo de X, el mar está en -Z,
//  la tierra en +Z. El Pantalán sale de la orilla hacia el mar en x = -40.
// =====================================================================================
const T = THREE;
T.ColorManagement.enabled = true;   // vendor.js lo apaga para el juego de surf; aquí trabajamos en lineal

const $ = id => document.getElementById(id);
const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const UP = V3(0, 1, 0);
let seed = 20261024;
const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed - 1) / 2147483646; };
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);

// ---------------------------------------------------------------- render
const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 9000);
camera.position.set(0, 4, 10);

const SUN_DIR = V3(0.42, 0.52, -0.74).normalize();   // sol de media mañana sobre el mar
const HORIZON = new T.Color(0xc9dbe6);
scene.fog = new T.Fog(HORIZON, 500, 7000);

// ---------------------------------------------------------------- cielo (con nubes) y entorno para reflejos
const SKY_GLSL = /* glsl */`
  uniform vec3 uSun; uniform float uTime;
  float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
  vec3 skyColor(vec3 d){
    float y = d.y;
    vec3 zen = vec3(0.045, 0.16, 0.42), hor = vec3(0.55, 0.68, 0.80);
    vec3 col = mix(hor, zen, pow(clamp(y,0.0,1.0), 0.42));
    if (y < 0.0) col = mix(hor, vec3(0.30,0.40,0.48), clamp(-y*3.0,0.0,1.0));
    float sd = max(dot(d, uSun), 0.0);
    col += vec3(1.0,0.80,0.55) * pow(sd, 6.0) * 0.28;
    col += vec3(1.0,0.92,0.75) * pow(sd, 90.0) * 0.6;
    col += vec3(1.0,0.97,0.9) * smoothstep(0.9993, 0.9997, sd) * 40.0;
    if (y > 0.0) {
      vec2 uv = d.xz / (y + 0.09) * 0.9 + vec2(uTime*0.003, 0.0);
      float c = fbm(uv*1.6) * 0.65 + fbm(uv*5.0) * 0.35;
      c = smoothstep(0.52, 0.82, c) * smoothstep(0.0, 0.18, y);
      vec3 cc = mix(vec3(0.82,0.86,0.9), vec3(1.0,0.98,0.95), clamp(sd*1.3,0.0,1.0));
      col = mix(col, cc * (0.75 + 0.35*fbm(uv*3.0)), c * 0.85);
    }
    return col;
  }`;
const skyMat = new T.ShaderMaterial({
  uniforms: { uSun: { value: SUN_DIR }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: SKY_GLSL + `varying vec3 vD; void main(){ gl_FragColor = vec4(skyColor(normalize(vD)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
  side: T.BackSide, depthWrite: false
});
const sky = new T.Mesh(new T.SphereGeometry(4000, 48, 24), skyMat);
sky.frustumCulled = false; sky.renderOrder = -1;
scene.add(sky);
{
  // entorno para los reflejos de metal, cristal y agua (sin tonemapping: valores lineales)
  const envMat = new T.ShaderMaterial({ uniforms: skyMat.uniforms, vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: SKY_GLSL + `varying vec3 vD; void main(){ gl_FragColor = vec4(skyColor(normalize(vD)), 1.0); }`, side: T.BackSide });
  const es = new T.Scene(); es.add(new T.Mesh(new T.SphereGeometry(100, 32, 16), envMat));
  const pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(es, 0, 0.1, 500).texture;
}

const hemi = new T.HemisphereLight(0xcfe6ff, 0x5b5145, 0.35); scene.add(hemi);
const sun = new T.DirectionalLight(0xfff2de, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
const SC = sun.shadow.camera; SC.left = -22; SC.right = 22; SC.top = 22; SC.bottom = -22; SC.near = 1; SC.far = 160;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- texturas procedurales
function canvasTex(w, h, draw, opt = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new T.CanvasTexture(cv);
  t.colorSpace = opt.data ? T.NoColorSpace : T.SRGBColorSpace;
  t.anisotropy = 8;
  if (opt.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
  return t;
}
// ruido periódico (se repite sin costuras) para las ondas finas del agua
function makeNoiseTextures(N = 256) {
  const g = 32, grid = new Float32Array(g * g).map(() => rnd());
  const val = (x, y, f) => {
    const s = g / f; x *= s; y *= s;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const P = (a, b) => grid[((b % g + g) % g) * g + ((a % g + g) % g)];
    return lerp(lerp(P(xi, yi), P(xi + 1, yi), u), lerp(P(xi, yi + 1), P(xi + 1, yi + 1), u), v);
  };
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, a = 0.5, f = 4;
    for (let o = 0; o < 4; o++) { s += a * val(x / N * f, y / N * f, f); a *= 0.5; f *= 2; }
    H[y * N + x] = s;
  }
  const nrm = new Uint8Array(N * N * 4), noi = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = (i, j) => H[((j + N) % N) * N + ((i + N) % N)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * 6, dy = (h(x, y + 1) - h(x, y - 1)) * 6;
    const l = Math.hypot(dx, dy, 1), k = (y * N + x) * 4;
    nrm[k] = (-dx / l * 0.5 + 0.5) * 255; nrm[k + 1] = (-dy / l * 0.5 + 0.5) * 255; nrm[k + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[k + 3] = 255;
    const v = clamp(H[y * N + x] * 255, 0, 255); noi[k] = noi[k + 1] = noi[k + 2] = v; noi[k + 3] = 255;
  }
  const mk = d => { const t = new T.DataTexture(d, N, N, T.RGBAFormat); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; };
  return { normal: mk(nrm), noise: mk(noi) };
}
const NOISE = makeNoiseTextures();

// ---------------------------------------------------------------- recorrido de la barca
// Un circuito cerrado junto al Pantalán: tramo hacia la orilla (con el pueblo y el Pantalán de fondo),
// giro, tramo hacia mar abierto y giro. Se muestrea cada metro.
const PATH = (() => {
  const pts = [];
  const line = (x0, z0, x1, z1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0)); for (let i = 0; i < n; i++) pts.push([lerp(x0, x1, i / n), lerp(z0, z1, i / n)]); };
  const arc = (cx, cz, R, a0, a1) => { const n = Math.ceil(Math.abs(a1 - a0) * R); for (let i = 0; i < n; i++) { const a = lerp(a0, a1, i / n); pts.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); } };
  // Rumbo sur, paralelo a la costa: el Pantalán de frente, la playa del espigón a la derecha y la bocana de
  // Puerto Siles detrás. Al llegar cerca del Pantalán gira mar adentro y vuelve hacia Puerto Siles.
  const XS = 80, XE = 640, ZA = -120, ZB = -310, R = (ZA - ZB) / 2;
  line(XS, ZA, XE, ZA);                                   // hacia el Pantalán (costa a la derecha)
  arc(XE, (ZA + ZB) / 2, R, Math.PI / 2, -Math.PI / 2);   // giro mar adentro
  line(XE, ZB, XS, ZB);                                   // de vuelta hacia Puerto Siles
  arc(XS, (ZA + ZB) / 2, R, -Math.PI / 2, -Math.PI * 1.5);
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return { pts, cum, len: cum[cum.length - 1] };
})();
function pathAt(s, out) {
  const L = PATH.len; s = ((s % L) + L) % L;
  let lo = 0, hi = PATH.pts.length;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PATH.cum[m] <= s) lo = m; else hi = m; }
  const a = PATH.pts[lo], b = PATH.pts[(lo + 1) % PATH.pts.length];
  const t = (s - PATH.cum[lo]) / Math.max(1e-6, PATH.cum[lo + 1] - PATH.cum[lo]);
  out.x = lerp(a[0], b[0], t); out.z = lerp(a[1], b[1], t);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; out.hx = (b[0] - a[0]) / l; out.hz = (b[1] - a[1]) / l;
  return out;
}

// ---------------------------------------------------------------- agua: olas + estela de la barca
// La estela se calcula a partir de los últimos 100 m que ha recorrido la barca, igual en el shader y en JS,
// así el rider salta sobre la misma ola que se ve.
const NPATH = 40, PSTEP = 2.5;
const WAKE = { amp: 0.62 };
const U = {
  uTime: { value: 0 },
  uPath: { value: Array.from({ length: NPATH }, () => V3()) },
  uAmp: { value: WAKE.amp },
  uRoll: { value: new T.Vector4(-99, -99, -99, 0) },
  tNrm: { value: NOISE.normal }, tNoise: { value: NOISE.noise },
};
const WATER_GLSL = /* glsl */`
  #define NPATH ${NPATH}
  uniform float uTime; uniform vec3 uPath[NPATH]; uniform float uAmp; uniform vec4 uRoll;
  float wavesH(vec2 p){
    return 0.075*sin(dot(p, vec2(0.110, 0.046)) + uTime*0.95)
         + 0.050*sin(dot(p, vec2(-0.060, 0.150)) + uTime*1.15)
         + 0.028*sin(dot(p, vec2(0.290, -0.210)) + uTime*1.85)
         + 0.016*sin(dot(p, vec2(-0.420, -0.350)) + uTime*2.60)
         + 0.010*sin(dot(p, vec2(0.700, 0.520)) + uTime*3.40);
  }
  // (d, s, dirx, dirz): d = metros detrás del espejo de popa, s = distancia lateral con signo
  vec4 wakeFrame(vec2 p){
    float best = 1e9; vec4 res = vec4(-1.0, 0.0, 0.0, 1.0);
    for (int k = 0; k < NPATH - 1; k++) {
      vec2 a = uPath[k].xy, b = uPath[k+1].xy, ab = b - a;
      float l2 = max(dot(ab, ab), 1e-4), t = dot(p - a, ab) / l2;
      float tc = k == 0 ? max(t, -6.0) : clamp(t, 0.0, 1.0);
      vec2 q = a + ab * tc; float dd = distance(p, q);
      if (dd < best) { best = dd; vec2 dir = ab / sqrt(l2);
        float cr = dir.x * (p - a).y - dir.y * (p - a).x;
        res = vec4(mix(uPath[k].z, uPath[k+1].z, tc), cr, dir); }
    }
    return res;
  }
  float wakeProfile(float d, float s, out float foam){
    foam = 0.0;
    if (d < 0.0) return 0.0;
    float A = uAmp * smoothstep(0.0, 8.0, d) * exp(-max(d - 16.0, 0.0) / 42.0) * (1.0 - smoothstep(82.0, 96.0, d));
    float r = 1.05 + d * 0.19, u = abs(s) / r;
    float prof = u < 1.0 ? mix(0.12, 1.0, pow(smoothstep(0.5, 1.0, u), 1.7))
                         : (u < 1.75 ? pow(1.0 - (u - 1.0) / 0.75, 2.0) : 0.0);
    float wash = exp(-u * u * 9.0) * smoothstep(0.0, 1.5, d) * (1.0 - smoothstep(8.0, 34.0, d));
    float lip = smoothstep(0.84, 0.99, u) * (1.0 - smoothstep(1.0, 1.14, u)) * (1.0 - smoothstep(30.0, 85.0, d));
    // espuma: cresta fina en el labio, remolino de la hélice al principio y burbujas sueltas en la mesa
    foam = lip * 0.8 + wash * 1.1 * (1.0 - smoothstep(4.0, 22.0, d))
         + (1.0 - smoothstep(0.0, 0.55, u)) * (1.0 - smoothstep(6.0, 40.0, d)) * 0.35
         + smoothstep(1.0, 1.2, u) * (1.0 - smoothstep(1.2, 1.7, u)) * (1.0 - smoothstep(8.0, 45.0, d)) * 0.2;
    float roll = uRoll.w * (exp(-pow(d - uRoll.x, 2.0) / 3.0) + exp(-pow(d - uRoll.y, 2.0) / 3.0) + exp(-pow(d - uRoll.z, 2.0) / 3.0)) * (1.0 - smoothstep(1.3, 2.4, u));
    foam += roll * 0.9 * smoothstep(0.7, 1.0, u);
    return A * prof + wash * 0.06 + roll;
  }`;

const waterMat = new T.MeshStandardMaterial({ color: 0x0c3f52, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.15 });
waterMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + WATER_GLSL + '\nvarying vec3 vW; varying float vFoam; varying float vWd;')
    .replace('#include <beginnormal_vertex>', `
      vec3 w0 = (modelMatrix * vec4(position, 1.0)).xyz;
      vec4 fr = wakeFrame(w0.xz);
      float fo, fo2;
      float hC = wavesH(w0.xz) + wakeProfile(fr.x, fr.y, fo);
      const float E = 0.3;
      vec2 ox = vec2(E, 0.0), oz = vec2(0.0, E);
      float hX = wavesH(w0.xz + ox) + wakeProfile(fr.x + dot(ox, fr.zw), fr.y + (fr.z*ox.y - fr.w*ox.x), fo2);
      float hZ = wavesH(w0.xz + oz) + wakeProfile(fr.x + dot(oz, fr.zw), fr.y + (fr.z*oz.y - fr.w*oz.x), fo2);
      vec3 objectNormal = normalize(vec3(-(hX - hC) / E, 1.0, -(hZ - hC) / E));
      vFoam = fo; vWd = fr.x;
      vW = w0 + vec3(0.0, hC, 0.0);`)
    .replace('#include <begin_vertex>', 'vec3 transformed = position + vec3(0.0, hC, 0.0);');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uTime; uniform sampler2D tNrm; uniform sampler2D tNoise;\nvarying vec3 vW; varying float vFoam; varying float vWd;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float n1 = texture2D(tNoise, vW.xz * 0.045 + uTime * vec2(0.008, 0.003)).r;
      float n2 = texture2D(tNoise, vW.xz * 0.23 - uTime * vec2(0.05, 0.035)).r;
      float n3 = texture2D(tNoise, vW.xz * 0.9 + uTime * vec2(0.11, -0.07)).r;
      float fo = clamp(vFoam * (0.35 + n2 * 0.9 + n3 * 0.45) - 0.45 * n1, 0.0, 1.0);
      fo = smoothstep(0.42, 0.82, fo);
      // agua del Mediterráneo: azul profundo algo verdoso, turquesa donde la estela mete burbujas
      vec3 base = diffuseColor.rgb * (0.85 + 0.3 * n1);
      float aer = clamp(vFoam * 0.9, 0.0, 1.0) * (1.0 - fo);
      base = mix(base, vec3(0.10, 0.36, 0.40), aer * 0.7);
      diffuseColor.rgb = mix(base, vec3(0.93, 0.96, 0.97), fo);`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, fo);')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 a = texture2D(tNrm, vW.xz * 0.075 + uTime * vec2(0.020, 0.008)).xyz * 2.0 - 1.0;
        vec3 b = texture2D(tNrm, vW.xz * 0.29 - uTime * vec2(0.025, 0.045)).xyz * 2.0 - 1.0;
        vec3 c = texture2D(tNrm, vW.xz * 1.1 + uTime * vec2(0.06, -0.05)).xyz * 2.0 - 1.0;
        float dist = length(vW - cameraPosition);
        float k = (1.0 - fo * 0.8) * mix(1.0, 0.35, smoothstep(40.0, 600.0, dist));
        vec3 pert = vec3(a.x * 0.55 + b.x * 0.35 + c.x * 0.22, 0.0, a.y * 0.55 + b.y * 0.35 + c.y * 0.22) * k;
        normal = normalize(normal + (viewMatrix * vec4(pert, 0.0)).xyz);
      }`);
};
// rejilla cerca del rider: celdas de ~0,35 m en el centro que crecen hacia fuera
function makeWaterGrid(R, N) {
  const g = new T.BufferGeometry(), pos = [], idx = [];
  const f = t => Math.sign(t) * R * (0.22 * Math.abs(t) + 0.78 * Math.pow(Math.abs(t), 2.6));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.push(f(i / N * 2 - 1), 0, f(j / N * 2 - 1));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.setAttribute('normal', new T.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return g;
}
const waterNear = new T.Mesh(makeWaterGrid(190, IS_MOBILE ? 150 : 230), waterMat);
waterNear.receiveShadow = true; waterNear.frustumCulled = false;
const farGeo = new T.PlaneGeometry(14000, 14000, 60, 60); farGeo.rotateX(-Math.PI / 2); farGeo.translate(0, -0.25, 0);
const waterFar = new T.Mesh(farGeo, waterMat); waterFar.frustumCulled = false;
scene.add(waterNear, waterFar);

// --- la misma ola en JS (física del rider, barca, salpicaduras)
const PATHJS = new Float32Array(NPATH * 3);
function wavesH(x, z, t) {
  return 0.075 * Math.sin(x * 0.110 + z * 0.046 + t * 0.95) + 0.050 * Math.sin(-x * 0.060 + z * 0.150 + t * 1.15)
    + 0.028 * Math.sin(x * 0.290 - z * 0.210 + t * 1.85) + 0.016 * Math.sin(-x * 0.420 - z * 0.350 + t * 2.60)
    + 0.010 * Math.sin(x * 0.700 + z * 0.520 + t * 3.40);
}
const WF = { d: -1, s: 0, dx: 0, dz: 1 };
function wakeFrame(x, z) {
  let best = 1e9;
  for (let k = 0; k < NPATH - 1; k++) {
    const ax = PATHJS[k * 3], az = PATHJS[k * 3 + 1], bx = PATHJS[k * 3 + 3], bz = PATHJS[k * 3 + 4];
    const abx = bx - ax, abz = bz - az, l2 = Math.max(abx * abx + abz * abz, 1e-4);
    const t = ((x - ax) * abx + (z - az) * abz) / l2, tc = k === 0 ? Math.max(t, -6) : clamp(t, 0, 1);
    const qx = ax + abx * tc, qz = az + abz * tc, dd = Math.hypot(x - qx, z - qz);
    if (dd < best) {
      best = dd; const l = Math.sqrt(l2), dx = abx / l, dz = abz / l;
      WF.d = lerp(PATHJS[k * 3 + 2], PATHJS[k * 3 + 5], tc); WF.s = dx * (z - az) - dz * (x - ax); WF.dx = dx; WF.dz = dz;
    }
  }
  return WF;
}
const ss = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const smooth = (a, b, x) => ss((x - a) / (b - a));
const wakeR = d => 1.05 + d * 0.19;
function wakeAmp(d) { if (d < 0) return 0; return WAKE.amp * smooth(0, 8, d) * Math.exp(-Math.max(d - 16, 0) / 42) * (1 - smooth(82, 96, d)); }
function wakeProfile(d, s) {
  if (d < 0) return 0;
  const A = wakeAmp(d), u = Math.abs(s) / wakeR(d);
  const prof = u < 1 ? lerp(0.12, 1, Math.pow(smooth(0.5, 1, u), 1.7)) : (u < 1.75 ? Math.pow(1 - (u - 1) / 0.75, 2) : 0);
  const wash = Math.exp(-u * u * 9) * smooth(0, 1.5, d) * (1 - smooth(8, 34, d));
  const R4 = U.uRoll.value, g = x => Math.exp(-((d - x) ** 2) / 3);
  const roll = R4.w * (g(R4.x) + g(R4.y) + g(R4.z)) * (1 - smooth(1.3, 2.4, u));
  return A * prof + wash * 0.06 + roll;
}
function surfaceH(x, z, t) { const f = wakeFrame(x, z); return wavesH(x, z, t) + wakeProfile(f.d, f.s); }
function surfaceNormal(x, z, t, out) {
  const e = 0.3, h = surfaceH(x, z, t);
  return out.set(-(surfaceH(x + e, z, t) - h) / e, 1, -(surfaceH(x, z + e, t) - h) / e).normalize();
}

// ---------------------------------------------------------------- materiales y piezas básicas
const MAT = (c, r = 0.8, m = 0, extra = {}) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
function box(w, h, d, mat, x, y, z, parent, cast = true) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
const CYL = new T.CylinderGeometry(1, 1, 1, 16, 1);
function rod(a, b, r, mat, parent) {
  const m = new T.Mesh(CYL, mat), d = V3().subVectors(b, a), L = d.length();
  m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(r, L, r); m.quaternion.setFromUnitVectors(UP, d.normalize());
  m.castShadow = true; parent.add(m); return m;
}

// =====================================================================================
//  EL PUERTO DE SAGUNTO
// =====================================================================================
const world = new T.Group(); scene.add(world);
const SHORE_Z = 80;
// Distribución real (Google Earth): Puerto Siles en x ≈ -200, espigón curvo en x ≈ 300, Pantalán en x = 900
// y el puerto industrial de Sagunto al otro lado del Pantalán.
const PIER_X = 900, GROIN_X = 300, MARINA_X = -200;
// entre el club náutico y el espigón no hay fincas: es un paraje natural con matorral, pinos, palmeras y un camino de grava
const WILD0 = MARINA_X + 12, WILD1 = GROIN_X + 15, inWild = x => x > WILD0 && x < WILD1;
{
  // ---- tierra, playa y paseo
  const sand = MAT(0xd9c29a, 0.95), sandWet = MAT(0xb8a07a, 0.9), prom = MAT(0xcfc4b2, 0.9), asphalt = MAT(0x4a4a4c, 0.9), land = MAT(0x9c946f, 1);
  box(2600, 2, 70, sand, PIER_X - 1300, -0.7, SHORE_Z + 35, world, false);
  box(2600, 2, 6, sandWet, PIER_X - 1300, -0.92, SHORE_Z + 2, world, false);
  {
    const tile = canvasTex(256, 256, (c, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#c9c0b2' : '#e6e0d5'; c.fillRect(i * 32, j * 32, 32, 32); } c.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i <= 8; i++) { c.fillRect(i * 32, 0, 1, h); c.fillRect(0, i * 32, w, 1); } }, { repeat: true });
    tile.repeat.set(650, 3.5);
    box(2600, 1.4, 14, MAT(0xffffff, 0.85, 0, { map: tile }), PIER_X - 1300, 0.3, SHORE_Z + 77, world, false);
  }
  box(2600, 1.2, 4, MAT(0xbdb7ad, 0.9), PIER_X - 1300, 0.35, SHORE_Z + 98, world, false);   // acera de las fincas
  box(2600, 1.2, 12, asphalt, PIER_X - 1300, 0.2, SHORE_Z + 90, world, false);
  // bahía de arena delante del espigón y zona verde con caminos detrás
  box(160, 2, 40, sand, GROIN_X + 40, -0.75, SHORE_Z - 8, world, false);
  box(220, 1.2, 70, MAT(0x6f8a4a, 1), GROIN_X - 20, 0.1, SHORE_Z + 135, world, false);
  {
    const sh = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), MAT(0x51703a, 1), 160), o = new T.Object3D();
    for (let i = 0; i < 160; i++) { o.position.set(GROIN_X - 120 + rnd(0, 210), 1.0, SHORE_Z + 105 + rnd(0, 60)); const s = rnd(1, 3); o.scale.set(s, s * rnd(0.8, 1.6), s); o.updateMatrix(); sh.setMatrixAt(i, o.matrix); }
    world.add(sh);
  }
  box(9000, 1, 9000, land, 0, -0.1, SHORE_Z + 4600, world, false);

  // ---- fincas de la Avenida del Mediterráneo (Puerto de Sagunto): bloques de 5 a 9 plantas en crema, ocre y
  //      salmón, con balcones de barandilla y persianas, bajos comerciales con toldos y alguna torre blanca más
  //      alta con terrazas corridas. Cada textura son 4 plantas (3,05 m) y 3 vanos (4 m).
  const FAC = {
    crema: ['#ece0c4', 'recessed'], ocre: ['#d8b98b', 'glass'], salmon: ['#d49a7c', 'shutters'],
    blanco: ['#f1efe9', 'recessed'], torre: ['#f4f3ef', 'bands'], gris: ['#cfcac0', 'shutters'],
  };
  function facadeTex(kind) {
    const [wall, type] = FAC[kind];
    return canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = wall; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { c.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.035).toFixed(3) + ')'; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      for (let fl = 0; fl < 4; fl++) {
        const y = fl * 128;
        if (type === 'bands') {   // terraza corrida: losa blanca, cristal oscuro y barandilla de aluminio
          c.fillStyle = '#2f3b45'; c.fillRect(0, y + 18, w, 84);
          c.fillStyle = 'rgba(160,190,210,.35)'; c.fillRect(0, y + 18, w, 22);
          for (let k = 0; k < 6; k++) { c.fillStyle = '#d9d6cf'; c.fillRect(k * 85, y + 18, 6, 84); }
          c.fillStyle = '#fbfaf7'; c.fillRect(0, y + 100, w, 22);
          c.fillStyle = 'rgba(200,215,225,.55)'; c.fillRect(0, y + 74, w, 26);
          c.fillStyle = '#bfc4c8'; c.fillRect(0, y + 72, w, 3);
          continue;
        }
        for (let k = 0; k < 3; k++) {
          const x = k * 170 + 22;
          if (type === 'recessed') {          // balcón metido: hueco oscuro, puerta y barandilla de barrotes blancos
            c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - 8, y + 10, 142, 104);
            c.fillStyle = '#34414c'; c.fillRect(x + 20, y + 18, 86, 80);
            c.fillStyle = '#e9e6df'; c.fillRect(x + 61, y + 18, 4, 80);
            c.fillStyle = '#f7f6f2'; c.fillRect(x - 8, y + 70, 142, 4); c.fillRect(x - 8, y + 108, 142, 6);
            for (let r = x - 4; r < x + 132; r += 9) c.fillRect(r, y + 72, 2, 38);
          } else if (type === 'glass') {      // balcón volado con frente de cristal verdoso
            c.fillStyle = '#2d3a42'; c.fillRect(x + 14, y + 14, 98, 84);
            c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(x + 14, y + 14, 98, 14);
            c.fillStyle = 'rgba(120,170,160,.55)'; c.fillRect(x - 10, y + 70, 146, 40);
            c.fillStyle = '#efece6'; c.fillRect(x - 12, y + 108, 150, 8);
          } else {                             // ventana con persiana enrollable a medio bajar y marco blanco
            c.fillStyle = '#f5f3ee'; c.fillRect(x + 8, y + 12, 110, 96);
            c.fillStyle = '#33404a'; c.fillRect(x + 16, y + 20, 94, 80);
            const down = 20 + ((k * 7 + fl * 3) % 5) * 12;
            c.fillStyle = ['#8a6a4a', '#5d7a5a', '#b9b2a4'][(k + fl) % 3]; c.fillRect(x + 16, y + 20, 94, down);
            for (let r = y + 22; r < y + 20 + down; r += 5) { c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(x + 16, r, 94, 1); }
            c.fillStyle = '#e8e4dc'; c.fillRect(x, y + 104, 126, 7);
            c.fillStyle = '#f5f3ee'; for (let r = x + 4; r < x + 122; r += 10) c.fillRect(r, y + 82, 2, 22); c.fillRect(x, y + 80, 126, 3);
          }
          if ((k + fl * 2) % 4 === 0) { c.fillStyle = ['#2f6b8a', '#b33a2f', '#3e7a4a', '#e3c34a'][(k + fl) % 4]; c.fillRect(x - 6, y + 8, 138, 12); }   // toldo
        }
      }
    }, { repeat: true });
  }
  const shopTex = canvasTex(512, 160, (c, w, h) => {   // bajos: escaparates, toldos de bares y rótulos
    c.fillStyle = '#e7e1d6'; c.fillRect(0, 0, w, h);
    const signs = ['BAR', 'CAFÉ', 'HELADOS', 'FARMACIA', 'TAPAS', 'INMOB.'];
    for (let k = 0; k < 3; k++) {
      const x = k * 170 + 10, col = ['#b8332c', '#2f6f4f', '#25587a', '#e1b23a', '#ffffff'][Math.floor(Math.random() * 5)];
      c.fillStyle = '#2b333a'; c.fillRect(x, 50, 150, 110);
      c.fillStyle = 'rgba(190,215,230,.35)'; c.fillRect(x + 6, 56, 138, 40);
      c.fillStyle = col; c.fillRect(x - 4, 36, 158, 22);
      for (let r = x - 4; r < x + 154; r += 16) { c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(r, 36, 8, 22); }
      c.fillStyle = '#1d2226'; c.fillRect(x + 20, 8, 110, 22); c.fillStyle = '#f2efe8'; c.font = 'bold 16px Arial'; c.fillText(signs[Math.floor(Math.random() * signs.length)], x + 34, 25);
    }
  }, { repeat: true });
  const facadeMats = {}; for (const k in FAC) facadeMats[k] = MAT(0xffffff, 0.88, 0, { map: facadeTex(k) });
  const shopMat = MAT(0xffffff, 0.8, 0, { map: shopTex }), roofMat = MAT(0xbdb6aa, 0.95), parapet = MAT(0xe8e3d8, 0.9);
  const tankMat = MAT(0xf0f0ee, 0.6);
  function boxUV(w, h, d, su, sv) { const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
  const kinds = ['crema', 'ocre', 'salmon', 'blanco', 'gris'];
  for (let row = 0; row < 3; row++) {
    let x = -1300 + rnd(0, 20);
    while (x < PIER_X - 60) {
      if (inWild(x) || inWild(x + 25)) { x += 30; continue; }   // el paraje natural
      const tower = rnd() < (row === 0 ? 0.16 : 0.08);
      const kind = tower ? 'torre' : kinds[Math.floor(rnd(0, kinds.length))];
      const w = tower ? rnd(20, 28) : rnd(16, 30), d = rnd(14, 20);
      const floors = tower ? Math.round(rnd(11, 15)) : Math.round(row === 0 ? rnd(5, 9.4) : rnd(4, 8));
      const hb = 4.2, hu = floors * 3.05, zc = SHORE_Z + 100 + d / 2 + row * 38 + rnd(0, 4);
      const base = new T.Mesh(boxUV(w, hb, d, w / 12, 1), shopMat); base.position.set(x + w / 2, hb / 2 + 0.6, zc); base.receiveShadow = true; world.add(base);
      const up = new T.Mesh(boxUV(w, hu, d, w / 12, floors / 4), facadeMats[kind]); up.position.set(x + w / 2, hb + 0.6 + hu / 2, zc); up.receiveShadow = true; world.add(up);
      const top = hb + 0.6 + hu;
      box(w + 0.4, 1.1, d + 0.4, parapet, x + w / 2, top + 0.2, zc, world, false);          // pretil de la azotea
      box(w - 0.6, 0.3, d - 0.6, roofMat, x + w / 2, top + 0.4, zc, world, false);
      box(rnd(4, 7), 2.6, rnd(4, 6), parapet, x + w * rnd(0.3, 0.7), top + 1.5, zc + rnd(-2, 2), world, false);   // casetón
      for (let k = 0; k < 2; k++) { const t2 = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 1.6, 10), tankMat); t2.position.set(x + rnd(2, w - 2), top + 1.1, zc + rnd(-d / 3, d / 3)); world.add(t2); }   // depósitos de agua
      x += w + (row === 0 ? rnd(2, 9) : rnd(4, 14));
    }
  }
  // ---- el paraje natural entre Puerto Siles y el espigón (Google Earth): playa de grava, duna baja, matorral
  //      verde oscuro, pinos, palmeras sueltas y un camino de tierra paralelo a la costa; las torres de Canet al fondo
  {
    const groundTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#a8946c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const g = Math.random();
        c.fillStyle = g < 0.55 ? `rgba(${70 + Math.random() * 30 | 0},${100 + Math.random() * 30 | 0},${60 + Math.random() * 20 | 0},.55)` : `rgba(${150 + Math.random() * 40 | 0},${130 + Math.random() * 30 | 0},${95 + Math.random() * 20 | 0},.5)`;
        c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 12, 0, TAU); c.fill();
      }
    }, { repeat: true });
    groundTex.repeat.set(10, 10);
    const W = WILD1 - WILD0, Z0 = SHORE_Z + 28, Z1 = SHORE_Z + 520;
    box(W, 1.5, Z1 - Z0, MAT(0xffffff, 1, 0, { map: groundTex }), (WILD0 + WILD1) / 2, 0.32, (Z0 + Z1) / 2, world, false);   // tapa el paseo y la avenida
    // duna baja detrás de la playa de grava
    box(W, 1.2, 9, MAT(0xcdb894, 1), (WILD0 + WILD1) / 2, 0.55, Z0 + 3, world, false);   // duna baja
    box(W, 1.0, 10, MAT(0xbfb4a2, 1), (WILD0 + WILD1) / 2, -0.4, SHORE_Z + 6, world, false);   // grava de la orilla
    // camino de tierra/grava paralelo a la costa y dos ramales hacia dentro
    const pathM = MAT(0xd8c9a6, 1);
    box(W, 0.2, 5, pathM, (WILD0 + WILD1) / 2, 1.15, SHORE_Z + 58, world, false);
    for (const px of [WILD0 + 150, WILD0 + 340]) { const b = box(4, 0.2, 160, pathM, px, 1.16, SHORE_Z + 140, world, false); b.rotation.y = 0.35; }
    // matorral: lentiscos y coscojas en manchas (verde oscuro, algo azulado como en la foto)
    const nb = 2600, bushes = new T.InstancedMesh(new T.DodecahedronGeometry(1, 1), MAT(0xffffff, 1), nb), o = new T.Object3D(), col = new T.Color();
    const greens = [0x3f5f3c, 0x4c6b45, 0x35553f, 0x5a7650, 0x46644c];
    for (let i = 0; i < nb; i++) {
      // en manchas: cerca de unos centros al azar
      const cx = WILD0 + 10 + ((i * 7919) % 97) / 97 * (W - 20), cz = SHORE_Z + 40 + ((i * 104729) % 89) / 89 * 440;
      let x = cx + rnd(-14, 14), z = cz + rnd(-12, 12);
      if (i % 3 === 0) { x = rnd(WILD0 + 4, WILD1 - 4); z = SHORE_Z + rnd(34, 54); }   // franja tupida justo detrás de la playa (lo que se ve desde el mar)
      if (Math.abs(z - (SHORE_Z + 58)) < 4) continue;   // el camino libre
      const sc = rnd(1.1, 3.4);
      o.position.set(x, 1.0 + sc * 0.4, z); o.rotation.set(rnd(0, 3), rnd(0, 6), rnd(0, 3)); o.scale.set(sc * rnd(1, 1.6), sc * rnd(0.6, 1.0), sc * rnd(1, 1.6)); o.updateMatrix();
      bushes.setMatrixAt(i, o.matrix); bushes.setColorAt(i, col.set(greens[i % greens.length]).multiplyScalar(rnd(0.85, 1.15)));
    }
    bushes.castShadow = true; bushes.receiveShadow = true; world.add(bushes);
    // pinos piñoneros (copa ancha y plana) y algún pino más alto
    const np = 70, ptr = new T.InstancedMesh(new T.CylinderGeometry(0.25, 0.4, 1, 7), MAT(0x6b5641, 0.95), np), pcr = new T.InstancedMesh(new T.SphereGeometry(1, 12, 8), MAT(0x3d5a36, 1), np);
    for (let i = 0; i < np; i++) {
      const x = rnd(WILD0 + 15, WILD1 - 15), z = SHORE_Z + rnd(80, 480), h = rnd(6, 11);
      o.position.set(x, 1 + h / 2, z); o.rotation.set(rnd(-0.1, 0.1), 0, rnd(-0.1, 0.1)); o.scale.set(1, h, 1); o.updateMatrix(); ptr.setMatrixAt(i, o.matrix);
      const r = rnd(3.5, 6); o.position.set(x, 1 + h + 0.8, z); o.rotation.set(0, rnd(0, 6), 0); o.scale.set(r, r * 0.38, r * rnd(0.8, 1.1)); o.updateMatrix(); pcr.setMatrixAt(i, o.matrix);
    }
    ptr.castShadow = pcr.castShadow = true; world.add(ptr, pcr);
    // al fondo, las torres de cristal de Canet
    const glassT = canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = '#8fa6b8'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, y, w, 3); c.fillStyle = 'rgba(40,60,80,.25)'; c.fillRect(0, y + 3, w, 10); }
      for (let x = 0; x < w; x += 32) { c.fillStyle = 'rgba(230,240,245,.5)'; c.fillRect(x, 0, 2, h); }
    }, { repeat: true });
    for (const [tx, tz, tw, th] of [[MARINA_X + 60, SHORE_Z + 640, 44, 62], [MARINA_X + 105, SHORE_Z + 660, 30, 48]]) {
      const tb = new T.Mesh(boxUV(tw, th, 22, tw / 20, th / 30), MAT(0xffffff, 0.25, 0.3, { map: glassT })); tb.position.set(tx, th / 2, tz); world.add(tb);
    }
  }
  // ---- coches aparcados a los dos lados de la avenida
  {
    const n = 220, bodyG = new T.BoxGeometry(4.2, 0.85, 1.8), cabG = new T.BoxGeometry(2.3, 0.6, 1.62);
    const bodies = new T.InstancedMesh(bodyG, MAT(0xffffff, 0.35, 0.4), n), cabs = new T.InstancedMesh(cabG, MAT(0x1d252c, 0.15, 0.3), n), o = new T.Object3D();
    const cols = [0xf2f2f0, 0x1c1d20, 0x8c9196, 0xb32a2a, 0x2a4f8c, 0xd8d3c8, 0x4a5a3a].map(c => new T.Color(c));
    for (let i = 0; i < n; i++) {
      const side = i % 2, xx = -1250 + (i >> 1) * 19 + rnd(-3, 3), zz = SHORE_Z + (side ? 95.2 : 85.2);
      o.scale.setScalar(inWild(xx) ? 0 : 1);
      o.position.set(xx, 1.25, zz); o.rotation.set(0, rnd(-0.03, 0.03), 0); o.updateMatrix(); bodies.setMatrixAt(i, o.matrix); bodies.setColorAt(i, cols[Math.floor(rnd(0, cols.length))]);
      o.position.y = 1.95; o.position.x -= 0.2; o.updateMatrix(); cabs.setMatrixAt(i, o.matrix);
    }
    world.add(bodies, cabs);
  }
  // ---- palmeras del paseo: datileras canarias (tronco grueso, copa grande) y alguna washingtonia alta y fina
  {
    const frondTex = canvasTex(128, 512, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.strokeStyle = '#4f6b2e'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 0); c.stroke();
      for (let y = 20; y < h - 10; y += 7) {
        const len = (w / 2 - 6) * Math.sin(Math.PI * (1 - y / h)) + 8;
        c.strokeStyle = ['#3f6a2a', '#4d7a32', '#5a8a3a'][y % 3]; c.lineWidth = 3;
        c.beginPath(); c.moveTo(w / 2, y); c.lineTo(w / 2 - len, y - 16); c.moveTo(w / 2, y); c.lineTo(w / 2 + len, y - 16); c.stroke();
      }
    });
    const trunkG = new T.CylinderGeometry(0.32, 0.45, 1, 9); trunkG.translate(0, 0.5, 0);
    const frondG = new T.PlaneGeometry(1.4, 5.2, 1, 6); frondG.translate(0, 2.6, 0);
    { const p = frondG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -0.075 * y * y); } }
    const n = 150, trunks = new T.InstancedMesh(trunkG, MAT(0x7d6a52, 0.95), n);
    const fronds = new T.InstancedMesh(frondG, MAT(0xffffff, 0.75, 0, { map: frondTex, alphaTest: 0.4, side: T.DoubleSide }), n * 16);
    const o = new T.Object3D();
    for (let i = 0; i < n; i++) {
      let x = PIER_X - 40 - i * 20 + rnd(-3, 3), z = SHORE_Z + 70 + (i % 2) * 10, wash = rnd() < 0.3;
      if (i >= 120 || inWild(x)) { x = rnd(WILD0 + 10, WILD1 - 10); z = SHORE_Z + rnd(45, 260); wash = rnd() < 0.6; }   // sueltas por el paraje
      const h = wash ? rnd(11, 15) : rnd(5, 8.5), thick = wash ? 0.55 : 1.15;
      o.position.set(x, 0.8, z); o.rotation.set(rnd(-0.05, 0.05), 0, rnd(-0.05, 0.05)); o.scale.set(thick, h, thick); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      const nf = 16, sc = wash ? 0.6 : 1.05;
      for (let k = 0; k < nf; k++) {
        o.position.set(x, 0.8 + h, z); o.scale.setScalar(sc * rnd(0.85, 1.1)); o.rotation.set(0, k / nf * TAU + rnd(-0.15, 0.15), 0); o.rotateX(k % 2 ? rnd(0.7, 1.2) : rnd(1.3, 1.9));
        o.updateMatrix(); fronds.setMatrixAt(i * nf + k, o.matrix);
      }
    }
    trunks.castShadow = true; fronds.castShadow = true; world.add(trunks, fronds);
    // farolas del paseo
    const poleM = MAT(0x3b3f44, 0.5, 0.6);
    for (let x = PIER_X - 50; x > -1280; x -= 26) {
      if (inWild(x)) continue;
      rod(V3(x, 0.8, SHORE_Z + 80), V3(x, 8.5, SHORE_Z + 80), 0.09, poleM, world);
      box(1.6, 0.14, 0.32, poleM, x - 0.7, 8.5, SHORE_Z + 80, world, false);
    }
  }
  // ---- el puerto industrial (al otro lado del Pantalán): explanada, contenedores, grúas y depósitos de gas
  const conc = MAT(0xbab4a8, 0.95), concDark = MAT(0x8d877d, 0.95);
  const PX = PIER_X;   // el puerto industrial queda detrás del Pantalán
  box(900, 4, 700, conc, PX + 840, -0.5, -120, world, false);                    // muelles ganados al mar
  // (entre el Pantalán y el puerto solo hay mar abierto: sin dique, como en la foto del dron)
  // ---- espigón curvo de la playa: sale de la orilla y se dobla hacia el Pantalán
  {
    const n = 700, rocks = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), MAT(0x8f7f69, 0.95), n), o = new T.Object3D();
    const curve = new T.QuadraticBezierCurve3(V3(GROIN_X, 0, SHORE_Z + 10), V3(GROIN_X - 10, 0, SHORE_Z - 85), V3(GROIN_X + 45, 0, SHORE_Z - 105));
    for (let i = 0; i < n; i++) {
      const t = rnd(), p = curve.getPoint(t), w = 7 * (1 - 0.35 * t), xr = rnd(-1, 1);
      o.position.set(p.x + xr * w, Math.max(-1.2, 2.4 * (1 - Math.abs(xr) ** 1.6) - rnd(0, 1.2) - t * 0.6), p.z + rnd(-3, 3));
      o.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); const s = rnd(1.1, 2.4); o.scale.set(s, s * 0.75, s); o.updateMatrix(); rocks.setMatrixAt(i, o.matrix);
    }
    rocks.castShadow = true; rocks.receiveShadow = true; world.add(rocks);
  }
  // ---- Puerto Siles (Canet), como en Google Earth: la dársena rectangular pegada a la playa, el dique norte,
  //      la escollera grande por fuera (con el paseo de hormigón encima) que se dobla hacia tierra en la bocana,
  //      el espigón corto del sur, los pantalanes llenos de barcos y el bosque de mástiles de los veleros
  {
    const X0 = MARINA_X - 280, X1 = MARINA_X, ZE = SHORE_Z - 205;     // dique norte · fondo sur de la dársena · escollera
    const rockM = MAT(0x8a7a64, 0.95), o = new T.Object3D();
    const rockSets = [];
    function breakwater(pts, width, h, n) {                             // escollera de bloques a lo largo de una curva
      const curve = new T.CatmullRomCurve3(pts.map(([x, z]) => V3(x, 0, z)));
      rockSets.push({ curve, width, h, n });
    }
    breakwater([[X0, SHORE_Z + 4], [X0, SHORE_Z - 100], [X0, ZE]], 11, 3.2, 700);                                   // dique norte
    breakwater([[X0, ZE], [X0 + 140, ZE - 4], [X1, ZE - 2], [X1 + 55, ZE + 6], [X1 + 78, ZE + 30], [X1 + 72, ZE + 58]], 16, 3.8, 1700);   // escollera exterior y su codo
    breakwater([[X1 + 6, SHORE_Z + 2], [X1 + 18, SHORE_Z - 40], [X1 + 34, SHORE_Z - 70]], 9, 2.6, 300);              // espigón sur
    const total = rockSets.reduce((q, r) => q + r.n, 0), rocks = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), rockM, total);
    let ri = 0;
    for (const r of rockSets) for (let i = 0; i < r.n; i++) {
      const t = rnd(), p = r.curve.getPoint(t), tg = r.curve.getTangent(t), nx = -tg.z, nz = tg.x, xr = rnd(-1, 1);
      o.position.set(p.x + nx * xr * r.width * 0.5, Math.max(-1.3, r.h * (1 - Math.abs(xr) ** 1.6) - rnd(0, 1.2)), p.z + nz * xr * r.width * 0.5);
      o.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); const sc = rnd(1.3, 2.9); o.scale.set(sc, sc * 0.8, sc); o.updateMatrix(); rocks.setMatrixAt(ri++, o.matrix);
    }
    rocks.castShadow = true; rocks.receiveShadow = true; world.add(rocks);
    // paseo de hormigón y muro encima de la escollera exterior (se ve desde el mar por encima de las rocas)
    const concM = MAT(0xc9c3b6, 0.9), wallM = MAT(0xb3ad9f, 0.9);
    box(X1 + 40 - X0, 1.0, 6, concM, (X0 + X1 + 40) / 2, 3.6, ZE + 5, world, false);
    box(X1 + 40 - X0, 2.2, 1.2, wallM, (X0 + X1 + 40) / 2, 4.6, ZE - 1.5, world);
    // muelles de hormigón de dentro: el de tierra, el del dique norte y la explanada central del sur
    box(X1 - X0, 1.2, 16, concM, (X0 + X1) / 2, 0.6, SHORE_Z - 6, world, false);
    box(14, 1.2, SHORE_Z - ZE - 10, concM, X0 + 10, 0.6, (SHORE_Z + ZE) / 2, world, false);
    box(36, 1.2, 70, concM, X1 - 50, 0.6, SHORE_Z - 50, world, false);
    // pantalanes flotantes y los barcos amarrados a los dos lados
    const pontM = MAT(0x9a8f80, 0.85), pontoons = [];
    for (let k = 0; k < 5; k++) pontoons.push({ x: X0 + 40 + k * 36, z0: SHORE_Z - 16, z1: ZE + 22, along: 'z' });   // los del norte, hacia fuera
    for (let k = 0; k < 3; k++) pontoons.push({ z: SHORE_Z - 98 - k * 30, x0: X1 - 160, x1: X1 - 72, along: 'x' });   // los del sur, paralelos a la costa
    for (const pt of pontoons) {
      if (pt.along === 'z') box(2.4, 0.5, pt.z0 - pt.z1, pontM, pt.x, 0.3, (pt.z0 + pt.z1) / 2, world, false);
      else box(pt.x1 - pt.x0, 0.5, 2.4, pontM, (pt.x0 + pt.x1) / 2, 0.3, pt.z, world, false);
    }
    const slots = [];
    for (const pt of pontoons) {
      if (pt.along === 'z') { for (let z = pt.z0 - 6; z > pt.z1 + 4; z -= 4.6) for (const sd of [-1, 1]) slots.push([pt.x + sd * 6.5, z, Math.PI / 2]); }
      else { for (let x = pt.x0 + 5; x < pt.x1 - 4; x += 4.6) for (const sd of [-1, 1]) slots.push([x, pt.z + sd * 6.5, 0]); }
    }
    for (let x = X0 + 22; x < X1 - 20; x += 4.8) slots.push([x, ZE + 12, Math.PI / 2 + 0.0001]);      // abarloados a la escollera por dentro
    const N = slots.length;
    const hullG = new T.CapsuleGeometry(1.15, 6.5, 4, 10); hullG.rotateX(Math.PI / 2); hullG.scale(1, 0.55, 1);
    const cabG = new T.BoxGeometry(1.6, 1.0, 3.2);
    const hulls = new T.InstancedMesh(hullG, MAT(0xffffff, 0.3), N), cabs = new T.InstancedMesh(cabG, MAT(0xffffff, 0.35), N);
    const masts = new T.InstancedMesh(new T.CylinderGeometry(0.1, 0.16, 1, 6), MAT(0xaeb3b8, 0.3, 0.7), N);   // gruesos para que se vean desde lejos
    const booms = new T.InstancedMesh(new T.CylinderGeometry(0.05, 0.05, 1, 5), MAT(0xd0d2d4, 0.3, 0.8), N);
    const covers = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.18, 1, 6), MAT(0x1f3f6b, 0.8), N);   // fundas azules de las velas
    const hc = [0xffffff, 0xffffff, 0xffffff, 0xf2f0ea, 0x1d3557, 0xffffff, 0xe8e4da], col = new T.Color();
    for (let i = 0; i < N; i++) {
      const [x, z, ry] = slots[i], sail = rnd() < 0.62, L = rnd(0.75, 1.3);
      o.position.set(x, 0.35, z); o.rotation.set(0, ry + rnd(-0.04, 0.04), 0); o.scale.set(L, L * rnd(0.9, 1.1), L); o.updateMatrix();
      hulls.setMatrixAt(i, o.matrix); hulls.setColorAt(i, col.set(hc[(i * 5) % hc.length]));
      o.position.set(x, 1.1 * L, z); o.scale.set(L, L * (sail ? 0.8 : 1.3), L); o.updateMatrix(); cabs.setMatrixAt(i, o.matrix);
      const mh = sail ? rnd(12, 19) * L : 0.001;                    // el mástil: lo que se ve por encima de la escollera
      o.position.set(x, 0.9 + mh / 2, z); o.rotation.set(0, 0, 0); o.scale.set(1, mh, 1); o.updateMatrix(); masts.setMatrixAt(i, o.matrix);
      // botavara (y la funda de la vela) a lo largo del barco, a 2 m del puente
      const ax = ry < 0.5 ? V3(0, 0, 1) : V3(1, 0, 0), bl = sail ? 4.2 * L : 0.001;
      o.position.set(x + ax.x * bl * 0.45, 2.6 * L, z + ax.z * bl * 0.45); o.quaternion.setFromUnitVectors(UP, ax); o.scale.set(1, bl, 1); o.updateMatrix(); booms.setMatrixAt(i, o.matrix);
      o.position.y += 0.22; o.scale.set(1, bl * 0.9, 1); o.updateMatrix(); covers.setMatrixAt(i, o.matrix);
      o.quaternion.identity();
    }
    for (const m of [hulls, cabs, masts]) { m.castShadow = true; }
    world.add(hulls, cabs, masts, booms, covers);
    // luces de la bocana: roja en la punta de la escollera, verde en el espigón sur
    for (const [x, z, c] of [[X1 + 72, ZE + 58, 0xc7302c], [X1 + 34, SHORE_Z - 70, 0x2e8b45]]) {
      const tw = new T.Mesh(new T.CylinderGeometry(0.8, 1.1, 6, 14), MAT(c, 0.5)); tw.position.set(x, 6, z); world.add(tw);
      const lt = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 1.2, 10), MAT(0xffffff, 0.3, 0, { emissive: c, emissiveIntensity: 0.6 })); lt.position.set(x, 9.6, z); world.add(lt);
    }
    // el club náutico (edificio blanco con cristaleras) y las naves de la marina
    const white = MAT(0xf1efe9, 0.7), glass = MAT(0x5d7f95, 0.15, 0.6);
    box(60, 9, 24, white, X1 - 70, 4.5, SHORE_Z + 26, world);
    box(58, 3, 0.6, glass, X1 - 70, 6, SHORE_Z + 13.7, world, false);
    box(64, 1, 28, MAT(0x2b5c8a, 0.6), X1 - 70, 9.5, SHORE_Z + 26, world);
    for (let k = 0; k < 4; k++) box(26, 7, 16, white, X0 + 30 + k * 40, 3.5, SHORE_Z + 22, world);
    // grúa de varada
    box(1, 9, 1, MAT(0x3b6fb0, 0.5, 0.4), X1 - 20, 5, SHORE_Z - 12, world); box(10, 1, 1, MAT(0x3b6fb0, 0.5, 0.4), X1 - 16, 9.5, SHORE_Z - 12, world);
  }
  const cc = [0xa2433a, 0x2d6688, 0xc89b3b, 0x3b7a4e, 0xd9d5cc, 0x7a2f2a];
  for (let i = 0; i < 160; i++) {
    const lvl = i % 3, col = Math.floor(i / 3);
    box(12.2, 2.6, 2.45, MAT(cc[(i * 7) % 6], 0.7, 0.2), PX + 610 + (col % 12) * 14, 1.3 + 2.6 * lvl + 1.5, 40 - Math.floor(col / 12) * 8, world, false);
  }
  for (const [tx, tz] of [[PX + 840, -260], [PX + 900, -260]]) {
    const t = new T.Mesh(new T.CylinderGeometry(24, 24, 34, 40), MAT(0xf3f2ee, 0.5)); t.position.set(tx, 18, tz); world.add(t);
    const d = new T.Mesh(new T.SphereGeometry(24, 40, 12, 0, TAU, 0, Math.PI * 0.3), MAT(0xf3f2ee, 0.5)); d.position.set(tx, 35, tz); world.add(d);
  }

  // ---- Alto Horno nº 2 y la Sierra Calderona al fondo
  {
    const rust = MAT(0x86523a, 0.85, 0.25), iron = MAT(0x39322e, 0.75, 0.4), ah = new T.Group();
    ah.position.set(PIER_X + 350, 0, 950); world.add(ah);
    const prof = [[5.2, 0], [6.0, 10], [6.4, 22], [5.4, 34], [4.2, 44], [3.2, 50]];
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      const m = new T.Mesh(new T.CylinderGeometry(r1, r0, y1 - y0, 24), i % 2 ? iron : rust); m.position.y = (y0 + y1) / 2; ah.add(m);
    }
    for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) box(1.2, 62, 1.2, iron, x, 31, z, ah, false);
    for (let y = 12; y <= 60; y += 9) { box(17, 0.6, 1.6, iron, 0, y, -8, ah, false); box(17, 0.6, 1.6, iron, 0, y, 8, ah, false); box(1.6, 0.6, 17, iron, -8, y, 0, ah, false); box(1.6, 0.6, 17, iron, 8, y, 0, ah, false); }
    const skip = box(3, 2, 85, iron, 0, 30, -40, ah, false); skip.rotation.x = 0.62;
    const ch = new T.Mesh(new T.CylinderGeometry(1.6, 2.2, 70, 16), MAT(0x9a948a, 0.9)); ch.position.set(40, 35, 10); ah.add(ch);
  }
  {
    // montañas: anillo de colinas al fondo, por detrás del pueblo
    const g = new T.PlaneGeometry(16000, 2600, 220, 40); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), k = (z + 1300) / 2600;
      const n = Math.sin(x * 0.0021) * 0.5 + Math.sin(x * 0.0057 + 1.3) * 0.3 + Math.sin(x * 0.013 + 0.4) * 0.2;
      p.setY(i, Math.max(0, (180 + 260 * n) * Math.sin(Math.PI * k) * smooth(0, 0.5, k)));
    }
    g.computeVertexNormals();
    const mt = new T.Mesh(g, MAT(0x6f7a5c, 1)); mt.position.set(0, -2, SHORE_Z + 4300); world.add(mt);
  }
}

// ---- El Pantalán (foto de dron desde la punta): tablero de hormigón claro sobre muchos pilotes finos,
//      cabeza más ancha al final con las tolvas de mineral oxidadas y las cargadoras grises, y una pasarela
//      blanca de celosía hasta los duques de alba rojos de la punta, el último con la baliza amarilla y negra.
{
  const pier = new T.Group(); pier.position.x = PIER_X; world.add(pier);
  const deckM = MAT(0xc9bea8, 0.9), deckDark = MAT(0x958b7b, 0.95), pileM = MAT(0x4b3f37, 0.85, 0.2), rustM = MAT(0x9a4f26, 0.8, 0.35);
  const railOld = MAT(0x5a554f, 0.7, 0.4), white = MAT(0xeeeeea, 0.45, 0.2), machine = MAT(0x5f6a73, 0.6, 0.5), redPile = MAT(0x8e3322, 0.75, 0.3);
  const DY = 7.5, W = 8, SPAN = 30, Z_START = SHORE_Z + 20, Z_END = SHORE_Z - 1150;
  const nSpan = Math.floor((Z_START - Z_END) / SPAN);
  const o = new T.Object3D();
  const decks = new T.InstancedMesh(new T.BoxGeometry(W, 1.0, SPAN + 0.02), deckM, nSpan);
  const piles = new T.InstancedMesh(new T.CylinderGeometry(0.42, 0.42, 1, 12), pileM, nSpan * 3 + 40);
  const caps = new T.InstancedMesh(new T.BoxGeometry(W + 0.8, 0.9, 1.2), deckDark, nSpan + 10);
  const posts = new T.InstancedMesh(new T.BoxGeometry(0.06, 1.1, 0.06), railOld, nSpan * 2 * 6);
  let np = 0, nc = 0, nq = 0;
  const addPile = (x, z, top, xb = x) => {   // de (x, top) arriba a (xb, -4) abajo
    const a = V3(x, top, z), b = V3(xb, -4, z), d = V3().subVectors(a, b), L = d.length();
    o.position.copy(b).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(UP, d.normalize()); o.scale.set(1.15, L, 1.15); o.updateMatrix(); piles.setMatrixAt(np++, o.matrix);
    o.quaternion.identity(); o.rotation.set(0, 0, 0);
  };
  for (let i = 0; i < nSpan; i++) {
    const z0 = Z_START - i * SPAN, zc = z0 - SPAN / 2;
    o.position.set(0, DY, zc); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); decks.setMatrixAt(i, o.matrix);
    if (z0 < SHORE_Z - 15) {
      addPile(0, z0, DY - 0.8); addPile(-2.6, z0, DY - 0.8, -5.2); addPile(2.6, z0, DY - 0.8, 5.2);
      o.position.set(0, DY - 0.9, z0); o.scale.set(1, 1, 1); o.updateMatrix(); caps.setMatrixAt(nc++, o.matrix);
    }
    for (const sx of [-1, 1]) {
      if ((i * 5 + (sx > 0 ? 2 : 0)) % 7 === 0) continue;   // trozos de barandilla perdidos
      box(0.07, 0.07, SPAN, railOld, sx * (W / 2 - 0.1), DY + 1.55, zc, pier, false);
      for (let k = 0; k < SPAN; k += 2.5) { o.position.set(sx * (W / 2 - 0.1), DY + 1.0, z0 - k); o.updateMatrix(); posts.setMatrixAt(nq++, o.matrix); }
    }
  }
  // cabeza del pantalán: plataforma ancha de carga
  const HZ0 = Z_END, HL = 75, HW = 20;
  box(HW, 1.2, HL, deckM, 0, DY, HZ0 - HL / 2, pier, true);
  for (let z = HZ0; z >= HZ0 - HL; z -= 12.5) for (const x of [-8.5, -4.2, 0, 4.2, 8.5]) addPile(x, z, DY - 0.8);
  // tolvas de mineral (pirámides invertidas oxidadas sobre patas) y cintas
  for (const [hz, hx] of [[HZ0 - 18, -3], [HZ0 - 30, -3.5], [HZ0 - 44, -2.5]]) {
    const g = new T.Group(); g.position.set(hx, DY + 0.6, hz); pier.add(g);
    for (const [px, pz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) box(0.35, 4.5, 0.35, rustM, px, 2.25, pz, g);
    const hop = new T.Mesh(new T.CylinderGeometry(4.2, 0.9, 3.6, 4, 1, true), rustM); hop.rotation.y = Math.PI / 4; hop.position.y = 5.6; hop.material.side = T.DoubleSide; hop.castShadow = true; g.add(hop);
    box(6, 0.4, 6, rustM, 0, 7.4, 0, g);
    const ch = box(1.2, 0.5, 8, rustM, 3.2, 4.6, 2, g); ch.rotation.set(-0.35, 0.6, 0);
  }
  // cargadoras grises (estructura con brazo) más hacia tierra
  for (const [mz, mx] of [[HZ0 + 30, 1.5], [HZ0 + 55, 1.2]]) {
    const g = new T.Group(); g.position.set(mx, DY + 0.5, mz); pier.add(g);
    for (const [px, pz] of [[-1.5, -2], [1.5, -2], [-1.5, 2], [1.5, 2]]) box(0.3, 3.2, 0.3, machine, px, 1.6, pz, g);
    box(3.6, 1.6, 5, machine, 0, 3.8, 0, g);
    const arm = box(1.2, 0.8, 12, machine, -3, 4.8, -2, g); arm.rotation.set(0.15, -0.9, 0);
  }
  box(1.4, 0.9, Z_START - HZ0 - 200, rustM, 2.2, DY + 0.95, (Z_START - 200 + HZ0) / 2, pier, false);   // restos de la cinta del mineral
  // pasarela de celosía blanca hasta los duques de alba
  const CZ0 = HZ0 - HL, CZ1 = CZ0 - 105, CY = DY + 0.4, CH = 2.0, CW = 1.8;
  box(CW, 0.15, CZ0 - CZ1, white, 0, CY, (CZ0 + CZ1) / 2, pier, true);
  for (const sx of [-1, 1]) {
    box(0.15, 0.15, CZ0 - CZ1, white, sx * CW / 2, CY, (CZ0 + CZ1) / 2, pier, false);
    box(0.15, 0.15, CZ0 - CZ1, white, sx * CW / 2, CY + CH, (CZ0 + CZ1) / 2, pier, false);
    for (let z = CZ0; z > CZ1; z -= 2.5) {
      rod(V3(sx * CW / 2, CY, z), V3(sx * CW / 2, CY + CH, z), 0.05, white, pier);
      rod(V3(sx * CW / 2, CY, z), V3(sx * CW / 2, CY + CH, z - 2.5), 0.04, white, pier);
    }
  }
  // duques de alba: grandes pilotes rojos oxidados
  for (const [dz, tip] of [[CZ0 - 50, false], [CZ1 - 3, true]]) {
    const d = new T.Mesh(new T.CylinderGeometry(2.0, 2.2, CY + 4, 24), redPile); d.position.set(0, (CY - 4) / 2, dz); d.castShadow = true; pier.add(d);
    box(5, 0.5, 5, deckDark, 0, CY - 0.2, dz, pier, true);
    if (tip) {   // baliza cardinal: franjas amarillo y negro con marca de tope
      const cols = [0x111111, 0xe8c21a, 0x111111];
      cols.forEach((c, k) => { const s = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 1.1, 16), MAT(c, 0.5)); s.position.set(0, CY + 0.6 + k * 1.1, dz); pier.add(s); });
      for (const sgn of [1, -1]) { const cn = new T.Mesh(new T.ConeGeometry(0.45, 0.8, 16), MAT(0x111111, 0.5)); cn.position.set(0, CY + 4.4 + (sgn > 0 ? 0.5 : -0.2), dz); if (sgn < 0) cn.rotation.x = Math.PI; pier.add(cn); }
      const lamp = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), MAT(0xffffff, 0.2, 0, { emissive: 0xfff2a0, emissiveIntensity: 0.6 })); lamp.position.set(0, CY + 5.3, dz); pier.add(lamp);
    }
  }
  piles.count = np; caps.count = nc; posts.count = nq;
  for (const m of [decks, piles, caps]) { m.castShadow = true; m.receiveShadow = true; }
  pier.add(decks, piles, caps, posts);
  // arranque en tierra sobre escollera
  box(14, DY, 120, deckDark, 0, DY / 2 - 0.6, SHORE_Z - 25, pier, false);
  const rockG = new T.DodecahedronGeometry(1, 0), nr = 900, rocks = new T.InstancedMesh(rockG, MAT(0x8b7862, 0.95), nr);
  for (let i = 0; i < nr; i++) {
    const z = rnd(SHORE_Z - 95, SHORE_Z + 25), xr = rnd(-1, 1), w = 13;
    o.position.set(xr * w, Math.max(-1.5, (DY - 2.5) * (1 - Math.pow(Math.abs(xr), 1.4)) - rnd(0, 2)), z);
    o.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); const s = rnd(1.2, 2.6); o.scale.set(s * rnd(0.9, 1.3), s * 0.8, s * rnd(0.9, 1.3)); o.updateMatrix(); rocks.setMatrixAt(i, o.matrix);
  }
  rocks.receiveShadow = true; pier.add(rocks);
  // farolas negras del tramo nuevo
  for (let z = SHORE_Z + 10; z > SHORE_Z - 170; z -= 24) for (const sx of [-1, 1]) {
    rod(V3(sx * 3.2, DY + 0.5, z), V3(sx * 3.2, DY + 6, z), 0.07, MAT(0x1b1b1d, 0.5, 0.4), pier);
    box(0.7, 0.18, 0.3, MAT(0x1b1b1d, 0.5, 0.4), sx * 2.95, DY + 6, z, pier, false);
  }
}

// =====================================================================================
//  LA BARCA «TATANKA» (se carga tatanka.glb; si no está, una provisional)
// =====================================================================================
const boat = new T.Group(); scene.add(boat);
const BOAT = { s: 120, speed: 10.3, towLocal: V3(0, 2.32, -0.62), transom: 2.65, model: null, bob: 0 };
function placeholderBoat() {
  const g = new T.Group();
  const hull = box(2.1, 0.9, 5.4, MAT(0xf4f4f2, 0.35), 0, 0.3, 0, g); hull.geometry.translate(0, 0, 0.1);
  box(2.12, 0.25, 5.42, MAT(0xc8202a, 0.35), 0, 0.15, 0, g);
  rod(V3(-0.9, 0.8, 0.1), V3(0, 2.3, -0.6), 0.03, MAT(0xdddddd, 0.2, 1), g);
  rod(V3(0.9, 0.8, 0.1), V3(0, 2.3, -0.6), 0.03, MAT(0xdddddd, 0.2, 1), g);
  return g;
}
BOAT.model = placeholderBoat(); boat.add(BOAT.model);

// =====================================================================================
//  SENÉN (se carga senen.glb con esqueleto; si no está, un maniquí provisional)
// =====================================================================================
const riderRoot = new T.Group(); scene.add(riderRoot);   // origen: centro de la tabla; +X = punta, +Y arriba, +Z = lado de los dedos
const boardGroup = new T.Group(); riderRoot.add(boardGroup);
const BOARD_LEN = 1.41, BOARD_W = 0.43;
function makeBoardMesh(style) {
  const g = new T.Group();
  // contorno: rectángulo con puntas redondeadas
  const sh = new T.Shape(), L = BOARD_LEN / 2, Wd = BOARD_W / 2, r = 0.17;
  sh.moveTo(-L + r, -Wd); sh.lineTo(L - r, -Wd); sh.quadraticCurveTo(L, -Wd, L, -Wd + r); sh.lineTo(L, Wd - r); sh.quadraticCurveTo(L, Wd, L - r, Wd);
  sh.lineTo(-L + r, Wd); sh.quadraticCurveTo(-L, Wd, -L, Wd - r); sh.lineTo(-L, -Wd + r); sh.quadraticCurveTo(-L, -Wd, -L + r, -Wd);
  const geo = new T.ExtrudeGeometry(sh, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);   // queda tumbada: x a lo largo, z a lo ancho, y espesor
  { // rocker: puntas levantadas
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + 0.075 * Math.pow(Math.abs(x) / L, 2.2)); }
    geo.computeVertexNormals();
  }
  // UV de arriba: x,z → textura
  { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / BOARD_LEN + 0.5, p.getZ(i) / BOARD_W + 0.5); }
  const top = canvasTex(1024, 320, (c, w, h) => {
    if (style === 0) {          // negra con la línea verde lima
      c.fillStyle = '#121314'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c3f53a'; c.fillRect(0, h * 0.62, w, h * 0.06);
      c.fillStyle = '#1e2022'; for (let k = 0; k < 40; k++) c.fillRect(k * 26, 0, 2, h);
      c.fillStyle = '#c3f53a'; c.font = 'italic 900 46px Segoe UI, sans-serif'; c.fillText('TATANKA', w * 0.08, h * 0.38);
    } else if (style === 2) {   // la de Rupert: puntas rojas y el centro turquesa
      c.fillStyle = '#21b7c9'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8343f'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w * 0.24, 0); c.quadraticCurveTo(w * 0.3, h * 0.5, w * 0.2, h); c.lineTo(0, h); c.fill();
      c.beginPath(); c.moveTo(w, 0); c.lineTo(w * 0.8, 0); c.quadraticCurveTo(w * 0.72, h * 0.5, w * 0.82, h); c.lineTo(w, h); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 4; c.beginPath(); c.arc(w * 0.12, h * 0.5, 34, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = '800 30px Segoe UI, sans-serif'; c.fillText('LIQUID', w * 0.42, h * 0.56);
    } else if (style === 3) {   // la de Omar: blanca con manchas grises de camuflaje gastado
      c.fillStyle = '#eceae6'; c.fillRect(0, 0, w, h);
      let sd = 7; const rr = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
      for (let k = 0; k < 70; k++) {
        const bx = rr() * w, by = rr() * h, br = 10 + rr() * 34;
        c.fillStyle = `rgba(${90 + rr() * 50 | 0},${92 + rr() * 50 | 0},${96 + rr() * 50 | 0},${0.25 + rr() * 0.35})`;
        c.beginPath(); for (let a = 0; a < 7; a++) { const an = a / 7 * TAU, rd = br * (0.6 + rr() * 0.6); c.lineTo(bx + Math.cos(an) * rd * 1.4, by + Math.sin(an) * rd); } c.fill();
      }
      c.fillStyle = 'rgba(40,40,44,.8)'; c.font = 'italic 800 26px Segoe UI, sans-serif'; c.fillText('HYPERLITE', w * 0.72, h * 0.9);
    } else {                    // Jobe Vanity: azul marino con un gran bloque azul eléctrico
      c.fillStyle = '#141b2e'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(80,110,190,.35)'; c.lineWidth = 2; for (let k = -10; k < 50; k++) { c.beginPath(); c.moveTo(k * 26, 0); c.lineTo(k * 26 + 160, h); c.stroke(); }
      c.fillStyle = '#1f4fd8'; c.beginPath(); c.moveTo(w * 0.48, 0); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(w * 0.3, h); c.closePath(); c.fill();
      c.fillStyle = '#ffffff'; c.font = '900 96px Arial Black, Segoe UI, sans-serif'; c.save(); c.translate(w * 0.42, h * 0.5); c.rotate(-0.08); c.fillText('JOBE', -120, 34); c.restore();
      c.font = '700 26px Segoe UI, sans-serif'; c.fillText('VANITY', w * 0.08, h * 0.86);
    }
  });
  const mTop = MAT(0xffffff, 0.35, 0.05, { map: top }), mBottom = MAT(0x101112, 0.4);
  const mesh = new T.Mesh(geo, [mTop, mBottom]); mesh.castShadow = true; g.add(mesh);
  // fijaciones (botas)
  const bootM = MAT(style === 2 ? 0x7fd83a : 0x18191b, 0.6), accent = MAT(style === 0 ? 0xc3f53a : style === 2 || style === 3 ? 0x18191b : 0x2a63ff, 0.5);
  for (const sx of [-1, 1]) {
    const b = new T.Group(); b.position.set(sx * 0.27, 0.06, 0); b.rotation.y = sx * -0.2; g.add(b);
    box(0.13, 0.05, 0.3, bootM, 0, 0, 0, b);
    const shell = new T.Mesh(new T.CylinderGeometry(0.065, 0.075, 0.2, 14, 1, true, 0, Math.PI * 1.6), bootM); shell.position.set(0, 0.11, -0.05); shell.rotation.y = Math.PI * 0.7; shell.material.side = T.DoubleSide; b.add(shell);
    box(0.135, 0.04, 0.12, accent, 0, 0.06, 0.09, b);
  }
  return g;
}
const BOARDS = [makeBoardMesh(0), makeBoardMesh(1), makeBoardMesh(2), makeBoardMesh(3)];
let boardIdx = 0;
boardGroup.add(BOARDS[0]);
function setBoard(i) { boardGroup.remove(BOARDS[boardIdx]); boardIdx = i; boardGroup.add(BOARDS[i]); }

const body = new T.Group(); riderRoot.add(body);   // aquí va el modelo de Senén
// Maniquí provisional hasta que esté senen.glb
const DUMMY = (() => {
  const g = new T.Group(), skin = MAT(0xc08a62, 0.6), vest = MAT(0x262c38, 0.6), shorts = MAT(0x151515, 0.8);
  const parts = {};
  const limb = (name, r, mat) => { const m = new T.Mesh(CYL, mat); m.castShadow = true; g.add(m); parts[name] = { m, r }; };
  limb('thF', 0.075, shorts); limb('thB', 0.075, shorts); limb('shF', 0.055, skin); limb('shB', 0.055, skin);
  limb('torso', 0.15, vest); limb('uaF', 0.045, skin); limb('uaB', 0.045, skin); limb('faF', 0.04, skin); limb('faB', 0.04, skin); limb('neck', 0.05, skin);
  const head = new T.Mesh(new T.SphereGeometry(0.11, 20, 14), skin); head.castShadow = true; g.add(head);
  return { g, parts, head };
})();
body.add(DUMMY.g);
function setRod(m, r, a, b) { const d = V3().subVectors(b, a), L = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(r, Math.max(L, 1e-3), r); if (L > 1e-6) m.quaternion.setFromUnitVectors(UP, d.normalize()); }
function poseDummy(j) {
  const P = DUMMY.parts, hip = V3().addVectors(j.hB, j.hF).multiplyScalar(0.5);
  setRod(P.thF.m, P.thF.r, j.hF, j.kF); setRod(P.thB.m, P.thB.r, j.hB, j.kB);
  setRod(P.shF.m, P.shF.r, j.kF, j.fF); setRod(P.shB.m, P.shB.r, j.kB, j.fB);
  setRod(P.torso.m, P.torso.r, hip, j.ch); setRod(P.neck.m, P.neck.r, j.ch, j.hd);
  setRod(P.uaF.m, P.uaF.r, j.sF, j.eF); setRod(P.uaB.m, P.uaB.r, j.sB, j.eB);
  setRod(P.faF.m, P.faF.r, j.eF, j.aF); setRod(P.faB.m, P.faB.r, j.eB, j.aB);
  DUMMY.head.position.copy(j.hd).add(V3(0, 0.08, 0));
}
let poseBody = poseDummy;   // se sustituye al cargar senen.glb

// ---- postura del rider en el espacio de la tabla
const J = {}; for (const k of ['hB', 'hF', 'kB', 'kF', 'fB', 'fF', 'ch', 'hd', 'sB', 'sF', 'eB', 'eF', 'aB', 'aF', 'fw', 'handle', 'toeB', 'toeF']) J[k] = V3();
// c: flexión (0 de pie .. 1 encogido) · lean: + hacia los dedos, - hacia los talones · grab: tipo y fuerza
// movimiento vivo del cuerpo: amortiguación de las piernas (muelle), tensión de la cuerda, giro y respiración
const DYN = { t: 0, absorb: 0, absVel: 0, tension: 0, spin: 0, air: 0, prevSH: 0, prevVs: 0, ropeL: null, bAngRel: null, raley: 0, hold: null, manual: 0, manualOne: 0 };
// sb: hacia qué lado de la tabla está la barca (+1 en regular, la punta; -1 en switch, la cola)
// manos: a ratos (al azar) va con una sola mano y la otra abierta para equilibrarse; y algunas veces, al aterrizar
// un giro, cae con la maneta por la espalda, la otra mano la coge por detrás y la vuelve a traer delante
const HANDS = { one: 0, target: 0, side: 'F', next: 9, back: null };
function updateHands(dt) {
  const R = RIDER, H = HANDS;
  const busy = R.state !== 'ride' || R.charging || R.grind || R.manualT || !GAME.running;
  if (H.back) { H.back.t += dt; if (H.back.t > 2.5 || R.state !== 'ride') H.back = null; H.target = 0; }
  else if (busy) H.target = 0;
  else if ((H.next -= dt) <= 0) {
    if (H.target) { H.target = 0; H.next = rnd(7, 16); }
    else if (rnd() < 0.55) { H.target = 1; H.side = rnd() < 0.6 ? 'F' : 'B'; H.next = rnd(2.5, 5.5); }
    else H.next = rnd(5, 10);
  }
  H.one = lerp(H.one, H.target, clamp(dt * 3, 0, 1));
}
function holdingHand() {   // qué mano lleva la maneta ahora: 'F', 'B' o null (las dos)
  const H = HANDS;
  if (H.back) { const t = H.back.t; return t < 1.1 ? H.back.hold : t < 2.15 ? (H.back.hold === 'F' ? 'B' : 'F') : null; }
  return H.one > 0.5 ? H.side : null;
}
// dónde va la mano en cada grab (en la tabla: +x punta, +z canto de los dedos, y arriba) y con qué mano (F delante, B detrás)
// Indy: mano de atrás, canto de los dedos entre los pies · Mute: mano de delante, dedos · Melon: delante, talones
// Stalefish: atrás, talones · Nose y Tail: las puntas
const GRAB_POS = {
  indy: [V3(0.02, 0.13, 0.21), 'B'], mute: [V3(0.1, 0.13, 0.21), 'F'], melon: [V3(0.06, 0.13, -0.21), 'F'], stale: [V3(-0.05, 0.13, -0.21), 'B'],
  nose: [V3(0.55, 0.14, 0.0), 'F'], tail: [V3(-0.55, 0.15, 0.0), 'B'],
};
// tabla tirada en el grab: se sube hacia la mano y se tuerce (punta arriba y de canto), aparte del cuerpo
const BOARD_TW = { on: false, q: new T.Quaternion(), off: V3() };
const twv = v => v.applyQuaternion(BOARD_TW.q).add(BOARD_TW.off);
function computePose(c, lean, grab, grabK, handleOn, raley = 0, sb = 1) {
  const D = DYN, ride = 1 - D.air;
  c = clamp(c + D.absorb, 0, 1);
  const tens = D.tension * ride, breathe = Math.sin(D.t * 2.1) * 0.008, chop = Math.sin(D.t * 3.3) * 0.012 * ride;
  const hy = lerp(0.93, 0.5, c) - Math.abs(lean) * 0.05;
  const hz = -0.06 - 0.1 * c + lean * 0.22;
  J.fF.set(0.27, 0.09, 0); J.fB.set(-0.27, 0.09, 0);
  J.toeF.set(0.3, 0.09, 0.16); J.toeB.set(-0.24, 0.09, 0.16);
  const kz = 0.1 + 0.25 * c + Math.max(0, lean) * 0.1, ky = lerp(0.5, 0.42, c);
  J.kF.set(0.29, ky, kz + chop); J.kB.set(-0.25, ky, kz - chop);
  if (BOARD_TW.on) {   // pies con la tabla; rodillas arriba y abiertas (la pierna que se queda lejos sale estirada)
    for (const v of [J.fF, J.fB, J.toeF, J.toeB]) twv(v);
    const L = BOARD_TW.off.y;
    J.kF.set(J.fF.x * 0.85 + 0.04, J.fF.y + 0.34 - L * 0.35, J.fF.z + 0.2 + L * 0.25);
    J.kB.set(J.fB.x * 0.85 - 0.02, J.fB.y + 0.32 - L * 0.3, J.fB.z + 0.22 + L * 0.3);
  }
  // cadera algo atrasada respecto a la barca (+X): el rider se cuelga de la cuerda
  const hipBack = (0.07 + 0.08 * tens) * sb;
  J.hF.set(-hipBack + 0.11, hy, hz); J.hB.set(-hipBack - 0.11, hy, hz);
  // hombros abiertos hacia la barca al remolcar (los dos brazos a la vista); en el aire y en el grab, de lado, de cara a la ola
  const tw = lerp(0.85, 0.18, D.air * (grab && grabK > 0 ? 1 : 0.55));
  const fwd = lerp(0.04, 0.3, c) + Math.max(0, lean) * 0.12;
  J.ch.set((-0.16 - 0.06 * (1 - c) - 0.14 * tens) * sb, hy + lerp(0.45, 0.36, c) + breathe, hz + fwd);
  // grab: el pecho baja hacia la tabla y las rodillas suben (si no, la mano no llega y se queda en la rodilla)
  const GPi = grab && grabK > 0 ? GRAB_POS[grab] : null;
  if (GPi) {
    const sd = Math.sign(GPi[0].z), k = grabK;
    J.ch.y -= 0.12 * k; J.ch.z += 0.1 * sd * k; J.ch.x += GPi[0].x * 0.2 * k;
    J.hF.y -= 0.04 * k; J.hB.y -= 0.04 * k;
  }
  J.fw.set(Math.sin(tw) * sb, 0, Math.cos(tw)).normalize();
  const sl = V3(Math.cos(tw), 0, -Math.sin(tw) * sb).multiplyScalar(0.19);
  J.sF.copy(J.ch).add(sl).add(V3(0, 0.04, 0)); J.sB.copy(J.ch).sub(sl).add(V3(0, 0.04, 0));
  J.hd.copy(J.ch).add(V3((0.05 + 0.04 * tens) * sb + Math.sin(D.t * 0.7) * 0.02, 0.27, 0.03 + fwd * 0.2 + Math.sin(D.t * 0.43) * 0.015));
  // la maneta a la altura de la cadera delantera, hacia la barca
  const pull = 0.5 + 0.1 * tens - 0.25 * D.spin;
  J.handle.set(pull * sb, hy - 0.05 + 0.1 * D.spin, hz + 0.22 + fwd * 0.4 - 0.08 * D.spin);
  J.aF.copy(J.handle).add(V3(0, 0, -0.1)); J.aB.copy(J.handle).add(V3(0, 0, 0.1));
  if (grab && grabK > 0) {
    const GP = GRAB_POS[grab];
    if (GP) {
      const hand = GP[1] === 'F' ? J.aF : J.aB, tgt = GP[0].clone(); if (BOARD_TW.on) twv(tgt);
      hand.lerp(tgt, grabK);
      J.handle.lerp(V3(0.68 * sb, J.ch.y - 0.04, J.ch.z + 0.05), grabK);   // brazo de la cuerda estirado, a la altura del hombro
      if (GP[1] === 'F') J.aB.copy(J.handle); else J.aF.copy(J.handle);
    }
  }
  if (handleOn && !(grab && grabK > 0) && D.air < 0.5) {
    // brazo libre: estirado y hacia atrás, lejos de la barca (como en el vídeo), con un leve balanceo
    const H = HANDS, free = k => k === 'F' ? V3().copy(J.sF).add(V3(0.12 * sb, -0.22 + Math.sin(D.t * 1.3) * 0.03, 0.42))
                                           : V3().copy(J.sB).add(V3(-0.46 * sb, -0.24 + Math.sin(D.t * 1.1) * 0.04, 0.06));
    if (H.back) {
      const t = H.back.t, A = H.back.hold, O = A === 'F' ? 'B' : 'F', aA = 'a' + A, aO = 'a' + O;
      const back = V3(0.04 * sb, hy + 0.04, hz - 0.2), front = J.handle.clone();
      const toFront = ss(clamp((t - 1.6) / 0.7, 0, 1));
      J.handle.lerpVectors(back, front, toFront);
      // A: la lleva por detrás hasta que la coge la otra; se abre y al final vuelve a la maneta
      const relA = ss(clamp((t - 1.15) / 0.35, 0, 1)), backA = ss(clamp((t - 2.0) / 0.4, 0, 1));
      J[aA].lerpVectors(J.handle, free(A), relA * (1 - backA));
      if (t > 2.0) J[aA].lerpVectors(free(A), V3().copy(J.handle).add(V3(0, 0, A === 'F' ? -0.1 : 0.1)), backA);
      // O: abierta para equilibrarse, va a buscarla por la espalda y se la trae delante
      const grabO = ss(clamp((t - 0.85) / 0.35, 0, 1));
      J[aO].lerpVectors(free(O), V3().copy(J.handle).add(V3(0, 0, t > 2.0 ? (O === 'F' ? -0.1 : 0.1) * backA : 0)), grabO);
      // codos hacia fuera y hacia atrás cuando la mano va por la espalda
      H.backElbow = 1 - toFront;
    } else if (H.one > 0.01) {
      const hold = 'a' + H.side, fr = H.side === 'F' ? 'B' : 'F';
      J.handle.lerp(V3(J.hF.x + 0.14 * sb, hy + 0.03, hz + 0.15), 0.45 * H.one);   // con una mano, la maneta pegada a la cadera de delante
      J[hold].lerp(J.handle, H.one);
      J['a' + fr].lerp(free(fr), H.one);
      H.backElbow = 0;
    } else H.backElbow = 0;
  } else HANDS.backElbow = 0;
  if (!handleOn) { J.aF.copy(J.sF).add(V3(0.1, -0.45, 0.25)); J.aB.copy(J.sB).add(V3(-0.15, -0.4, 0.3)); }
  // ---- en el aire la maneta apunta siempre a la barca (la cuerda tira de ella). Al girar, en el cuerpo da la vuelta
  //      a la cintura: con el pecho hacia la barca va delante con las dos manos; con la espalda hacia la barca va pegada
  //      a la espalda, las dos manos se juntan detrás y una se la pasa a la otra (el paso de maneta de los 360)
  D.hold = null;
  const RL = D.ropeL;
  if (RL && handleOn && D.air > 0.01 && !(grab && grabK > 0)) {
    const k = ss(D.air), rk = ss(clamp(D.raley, 0, 1));
    // ángulo de la cuerda por el lado de la espalda (0 = hacia la punta de delante, 90° = la espalda justo hacia la barca)
    //  (medido desde cómo salió: de talones la cuerda ya va algo por detrás y eso no es un paso de maneta)
    const bAng = D.bAngRel !== null ? D.bAngRel : Math.atan2(-RL.z, RL.x * sb);
    // la cuerda «como si hubiera salido recto»: las manos y la maneta siguen el giro del cuerpo desde el despegue
    const hz0 = Math.hypot(RL.x, RL.z), RV = V3(hz0 * Math.cos(bAng) * sb, RL.y, -hz0 * Math.sin(bAng));
    const behind = ss(clamp((bAng - 0.72) / 0.45, 0, 1)) * ss(clamp((2.42 - bAng) / 0.45, 0, 1)), vert = clamp(Math.abs(RV.y) * 1.4, 0, 1);
    const cx0 = (J.hF.x + J.hB.x) / 2, r = lerp(lerp(clamp(pull, 0.3, 0.5), 0.26, behind), 0.24, vert);
    const hp = V3(cx0, hy - 0.02, hz).addScaledVector(RV, r);
    hp.z += 0.18 * (1 - behind) * (1 - vert); hp.y += 0.04 * behind;
    if (rk > 0) {   // raley: los brazos estirados hacia la barca desde los hombros
      const shc = V3().addVectors(J.sF, J.sB).multiplyScalar(0.5).addScaledVector(RL, 0.62);
      hp.lerp(shc, rk);
    }
    J.handle.lerp(hp, k);
    const bar = V3(-RV.z, 0, RV.x).multiplyScalar(sb); if (bar.lengthSq() < 1e-4) bar.set(0, 0, 1); bar.normalize();
    const gF = V3().copy(J.handle).addScaledVector(bar, -0.1 * (1 - 0.6 * behind)), gB = V3().copy(J.handle).addScaledVector(bar, 0.1 * (1 - 0.6 * behind));
    // la mano del lado de la maneta la lleva; en medio (justo con la espalda a la barca) la llevan las dos: ahí se pasa
    const hF = lerp(1, clamp((RV.x + 0.15) / 0.3, 0, 1), behind * (1 - rk)), hB = lerp(1, clamp((0.15 - RV.x) / 0.3, 0, 1), behind * (1 - rk));
    const freeF = V3().copy(J.sF).add(V3(0.42, -0.3, 0.18)), freeB = V3().copy(J.sB).add(V3(-0.42, -0.3, 0.18));   // la libre, abierta para equilibrarse
    J.aF.lerp(V3().lerpVectors(freeF, gF, ss(hF)), k); J.aB.lerp(V3().lerpVectors(freeB, gB, ss(hB)), k);
    D.hold = hF > 0.5 && hB < 0.5 ? 'F' : hB > 0.5 && hF < 0.5 ? 'B' : null;
    HANDS.backElbow = Math.max(HANDS.backElbow || 0, behind * k);
  }
  // ---- raley: piernas estiradas hacia atrás (rodillas en línea con cadera y pies) y el cuerpo arqueado, la cabeza alta
  if (D.raley > 0.01 && handleOn) {
    const k = ss(clamp(D.raley, 0, 1));
    J.kF.lerp(V3().lerpVectors(J.hF, J.fF, 0.5).add(V3(0, 0, 0.02)), k); J.kB.lerp(V3().lerpVectors(J.hB, J.fB, 0.5).add(V3(0, 0, 0.02)), k);
    J.hF.y += 0.08 * k; J.hB.y += 0.08 * k;                       // cadera lejos de los pies: las piernas rectas
    J.hd.y += 0.02 * k;                                          // la cabeza levantada, mirando a la barca
  }
  // ---- manual: la cadera atrás sobre la cola y el pecho hacia delante (la tabla sube, el cuerpo no se tumba);
  //      a fondo, suelta la mano de atrás y la lleva estirada hacia atrás
  if (D.manual > 0.01 && handleOn) {
    const m = D.manual, fw = sb;
    J.hF.x -= 0.1 * fw * m; J.hB.x -= 0.1 * fw * m; J.hF.y -= 0.05 * m; J.hB.y -= 0.05 * m;
    J.ch.x += 0.36 * fw * m; J.hd.x += 0.46 * fw * m; J.sF.x += 0.36 * fw * m; J.sB.x += 0.36 * fw * m;
    J.kF.x += 0.06 * fw * m; J.kB.x += 0.03 * fw * m;
    J.handle.x += 0.3 * fw * m; J.aF.x += 0.3 * fw * m; J.aB.x += 0.3 * fw * m;
    if (D.manualOne > 0.01) {
      const o = D.manualOne, lead = fw > 0 ? 'F' : 'B', back = lead === 'F' ? 'B' : 'F';
      J['a' + lead].lerp(J.handle, o);
      const sh = J['s' + back];
      J['a' + back].lerp(V3(sh.x - 0.6 * fw, sh.y - 0.12, sh.z - 0.08), o);   // el brazo recto hacia atrás
      D.hold = lead;
    }
  }
  // codos: casi rectos cuando tira la cuerda, más doblados cuando está suelta o en los giros
  const bend = 0.04 - 0.03 * tens + 0.08 * D.spin;
  J.eF.lerpVectors(J.sF, J.aF, 0.5).add(V3(0, -bend, 0.05 + bend * 0.4)); J.eB.lerpVectors(J.sB, J.aB, 0.5).add(V3(0, -bend, 0.05 + bend * 0.4));
  if (HANDS.backElbow > 0.01) {   // mano por detrás: el codo sale hacia fuera y atrás (si no, el brazo atraviesa el cuerpo)
    const be = HANDS.backElbow;
    for (const k of ['F', 'B']) { if (J['a' + k].z < hz - 0.08) J['e' + k].add(V3((k === 'F' ? 0.12 : -0.12) * sb * be, 0.02 * be, -0.06 * be)); }
  }
}

// cuerda y maneta
const ropeMat = MAT(0xf2e9c8, 0.7);
const rope = new T.Mesh(CYL, ropeMat); rope.castShadow = true; scene.add(rope);
const handleMesh = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.36, 10), MAT(0x1a1a1a, 0.5)); handleMesh.castShadow = true; scene.add(handleMesh);

// =====================================================================================
//  SALPICADURAS
// =====================================================================================
const SPRAY_N = 900;
const sprayGeo = new T.BufferGeometry();
const spPos = new Float32Array(SPRAY_N * 3), spVel = new Float32Array(SPRAY_N * 3), spLife = new Float32Array(SPRAY_N), spSize = new Float32Array(SPRAY_N), spMax = new Float32Array(SPRAY_N);
sprayGeo.setAttribute('position', new T.BufferAttribute(spPos, 3));
sprayGeo.setAttribute('aLife', new T.BufferAttribute(spLife, 1));
sprayGeo.setAttribute('aSize', new T.BufferAttribute(spSize, 1));
const sprayMat = new T.ShaderMaterial({
  uniforms: { uScale: { value: innerHeight * 0.5 } },
  vertexShader: `attribute float aLife; attribute float aSize; uniform float uScale; varying float vL;
    void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = aLife > 0.0 ? aSize * uScale / -mv.z * (1.4 - aLife * 0.4) : 0.0; }`,
  fragmentShader: `varying float vL; void main(){ vec2 p = gl_PointCoord - 0.5; float r = length(p); if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.1, r) * clamp(vL, 0.0, 1.0) * 0.85; gl_FragColor = vec4(vec3(0.95,0.97,1.0), a); }`,
  transparent: true, depthWrite: false
});
const spray = new T.Points(sprayGeo, sprayMat); spray.frustumCulled = false; scene.add(spray);
let spHead = 0;
function emit(x, y, z, vx, vy, vz, size = 0.25, life = 1) {
  const i = spHead; spHead = (spHead + 1) % SPRAY_N;
  spPos[i * 3] = x; spPos[i * 3 + 1] = y; spPos[i * 3 + 2] = z; spVel[i * 3] = vx; spVel[i * 3 + 1] = vy; spVel[i * 3 + 2] = vz;
  spLife[i] = 1; spMax[i] = life; spSize[i] = size;
}
function updateSpray(dt) {
  for (let i = 0; i < SPRAY_N; i++) {
    if (spLife[i] <= 0) continue;
    spLife[i] -= dt / spMax[i];
    spVel[i * 3 + 1] -= 9.8 * dt;
    spVel[i * 3] *= 1 - 1.2 * dt; spVel[i * 3 + 2] *= 1 - 1.2 * dt;
    spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
    if (spPos[i * 3 + 1] < -0.1) spLife[i] = 0;
  }
  sprayGeo.attributes.position.needsUpdate = true; sprayGeo.attributes.aLife.needsUpdate = true; sprayGeo.attributes.aSize.needsUpdate = true;
}

// =====================================================================================
//  ESTELA DE LA TABLA: franja de espuma que deja el canto al cortar el agua
// =====================================================================================
const TRAIL_N = 110, TRAIL_LIFE = 3.0;
const trail = { pts: [], acc: 0 };
const trailGeo = new T.BufferGeometry();
const trPos = new Float32Array(TRAIL_N * 2 * 3), trA = new Float32Array(TRAIL_N * 2), trU = new Float32Array(TRAIL_N * 2);
trailGeo.setAttribute('position', new T.BufferAttribute(trPos, 3));
trailGeo.setAttribute('aA', new T.BufferAttribute(trA, 1));
trailGeo.setAttribute('aU', new T.BufferAttribute(trU, 1));
{ const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx); }
const trailMat = new T.ShaderMaterial({
  uniforms: { tNoise: U.tNoise, uTime: U.uTime },
  vertexShader: `attribute float aA; attribute float aU; varying float vA; varying float vU; varying vec2 vW;
    void main(){ vA = aA; vU = aU; vW = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tNoise; uniform float uTime; varying float vA; varying float vU; varying vec2 vW;
    void main(){ float edge = 1.0 - abs(vU * 2.0 - 1.0); float n = texture2D(tNoise, vW * 0.35 + uTime * 0.02).r;
      float a = vA * smoothstep(0.0, 0.6, edge) * (0.55 + 0.7 * n); if (a < 0.02) discard;
      gl_FragColor = vec4(vec3(0.94, 0.97, 0.98), clamp(a, 0.0, 0.9)); }`,
  transparent: true, depthWrite: false, side: T.DoubleSide,
});
const trailMesh = new T.Mesh(trailGeo, trailMat); trailMesh.frustumCulled = false; trailMesh.renderOrder = 2; scene.add(trailMesh);
function updateTrail(dt, t) {
  const R = RIDER, riding = R.state === 'ride' || R.state === 'start';
  for (const q of trail.pts) q.age += dt;
  trail.acc += dt;
  if (trail.acc > 0.03) {
    trail.acc = 0;
    // el punto sale de la cola de la tabla (lo que va detrás según hacia dónde se mueve)
    const v = R.vel, sp = Math.hypot(v.x, v.z) || 1;
    trail.pts.unshift({ x: R.pos.x - v.x / sp * 0.55, z: R.pos.z - v.z / sp * 0.55, age: 0, on: riding, k: clamp(Math.abs(R.edge) * 2.2 + 0.35, 0.35, 1) });
    if (trail.pts.length > TRAIL_N) trail.pts.length = TRAIL_N;
  }
  const P = trail.pts;
  for (let i = 0; i < TRAIL_N; i++) {
    const q = P[Math.min(i, P.length - 1)];
    if (!q) continue;
    const q2 = P[Math.min(i + 1, P.length - 1)], q0 = P[Math.min(Math.max(i - 1, 0), P.length - 1)];
    let dx = q0.x - q2.x, dz = q0.z - q2.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const life = clamp(1 - q.age / TRAIL_LIFE, 0, 1), w = (0.16 + 0.75 * (1 - life)) * q.k;
    const y = surfaceH(q.x, q.z, t) + 0.04;
    trPos.set([q.x - dz * w, y, q.z + dx * w, q.x + dz * w, y, q.z - dx * w], i * 6);
    const a = i < P.length && q.on ? life * life * 0.85 * q.k : 0;
    trA[i * 2] = trA[i * 2 + 1] = a; trU[i * 2] = 0; trU[i * 2 + 1] = 1;
  }
  trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.aA.needsUpdate = true; trailGeo.attributes.aU.needsUpdate = true;
}

// =====================================================================================
//  CONTROLES (copiados de Pocket Shredders): stick L = carve / ollie / pop / grabs,
//  stick R = spins / rolls / raley / whirly / S-Bend. Teclado como en su juego.
// =====================================================================================
const mkStick = () => ({ x: 0, y: 0, on: false, t0: 0, maxR: 0, ang: null, turn: 0, tapEv: false, circleEv: 0 });
const IN = { L: mkStick(), R: mkStick(), kb: {}, seq: [] };
const STICK_R = 56;
const touches = new Map();
function stickTouchStart(side, x, y) {
  const s = IN[side];
  s.on = true; s.x = 0; s.y = 0; s.t0 = performance.now(); s.maxR = 0; s.ang = null; s.turn = 0; s.circled = false;
  $(side === 'L' ? 'stL' : 'stR').classList.add('on');
}
function stickTouchEnd(side) {
  const s = IN[side];
  if (performance.now() - s.t0 < 240 && s.maxR < 0.45) s.tapEv = true;   // toque corto = «tap»
  s.relEv = { x: s.x, y: s.y, circled: s.circled };                       // al soltar (el pop con el stick derecho)
  s.on = false; s.x = 0; s.y = 0; s.ang = null; s.turn = 0;
  $(side === 'L' ? 'stL' : 'stR').classList.remove('on');
}
// cada vuelta: el ángulo acumulado con el stick fuera; media vuelta = evento de círculo
function trackCircle(s) {
  const r = Math.hypot(s.x, s.y); s.maxR = Math.max(s.maxR, r);
  if (r > 0.55) {
    const a = Math.atan2(s.y, s.x);
    if (s.ang !== null) { let d = a - s.ang; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; s.turn += d; }
    s.ang = a;
    if (Math.abs(s.turn) >= Math.PI * 0.92) { s.circleEv = Math.sign(s.turn); s.turn = 0; s.circled = true; }
  } else if (r < 0.3) { s.ang = null; s.turn = 0; }
}
addEventListener('pointerdown', e => {
  if (!GAME.running || e.target.closest('button') || e.target.closest('#stance')) return;
  const side = e.clientX < innerWidth / 2 ? 'L' : 'R';   // izquierda = dirección, derecha = agacharse / saltar y giros
  for (const [, t] of touches) if (t.side === side) return;
  // el círculo derecho va por posición: pulsar encima de SPIN o ROLL ya es el truco, sin arrastrar
  // (si se toca lejos del círculo, cuenta desde donde se puso el dedo)
  const b = $('stR').getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, rad = b.width * 0.47;
  const abs = side === 'R' && Math.hypot(e.clientX - cx, e.clientY - cy) < rad * 1.6;
  const t = abs ? { side, x0: cx, y0: cy, rad } : { side, x0: e.clientX, y0: e.clientY, rad: STICK_R };
  touches.set(e.pointerId, t);
  stickTouchStart(side);
  if (abs) moveStick(t, e);
});
function moveStick(t, e) {
  let dx = (e.clientX - t.x0) / t.rad, dy = -(e.clientY - t.y0) / t.rad;
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  if (l < 0.3) { dx = 0; dy = 0; }                       // el centro (OLLIE) no apunta a ningún truco
  IN[t.side].x = dx; IN[t.side].y = dy; trackCircle(IN[t.side]);
}
addEventListener('pointermove', e => { const t = touches.get(e.pointerId); if (t) moveStick(t, e); });
const endTouch = e => { const t = touches.get(e.pointerId); if (!t) return; touches.delete(e.pointerId); stickTouchEnd(t.side); };
addEventListener('pointerup', endTouch); addEventListener('pointercancel', endTouch);
addEventListener('keydown', e => {
  if (e.repeat) return;
  IN.kb[e.code] = true;
  if (e.code === 'Space') IN.spaceT0 = performance.now();
  if (e.code === 'KeyC') nextCam();
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyV') surface180();
  if (e.code === 'KeyO') IN.kbOther = true;
  if (e.code === 'KeyB') IN.kbSBend = true;
  if (e.code === 'Enter' && RIDER.state === 'fallen') getUp();
  if (/^Arrow/.test(e.code) && IN.kb.KeyG) IN.seq.push(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { IN.kb[e.code] = false; if (e.code === 'KeyG') IN.seq = []; if (e.code === 'KeyO') IN.kbOther = false; });
$('stance').addEventListener('click', () => { if (GAME.running) surface180(); });   // tocar REG/SW también cambia de pie

// junta táctil y teclado en un estado por stick (y recoge los eventos del fotograma)
function readSticks() {
  if (!GAME.running) {   // intro: carvea solo, suave, sin saltar
    if (RIDER.state === 'fallen' && RIDER.fallT > 2) getUp();
    return { L: { x: Math.sin(GAME.t * 0.32) > 0.2 ? 0.75 : Math.sin(GAME.t * 0.32) < -0.2 ? -0.75 : 0, y: 0, tap: false, circle: 0 }, R: { x: 0, y: 0, tap: false, circle: 0, hold: false, rel: null } };
  }
  const k = IN.kb, air = RIDER.state === 'air';
  const L = { x: IN.L.x, y: IN.L.y, tap: IN.L.tapEv, circle: IN.L.circleEv };
  const R = { x: IN.R.x, y: IN.R.y, tap: IN.R.tapEv, circle: IN.R.circleEv, hold: IN.R.on || !!k.Space, rel: IN.R.relEv || null };
  IN.L.tapEv = IN.R.tapEv = false; IN.L.circleEv = IN.R.circleEv = 0; IN.L.relEv = IN.R.relEv = null;
  // Espacio = el centro del stick derecho: mantener agacha, soltar salta
  if (k.Space) prevSpace = true; else if (prevSpace) { prevSpace = false; R.rel = { x: 0, y: k.KeyR ? -1 : 0, circled: false }; }
  // Riding: ← → carvean (soltar la flecha = pop) · Espacio ollie. Grabs: G (+ flechas para el tweak), O la otra mano
  if (!air) { if (k.ArrowLeft) L.x = -1; if (k.ArrowRight) L.x = 1; if (k.ArrowUp) L.y = 1; if (k.ArrowDown) L.y = -1; }
  if (air && k.KeyG) {
    L.y = 1; L.x = 0;                                   // G solo = Indy
    if (k.ArrowUp) { L.y = 1; L.x = 0; } if (k.ArrowDown) { L.y = -1; L.x = 0; }
    if (k.ArrowLeft) { L.x = -1; L.y = 0; } if (k.ArrowRight) { L.x = 1; L.y = 0; }
  }
  if (k.KeyW) R.y = 1; if (k.KeyS) R.y = -1; if (k.KeyA) R.x = -1; if (k.KeyD) R.x = 1;
  if (k.KeyR) { R.y = -1; R.x = 0; R.raleyKey = true; }
  if (IN.raleyBtn) R.raleyBtn = true;
  if (IN.kbSBend) { R.circle = 1; IN.kbSBend = false; }
  return { L, R };
}
let prevSpace = false;

// ---- dibujo de los sticks: aro con flechas y palabras, bola que sigue al dedo, aro de aterrizaje
function stickSVG(words) {
  const chev = (rot) => `<path d="M-7,-62 L0,-69 L7,-62" transform="rotate(${rot})" />`;
  return `<svg class="dirs" viewBox="-70 -70 140 140" aria-hidden="true">
    <circle r="66" class="rim"/><circle r="66" class="land" id="__land"/>
    ${chev(0)}${chev(90)}${chev(180)}${chev(270)}
    <text x="0" y="-41">${words[0]}</text><text x="44" y="4">${words[1]}</text><text x="0" y="49">${words[2]}</text><text x="-44" y="4">${words[3]}</text></svg>
    <i class="knob">${''}</i>`;
}
$('stL').innerHTML = stickSVG(['180', 'CARVE', 'MANUAL', 'CARVE']).replace('id="__land"', 'id="landL"').replace('<i class="knob"></i>', '<i class="knob">L</i>');   // dirección
$('stR').innerHTML = stickSVG(['SPIN', 'ROLL', 'SPIN', 'ROLL']).replace('id="__land"', 'id="landR"').replace('<i class="knob"></i>', '<i class="knob">OLLIE</i>');   // centro: agacharse y saltar
// la posición se pone aquí también: si el móvil tiene guardado un index.html viejo, el círculo de la dirección seguiría a la derecha
Object.assign($('stL').style, { left: 'max(18px, env(safe-area-inset-left))', right: 'auto' });
Object.assign($('stR').style, { right: 'max(18px, env(safe-area-inset-right))', left: 'auto' });
function drawSticks(S) {
  for (const [id, s] of [['stL', S.L], ['stR', S.R]]) {
    const k = $(id).querySelector('.knob'); k.style.transform = `translate(${(s.x * 40).toFixed(1)}px, ${(-s.y * 40).toFixed(1)}px)`;
  }
  $('stR').classList.toggle('armed', RIDER.armed);
  $('stL').classList.toggle('armed', RIDER.otherHand);
}
function setLandRing(frac, ok) {
  const c = $('landR'); if (!c) return;
  const L = 2 * Math.PI * 66;
  c.style.strokeDasharray = `${(L * clamp(frac, 0, 1)).toFixed(1)} ${L.toFixed(1)}`;
  c.style.stroke = ok ? 'var(--lima)' : 'rgba(255,255,255,.75)';
  c.style.opacity = frac > 0 ? 1 : 0;
}

// =====================================================================================
//  SONIDO (sintetizado, sin archivos): el mar y el viento de fondo, el motor de la Tatanka, el siseo del canto
//  al cortar el agua, el golpe al saltar y la salpicadura al caer (más fuerte cuanto más alto y si te caes)
// =====================================================================================
const SFX = { ctx: null, on: true, carve: null, engine: null, amb: null };
try { SFX.on = localStorage.getItem('wake-sound') !== 'off'; } catch (e) {}
function sfxInit() {
  if (SFX.ctx) { if (SFX.ctx.state === 'suspended') SFX.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const C = SFX.ctx = new AC();
  const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  SFX.noise = buf;
  SFX.master = C.createGain(); SFX.master.gain.value = SFX.on ? 0.9 : 0; SFX.master.connect(C.destination);
  const loop = (freq, type, q, gain) => {
    const src = C.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.5 + Math.random() * 0.5;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = C.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(SFX.master); src.start();
    return { src, f, g };
  };
  // mar: rumor grave que sube y baja como las olas
  SFX.amb = loop(420, 'lowpass', 0.7, 0.05);
  const lfo = C.createOscillator(), lg = C.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(SFX.amb.g.gain); lfo.start();
  SFX.wind = loop(950, 'bandpass', 0.6, 0.018);
  // motor fueraborda: zumbido grave con algo de vibración
  const eg = C.createGain(); eg.gain.value = 0; const ef = C.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 260; ef.connect(eg); eg.connect(SFX.master);
  for (const [fq, ty, v] of [[46, 'sawtooth', 0.6], [92, 'square', 0.25], [138, 'sawtooth', 0.15]]) { const o = C.createOscillator(), g = C.createGain(); o.type = ty; o.frequency.value = fq; g.gain.value = v; o.connect(g); g.connect(ef); o.start(); }
  const vib = C.createOscillator(), vg = C.createGain(); vib.frequency.value = 7; vg.gain.value = 0.012; vib.connect(vg); vg.connect(eg.gain); vib.start();
  SFX.engine = eg;
  // el canto de la tabla cortando el agua
  SFX.carve = loop(1700, 'bandpass', 0.9, 0);
}
function sfxBurst(dur, f0, f1, gain, type = 'lowpass', q = 0.8) {
  if (!SFX.ctx || !SFX.on) return;
  const C = SFX.ctx, t = C.currentTime, src = C.createBufferSource(); src.buffer = SFX.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = C.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(SFX.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function sfxThump(freq, gain, dur) {
  if (!SFX.ctx || !SFX.on) return;
  const C = SFX.ctx, t = C.currentTime, o = C.createOscillator(), g = C.createGain();
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(SFX.master); o.start(t); o.stop(t + dur + 0.05);
}
function sfxSplash(k) {            // la tabla golpea el agua al caer (k ≈ 0.3 un bote … 1.5 una caída)
  k = clamp(k, 0.2, 1.6);
  sfxThump(95, 0.35 * k, 0.18);
  sfxBurst(0.35 + 0.35 * k, 3200, 380, 0.32 * k);
  if (k > 0.8) setTimeout(() => sfxBurst(0.9, 1400, 250, 0.12 * k), 120);   // el agua que vuelve a caer
}
function sfxPop(q) { sfxThump(140, 0.18 + 0.12 * q, 0.12); sfxBurst(0.28, 900, 2600, 0.12 + 0.1 * q, 'bandpass', 1.2); }   // el canto suelta el agua y sale volando
function sfxUpdate() {
  if (!SFX.ctx) return;
  const C = SFX.ctx, t = C.currentTime, R = RIDER;
  const riding = (R.state === 'ride' || R.state === 'start') && !GAME.paused;
  const lat = Math.abs(R.omega) * ROPE;                                      // velocidad lateral al carvear
  const cv = riding ? clamp(0.03 + lat / 9 * 0.14 + (R.grind ? 0.08 : 0) + (R.manualT ? 0.04 : 0), 0, 0.22) : 0;
  SFX.carve.g.gain.setTargetAtTime(cv, t, 0.08);
  SFX.carve.f.frequency.setTargetAtTime(1300 + lat * 120, t, 0.1);
  SFX.engine.gain.setTargetAtTime(GAME.paused ? 0 : (CAM.mode === 2 ? 0.07 : 0.035), t, 0.3);
  SFX.master.gain.setTargetAtTime(SFX.on && !GAME.paused ? (typeof VOL !== 'undefined' ? VOL.fx / 100 : 0.9) : 0, t, 0.05);
}
addEventListener('pointerdown', sfxInit, { capture: true }); addEventListener('keydown', sfxInit, { capture: true });
document.addEventListener('visibilitychange', () => { if (!SFX.ctx) return; if (document.hidden) SFX.ctx.suspend(); else SFX.ctx.resume(); });

// =====================================================================================
//  MÓDULOS DE WAKE PARK en el recorrido: 2 rampas (kicker) y 2 barandillas (flat bar), flotando junto a la estela.
//  Medidas típicas: kicker de 5 m de largo, 3 m de ancho y 1,4 m de alto; flat bar de 12 m con el tubo a 0,8 m
//  Para la barandilla: ollie antes de llegar y, encima, el botón GRIND; arriba sale la barra de equilibrio
// =====================================================================================
const MODULES = [
  { type: 'kicker', x: 260, z: -120 + 9, dir: 1, L: 5, W: 3, H: 1.4 },
  { type: 'rail', x: 470, z: -120 - 9, dir: 1, L: 12, H: 0.8 },
  { type: 'kicker', x: 470, z: -310 - 9, dir: -1, L: 5, W: 3, H: 1.4 },
  { type: 'rail', x: 240, z: -310 + 9, dir: -1, L: 12, H: 0.8 },
];
function modLocal(m, p) { return { u: (p.x - m.x) * m.dir, v: p.z - m.z }; }
{
  const floatM = MAT(0x1f6fb5, 0.55), topM = MAT(0x26292d, 0.6), sideM = MAT(0xf2f2ee, 0.6), pipeM = MAT(0xf2c21b, 0.35, 0.6), legM = MAT(0xd8dadc, 0.4, 0.6);
  const logo = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8202a'; c.font = 'italic 900 70px Arial Black, sans-serif'; c.fillText('TATANKA', 40, 92); });
  for (const m of MODULES) {
    const g = new T.Group(); g.position.set(m.x, 0, m.z); g.rotation.y = m.dir > 0 ? 0 : Math.PI; world.add(g);
    if (m.type === 'kicker') {
      // perfil curvo de la rampa (sube hacia +x) extruido a lo ancho
      const sh = new T.Shape(); sh.moveTo(-m.L / 2, -0.25);
      for (let i = 0; i <= 16; i++) { const k = i / 16; sh.lineTo(-m.L / 2 + k * m.L, Math.pow(k, 1.7) * m.H); }
      sh.lineTo(m.L / 2, -0.25); sh.lineTo(-m.L / 2, -0.25);
      const geo = new T.ExtrudeGeometry(sh, { depth: m.W, bevelEnabled: false }); geo.translate(0, 0, -m.W / 2);
      const k = new T.Mesh(geo, [topM, sideM]); k.castShadow = true; k.receiveShadow = true; g.add(k);
      const lg = new T.Mesh(new T.PlaneGeometry(2.4, 0.6), MAT(0xffffff, 0.6, 0, { map: logo })); lg.position.set(m.L * 0.18, 0.45, m.W / 2 + 0.01); g.add(lg);
      const lg2 = lg.clone(); lg2.rotation.y = Math.PI; lg2.position.z = -m.W / 2 - 0.01; g.add(lg2);
      for (const zz of [-m.W / 2 + 0.4, m.W / 2 - 0.4]) box(m.L + 0.4, 0.5, 0.7, floatM, 0, -0.1, zz, g);   // flotadores azules
    } else {
      const pipe = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, m.L, 14), pipeM); pipe.rotation.z = Math.PI / 2; pipe.position.y = m.H; pipe.castShadow = true; g.add(pipe);
      for (let x = -m.L / 2 + 0.6; x <= m.L / 2 - 0.5; x += 2.7) {
        rod(V3(x, 0.15, 0), V3(x, m.H - 0.05, 0), 0.05, legM, g);
        box(1.2, 0.45, 1.2, floatM, x, -0.05, 0, g);
      }
      box(m.L, 0.12, 0.5, MAT(0x2a2d31, 0.6), 0, 0.15, 0, g);    // la viga que une los flotadores
    }
  }
}
// barra de equilibrio del grind
{ const st = document.createElement('style'); st.textContent = `
  #balBar { position: absolute; left: 50%; top: calc(64px + env(safe-area-inset-top)); transform: translateX(-50%); width: 210px; height: 16px; border-radius: 9px;
    background: linear-gradient(90deg, #ff5a4e 0 14%, #ffc56b 14% 32%, #c3f53a 32% 68%, #ffc56b 68% 86%, #ff5a4e 86%); border: 2px solid #fff; display: none; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
  #balBar i { position: absolute; top: -6px; width: 4px; height: 24px; margin-left: -2px; background: #fff; border-radius: 2px; box-shadow: 0 0 4px #000; left: 50%; }
  #balBar b { position: absolute; top: -20px; left: 0; right: 0; text-align: center; font: 800 11px system-ui, sans-serif; letter-spacing: .14em; text-shadow: 0 1px 3px #000; }
  #stR.grind .knob { background: rgba(255,153,0,.85) !important; border-color: #fff !important; color: #fff; font-size: 10px !important; }`; document.head.appendChild(st); }
const balBar = document.createElement('div'); balBar.id = 'balBar'; balBar.innerHTML = '<b>EQUILIBRIO</b><i></i>'; $('hud').appendChild(balBar);
function startRail(m) {
  const R = RIDER; R.state = 'rail'; R.air = null; R.vy = 0; R.omega = 0; setLandRing(0, false);
  R.rail = { m, t: 0, t0: performance.now(), bal: rnd(-0.12, 0.12), bv: rnd(-0.3, 0.3) };
  balBar.style.display = 'block'; say('BOARDSLIDE', '', 1);
  sfxThump(160, 0.25, 0.1); sfxBurst(0.25, 2600, 1800, 0.08, 'bandpass', 2);   // el golpe metálico al caer en el tubo
}
function endRail(ollie) {
  const R = RIDER, rl = R.rail; R.rail = null; balBar.style.display = 'none';
  const rep = R.history.Rail || 0; R.history.Rail = rep + 1;
  const pts = Math.round((150 + 350 * Math.min(rl.t, 2.5) + (ollie ? 200 : 0)) * Math.pow(0.8, rep) / 10) * 10;
  R.score += pts; $('score').textContent = R.score.toLocaleString('es-ES');
  REC.bestTrickPts < pts && (REC.bestTrickPts = pts, REC.bestTrick = 'Boardslide');
  R.state = 'ride'; pop(ollie ? 0.8 : 0.1, ollie ? 'ollie' : 'hop');
  say(`Boardslide${ollie ? ' to Ollie' : ''}<small>+${pts.toLocaleString('es-ES')}</small>`, '', 1.8);
}
function updateRail(dt, S) {
  const R = RIDER, rl = R.rail, m = rl.m; rl.t += dt;
  R.y = m.H + 0.04; R.vy = 0; R.omega = 0;
  // equilibrio: se va solo hacia un lado (cada vez más) y se corrige con el círculo izquierdo
  rl.bv += (rnd(-1, 1) * 2.4 + rl.bal * 2.2 - S.L.x * 4.2 * (CAM.mode === 2 ? -1 : 1)) * dt; rl.bv *= 1 - 1.2 * dt; rl.bal += rl.bv * dt;
  balBar.querySelector('i').style.left = (50 + clamp(rl.bal, -1, 1) * 50) + '%';
  R.lean = lerp(R.lean, rl.bal * 0.8, clamp(dt * 8, 0, 1)); R.crouch = lerp(R.crouch, 0.5, clamp(dt * 6, 0, 1));
  const { u, v } = modLocal(m, R.pos);
  if (Math.abs(rl.bal) > 1) { R.rail = null; balBar.style.display = 'none'; fall('¡TE HAS CAÍDO DEL RAIL!'); return; }
  // ollie para salir: una pulsación NUEVA (soltar el GRIND con el que entraste no cuenta)
  if (S.R.rel && !S.R.rel.circled && Math.hypot(S.R.rel.x, S.R.rel.y) < 0.35 && IN.R.t0 > rl.t0) { endRail(true); return; }
  if (u > m.L / 2 || Math.abs(v) > 1.4) endRail(false);
}
// en el aire: ¿hay una barandilla debajo para entrar en grind?
function railBelow() {
  const R = RIDER;
  for (const m of MODULES) {
    if (m.type !== 'rail') continue;
    const { u, v } = modLocal(m, R.pos);
    if (u > -m.L / 2 + 0.3 && u < m.L / 2 - 1.2 && Math.abs(v) < 0.9 && R.y > m.H - 0.3 && R.y < m.H + 2.2) return m;
  }
  return null;
}
// en el agua: ¿estamos subiendo una rampa?
function kickerUnder() {
  const R = RIDER;
  for (const m of MODULES) {
    if (m.type !== 'kicker') continue;
    const { u, v } = modLocal(m, R.pos);
    if (u > -m.L / 2 && u < m.L / 2 + 0.3 && Math.abs(v) < m.W / 2 + 0.2) return { m, u, h: u >= m.L / 2 ? m.H : Math.pow((u + m.L / 2) / m.L, 1.7) * m.H };
  }
  return null;
}

// =====================================================================================
//  EL RIDER: cuerda, carving, pop, aire, trucos, aterrizaje y caídas
// =====================================================================================
let ROPE = 22.9;   // 75 pies, como en Pocket Shredders (online: cada uno con un largo distinto)
const RIDER = {
  state: 'ride', theta: 0.05, omega: 0, y: 0, vy: 0, pos: V3(), prevPos: V3(), vel: V3(),
  sw: false, yaw: 0, yawAnim: 0, edge: 0, crouch: 0.35, lean: 0,
  charging: false, prevS: 0, prevU: 2, lateWin: 0, lateQ: 0,
  air: null, spaceFlick: 0, ollieArm: 0, fallT: 0, startT: 0,
  armed: false, wrapped: 0, otherHand: false,
  banger: 0, bangerOn: false, twoUp: 0, rollers: null, score: 0, history: {},
};
const tmp = { a: V3(), b: V3(), c: V3(), n: V3(), q: new T.Quaternion(), q2: new T.Quaternion(), m: new T.Matrix4(), e: new T.Euler(), p: {} };
const boatPose = { x: 0, z: 0, hx: 0, hz: 1 };
const towW = V3(), boatVel = V3();

function trailDir(out) {
  // dirección desde el punto de remolque hacia donde estaba la barca hace ~20 m (la cuerda sigue la estela)
  pathAt(BOAT.s - BOAT.transom - 19, tmp.p);
  out.set(tmp.p.x - towW.x, 0, tmp.p.z - towW.z).normalize();
  return out;
}
function riderFromTheta(theta, out) {
  const d = trailDir(tmp.a), px = -d.z, pz = d.x;
  const Lh = Math.sqrt(Math.max(1, ROPE * ROPE - 1.4 * 1.4));
  return out.set(towW.x + Lh * (Math.cos(theta) * d.x + Math.sin(theta) * px), 0, towW.z + Lh * (Math.cos(theta) * d.z + Math.sin(theta) * pz));
}
function say(html, cls = '', sec = 1.6) { const el = $('trick'); el.innerHTML = html; el.className = cls; el.style.opacity = 1; clearTimeout(say.t); say.t = setTimeout(() => el.style.opacity = 0, sec * 1000); }
function msg(t, sec = 0) { const el = $('msg'); el.textContent = t; el.style.opacity = t ? 1 : 0; clearTimeout(msg.t); if (sec) msg.t = setTimeout(() => el.style.opacity = 0, sec * 1000); }
function landLabel(text, cls) { const el = $('landTxt'); el.textContent = text; el.className = cls; el.style.opacity = 1; clearTimeout(landLabel.t); landLabel.t = setTimeout(() => el.style.opacity = 0, 1500); }
function showPop(pos01, rollerPos) {
  $('popMk').style.left = `calc(${(clamp(pos01, 0, 1) * 100).toFixed(1)}% - 2px)`;
  const rm = $('popRoll'); rm.style.display = rollerPos === undefined ? 'none' : 'block';
  if (rollerPos !== undefined) rm.style.left = `calc(${(clamp(rollerPos, 0, 1) * 100).toFixed(1)}% - 5px)`;
  const el = $('pop'); el.style.opacity = 1; clearTimeout(showPop.t); showPop.t = setTimeout(() => el.style.opacity = 0, 1700);
}
function chestWorld(out) { return out.set(0, 0, 1).applyQuaternion(riderRoot.quaternion).setY(0).normalize(); }
// lado de la pantalla hacia el que viaja el rider (para «hacia donde vas / al contrario»)
function travelScreenSign() {
  // como si se mirara desde detrás (en la lateral la derecha de la pantalla no sirve), y al revés desde la barca
  const d = trailDir(tmp.n), px = -d.z, pz = d.x, lat = RIDER.vel.x * px + RIDER.vel.z * pz;
  return (Math.sign(lat) || 1) * (CAM.mode === 2 ? -1 : 1);
}

// cambio de pie en el agua (surface 180): la tabla gira sobre el agua
function surface180() {
  const R = RIDER; if (R.state !== 'ride') return;
  R.sw = !R.sw; R.yawAnim += Math.PI; say('Surface 180', '', 0.9);
}

// grind en la cresta de la estela: la tabla se cruza y resbala por el labio; cuanto más dura, más puntos
function startGrind() {
  const R = RIDER; if (R.state !== 'ride') return;
  R.grind = { t: 0, dir: Math.sign(R.omega || 1) * (R.sw ? -1 : 1) };
  say('WAKE GRIND', '', 0.9);
}
function endGrind() {
  const R = RIDER, g = R.grind; if (!g) return; R.grind = null;
  if (g.t < 0.25) return;
  const rep = R.history['Wake Grind'] || 0; R.history['Wake Grind'] = rep + 1;
  const pts = Math.round((120 + 320 * Math.min(g.t, 2.2)) * Math.pow(0.75, rep) / 10) * 10;
  R.score += pts; $('score').textContent = R.score.toLocaleString('es-ES');
  say(`Wake Grind<small>+${pts.toLocaleString('es-ES')}</small>`, '', 1.6);
}

function endManual() {
  const R = RIDER, t = R.manualT || 0; R.manualT = 0; R.manualSaid = false;
  if (t < 0.5) return;
  const rep = R.history.Manual || 0; R.history.Manual = rep + 1;
  const pts = Math.round((80 + 180 * Math.min(t, 4)) * Math.pow(0.75, rep) / 10) * 10;
  R.score += pts; $('score').textContent = R.score.toLocaleString('es-ES');
  say(`Manual<small>+${pts.toLocaleString('es-ES')}</small>`, '', 1.5);
}
function pop(q, kind, popPos) {
  sfxPop(kind === 'hop' ? 0.1 : q);
  if (RIDER.manualT) endManual();   // manual to ollie
  const R = RIDER, f = wakeFrame(R.pos.x, R.pos.z), A = wakeAmp(f.d) / WAKE.amp, S = R.lastS;
  const vlat = Math.abs(R.omega) * ROPE;
  const big = R.bangerOn ? 1.15 : 1;
  // Double Up: soltar justo en la cresta de uno de los rodillos grandes
  let du = false, rollerPos;
  if (R.rollers && kind === 'wake') {
    let best = 99; for (const d of R.rollers.d) best = Math.min(best, Math.abs(d - f.d) < Math.abs(best) ? d - f.d : best);
    rollerPos = clamp(0.5 + best / 6, 0, 1);
    if (Math.abs(best) < 1.6) du = true;
  }
  R.vy = (1.7 + 5.0 * q * clamp(A, 0.25, 1.2) * clamp(vlat / 6, 0.3, 1.2)) * big * (du ? 1.5 : 1);
  if (kind === 'ollie') R.vy = 2.4 + 1.3 * q + (R.rollers ? 1 : 0);
  if (kind === 'hop') R.vy = 1.2;
  if (kind === 'kicker') {   // la rampa lanza según la velocidad con la que se llega (inercia), más el OLLIE en la rampa
    const m = RIDER.onKicker || (kickerUnder() || {}).m, along = m ? Math.max(0, R.vel.x * m.dir) : 10;
    R.vy = clamp(6 + 0.45 * along, 8.5, 12.5) + 2.2 * (R.kickBonus || 0) + (R.bangerOn ? 1 : 0);
  }
  R.state = 'air';
  chestWorld(tmp.c);
  // de puntas si se va hacia el lado al que mira el pecho (respecto a la estela; la tabla apunta donde va, así que se mira de lado)
  const dTr = trailDir(tmp.trd || (tmp.trd = V3())), lpx = -dTr.z, lpz = dTr.x;
  const toe = Math.sign(tmp.c.x * lpx + tmp.c.z * lpz) === Math.sign(R.vel.x * lpx + R.vel.z * lpz);
  const heel = !toe;
  const air = {
    t: 0, t0: performance.now(), spin: 0, spinDir: 0, spinning: false, maxSpinAbs: 0, rewound: false,
    flip: 0, flipAxis: 'x', flipDir: 0, flipping: false, flipDone: false, flipName: '', flipKind: '',
    grab: null, grabFirst: null, grabT: 0, grabs: [], tweak: null, tweakT: 0, other: R.otherHand,
    baseQ: riderRoot.quaternion.clone(), toe, kind, quality: q, du, wrapped: R.wrapped, autoSpin: 0,
    raley: 0, raleyOn: false, sbend: 0, sbendOn: false, whirly: false, maxFlips: 1 + (R.bangerOn ? 1 : 0) + (du ? 1 : 0),
  };
  if (kind === 'wake') {
    if (R.armed && S && S.R.y < -0.5) { air.raleyOn = true; R.armed = false; }
    else if (R.armed && S && S.R.y > 0.5 && heel) { air.whirly = true; air.flipName = 'Tantrum'; air.flipAxis = 'z'; air.flipDir = 1; air.flipping = true; air.spinDir = 1; air.autoSpin = TAU; R.armed = false; }
    if (R.wrapped) { air.autoSpin = TAU * R.wrapped; air.spinDir = R.wrapped; R.wrapped = 0; }
  }
  R.otherHand = false;
  R.air = air;
  if (popPos !== undefined) showPop(popPos, rollerPos);
  if (du) say('DOUBLE UP', 'du', 1.2);
  if (kind === 'wake') emitBurst(R.pos.x, R.pos.z, 26, 2.2);
}
function emitBurst(x, z, n, up) {
  for (let i = 0; i < n; i++) emit(x + rnd(-0.4, 0.4), 0.1, z + rnd(-0.4, 0.4), rnd(-2, 2), rnd(1, up * 1.6), rnd(-2, 2), rnd(0.18, 0.4), rnd(0.6, 1.1));
}
function getUp() {
  const R = RIDER; R.state = 'start'; R.startT = 0; R.theta = 0.05; R.omega = 0; R.y = 0; R.vy = 0; R.armed = false; R.wrapped = 0; msg('');
}
function fall(reason) {
  sfxSplash(1.5);
  const R = RIDER; R.state = 'fallen'; R.fallT = 0; R.banger = 0; R.bangerOn = false; R.twoUp = 0; updateMeters();
  R.fallVel = R.vel.clone(); R.fallSpin = rnd(-3, 3);
  say(`<span class="fall">${reason || '¡AL AGUA!'}</span>`, '', 1.8);
  landLabel('FALL', 'fall');
  emitBurst(R.pos.x, R.pos.z, 60, 3);
  setTimeout(() => { if (RIDER.state === 'fallen') msg(IS_MOBILE ? 'TOCA PARA VOLVER' : 'ENTER O TOCA PARA VOLVER'); }, 1100);
}
addEventListener('pointerdown', () => { if (GAME.running && RIDER.state === 'fallen' && RIDER.fallT > 1.0) getUp(); });

// ---- grabs: dirección del stick → grab (mostrado heelside con el pie izquierdo delante; toeside y switch los cambian)
function grabFor(x, y, swap) {
  if (Math.hypot(x, y) < 0.5) return null;
  let g = Math.abs(y) > Math.abs(x) ? (y > 0 ? 'indy' : 'stale') : (x < 0 ? 'nose' : 'tail');
  if (swap) g = { indy: 'stale', stale: 'indy', nose: 'tail', tail: 'nose' }[g];
  return g;
}
const GRAB_NAME = { indy: 'Indy', mute: 'Mute', melon: 'Melon', nose: 'Nose', tail: 'Tail', stale: 'Stalefish', japan: 'Japan Air', method: 'Method', fashion: 'Fashion Air' };
const OTHER_NAME = { indy: 'Canadian Bacon', nose: 'Crail', tail: 'Seatbelt', stale: 'Roast Beef' };
// el botón GRAB (el de OLLIE en el aire) elige uno de estos cada salto, al azar
const BTN_GRABS = ['indy', 'mute', 'melon', 'stale', 'nose', 'tail', 'method', 'japan', 'indy', 'method'];
function grabLabel(a) {
  const g = a.grabFirst; if (!g) return '';
  let n = a.other && OTHER_NAME[g] ? OTHER_NAME[g] : GRAB_NAME[g];
  if (a.tweak) n += ' ' + a.tweak;
  return n;
}
// dificultad de cada cosa (para los puntos y para llenar el Banger)
function trickValue(a, halfTurns, flips) {
  let v = a.kind === 'kicker' ? 180 : a.kind === 'wake' ? 100 : (a.kind === 'ollie' ? 30 : 15);
  v += Math.abs(halfTurns) * 120;
  if (flips) v += (a.flipKind === 'tip' ? 600 : 480) * (Math.abs(flips) === 1 ? 1 : Math.abs(flips) === 2 ? 1.9 : 2.8);
  if (a.didRaley) v += 380;
  if (a.sbend) v += 900;
  if (a.whirly) v += 500;
  if (flips && halfTurns) v += 280;                 // mobe: spin e invert a la vez
  if (a.rewound) v += 200;
  if (a.grabFirst) v += 100 + Math.min(a.grabT, 1.5) * 120 + (a.tweak ? 80 : 0);
  if (a.other) v *= 1.12;
  if (a.wrapped) v *= 0.94;                         // un wrapped start resta un 6 %
  if (a.du) v *= 1.3;
  return v;
}
function trickName(a, halfTurns, flips, deg) {
  const edge = a.toe ? 'TS' : 'HS', g = grabLabel(a);
  let n = '';
  if (a.sbend) n = 'S-Bend' + (deg === 180 ? ' to Blind' : deg === 360 ? ' Back 3' : '');
  else if (a.whirly) n = deg > 360 ? `Whirly ${deg}` : 'Whirlybird';
  else if (a.didRaley) n = 'Raley' + (deg ? ` ${deg}` : '');
  else if (flips) {
    const mult = Math.abs(flips) === 2 ? 'Double ' : Math.abs(flips) === 3 ? 'Triple ' : '';
    if (halfTurns && a.flipName === 'Backroll' && deg === 360) n = mult + 'Back Mobe';
    else if (halfTurns && a.flipName === 'Front Roll' && deg === 360) n = mult + 'Front Mobe';
    else n = mult + a.flipName + (deg ? (deg === 180 ? ' to Blind' : ` ${deg}`) : '');
  } else if (a.rewound) n = `${edge} Rewind`;
  else if (deg) n = `${edge} ${a.spinDir > 0 ? 'FS' : 'BS'} ${deg}`;
  else if (g) n = '';
  else n = a.kind === 'ollie' ? 'Ollie' : a.kind === 'kicker' ? 'Kicker Air' : (a.kind === 'wake' ? `${edge} Air` : 'Hop');
  if (a.wrapped && !a.whirly) n = 'Wrapped ' + n;
  if (g) n = (n ? n + ' ' : '') + g;
  if (a.du) n = 'Double Up ' + n;
  return n.trim();
}

function land() {
  const R = RIDER, a = R.air;
  sfxSplash(0.35 + Math.min(1, Math.abs(R.vy) / 9) * 0.8);
  R.armed = false;   // el tip flip armado no pasa al siguiente salto
  R.lastLand = { spin: +a.spin.toFixed(2), flip: +a.flip.toFixed(2), t: +a.t.toFixed(2), spinning: a.spinning, flipping: a.flipping };
  const halfTurns = Math.round(a.spin / Math.PI), spinErr = Math.abs(a.spin - halfTurns * Math.PI);
  const flips = Math.round(a.flip / TAU), flipErr = Math.abs(a.flip - flips * TAU);
  const holding = a.spinning || a.flipping || a.sbendOn;
  const notUnder = a.raley > 0.35;                       // de un raley hay que volver a tener la tabla debajo
  let result;
  if (flipErr > 0.8 || spinErr > 0.8 || notUnder && a.raley > 0.8 || (holding && (flipErr > 0.45 || spinErr > 0.45))) result = 'fall';
  else if (spinErr < 0.26 && flipErr < 0.3 && !a.grab && !holding && !notUnder) result = 'clean';
  else result = 'sketchy';
  setLandRing(0, false);
  if (result === 'fall') { fall(flipErr > 0.8 ? '¡DE CABEZA!' : '¡DE LADO!'); return; }
  // algunas veces (no siempre), tras un giro limpio, cae con la maneta por la espalda y la cambia de mano
  if (result === 'clean' && halfTurns !== 0 && rnd() < 0.35) { HANDS.back = { t: 0, hold: rnd() < 0.5 ? 'F' : 'B' }; HANDS.target = 0; HANDS.one = 0; }
  const deg = Math.abs(halfTurns) * 180;
  if (a.kind === 'hop' && !flips && !halfTurns && !a.grabFirst) { R.state = 'ride'; R.vy = 0; R.air = null; return; }   // un bote sin truco no puntúa
  const name = trickName(a, halfTurns, flips, deg);
  R.lastTrickName = name;
  const value = trickValue(a, halfTurns, flips);
  let pts = value * (0.7 + 0.3 * a.quality);
  if (result === 'sketchy') pts *= 0.9;                  // Sketchy: −10 %
  const rep = R.history[name] || 0; R.history[name] = rep + 1; pts *= Math.pow(0.75, rep);   // cada repetición vale el 75 %
  pts = Math.round(pts / 10) * 10;
  R.score += pts; $('score').textContent = R.score.toLocaleString('es-ES');
  if (pts > (REC.bestTrickPts || 0)) { REC.bestTrickPts = pts; REC.bestTrick = name; }
  SESSION.tricks++; if (pts > SESSION.bestPts) { SESSION.bestPts = pts; SESSION.best = name; }
  // Banger: los trucos de estela lo llenan (los difíciles más rápido, los ollies casi nada)
  if (a.kind === 'wake' || a.kind === 'ollie') R.banger = Math.min(1, R.banger + (a.kind === 'ollie' ? 0.02 : clamp(value / 2400, 0.05, 0.45)));
  if (R.banger >= 1 && !R.bangerOn) { R.bangerOn = true; msg('BANGER', 1.2); }
  // 2UP: solo los trucos de estela hechos con el Banger encendido lo cargan
  if (R.bangerOn && a.kind === 'wake' && !R.rollers) {
    R.twoUp = Math.min(1, R.twoUp + clamp(value / 2200, 0.08, 0.5));
    if (R.twoUp >= 1) startRollers();
  }
  updateMeters();
  say(`${name}<small>+${pts.toLocaleString('es-ES')}</small>`, '', 1.9);
  landLabel(result === 'clean' ? 'CLEAN LANDING' : 'SKETCHY −10%', result);
  if (halfTurns % 2) R.sw = !R.sw;
  DYN.absVel += 1.6 + Math.min(2, -R.vy * 0.15);   // las piernas se comen el golpe
  R.state = 'ride'; R.vy = 0; R.air = null; R.y = 0;
  emitBurst(R.pos.x, R.pos.z, 34, 1.6);
}
function updateMeters() {
  $('banger').style.width = (RIDER.banger * 100).toFixed(0) + '%';
  $('banger').classList.toggle('on', RIDER.bangerOn);
  $('twoup').style.width = (RIDER.twoUp * 100).toFixed(0) + '%';
}
// Double Up: llega una tanda de rodillos grandes que cruzan la estela hacia el rider
function startRollers() { RIDER.rollers = { t: 0, d: [0, 0, 0] }; msg('¡VIENE EL DOUBLE UP!', 1.6); }
function updateRollers(dt) {
  const R = RIDER;
  if (!R.rollers) { U.uRoll.value.set(-99, -99, -99, 0); return; }
  const r = R.rollers; r.t += dt;
  r.d = [0, 1, 2].map(k => 6 + r.t * 4.2 - k * 7.5);
  U.uRoll.value.set(r.d[0], r.d[1], r.d[2], 0.42 * smooth(0, 1.5, r.t));
  if (r.d[2] > 40) { R.rollers = null; R.twoUp = 0; updateMeters(); }
}

function updateRider(dt, t) {
  const R = RIDER, S = readSticks(); R.lastS = S;
  if (NET.pendingFall) { const why = NET.pendingFall; NET.pendingFall = null; pushFall(why); }
  if (R.pendingRail && R.state === 'air') { const m = R.pendingRail; R.pendingRail = null; startRail(m); }   // empujón (se aplica al empezar el fotograma)
  drawSticks(S);
  R.prevPos.copy(R.pos);
  if (R.bangerOn) { R.banger -= dt * 0.025; if (R.banger < 0.75) { R.bangerOn = false; } updateMeters(); }
  // --- horizontal: la cuerda manda (péndulo detrás de la barca)
  if (R.state !== 'fallen') {
    if (R.state === 'rail') R.omega = 0;
    else if (R.grind) R.omega *= Math.max(0, 1 - dt * 7);
    else if (R.state === 'ride' || R.state === 'start') {
      const c = R.state === 'start' ? 0 : S.L.x;          // solo cuenta lo lateral
      // el stick va según la pantalla: a la derecha = hacia la derecha de la cámara (en cualquier pie)
      const d = trailDir(tmp.n); tmp.c.set(1, 0, 0).applyQuaternion(camera.quaternion);
      const proj = -d.z * tmp.c.x + d.x * tmp.c.z;
      const side = CAM.mode === 2 ? -1 : (Math.abs(proj) > 0.4 ? Math.sign(proj) : 1);   // desde la barca se ve al revés; en la lateral, como desde detrás
      const target = c * 0.4 * side - R.theta * 0.16;
      R.omega += (target - R.omega) * clamp(dt * 1.8, 0, 1);
    } else R.omega *= 1 - 0.15 * dt;
    R.theta = clamp(R.theta + R.omega * dt, -1.0, 1.0);
    if (Math.abs(R.theta) >= 1.0) R.omega *= 0.5;
    riderFromTheta(R.theta, R.pos);
  } else {
    R.fallT += dt; R.fallVel.multiplyScalar(1 - 1.6 * dt); R.pos.addScaledVector(R.fallVel, dt);
  }
  R.vel.subVectors(R.pos, R.prevPos).divideScalar(Math.max(dt, 1e-4));
  const f = wakeFrame(R.pos.x, R.pos.z), sH = wavesH(R.pos.x, R.pos.z, t) + wakeProfile(f.d, f.s);
  const r = wakeR(f.d), u = Math.abs(f.s) / r, dsdt = (f.s - R.prevS) / Math.max(dt, 1e-4); R.prevS = f.s;
  const inward = f.s * dsdt < 0, A = wakeAmp(f.d);

  if (R.state === 'start') {
    R.startT += dt; R.y = sH; R.crouch = lerp(1, 0.4, ss(R.startT / 1.4));
    if (R.startT > 1.4) R.state = 'ride';
  } else if (R.state === 'ride') {
    const kk = kickerUnder();
    if (kk) {   // subiendo la rampa: la tabla va por encima de ella y en el borde sale volando
      R.y = Math.max(lerp(R.y, sH, clamp(dt * 14, 0, 1)), kk.h + 0.03); R.onKicker = kk.m;
      if (kk.u >= kk.m.L / 2 - 0.05) { R.onKicker = null; pop(1, 'kicker'); R.kickBonus = 0; }
    } else { R.onKicker = null; R.kickBonus = 0; R.y = lerp(R.y, sH, clamp(dt * 14, 0, 1)); }
    // --- en el agua: tap R arma Flip/Raley, círculo con R = mano envuelta, círculo con L = surface 180, tap L = la otra mano
    if (S.R.circle) { R.wrapped = R.wrapped && Math.sign(S.R.circle) !== R.wrapped ? 0 : S.R.circle; say(R.wrapped ? 'Handle wrapped' : 'Unwrapped', '', 0.9); }
    if (S.L.circle) surface180();
    // círculo izquierdo hacia arriba: cambia la punta de la tabla (surface 180, se invierten los pies)
    const upL = S.L.y > 0.7 && S.L.y > Math.abs(S.L.x) * 1.5;
    if (upL && !R.upHeld) surface180();
    R.upHeld = upL;
    // círculo izquierdo hacia abajo: manual (como en el skate): la cola clavada en el agua y la punta levantada
    const downL = S.L.y < -0.6 && -S.L.y > Math.abs(S.L.x);
    if (downL && R.state === 'ride') { R.manualT = (R.manualT || 0) + dt; if (R.manualT > 0.3 && !R.manualSaid) { R.manualSaid = true; say('Manual', '', 0.8); } }
    else if (R.manualT) endManual();
    if (S.L.tap || IN.kbOther) R.otherHand = !R.otherHand && !IN.kbOther ? true : (IN.kbOther ? true : false);
    // --- pop: mantener el centro del stick derecho (se agacha) y soltarlo. En la cresta salta la estela, en plano es un ollie.
    //     Soltarlo arrastrado abajo = raley, arriba (de talones) = whirly
    const hold = S.R.hold;
    const onOuter = u > 0.94 && u < 1.75 && inward && A > 0.12, onInner = u > 0.5 && u < 1.08 && !inward && A > 0.12;
    if (hold) R.ollieArm = Math.min(1, R.ollieArm + dt * 2.5);
    if (S.R.rel && !S.R.rel.circled) {
      // pop() mira hacia dónde se soltó: abajo raley, arriba whirly, de lado queda armado el tip flip (aro azul en el aire)
      R.armed = Math.abs(S.R.rel.y) > 0.5 || Math.abs(S.R.rel.x) > 0.5; S.R.y = S.R.rel.y;
      const q0 = clamp(R.ollieArm, 0.3, 1);
      if (R.grind) { endGrind(); pop(0.85, 'wake', 0.5); }
      else if (R.onKicker) {   // OLLIE soltado subiendo la rampa: no es un ollie pequeño, se suma al salto del borde (mejor cuanto más arriba)
        const kq = kickerUnder(), up = kq ? clamp((kq.u + kq.m.L / 2) / kq.m.L, 0, 1) : 1;
        R.kickBonus = Math.max(R.kickBonus || 0, q0 * (0.5 + 0.5 * up));
      }
      else if (onOuter) { const q = clamp(1 - (u - 1) / 0.75, 0, 1); pop(clamp(q, 0.2, 1), 'wake', 0.5 - 0.5 * (1 - q)); }
      else if (onInner) { const q = clamp((u - 0.5) / 0.5, 0, 1); pop(clamp(q, 0.2, 1), 'wake', 0.5 - 0.5 * (1 - q)); }
      else if (R.lateWin > 0) { pop(R.lateQ, 'wake', 0.5 + 0.5 * (1 - R.lateQ)); }
      else pop(q0, 'ollie');
      R.ollieArm = 0; R.lateWin = 0;
      if (R.state !== 'air') R.armed = false;
    } else if (!hold) R.ollieArm = Math.max(0, R.ollieArm - dt * 3);
    // --- grind: subir la cara de la estela y, antes de pasar la cresta, volver a bajar por el mismo lado
    // (se nota en el stick: subiendo la cara se lleva hacia un lado; si se cambia al otro cerca de la cresta, grind)
    const nearCrest = u > 0.75 && u < 1.3 && A > 0.15, stk = Math.abs(S.L.x) > 0.5 ? Math.sign(S.L.x) : 0;
    if (R.state === 'ride' && !R.grind && R.climb && nearCrest && stk && stk !== R.climbStick && !hold) startGrind();
    if (inward && u > 0.95 && u < 1.8) { R.climb = true; if (stk) R.climbStick = stk; }
    else if (u > 1.8 || u < 0.75 || (!inward && !R.grind)) R.climb = false;
    if (R.grind) {
      const g = R.grind; g.t += dt;
      R.y = sH + 0.03;
      if (!nearCrest || g.t > 2.2 || (g.t > 0.5 && Math.abs(S.L.x) < 0.2)) { endGrind(); R.climb = false; }   // se acaba al soltar la dirección o al salir de la cresta
    }
    if (R.state === 'ride') {
      const crossed = (R.prevU - 1) * (u - 1) < 0 && A > 0.12;
      if (crossed && hold) { R.lateWin = 0.26; }
      else if (crossed && Math.abs(dsdt) > 2.5 && !R.lateWin && !R.grind) { pop(0.15, 'hop'); }
      if (R.lateWin > 0) {
        R.lateWin -= dt; R.lateQ = clamp(R.lateWin / 0.26, 0, 1) * 0.75;
        if (R.lateWin <= 0 && hold && R.state === 'ride') { pop(0.12, 'hop', 1); say('NO RELEASE', '', 1); R.ollieArm = 0; }
      }
    }
    R.charging = hold && R.state === 'ride';
    updateHands(dt);
    R.crouch = lerp(R.crouch, 0.48 + R.ollieArm * 0.35 + (R.charging ? 0.12 : 0), clamp(dt * 6, 0, 1));
  } else if (R.state === 'air') {
    const a = R.air; a.t += dt;
    // empujón: si en el aire te cruzas con otro rider que también salta, el OLLIE se pone rojo («EMPUJAR»)
    if (NET.pushTarget && S.R.rel && Math.hypot(S.R.rel.x, S.R.rel.y) < 0.35) doPush(NET.pushTarget);
    R.vy -= 9.8 * dt; R.y += R.vy * dt;
    const fast = R.bangerOn ? 1.25 : 1;
    const rx = S.R.x, ry = S.R.y, rr = Math.hypot(rx, ry);
    const diag = Math.abs(rx) > 0.42 && Math.abs(ry) > 0.42;
    // ---- raley: R abajo mantenido desde la salida; soltar trae la tabla de vuelta. S-Bend: media vuelta con R en el raley
    // botón RALEY (o la R del teclado): en el aire, si no hay otro truco a medias, empieza el raley
    if ((S.R.raleyBtn || S.R.raleyKey) && !a.raleyOn && !a.flipName && !a.spinning && !a.autoSpin && !a.grab && Math.abs(a.spin % Math.PI) < 0.05 && a.raley < 0.05 && !a.didRaley) { a.raleyOn = true; a.raleyAx = null; }
    if (a.raleyOn) {
      if (ry < -0.4 || S.R.raleyKey || S.R.raleyBtn) { a.raley = Math.min(1, a.raley + dt * 3.2); if (a.raley > 0.6) a.didRaley = true; }
      else { a.raleyOn = false; }
      if (S.R.circle && a.raley > 0.6 && !a.sbend) { a.sbend = 1; a.sbendOn = true; a.flipAxis = 'x'; a.flipDir = 1; a.flipName = 'S-Bend'; }
    } else a.raley = Math.max(0, a.raley - dt * 3.5);
    if (a.sbendOn) { a.flip += 7 * dt; if (a.flip >= TAU) { a.flip = TAU; a.sbendOn = false; } }
    // ---- spin con R arriba/abajo (más lejos = más rápido); al soltar acaba la media vuelta en curso. Rewind: volver hacia atrás
    if (a.autoSpin) {
      const st = 7.5 * fast * dt * Math.sign(a.autoSpin); a.spin += st; a.autoSpin -= st;
      if (Math.abs(a.autoSpin) < Math.abs(st)) { a.spin += a.autoSpin; a.autoSpin = 0; }
    }
    if (!a.raleyOn && !a.sbendOn && !a.autoSpin && Math.abs(ry) > 0.35 && !diag && Math.abs(ry) > Math.abs(rx)) {   // el dedo en ROLL no gira también
      const dir = Math.sign(ry);
      if (a.spinDir && dir !== a.spinDir && Math.abs(a.spin) > Math.PI * 0.45) a.rewinding = true;
      if (!a.spinDir) a.spinDir = dir;
      a.spinning = true; a.spin += dir * (4.6 + 4.2 * clamp((rr - 0.35) / 0.65, 0, 1)) * fast * dt;
      a.maxSpinAbs = Math.max(a.maxSpinAbs, Math.abs(a.spin));
      if (a.rewinding && Math.abs(a.spin) < 0.25) { a.rewound = true; a.spin = 0; }
    } else if (a.spinning && !diag) {
      a.spinning = false;
      const d = a.rewinding ? -a.spinDir : a.spinDir;
      const target = (d > 0 ? Math.ceil(a.spin / Math.PI - 0.08) : Math.floor(a.spin / Math.PI + 0.08)) * Math.PI;
      a.spinTarget = target;
    }
    if (!a.spinning && a.spinTarget !== undefined) {
      const st = 7 * fast * dt; a.spin = Math.abs(a.spinTarget - a.spin) < st ? a.spinTarget : a.spin + Math.sign(a.spinTarget - a.spin) * st;
    }
    // ---- invert con R a los lados (o en diagonal = mobe). Hacia donde vas o al contrario elige el flip.
    //      Armado (aro azul): tip flip, punta sobre cola. Mantener = doble (con Banger) o triple (con Double Up)
    const rollIn = !a.whirly && !a.raleyOn && !a.sbend && Math.abs(rx) > 0.45 && (Math.abs(rx) >= Math.abs(ry) || diag);
    if (rollIn) {
      if (!a.flipName && !a.flipDone) {
        const toward = Math.sign(rx) === travelScreenSign();
        if (R.armed) { a.flipKind = 'tip'; a.flipName = toward ? 'Front Flip' : 'Back Flip'; a.flipAxis = 'z'; a.flipDir = toward ? -1 : 1; R.armed = false; }
        else {
          a.flipKind = 'roll';
          a.flipName = a.toe ? (toward ? 'Front Roll' : 'Backroll') : (toward ? 'Tantrum' : 'Backroll');
          a.flipAxis = a.flipName === 'Tantrum' ? 'z' : 'x'; a.flipDir = a.flipName === 'Front Roll' ? -1 : 1;
        }
        if (diag && !a.spinDir) a.spinDir = Math.sign(ry);
        a.flipTurns = 1;
      }
      if (diag && !a.autoSpin) { a.spinning = true; a.spin += a.spinDir * 5.2 * fast * dt; }
    }
    // la vuelta, una vez empezada, se acaba sola y seguida (soltar el dedo no la para ni la echa atrás).
    // Seguir pulsando al pasar 3/4 de vuelta añade otra (doble con Banger, triple con Double Up)
    if (a.flipName && a.flipTurns && !a.flipDone && !a.sbend && !a.whirly) {
      a.flipping = true;
      if (rollIn && a.flipTurns < a.maxFlips && Math.abs(a.flip) > (a.flipTurns - 0.25) * TAU) a.flipTurns++;
      const ph = (Math.abs(a.flip) % TAU) / TAU;                    // arranca, acelera a media vuelta y frena para caer
      a.flip += a.flipDir * 7.6 * fast * (0.75 + 0.5 * Math.sin(Math.PI * ph)) * dt;
      if (Math.abs(a.flip) >= a.flipTurns * TAU) { a.flip = a.flipDir * a.flipTurns * TAU; a.flipping = false; a.flipDone = true; }
    }
    if (a.whirly) { a.flip = Math.min(TAU, a.flip + 6.5 * dt); if (a.flip >= TAU) a.flipping = false; if (ry < -0.4) { a.spin += 5 * fast * dt; } }
    // ---- grabs con L (y tweak: deslizar a otra dirección sin levantar el dedo). Teclado: Mayús+G y flechas
        let g = IN.kb.KeyG ? grabFor(S.L.x, S.L.y, a.toe !== R.sw) : null;   // en el móvil el grab es solo con el botón GRAB (el círculo izquierdo es para dirigir)
    // solo si se pulsa YA en el aire (el dedo que estaba agachando para saltar no cuenta)
    const freshPress = IN.R.on ? IN.R.t0 > a.t0 : (IN.kb.Space && (IN.spaceT0 || 0) > a.t0);
    R.railNear = railBelow();
    if (R.railNear && S.R.hold && freshPress && R.vy < 2.5) R.pendingRail = R.railNear;
    const centerHold = S.R.hold && freshPress && Math.abs(S.R.x) < 0.01 && Math.abs(S.R.y) < 0.01 && !NET.pushTarget && !R.railNear;
    if (!g && centerHold) {
      if (!a.btnGrab) a.btnGrab = BTN_GRABS[Math.floor(rnd(0, BTN_GRABS.length))];
      g = a.btnGrab;
    }
    if (IN.kb.KeyG && IN.kb.ShiftLeft || IN.kb.KeyG && IN.kb.ShiftRight) {
      const sq = IN.seq.join(',');
      if (/ArrowUp,ArrowRight/.test(sq)) g = 'japan'; else if (/ArrowDown,ArrowLeft/.test(sq)) g = 'method'; else if (/ArrowDown,ArrowRight/.test(sq)) g = 'fashion';
    }
    if (IN.kbOther) a.other = true;
    if (S.L.tap) a.other = !a.other;
    if (g) {
      if (!a.grabFirst) a.grabFirst = g;
      else if (g !== a.grab && a.grab && !a.tweak && GRAB_NAME[a.grabFirst] && !['japan', 'method', 'fashion'].includes(g)) {
        a.tweakT += dt;
        if (a.tweakT > 0.2) a.tweak = (S.L.y > 0.5 && ['indy', 'stale'].includes(a.grabFirst)) ? 'Tuck Knee' : 'Poke';
      }
      if (['japan', 'method', 'fashion'].includes(g)) a.grabFirst = g;
      a.grab = a.grab || g; a.grabT += dt;
      if (centerHold && a.grabT > 0.55 && !a.tweak && ['indy', 'mute', 'melon', 'stale'].includes(g)) a.tweak = rnd() < 0.5 ? 'Tweak' : 'Poke';   // aguantándolo: lo estira
      if (!a.grabs.includes(g)) a.grabs.push(g);
    } else { a.grab = null; }
    R.crouch = lerp(R.crouch, a.grab ? 1 : a.raley > 0.2 ? 0 : (a.flipping || a.flipName && a.flip % TAU) ? (a.flipKind === 'roll' && a.flipAxis === 'x' ? 0.28 : 0.75) : 0.62, clamp(dt * 8, 0, 1));   // en el roll, estirado (como en Pocket Shredders); en el tantrum, algo recogido
    // aro de aterrizaje del stick R: se llena con la rotación y se pone verde cuando la tabla está alineada
    const spinErr = Math.abs(a.spin - Math.round(a.spin / Math.PI) * Math.PI), flipErr = Math.abs(a.flip - Math.round(a.flip / TAU) * TAU);
    const prog = Math.max((Math.abs(a.spin) % Math.PI) / Math.PI, (Math.abs(a.flip) % TAU) / TAU);
    const ok = spinErr < 0.26 && flipErr < 0.3 && a.raley < 0.35;
    setLandRing(a.spin || a.flip || a.raley ? (ok ? 1 : prog) : 0, ok);
    if (R.y <= sH && R.vy < 0) land();
  } else if (R.state === 'rail') {
    updateRail(dt, S);
  } else if (R.state === 'fallen') {
    R.y = lerp(R.y, sH - 0.35, clamp(dt * 3, 0, 1));
  }
  R.prevU = u;
  if (R.spaceFlick > 0) R.spaceFlick -= dt;

  // --- orientación de la tabla
  const vh = tmp.b.copy(R.vel).setY(0);
  R.yawAnim *= Math.max(0, 1 - dt * 7);
  if (vh.lengthSq() > 0.5 && R.state !== 'air' && R.state !== 'fallen') R.yaw = Math.atan2(-vh.z, vh.x) + (R.sw ? Math.PI : 0);
  riderRoot.position.set(R.pos.x, R.y, R.pos.z);
  if (R.state === 'air') {
    const a = R.air;
    tmp.q.setFromAxisAngle(UP, a.spin);
    if (a.flipKind === 'roll' && a.flip) {
      // rolls como en Pocket Shredders: la vuelta es alrededor de la línea de la cuerda (hacia la barca), no de la tabla
      const q0r = tmp.q0r || (tmp.q0r = new T.Quaternion()), ax = tmp.axr || (tmp.axr = V3()), loc = tmp.locr || (tmp.locr = V3());
      q0r.copy(a.baseQ).multiply(tmp.q);
      if (!a.rollAx) {   // el eje y el sentido se fijan al empezar: si se recalculan a cada momento, a media vuelta salta y gira raro
        a.rollAx = V3(towW.x - R.pos.x, 0, towW.z - R.pos.z).normalize();
        if (a.flipAxis === 'z') a.rollAx.set(a.rollAx.z, 0, -a.rollAx.x);   // tantrum: de lado a la cuerda
        ax.copy(a.rollAx);
        loc.set(a.flipAxis === 'x' ? 1 : 0, 0, a.flipAxis === 'x' ? 0 : 1).applyQuaternion(q0r);
        a.rollSg = Math.sign(loc.dot(ax)) || 1;
        if (a.flipAxis === 'x') {   // la cabeza cae hacia los dedos en el front roll y hacia los talones en el backroll
          loc.set(0, 0, 1).applyQuaternion(q0r);
          a.rollSg = (Math.sign(loc.x * -ax.z + loc.z * ax.x) || 1) * (a.flipName === 'Front Roll' ? 1 : -1) * Math.sign(a.flipDir || 1);
        }
      }
      ax.copy(a.rollAx);
      tmp.q2.setFromAxisAngle(ax, a.flip * a.rollSg);
      riderRoot.quaternion.copy(tmp.q2).multiply(q0r);
    } else {
      tmp.q2.setFromAxisAngle(a.flipAxis === 'x' ? V3(1, 0, 0) : V3(0, 0, 1), a.flip);
      riderRoot.quaternion.copy(a.baseQ).multiply(tmp.q).multiply(tmp.q2);
    }
    if (a.raley > 0) {   // raley: el cuerpo estirado a lo largo de la cuerda, la cabeza hacia la barca y las piernas y la tabla atrás, por encima de la cabeza
      if (!a.raleyAx) a.raleyAx = V3().crossVectors(UP, V3(towW.x - R.pos.x, 0, towW.z - R.pos.z).normalize());   // gira en el plano de la cuerda
      tmp.q2.setFromAxisAngle(a.raleyAx, 1.92 * ss(a.raley)); riderRoot.quaternion.premultiply(tmp.q2);
    }
    // los flips giran alrededor de la cintura (el centro de gravedad), no de la tabla: la tabla pasa por encima de la cabeza
    if (a.flip || a.raley) {
      const pv = tmp.pv || (tmp.pv = V3()), q0 = tmp.q0 || (tmp.q0 = new T.Quaternion());
      q0.copy(a.baseQ).multiply(tmp.q);                               // sin el flip
      pv.set(0, 0.82, 0).applyQuaternion(q0); riderRoot.position.add(pv);
      pv.set(0, 0.82, 0).applyQuaternion(riderRoot.quaternion); riderRoot.position.sub(pv);
    }
    // grab con estilo: la tabla tirada hacia un lado (como en las fotos) y más cuanto más se aguanta
    const ST = { indy: [0.35, -0.45], mute: [0.3, 0.45], melon: [-0.4, 0.42], stale: [-0.35, -0.45], nose: [0.1, 0.6], tail: [0.1, -0.6], method: [-0.75, 0.55], japan: [0.6, 0.5], fashion: [-0.4, -0.5] }[a.grab] || [0, 0];   // [de canto, punta arriba/abajo]: con la punta inclinada una pierna sale estirada y la otra recogida
    const kk = a.grab ? (a.tweak ? 1.35 : 1) : 0;
    a.styX = lerp(a.styX || 0, ST[0] * kk, clamp(dt * 7, 0, 1)); a.styZ = lerp(a.styZ || 0, ST[1] * kk, clamp(dt * 7, 0, 1));
    const LIFT = { indy: 0.18, mute: 0.18, melon: 0.16, stale: 0.16, nose: 0.12, tail: 0.12, method: 0.22, japan: 0.2, fashion: 0.16 }[a.grab] || 0;
    a.styL = lerp(a.styL || 0, LIFT * kk, clamp(dt * 7, 0, 1));
    BOARD_TW.on = Math.abs(a.styX) + Math.abs(a.styZ) + a.styL > 0.003;
    BOARD_TW.q.setFromEuler(new T.Euler(a.styX * 1.25 * (R.sw ? -1 : 1), 0, a.styZ)); BOARD_TW.off.set(0, a.styL, 0);
  } else if (R.state === 'rail') {
    riderRoot.rotation.set(0, R.yaw + Math.PI / 2, 0); riderRoot.rotateX(R.rail ? R.rail.bal * 0.25 : 0);
  } else if (R.state === 'fallen') {
    riderRoot.rotation.set(0, R.yaw, 0); riderRoot.rotateX(-1.25); riderRoot.rotateY(R.fallT * R.fallSpin * Math.max(0, 1 - R.fallT));
  } else {
    chestWorld(tmp.c);
    const latV = vh.dot(tmp.c);
    const dT = trailDir(tmp.n), outX = -dT.z * Math.sign(R.theta), outZ = dT.x * Math.sign(R.theta);
    const outChest = outX * tmp.c.x + outZ * tmp.c.z;                         // +1 si el exterior está hacia los dedos
    const hold = outChest * clamp(Math.abs(R.theta) / 0.7, 0, 1) * 0.85;      // cuanto más fuera, más clavado el canto
    const lt = clamp(latV / 6 + hold, -1, 1);
    R.edge = lerp(R.edge, lt * 0.5, clamp(dt * 4, 0, 1));
    R.lean = lerp(R.lean, lt * 0.95, clamp(dt * 4, 0, 1));
    surfaceNormal(R.pos.x, R.pos.z, t, tmp.n);
    R.grindYaw = lerp(R.grindYaw || 0, R.grind ? R.grind.dir * 1.1 : 0, clamp(dt * 9, 0, 1));   // grind: la tabla cruzada sobre la cresta
    tmp.q.setFromAxisAngle(UP, R.yaw + R.yawAnim + R.grindYaw);
    tmp.q2.setFromUnitVectors(UP, tmp.n);
    riderRoot.quaternion.copy(tmp.q2).multiply(tmp.q);
    riderRoot.rotateX(R.edge);
    // manual: gira sobre la cola (la punta sube y la cola se queda en el agua)
    //         (la de delante según hacia dónde va: en switch es la cola de la tabla). Más abajo el círculo, más sube
    const mDeep = R.manualT ? clamp((-S.L.y - 0.6) / 0.35, 0, 1) : 0;
    R.manual = lerp(R.manual || 0, R.manualT && R.state === 'ride' ? 0.8 + 0.2 * mDeep : 0, clamp(dt * 8, 0, 1));
    R.manualOne = lerp(R.manualOne || 0, R.manualT && R.state === 'ride' && -S.L.y > 0.9 ? 1 : 0, clamp(dt * 6, 0, 1));   // a fondo: de una mano
    if (R.manual > 0.005) { const m = R.manual * 0.62; riderRoot.rotateZ(m * (R.sw ? -1 : 1)); riderRoot.position.y += Math.sin(m) * 0.6; }
    const sp = Math.abs(latV) + (R.grind ? 6 : 0), n = Math.min(R.grind ? 7 : 4, Math.floor(sp * 0.6 * dt * 60 * 0.25 + rnd()));
    for (let i = 0; i < n; i++) {
      tmp.a.set(rnd(-0.6, 0.6), 0.02, -Math.sign(latV) * 0.2).applyQuaternion(riderRoot.quaternion).add(riderRoot.position);
      emit(tmp.a.x, tmp.a.y, tmp.a.z, -tmp.c.x * latV * 0.35 + rnd(-0.6, 0.6), rnd(0.8, 1.8) + sp * 0.12, -tmp.c.z * latV * 0.35 + rnd(-0.6, 0.6), rnd(0.12, 0.28), rnd(0.4, 0.8));
    }
  }
  // --- movimiento vivo: las piernas absorben la ola como un muelle, la cuerda tira al carvear
  DYN.t += dt;
  const vs = (sH - DYN.prevSH) / Math.max(dt, 1e-4); DYN.prevSH = sH;
  if (R.state === 'ride') DYN.absVel += clamp((vs - DYN.prevVs) * 0.05, -0.6, 0.6);
  DYN.prevVs = vs;
  DYN.absVel += (-55 * DYN.absorb - 9 * DYN.absVel) * dt; DYN.absorb = clamp(DYN.absorb + DYN.absVel * dt, -0.25, 0.45);
  DYN.tension = lerp(DYN.tension, R.state === 'ride' ? clamp(Math.abs(R.omega) * ROPE / 6, 0, 1) : 0, clamp(dt * 3, 0, 1));
  DYN.air = lerp(DYN.air, R.state === 'air' ? 1 : 0, clamp(dt * 8, 0, 1));
  DYN.spin = lerp(DYN.spin, R.state === 'air' && R.air && (R.air.spinning || R.air.flipping || R.air.autoSpin) ? 1 : 0, clamp(dt * 6, 0, 1));
  if (R.state === 'air' && R.air && !R.air.grab && R.vy < 0 && R.y - sH < 0.7) R.crouch = lerp(R.crouch, 0.3, clamp(dt * 10, 0, 1));   // estira las piernas antes de caer
  // --- postura y cuerpo
  const a = R.air;
  const gp = a && a.grab ? ({ japan: 'mute', method: 'melon', fashion: 'stale' }[a.grab] || a.grab) : null;
  riderRoot.updateMatrixWorld(true);
  DYN.ropeL = (tmp.ropeL || (tmp.ropeL = V3())).copy(towW).sub(riderRoot.localToWorld(tmp.wc = (tmp.wc || V3()).set(0, 0.82, 0))).normalize()
    .applyQuaternion((tmp.qInv2 || (tmp.qInv2 = new T.Quaternion())).copy(riderRoot.quaternion).invert());
  DYN.bAngRel = null;
  if (a) {
    const ba = Math.atan2(-DYN.ropeL.z, DYN.ropeL.x * (R.sw ? -1 : 1));
    if (a.bAng0 === undefined) a.bAng0 = ba;
    let d = ba - a.bAng0; d -= TAU * Math.round(d / TAU); DYN.bAngRel = d + 0.3;
  }
  DYN.raley = a ? a.raley : 0; DYN.manual = R.state === 'ride' ? (R.manual || 0) : 0; DYN.manualOne = DYN.manual > 0.1 ? (R.manualOne || 0) : 0;
  computePose(R.crouch, R.state === 'air' ? 0 : R.lean, gp, gp ? 1 : 0, R.state !== 'fallen', a ? a.raley : 0, R.sw ? -1 : 1);
  DYN.holdNow = DYN.hold;
  DYN.ropeL = null; DYN.raley = 0; DYN.manual = 0; DYN.manualOne = 0;   // (los demás riders se colocan sin esto)
  (R.headL || (R.headL = V3())).copy(J.hd);   // la cabeza (para la cámara en primera persona)
  poseBody(J);
  boardGroup.quaternion.copy(BOARD_TW.on ? BOARD_TW.q : tmp.qI || (tmp.qI = new T.Quaternion())); boardGroup.position.copy(BOARD_TW.on ? BOARD_TW.off : V3());
  BOARD_TW.on = false;   // (los demás riders se colocan sin esto)
  // --- cuerda: del punto de remolque de la torre a la maneta (que está en las manos de verdad)
  riderRoot.updateMatrixWorld(true);
  const hw = tmp.a;
  if (!handWorld(hw)) hw.copy(J.handle).applyMatrix4(riderRoot.matrixWorld);
  if (R.state === 'fallen') { const k = Math.min(1, R.fallT / 1.5); hw.lerpVectors(hw, V3().lerpVectors(towW, hw, 0.6).setY(0.1), k); }
  setRod(rope, 0.009, towW, hw);
  handleMesh.position.copy(hw);
  handleMesh.quaternion.setFromUnitVectors(UP, tmp.b.subVectors(towW, hw).normalize().cross(V3(0, 1, 0)).normalize());
  $('stance').textContent = `${R.sw ? 'SW' : 'REG'} · ${R.edge < 0 ? 'HS' : 'TS'}`;
  updateRollers(dt);
}

// =====================================================================================
//  BARCA EN MOVIMIENTO
// =====================================================================================
function updateBoat(dt, t) {
  BOAT.s += BOAT.speed * dt;
  pathAt(BOAT.s, boatPose);
  const ahead = pathAt(BOAT.s + 6, {}), behind = pathAt(BOAT.s - 6, {});
  const turn = (ahead.hx * behind.hz - ahead.hz * behind.hx);    // curvatura (signo = lado del giro)
  BOAT.turn = turn;
  const y = wavesH(boatPose.x, boatPose.z, t) * 0.6;
  boat.position.set(boatPose.x, y + 0.02, boatPose.z);
  boat.rotation.set(0, 0, 0, 'YXZ');
  boat.rotation.y = Math.atan2(boatPose.hx, boatPose.hz);
  boat.rotation.x = -0.065 + Math.sin(t * 1.7) * 0.008;       // proa levantada al planear
  boat.rotation.z = -turn * 0.9 + Math.sin(t * 1.3) * 0.01;   // escora en los giros
  boat.updateMatrixWorld(true);
  towW.copy(BOAT.towLocal).applyMatrix4(boat.matrixWorld);
  boatVel.set(boatPose.hx, 0, boatPose.hz).multiplyScalar(BOAT.speed);
  // muestras de la estela: los últimos 100 m recorridos, desde el espejo de popa hacia atrás
  for (let k = 0; k < NPATH; k++) {
    const p = pathAt(BOAT.s - BOAT.transom - k * PSTEP, tmp.p);
    PATHJS[k * 3] = p.x; PATHJS[k * 3 + 1] = p.z; PATHJS[k * 3 + 2] = k * PSTEP;
    U.uPath.value[k].set(p.x, p.z, k * PSTEP);
  }
  // espuma de la hélice y del pantoque
  for (let i = 0; i < 3; i++) {
    tmp.a.set(rnd(-0.3, 0.3), 0.05, -BOAT.transom - 0.2).applyMatrix4(boat.matrixWorld);
    emit(tmp.a.x, 0.05, tmp.a.z, rnd(-0.8, 0.8) - boatPose.hx * 2, rnd(0.4, 1.4), rnd(-0.8, 0.8) - boatPose.hz * 2, rnd(0.2, 0.45), rnd(0.5, 1));
  }
  for (const sx of [-1, 1]) {
    tmp.a.set(sx * 1.0, 0.05, rnd(-0.5, 0.8)).applyMatrix4(boat.matrixWorld);
    tmp.b.set(sx * 2.2, 0, 0).applyQuaternion(boat.quaternion);
    emit(tmp.a.x, 0.1, tmp.a.z, tmp.b.x + rnd(-0.4, 0.4), rnd(0.6, 1.3), tmp.b.z + rnd(-0.4, 0.4), rnd(0.15, 0.3), rnd(0.4, 0.7));
  }
}

// =====================================================================================
//  CÁMARAS
// =====================================================================================
const CAM = { mode: 0, pos: V3(0, 5, 0), look: V3(), names: ['DETRÁS', 'BAJA', 'DESDE LA BARCA', 'LATERAL', 'TODOS', 'CERCA', 'PRIMERA PERSONA'] };
function nextCam() { setCam((CAM.mode + 1) % CAM.names.length); msg('CÁMARA: ' + CAM.names[CAM.mode], 1.2); }
function setCam(i) { CAM.mode = i; document.querySelectorAll('#cams .opt').forEach(b => b.classList.toggle('sel', +b.dataset.c === i)); }
function updateCamera(dt) {
  // la cámara sigue al rider (no al punto de giro de los flips: si no, se mueve rara al dar la vuelta)
  const R = RIDER, rp = (tmp.camRP || (tmp.camRP = V3())).set(R.pos.x, R.y, R.pos.z);
  const toBoat = tmp.a.set(towW.x - rp.x, 0, towW.z - rp.z).normalize();
  const side = tmp.b.set(-toBoat.z, 0, toBoat.x);
  const want = tmp.c, look = tmp.n;
  // como en Pocket Shredders: detrás y algo ladeada hacia el pecho del rider, para verle los brazos y la maneta
  chestWorld(tmp.p2 = tmp.p2 || V3());
  if (R.state !== 'air' || !CAM.chest) CAM.chest = (CAM.chest || V3()).lerp(tmp.p2, clamp(dt * 1.5, 0, 1));   // en el aire no: al dar la vuelta el pecho gira y la cámara se iría de lado
  const portrait = camera.aspect < 1, far = portrait ? 1.35 : 1;
  const fov = portrait ? 74 : 58; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (!GAME.running) { introCamera(dt, rp, toBoat); return; }
  // se mira a un punto delante del rider en la línea hacia la barca: el rider queda en el centro de la pantalla
  if (CAM.mode === 0) { want.copy(rp).addScaledVector(toBoat, -7.2 * far).add(V3(0, 3.2 * far, 0)).addScaledVector(CAM.chest, portrait ? 1.2 : 2.8); look.copy(rp).addScaledVector(toBoat, 5).setY(1.1); }
  else if (CAM.mode === 1) { want.copy(rp).addScaledVector(toBoat, -4.6 * far).add(V3(0, 1.4 * far, 0)).addScaledVector(side, portrait ? 0.5 : 1.2); look.copy(rp).addScaledVector(toBoat, 4).setY(1.0); }
  else if (CAM.mode === 2) { want.copy(towW).add(V3(0, 0.4, 0)).addScaledVector(toBoat, 0.6); look.copy(rp).setY(rp.y + 0.9); }
  else if (CAM.mode === 5) {   // CERCA: justo detrás y un poco por encima del hombro
    want.copy(rp).addScaledVector(toBoat, -3.1 * (portrait ? 1.15 : 1)).add(V3(0, 1.9, 0)).addScaledVector(CAM.chest, 0.7);
    look.copy(rp).addScaledVector(toBoat, 6).setY(rp.y + 1.1);
  }
  else if (CAM.mode === 6) {   // PRIMERA PERSONA: desde los ojos del rider, mirando a la barca (el horizonte no da vueltas en los flips)
    riderRoot.updateMatrixWorld(true);
    const eye = riderRoot.localToWorld(tmp.eye = (tmp.eye || V3()).copy(R.headL || V3(0, 1.6, 0)).add(V3(0, 0.06, 0)));
    eye.addScaledVector(toBoat, 0.22);
    const lat = R.vel.x * side.x + R.vel.z * side.z;
    look.copy(eye).addScaledVector(toBoat, 12).addScaledVector(side, clamp(lat * 0.35, -4, 4)).setY(Math.max(0.3, eye.y - 1.8));   // algo hacia abajo: se ve la cuerda y la estela
    CAM.off = null; CAM.lookOff = null; CAM.pos.copy(eye);
    CAM.look1 = (CAM.look1 || look.clone()).lerp(look, clamp(dt * 8, 0, 1)); CAM.look.copy(CAM.look1);
    camera.position.copy(CAM.pos); camera.lookAt(CAM.look); return;
  }
  else if (CAM.mode === 4) {   // TODOS: alta, detrás del rider con la cuerda más larga, para ver a toda la sala y la barca
    const back = Math.max(ROPE, ...Object.values(NET.peers).filter(P => P.st && P.st.p).map(P => ROPES[P.st.ln] || ROPE));
    const bh = tmp.p2b = (tmp.p2b || V3()).set(boatVel.x, 0, boatVel.z).normalize();
    want.copy(boat.position).addScaledVector(bh, -(back + 13 * far)).setY(8.5 * far);
    look.copy(boat.position).addScaledVector(bh, -back * 0.5).setY(0.5);
    CAM.off = null; CAM.lookOff = null; CAM.pos.lerp(want, clamp(dt * 3, 0, 1)); CAM.look.lerp(look, clamp(dt * 4, 0, 1));
    camera.position.copy(CAM.pos); camera.lookAt(CAM.look); return;
  }
  else { want.copy(rp).addScaledVector(side, -9 * far).addScaledVector(toBoat, 2).add(V3(0, 2.0, 0)); look.copy(rp).setY(rp.y + 0.9); }
  if (R.state === 'air' && CAM.mode !== 2) { want.y += R.y * (CAM.mode === 5 ? 0.2 : 0.45); look.y += R.y * (CAM.mode === 5 ? 0.3 : 0.6); }
  // se suaviza la posición RELATIVA al rider: así va siempre centrado aunque cruce rápido de un lado a otro
  const k = clamp(dt * (CAM.mode === 2 ? 10 : CAM.mode === 5 ? 5 : 3.5), 0, 1);
  CAM.off = (CAM.off || want.clone().sub(rp)).lerp(want.sub(rp), k);
  CAM.lookOff = (CAM.lookOff || look.clone().sub(rp)).lerp(look.sub(rp), clamp(dt * 6, 0, 1));
  CAM.pos.copy(rp).add(CAM.off); CAM.look.copy(rp).add(CAM.lookOff);
  camera.position.copy(CAM.pos); camera.lookAt(CAM.look);
}
// intro (con el menú): planos que van cambiando: el patrón al volante, el rider de cerca y una general con el Pantalán
const INTRO = { shot: -1, t: 0 };
function introCamera(dt, rp, toBoat) {
  const want = tmp.c, look = tmp.n;
  const portrait = camera.aspect < 1, side = V3(-toBoat.z, 0, toBoat.x);
  if (!READY.on) {             // cargando: el Pantalán desde el agua, con un barrido lento
    const a = GAME.t * 0.03;
    want.set(PIER_X - 260, 14, SHORE_Z - 520); look.set(PIER_X + Math.sin(a) * 60, 6 - (portrait ? 14 : 0), SHORE_Z - 760 + Math.cos(a) * 120);
    camera.position.copy(want); camera.lookAt(look); return;
  }
  INTRO.t += dt;
  const shot = Math.floor(INTRO.t / 7) % 3; INTRO.shot = shot;
  if (shot === 0) {            // el patrón al volante, desde arriba y por delante de estribor
    boat.updateMatrixWorld(true);
    want.copy(boat.localToWorld(V3(-3.2, 2.1, 1.2))); look.copy(boat.localToWorld(V3(-0.5, 1.25, -0.35)));
  } else if (shot === 1) {     // el rider de cerca, de tres cuartos por delante
    want.copy(rp).addScaledVector(CAM.chest, 3.8).addScaledVector(toBoat, 2.4).add(V3(0, 1.6, 0)); look.copy(rp).setY(rp.y + 1.0);
  } else {                     // la Tatanka de cerca, de tres cuartos por la proa de estribor
    boat.updateMatrixWorld(true);
    want.copy(boat.localToWorld(V3(-5.5, 2.4, 7.5))); look.copy(boat.localToWorld(V3(0, 0.9, 0.6)));
  }
  // en vertical el menú tapa la mitad de abajo: se apunta más bajo para que barca y rider queden arriba
  if (portrait) look.y -= shot === 2 ? 3.2 : 2.6;
  // la cámara va pegada a lo que filma (se mueve a 37 km/h): si se suavizara se quedaría atrás
  CAM.pos.copy(want); CAM.look.copy(look);
  camera.position.copy(CAM.pos); camera.lookAt(CAM.look);
}

// =====================================================================================
//  CARGA DE MODELOS (Senén y la Tatanka exportados desde Blender)
// =====================================================================================
const loader = new T.GLTFLoader();
const LOADP = {};
function loadProgress() {
  let a = 0, b = 0; for (const k in LOADP) { a += LOADP[k][0]; b += LOADP[k][1]; }
  const pct = b ? Math.round(a / b * 100) : 0;
  $('loadBar').style.width = pct + '%'; $('loadPct').textContent = pct + ' %';
}
function loadGLB(url, size) {
  LOADP[url] = [0, size];
  return new Promise(res => loader.load(url, g => { LOADP[url][0] = LOADP[url][1]; loadProgress(); res(g); },
    e => { if (e.total) LOADP[url][1] = e.total; LOADP[url][0] = e.loaded; loadProgress(); }, () => res(null)));
}
const H_ALIAS = {   // nombres de huesos: esqueleto «game engine» de MakeHuman y Mixamo
  Hips: ['pelvis', 'mixamorigHips', 'Hips'], Spine: ['spine_01', 'mixamorigSpine'], Spine1: ['spine_02', 'mixamorigSpine1'], Spine2: ['spine_03', 'mixamorigSpine2'],
  Neck: ['neck_01', 'mixamorigNeck'], Head: ['head', 'mixamorigHead'],
  LeftArm: ['upperarm_l', 'mixamorigLeftArm'], LeftForeArm: ['lowerarm_l', 'mixamorigLeftForeArm'], LeftHand: ['hand_l', 'mixamorigLeftHand'],
  RightArm: ['upperarm_r', 'mixamorigRightArm'], RightForeArm: ['lowerarm_r', 'mixamorigRightForeArm'], RightHand: ['hand_r', 'mixamorigRightHand'],
  LeftUpLeg: ['thigh_l', 'mixamorigLeftUpLeg'], LeftLeg: ['calf_l', 'mixamorigLeftLeg'], LeftFoot: ['foot_l', 'mixamorigLeftFoot'], LeftToeBase: ['ball_l', 'mixamorigLeftToeBase'],
  RightUpLeg: ['thigh_r', 'mixamorigRightUpLeg'], RightLeg: ['calf_r', 'mixamorigRightLeg'], RightFoot: ['foot_r', 'mixamorigRightFoot'], RightToeBase: ['ball_r', 'mixamorigRightToeBase'],
};
function setupHuman(gltf) {
  const sc = gltf.scene; const root = new T.Group(); root.add(sc);
  const b = {};
  for (const k in H_ALIAS) { for (const n of H_ALIAS[k]) { const o = sc.getObjectByName(n); if (o) { b[k] = o; break; } } }
  const missing = Object.keys(H_ALIAS).filter(k => !b[k]);
  if (missing.length) { console.warn('faltan huesos', missing); return null; }
  sc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const h = { root, sc, b, rest: {}, fingers: [] };
  for (const k in b) h.rest[k] = b[k].quaternion.clone();
  // dedos (para cerrar la mano sobre la maneta)
  sc.traverse(o => { const m = o.isBone && /^(index|middle|ring|pinky|thumb)_0([123])_([lr])$/.exec(o.name); if (m) h.fingers.push({ bone: o, rest: o.quaternion.clone(), thumb: m[1] === 'thumb', k: +m[2] }); });
  h.knuckL = sc.getObjectByName('middle_01_l'); h.knuckR = sc.getObjectByName('middle_01_r');
  return h;
}
// orienta los huesos para que pasen por las articulaciones de la postura (todo en el espacio de root)
const hv = { a: V3(), b: V3(), c: V3(), d: V3(), t: V3(), X: V3(), Y: V3(), Z: V3(), m: new T.Matrix4() };
const hq = { a: new T.Quaternion(), b: new T.Quaternion(), c: new T.Quaternion(), r: new T.Quaternion() };
const hM = { inv: new T.Matrix4(), t: new T.Matrix4(), s: V3() };
function relPos(obj, out) { return out.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(hM.inv); }
function relQuat(obj, out) { hM.t.multiplyMatrices(hM.inv, obj.matrixWorld); hM.t.decompose(hv.d, out, hM.s); return out; }
function setBoneRelQuat(bone, q) { relQuat(bone.parent, hq.c); bone.quaternion.copy(hq.c.invert()).multiply(q); bone.updateMatrixWorld(true); }
function aimBone(bone, child, Tg) {
  relPos(bone, hv.a); relPos(child, hv.b); hv.b.sub(hv.a); hv.t.copy(Tg).sub(hv.a);
  if (hv.b.lengthSq() < 1e-10 || hv.t.lengthSq() < 1e-10) return;
  hq.a.setFromUnitVectors(hv.b.normalize(), hv.t.normalize()); relQuat(bone, hq.b); setBoneRelQuat(bone, hq.a.multiply(hq.b));
}
function poseHuman(h, j) {
  const b = h.b;
  for (const k in b) b[k].quaternion.copy(h.rest[k]);
  h.root.updateMatrixWorld(true);
  hM.inv.copy(h.root.matrixWorld).invert();
  const hip = hv.c.addVectors(j.hB, j.hF).multiplyScalar(0.5).clone();
  const sh = V3().addVectors(j.sB, j.sF).multiplyScalar(0.5);
  hv.Y.subVectors(sh, hip).normalize();
  hv.Z.copy(j.fw).addScaledVector(hv.Y, -j.fw.dot(hv.Y)).normalize();
  hv.X.crossVectors(hv.Y, hv.Z).normalize();
  const fLeft = hv.a.subVectors(j.hF, j.hB).dot(hv.X) >= 0, L = fLeft ? 'F' : 'B', R = fLeft ? 'B' : 'F'; h.LF = fLeft;
  hM.t.multiplyMatrices(hM.inv, b.Hips.parent.matrixWorld).invert();
  b.Hips.position.copy(hip).applyMatrix4(hM.t); b.Hips.updateMatrixWorld(true);
  relQuat(b.Hips, hq.r); hv.m.makeBasis(hv.X, hv.Y, hv.Z); hq.a.setFromRotationMatrix(hv.m); setBoneRelQuat(b.Hips, hq.a.multiply(hq.r));
  aimBone(b.Spine, b.Neck, sh);
  aimBone(b.Neck, b.Head, j.hd);
  aimBone(b.LeftArm, b.LeftForeArm, j['e' + L]); aimBone(b.LeftForeArm, b.LeftHand, j['a' + L]);
  aimBone(b.RightArm, b.RightForeArm, j['e' + R]); aimBone(b.RightForeArm, b.RightHand, j['a' + R]);
  aimBone(b.LeftUpLeg, b.LeftLeg, j['k' + L]); aimBone(b.LeftLeg, b.LeftFoot, j['f' + L]);
  aimBone(b.RightUpLeg, b.RightLeg, j['k' + R]); aimBone(b.RightLeg, b.RightFoot, j['f' + R]);
  aimBone(b.LeftFoot, b.LeftToeBase, j['toe' + L]); aimBone(b.RightFoot, b.RightToeBase, j['toe' + R]);
  // puño cerrado: cada falange se dobla sobre su eje X local
  for (const f of h.fingers) { f.bone.quaternion.copy(f.rest).multiply(hq.a.setFromAxisAngle(FINGER_AXIS, (f.thumb ? 0.5 : [0, 1.25, 1.35, 0.9][f.k]) * FINGER_SIGN)); }
}
const FINGER_AXIS = V3(1, 0, 0); let FINGER_SIGN = 1;
// la maneta va donde están de verdad las manos de Senén (entre los nudillos de las dos manos, o en la que sujeta)
let SENEN = null;   // el humano del rider elegido (Senén o Rupert)
function handWorld(out) {
  if (!SENEN || !SENEN.knuckL) return false;
  const a = RIDER.air, g = a && a.grab;
  const pl = SENEN.knuckL.getWorldPosition(tmp.n), pr = SENEN.knuckR.getWorldPosition(tmp.c);
  const hh = DYN.holdNow || (RIDER.state === 'ride' ? holdingHand() : null);
  if (g && RIDER.state === 'air') { const gg = { japan: 'mute', method: 'melon', fashion: 'stale' }[g] || g, gh = (GRAB_POS[gg] || [0, 'B'])[1], rope = gh === 'F' ? 'B' : 'F'; out.copy((rope === 'F') === !!SENEN.LF ? pl : pr); }   // la otra mano lleva la cuerda
  else if (hh) out.copy((hh === 'F') === !!SENEN.LF ? pl : pr);           // con una mano: la de la maneta
  else out.addVectors(pl, pr).multiplyScalar(0.5);
  return true;
}
const MODEL_VER = '?v=3';   // cambiarlo al reexportar los .glb (así el móvil no los descarga cada vez)
async function loadModels() {
  const v = MODEL_VER;
  const SIZES = { senen: 2.8e6, tatanka: 1.4e6, rupert: 3.7e6, rupert_patron: 3.6e6 };
  // las fotos del menú primero (si no, las tapan las descargas de los modelos)
  await Promise.all(['avatar.jpg', 'avatar-rupert.jpg'].map(u => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = u; setTimeout(r, 3000); })));
  const [sen, tat, pat] = await Promise.all(['senen', 'tatanka', 'rupert_patron'].map(n => loadGLB(n + '.glb' + v, SIZES[n])));
  if (tat) {
    boat.remove(BOAT.model); BOAT.model = tat.scene; boat.add(tat.scene);
    tat.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const tp = tat.scene.getObjectByName('remolque');
    if (tp) { boat.updateMatrixWorld(true); BOAT.towLocal.copy(boat.worldToLocal(tp.getWorldPosition(V3()))); }
  }
  { const h = sen && setupHuman(sen); if (h) RIDERS.senen = h; }
  setRider(RIDER_NAME);
  // Rupert de patrón: de pie al volante de la Tatanka, con las manos en la rueda
  // (cuando Rupert hace wake, conduce Senén)
  const hd = pat && setupHuman(pat), hs = sen && setupHuman({ scene: T.SkeletonUtils.clone(sen.scene) });
  for (const [n, h] of [['rupert', hd], ['senen', hs]]) if (h) { DRIVERS[n] = h; h.root.position.copy(DRIVER.at); h.root.visible = false; boat.add(h.root); }
  pickPatron();
  const ok = sen && tat && pat;
  $('loadLine').textContent = ok ? '✅ Barca y riders listos' : '⚠️ No se han podido cargar todos los modelos: recarga la página';
  $('go').disabled = !ok && !sen;
  showModels(); READY.t = GAME.t;
  // Rupert de rider: se baja mientras tanto (si lo eligen antes, sigue Senén hasta que llega)
  const rup = await new Promise(res => loader.load('rupert.glb' + v, res, undefined, () => res(null)));
  const h = rup && setupHuman(rup); if (h) { RIDERS.rupert = h; if (RIDER_NAME === 'rupert') setRider('rupert'); }
  pickPatron();
  const om = await new Promise(res => loader.load('omar.glb?v=5', res, undefined, () => res(null)));
  const ho = om && setupHuman(om); if (ho) { RIDERS.omar = ho; if (RIDER_NAME === 'omar') setRider('omar'); }
  pickPatron();
  const jp = await new Promise(res => loader.load('juanp.glb?v=1', res, undefined, () => res(null)));
  const hj = jp && setupHuman(jp); if (hj) { RIDERS.juanp = hj; if (RIDER_NAME === 'juanp') setRider('juanp'); }
  pickPatron();
  READY.extras = true;
}
// mientras cargan no se enseñan ni el maniquí ni la barca provisional: se ve el Pantalán
const READY = { on: false, t: 0, shots: false };
function showModels() { READY.on = true; for (const o of [riderRoot, rope, handleMesh, boat]) o.visible = true; }
for (const o of [riderRoot, rope, handleMesh, boat]) o.visible = false;
const RIDERS = {}, DRIVERS = {}; let RIDER_NAME = 'senen';
const ALL_PJ = ['rupert', 'senen', 'omar', 'juanp'];
let PATRON = 'rupert'; try { PATRON = localStorage.getItem('wake-patron') || 'rupert'; } catch (e) {}
function makeDriver(n) {
  if (DRIVERS[n]) return DRIVERS[n];
  const src = RIDERS[n]; if (!src) return null;
  const h = setupHuman({ scene: T.SkeletonUtils.clone(src.sc) }); if (!h) return null;
  DRIVERS[n] = h; h.root.position.copy(DRIVER.at); h.root.visible = false; boat.add(h.root); return h;
}
function pickPatron() {
  let n = PATRON;
  if (n === RIDER_NAME || !makeDriver(n)) n = ALL_PJ.find(k => k !== RIDER_NAME && makeDriver(k)) || n;
  setDriver(n);
  if (typeof RIDER_INFO !== 'undefined' && RIDER_INFO[n]) $('riderSub').textContent = 'Patrón: ' + RIDER_INFO[n][0] + ' · Barca Tatanka';
  document.querySelectorAll('#patrons .opt').forEach(b => { b.classList.toggle('sel', b.dataset.p === n); b.disabled = b.dataset.p === RIDER_NAME; });
}
function setDriver(n) { for (const k in DRIVERS) DRIVERS[k].root.visible = k === n; DRIVER.h = DRIVERS[n] || null; }
function setRider(name) {
  RIDER_NAME = name;
  const h = RIDERS[name]; if (!h) return;
  body.clear(); body.add(h.root); poseBody = j => poseHuman(h, j); SENEN = h; window.__senen = h;
}
// el patrón: sentado en el asiento del piloto, mirando a proa, con las dos manos en el volante
const DRIVER = { h: null, at: V3(-0.53, 0, -0.33), steer: 0, J: {} };
for (const k of ['hB', 'hF', 'kB', 'kF', 'fB', 'fF', 'ch', 'hd', 'sB', 'sF', 'eB', 'eF', 'aB', 'aF', 'fw', 'toeB', 'toeF']) DRIVER.J[k] = V3();
function poseDriver(turn, t) {
  if (!DRIVER.h) return;
  const j = DRIVER.J, st = DRIVER.steer = lerp(DRIVER.steer, clamp(turn * 25, -1.2, 1.2), 0.05);
  j.hF.set(0.1, 0.72, 0.0); j.hB.set(-0.1, 0.72, 0.0);                 // sentado sobre el cojín
  j.kF.set(0.13, 0.66, 0.4); j.kB.set(-0.13, 0.66, 0.4);
  j.fF.set(0.14, 0.24, 0.46); j.fB.set(-0.14, 0.24, 0.46); j.toeF.set(0.15, 0.2, 0.62); j.toeB.set(-0.15, 0.2, 0.62);
  j.ch.set(0, 1.18, 0.07 + Math.sin(t * 1.7) * 0.01); j.fw.set(-st * 0.12, 0, 1).normalize();
  j.sF.set(0.19, 1.2, 0.07); j.sB.set(-0.19, 1.2, 0.07); j.hd.set(-st * 0.03, 1.45, 0.1);
  const wc = V3(-0.02, 0.8, 0.47), r = 0.15;                             // centro del volante respecto al asiento
  j.aF.set(wc.x + Math.cos(0.45 + st) * r, wc.y + Math.sin(0.45 + st) * r * 0.55, wc.z - Math.sin(0.45 + st) * r * 0.3);
  j.aB.set(wc.x - Math.cos(0.45 - st) * r, wc.y + Math.sin(0.45 - st) * r * 0.55, wc.z - Math.sin(0.45 - st) * r * 0.3);
  j.eF.set(0.27, 0.92, 0.27); j.eB.set(-0.27, 0.92, 0.27);
  boat.updateMatrixWorld(true);
  poseHuman(DRIVER.h, j);
}

// =====================================================================================
//  ONLINE: la sala del Pantalán. Todos van detrás de la misma Tatanka, en la misma estela, cada uno con
//  su cuerda de un largo distinto para que no se toquen. La barca va sincronizada con la hora del servidor.
//  (Firebase: el mismo proyecto que el surf; sala «wake-pantalan»)
// =====================================================================================
const FIREBASE_CONFIG = { apiKey: 'AIzaSyBYEgJnEQxYbgT97giPRuTaRNd5d9vF8tg', authDomain: 'surf-sagunto.firebaseapp.com', databaseURL: 'https://surf-sagunto-default-rtdb.europe-west1.firebasedatabase.app', projectId: 'surf-sagunto', storageBucket: 'surf-sagunto.firebasestorage.app', messagingSenderId: '669179228796', appId: '1:669179228796:web:1e39377632d94fa1c50ff9' };
const ROPES = [22.9, 20.7, 25.1, 18.5, 27.3, 16.3];   // cuerdas cerca unas de otras (2 m de diferencia) pero sin tocarse
const NET = { db: null, me: null, id: 'w' + Math.random().toString(36).slice(2, 10), peers: {}, offset: 0, connected: false, sendT: 0, lane: 0, laneLocked: false };
const netNow = () => Date.now() + NET.offset;
function loadScript(src) { return new Promise((res, rej) => { const e = document.createElement('script'); e.src = src; e.onload = res; e.onerror = rej; document.head.appendChild(e); }); }
(async function netStart() {
  const mp = $('mpMenu');
  try {
    if (!window.firebase) { await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js'); await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'); }
    firebase.initializeApp(FIREBASE_CONFIG); NET.db = firebase.database();
    NET.base = NET.db.ref('salas/wake-tatanka'); NET.me = NET.base.child('players/' + NET.id);
    NET.db.ref('.info/serverTimeOffset').on('value', v => { NET.offset = v.val() || 0; });
    NET.db.ref('.info/connected').on('value', v => { NET.connected = !!v.val(); if (NET.connected) { NET.me.onDisconnect().remove(); NET.sendT = 0; } netMenu(); });
    const pl = NET.base.child('players');
    pl.on('child_added', v => peerData(v.key, v.val())); pl.on('child_changed', v => peerData(v.key, v.val())); pl.on('child_removed', v => peerGone(v.key));
    NET.base.child('msgs').orderByChild('at').startAt(Date.now() - 5000).on('child_added', v => onNetMsg(v.val()));
    recLoad();
    addEventListener('pagehide', () => { try { NET.me.remove(); } catch (e) {} });
    mp.textContent = '🌊 Conectando a la sala Tatanka…';
  } catch (e) { mp.textContent = '🌊 Sin conexión: juegas solo'; }
})();
function peerData(id, v) {
  if (id === NET.id || !v || !v.st) return;
  const P = NET.peers[id] || (NET.peers[id] = { id, vis: null, d: V3(), q: new T.Quaternion(), first: true });
  P.st = v.st; P.ch = v.ch; P.seen = performance.now();
  netMenu();
}
function peerGone(id) { const P = NET.peers[id]; if (!P) return; if (P.vis) { scene.remove(P.vis.root, P.vis.rope); } delete NET.peers[id]; netMenu(); }
// carril = largo de cuerda: el primero libre al entrar, y se queda fijo mientras juegas
function pickLane() {
  const used = new Set(Object.values(NET.peers).filter(P => P.st && P.st.p).map(P => P.st.ln));
  let ln = 0; while (used.has(ln) && ln < ROPES.length - 1) ln++;
  NET.lane = ln; ROPE = ROPES[ln];
}
function netMenu() {
  const ps = Object.values(NET.peers).filter(P => P.st);
  const names = ps.map(P => (P.st.n || 'Rider') + (P.st.p ? '' : ' (en el menú)'));
  if (NET.connected) $('mpMenu').textContent = ps.length ? `🌊 Sala Tatanka · ${ps.length + 1} conectados: tú, ${names.join(', ')}` : '🌊 Sala Tatanka · de momento solo tú (pasa el enlace a tus amigos)';
  // marcador en el juego
  let box = $('mpList');
  if (!box) { box = document.createElement('div'); box.id = 'mpList'; box.style.cssText = 'position:absolute;right:max(14px,env(safe-area-inset-right));top:96px;text-align:right;font:700 12px/1.45 system-ui,sans-serif;letter-spacing:.04em;text-shadow:0 1px 4px rgba(0,0,0,.7);pointer-events:none'; $('hud').appendChild(box); }
  const rows = ps.filter(P => P.st.p).map(P => `${esc(P.st.n || 'Rider')} · ${(P.st.s || 0).toLocaleString('es-ES')}`);
  box.innerHTML = rows.join('<br>');
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// la barca de todos va por el mismo sitio a la misma hora
function netSyncBoat(dt) {
  if (!NET.connected) return;
  const L = PATH.len, target = (netNow() / 1000 * BOAT.speed) % L;
  let d = ((target - BOAT.s) % L + L) % L; if (d > L / 2) d -= L;
  if (Math.abs(d) > 30) { BOAT.s += d; trail.pts.length = 0; }       // salto (al entrar o tras una pausa)
  else BOAT.s += clamp(d, -2 * dt, 2 * dt);
}
function netSend(dt) {
  if (!NET.connected || !NET.me) return;
  NET.sendT -= dt; if (NET.sendT > 0) return; NET.sendT = 0.12;
  const R = RIDER, a = R.air, q = riderRoot.quaternion, rp = riderRoot.position, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const gp = a && a.grab ? ({ japan: 'mute', method: 'melon', fashion: 'stale' }[a.grab] || a.grab) : '';
  const st = {
    n: ($('nick').value.trim() || RIDER_INFO[RIDER_NAME][0]).slice(0, 16), b: boardIdx, p: GAME.running ? 1 : 0, ln: NET.lane, s: R.score,
    dx: r2(rp.x - boat.position.x), dy: r2(rp.y), dz: r2(rp.z - boat.position.z), q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)],
    a: R.state === 'air' ? 1 : 0, v: r2(R.state === 'air' ? Math.hypot(R.vel.x, R.vy, R.vel.z) : 0),
    c: r2(R.crouch), l: r2(R.state === 'air' ? 0 : R.lean), g: gp, rl: r2(a ? a.raley : 0), sw: R.sw ? 1 : 0, ho: R.state !== 'fallen' ? 1 : 0,
  };
  NET.me.set({ ch: RIDER_NAME, st }).catch(() => {});
}

// ---- EMPUJONES EN EL AIRE: gana el que va más rápido; el otro se suelta de la cuerda y cae mal al agua
{ const st = document.createElement('style'); st.textContent = `
  #stR.push svg .rim { stroke: #ff3b30; fill: rgba(255,59,48,.25); stroke-width: 3; }
  #stR.push .knob { background: rgba(255,59,48,.85) !important; border-color: #fff !important; color: #fff; font-size: 9px !important; }
  .rec { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 14px; font-size: 16px; align-items: center; background: rgba(13,22,32,.62); padding: 12px 14px; }
  .rec b { font-weight: 700; } .rec small { opacity: .7; font-size: 12px; } .rec .pts { text-align: right; font-weight: 700; }`;
  document.head.appendChild(st); }
function checkPush() {
  NET.pushTarget = null;
  if (RIDER.state !== 'air') return;
  const rp = riderRoot.position;
  for (const id in NET.peers) {
    const P = NET.peers[id]; if (!P.vis || !P.vis.root.visible || !P.st || !P.st.a) continue;
    const q = P.vis.root.position;
    if (Math.hypot(q.x - rp.x, q.z - rp.z) < 3.2 && Math.abs(q.y - rp.y) < 2.2) { NET.pushTarget = id; break; }
  }
}
function doPush(id) {
  const P = NET.peers[id]; if (!P || !NET.base) return;
  NET.pushTarget = null;
  const R = RIDER, mine = Math.hypot(R.vel.x, R.vy, R.vel.z), his = P.st.v || 0, win = mine >= his;
  const ref = NET.base.child('msgs').push();
  ref.set({ ev: 'push', to: id, at: netNow(), from: NET.id, fn: ($('nick').value.trim() || RIDER_INFO[RIDER_NAME][0]).slice(0, 16), w: win ? 1 : 0 }).catch(() => {});
  setTimeout(() => ref.remove().catch(() => {}), 15000);
  if (win) { pushWon(P.st.n || 'Rider'); }
  else { REC.pushLost = (REC.pushLost || 0) + 1; NET.pendingFall = (P.st.n || 'Rider') + ' iba más rápido'; }
}
function pushWon(name) {
  const R = RIDER, pts = 500; R.score += pts; $('score').textContent = R.score.toLocaleString('es-ES');
  REC.pushWon = (REC.pushWon || 0) + 1;
  say(`¡EMPUJÓN!<small>${esc(name)} al agua · +${pts}</small>`, '', 2);
}
function pushFall(reason) {
  const R = RIDER; if (R.state === 'fallen') return;
  R.air = null; fall('¡EMPUJADO! ' + reason);
  R.fallSpin = (Math.random() < 0.5 ? -1 : 1) * 6;               // cae mal: dando vueltas
  R.fallVel.y = 0; R.fallVel.multiplyScalar(1.4);
}
function onNetMsg(m) {
  if (m && m.au) { onVoice(m); return; }
  if (!m || m.ev !== 'push' || m.to !== NET.id || netNow() - m.at > 5000) return;
  if (m.w) { REC.pushLost = (REC.pushLost || 0) + 1; NET.pendingFall = 'por ' + (m.fn || 'otro rider'); }
  else pushWon(m.fn || 'otro rider');
}
// el botón rojo mientras se puede empujar
// botón RALEY: sale a la izquierda del círculo derecho, solo en el aire
{ const b = document.createElement('button'); b.id = 'bRaley'; b.textContent = 'RALEY'; b.hidden = true; $('hud').appendChild(b);
  const on = e => { e.preventDefault(); e.stopPropagation(); IN.raleyBtn = true; b.classList.add('on'); };
  const off = () => { IN.raleyBtn = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  b.addEventListener('contextmenu', e => e.preventDefault());
}
function drawRaleyBtn() {
  const b = $('bRaley'), a = RIDER.air;
  const show = RIDER.state === 'air' && !NET.pushTarget && GAME.running && !(a && a.flipName && !a.raleyOn);
  if (b.hidden === show) {
    b.hidden = !show;
    if (show) { const r = $('stR').getBoundingClientRect(), h = $('hud').getBoundingClientRect(); b.style.left = (r.left - h.left - 70) + 'px'; b.style.top = (r.top - h.top - 26) + 'px'; }
    else { IN.raleyBtn = false; b.classList.remove('on'); }
  }
}
function drawPushBtn() {
  drawRaleyBtn();
  const on = !!NET.pushTarget, el = $('stR'), k = el.querySelector('.knob');
  const txt = on ? 'EMPUJAR' : RIDER.state === 'air' ? (RIDER.railNear ? 'GRIND' : 'GRAB') : 'OLLIE';
  el.classList.toggle('grind', txt === 'GRIND');
  if (el.classList.contains('push') !== on) el.classList.toggle('push', on);
  el.classList.toggle('grab', !on && txt === 'GRAB');
  if (k.textContent !== txt) k.textContent = txt;
}
{ const st = document.createElement('style'); st.textContent = `
  #stR.grab .knob { background: rgba(195,245,58,.55) !important; border-color: #f4ffd8 !important; color: #10220a; font-size: 10px !important; }
  #bRaley { position: absolute; z-index: 6; width: 64px; height: 64px; border-radius: 50%; pointer-events: auto; touch-action: none;
    font: 900 11px system-ui, sans-serif; letter-spacing: .06em; color: #fff; background: rgba(40,140,255,.5); border: 2px solid #e6f2ff;
    box-shadow: 0 2px 10px rgba(0,0,0,.35); -webkit-user-select: none; user-select: none; }
  #bRaley.on { background: rgba(40,140,255,.9); transform: scale(.94); }
  #bMenu { position: absolute; left: max(14px, env(safe-area-inset-left)); top: calc(112px + env(safe-area-inset-top)); pointer-events: auto;
    font: 800 11px system-ui, sans-serif; letter-spacing: .12em; color: #fff; background: rgba(0,0,0,.28); border: 1.5px solid rgba(255,255,255,.8); border-radius: 14px; padding: 4px 10px; }`;
  document.head.appendChild(st); }
// botón pequeño arriba para volver al menú desde el agua (la sesión se guarda)
{ const b = document.createElement('button'); b.id = 'bMenu'; b.textContent = '☰ MENÚ'; $('hud').appendChild(b);
  b.addEventListener('click', e => {
    e.stopPropagation();
    try { recSave(); } catch (er) {}
    GAME.running = false; GAME.paused = false; msg(''); $('hud').hidden = true; $('menu').hidden = false; showPanel('pMain');
    try { musicUpdate(); } catch (er) {}
  });
}

// ---- RÉCORDS: se guardan en la sala «wake-records» (uno por móvil, sin cuenta) y salen en el menú
const REC = { dev: (() => { try { let d = localStorage.getItem('wake-dev'); if (!d) { d = 'd' + Math.random().toString(36).slice(2, 12); localStorage.setItem('wake-dev', d); } return d; } catch (e) { return 'd' + Math.random().toString(36).slice(2, 12); } })(),
  data: null, saveT: 0, lastScore: 0, pushWon: 0, pushLost: 0, bestTrick: '', bestTrickPts: 0 };
function recLoad() {
  if (!NET.base) return;
  const ref = NET.db.ref('salas/wake-records/players');
  ref.child(REC.dev).once('value', v => { REC.data = (v.val() && v.val().st) || null; recShow(); });
  ref.on('value', v => { REC.all = v.val() || {}; recShow(); });
}
function recSave() {
  if (!NET.db || !GAME.running) return;
  const d = REC.data || { best: 0, total: 0, pw: 0, pl: 0, bt: '', btp: 0, ses: 0 }, R = RIDER;
  const add = Math.max(0, R.score - REC.lastScore); REC.lastScore = R.score;
  const n = {
    nm: ($('nick').value.trim() || RIDER_INFO[RIDER_NAME][0]).slice(0, 16), best: Math.max(d.best || 0, R.score), total: (d.total || 0) + add,
    pw: (d.pw || 0) + REC.pushWon, pl: (d.pl || 0) + REC.pushLost, ses: d.ses || 0,
    bt: REC.bestTrickPts > (d.btp || 0) ? REC.bestTrick : (d.bt || ''), btp: Math.max(d.btp || 0, REC.bestTrickPts), r: RIDER_NAME, at: netNow(),
  };
  if (!REC.counted) { REC.counted = true; n.ses = (d.ses || 0) + 1; }
  REC.pushWon = 0; REC.pushLost = 0; REC.data = n;
  NET.db.ref('salas/wake-records/players/' + REC.dev).set({ ch: n.nm.slice(0, 19), st: n }).catch(() => {});
}
function recTick(dt) { REC.saveT -= dt; if (REC.saveT <= 0) { REC.saveT = 10; recSave(); } }
addEventListener('pagehide', () => { try { recSave(); } catch (e) {} });
document.addEventListener('visibilitychange', () => { if (document.hidden) try { recSave(); } catch (e) {} });
// el panel de récords del menú (se crea aquí para no depender del index.html guardado en el móvil)
(function recPanel() {
  const btn = document.createElement('button'); btn.className = 'mbtn'; btn.id = 'toStats'; btn.textContent = 'Récords';
  $('toControls').before(btn);
  const pn = document.createElement('div'); pn.className = 'panel wide'; pn.id = 'pStats'; pn.hidden = true;
  pn.innerHTML = `<div class="ptitle">Récords</div><div class="rec" id="recMine"></div>
    <div class="ptitle" style="font-size:28px;margin-top:6px">Ranking Tatanka</div><div class="rec" id="recAll"></div>
    <button class="btn" id="statsOk">Volver</button>`;
  $('pControls').after(pn);
  btn.onclick = () => { showPanel('pStats'); recShow(); };
  $('statsOk').onclick = () => showPanel('pMain');
})();
function recShow() {
  const d = REC.data, fmt = v => (v || 0).toLocaleString('es-ES');
  const mine = $('recMine'); if (!mine) return;
  mine.innerHTML = d ? `<b>Mejor sesión</b><span>${fmt(d.best)} puntos</span><b>Puntos en total</b><span>${fmt(d.total)}</span>
    <b>Mejor truco</b><span>${d.bt ? esc(d.bt) + ' · ' + fmt(d.btp) : '—'}</span><b>Empujones</b><span>${fmt(d.pw)} ganados · ${fmt(d.pl)} al agua</span><b>Sesiones</b><span>${fmt(d.ses)}</span>`
    : '<b>Aún nada</b><span>Sal a navegar: tus récords se guardan solos</span>';
  const list = Object.entries(REC.all || {}).map(([k, v]) => ({ me: k === REC.dev, ...(v.st || {}) })).filter(v => v.best > 0).sort((a, b) => b.best - a.best).slice(0, 10);
  $('recAll').innerHTML = list.length ? list.map((v, i) => `<span><b>${i + 1}. ${esc(v.nm || 'Rider')}${v.me ? ' (tú)' : ''}</b>${v.bt ? '<br><small>' + esc(v.bt) + '</small>' : ''}</span><span class="pts">${fmt(v.best)}</span>`).join('') : '<b>Vacío</b><span>Sé el primero</span>';
}

// ---- NOTAS DE VOZ (como en el surf): mantener pulsado 🎤, hablar y soltar (máx. 8 s). Las oyen todos los de la sala
$('place').textContent = 'TATANKA · PUERTO DE SAGUNTO';
const voiceEl = document.createElement('audio'); voiceEl.setAttribute('playsinline', ''); document.body.appendChild(voiceEl);
const micBtn = document.createElement('button'); micBtn.id = 'bMic'; micBtn.textContent = '🎤'; micBtn.setAttribute('aria-label', 'Mantén pulsado para grabar una nota de voz');
$('hud').appendChild(micBtn);   // a la derecha, a media altura (encima del círculo de los giros)
// botón del sonido (se recuerda en el móvil)
const sndBtn = document.createElement('button'); sndBtn.id = 'bSnd'; sndBtn.setAttribute('aria-label', 'Sonido');
const sndIcon = () => { sndBtn.textContent = SFX.on ? '🔊' : '🔇'; };
sndIcon(); $('bCam').after(sndBtn);
sndBtn.addEventListener('click', e => { e.stopPropagation(); SFX.on = !SFX.on; sndIcon(); try { localStorage.setItem('wake-sound', SFX.on ? 'on' : 'off'); } catch (er) {} sfxInit(); if (typeof musicUpdate === 'function') musicUpdate(); });
{ const st = document.createElement('style'); st.textContent = `
  #bMic { position: absolute; right: max(16px, env(safe-area-inset-right)); top: 46%; transform: translateY(-50%); width: 46px; height: 46px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.85); background: rgba(0,0,0,.18); color: #fff; font-size: 20px; pointer-events: auto; cursor: pointer; }
  #bMic.rec { background: #ff5a4e !important; border-color: #fff !important; animation: micpulse .45s ease-in-out infinite alternate; }
  @keyframes micpulse { from { transform: scale(1); } to { transform: scale(1.15); } }
  #voiceLog { position: absolute; left: 50%; top: 92px; transform: translateX(-50%); font: 700 13px system-ui, sans-serif; text-shadow: 0 1px 4px rgba(0,0,0,.8); pointer-events: none; text-align: center; }
  #voiceLog div { transition: opacity .6s; } #voiceLog div.old { opacity: 0; }`; document.head.appendChild(st); }
const voiceLog = document.createElement('div'); voiceLog.id = 'voiceLog'; $('hud').appendChild(voiceLog);
function logVoice(text) {
  const d = document.createElement('div'); d.textContent = text; voiceLog.prepend(d);
  while (voiceLog.children.length > 3) voiceLog.lastChild.remove();
  setTimeout(() => d.classList.add('old'), 6000); setTimeout(() => d.remove(), 7000);
}
let recV = null, recChunks = [], recTimer = 0, micStream = null, recMime = '';
function unlockVoice() { try { voiceEl.muted = true; const p = voiceEl.play(); if (p && p.then) p.then(() => { voiceEl.pause(); voiceEl.muted = false; }).catch(() => { voiceEl.muted = false; }); } catch (e) {} }
addEventListener('pointerdown', unlockVoice, { once: true, capture: true });
async function startRec(e) {
  e.preventDefault(); e.stopPropagation();
  if (recV) return;
  if (!NET.base) { logVoice('Sin conexión a la sala'); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { logVoice('Este navegador no deja grabar audio'); return; }
  try { if (!micStream) micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (err) { logVoice('Sin permiso para el micrófono'); return; }
  recMime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  recChunks = [];
  recV = new MediaRecorder(micStream, recMime ? { mimeType: recMime, audioBitsPerSecond: 32000 } : undefined);
  recV.ondataavailable = ev => { if (ev.data && ev.data.size) recChunks.push(ev.data); };
  recV.onstop = () => {
    const blob = new Blob(recChunks, { type: recV.mimeType || recMime || 'audio/webm' });
    recV = null; micBtn.classList.remove('rec');
    if (blob.size < 1500) return;                         // pulsación demasiado corta
    if (blob.size > 280000) { logVoice('Nota de voz demasiado larga'); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const ref = NET.base.child('msgs').push();
      ref.set({ au: String(fr.result), id: NET.id, nm: ($('nick').value.trim() || RIDER_INFO[RIDER_NAME][0]).slice(0, 16), at: firebase.database.ServerValue.TIMESTAMP })
        .then(() => logVoice('🎤 Tu nota de voz, enviada')).catch(() => logVoice('No se ha podido enviar'));
      setTimeout(() => ref.remove().catch(() => {}), 60000);   // se borra al minuto
    };
    fr.readAsDataURL(blob);
  };
  recV.start(); micBtn.classList.add('rec');
  clearTimeout(recTimer); recTimer = setTimeout(stopRec, 8000);
}
function stopRec() { clearTimeout(recTimer); if (recV && recV.state === 'recording') recV.stop(); }
micBtn.addEventListener('pointerdown', startRec);
micBtn.addEventListener('pointerup', stopRec); micBtn.addEventListener('pointercancel', stopRec); micBtn.addEventListener('pointerleave', stopRec);
micBtn.addEventListener('contextmenu', e => e.preventDefault());
function onVoice(m) {
  if (m.id === NET.id || typeof m.au !== 'string' || !/^data:audio\/[a-z0-9.+;=-]+;base64,/i.test(m.au)) return;
  if (typeof m.at === 'number' && netNow() - m.at > 15000) return;
  logVoice('🔊 ' + (m.nm || 'Rider'));
  try { voiceEl.src = m.au; voiceEl.volume = 1; const pr = voiceEl.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
}
function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '700 34px system-ui, sans-serif'; x.textAlign = 'center'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.6)'; x.strokeText(text, 128, 44); x.fillStyle = '#fff'; x.fillText(text, 128, 44);
  const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false, transparent: true })); sp.scale.set(2.4, 0.6, 1); sp.renderOrder = 5; return sp;
}
// el rider de otro jugador: su personaje, su tabla, su cuerda y su nombre encima
function buildPeer(P) {
  const st = P.st, name = RIDERS[P.ch] ? P.ch : 'senen', src = RIDERS[name]; if (!src) return null;
  const root = new T.Group(), h = setupHuman({ scene: T.SkeletonUtils.clone(src.sc) }); if (!h) return null;
  const board = BOARDS[st.b] ? BOARDS[st.b].clone() : BOARDS[0].clone();
  root.add(board, h.root); scene.add(root);
  const rope = new T.Mesh(CYL, ropeMat); scene.add(rope);
  const label = makeLabel(st.n || 'Rider'); label.position.set(0, 2.3, 0); root.add(label);
  return { root, h, board, rope, label, ch: P.ch, b: st.b, n: st.n };
}
const peerTmp = { tow: V3(), hand: V3(), a: V3(), d: V3(), q: new T.Quaternion() };
function updatePeers(dt) {
  if (!READY.on) return;
  for (const id in NET.peers) {
    const P = NET.peers[id], st = P.st;
    if (!st || !st.p || performance.now() - P.seen > 6000) { if (P.vis) { P.vis.root.visible = P.vis.rope.visible = false; } continue; }
    if (P.vis && (P.vis.ch !== P.ch || P.vis.b !== st.b || P.vis.n !== st.n)) { scene.remove(P.vis.root, P.vis.rope); P.vis = null; }
    if (!P.vis) { P.vis = buildPeer(P); P.first = true; if (!P.vis) continue; }
    const V = P.vis; V.root.visible = V.rope.visible = true;
    // posición respecto a la barca (la misma barca para todos) suavizada entre mensajes
    const td = peerTmp.d.set(st.dx, st.dy, st.dz), qq = peerTmp.q.set(st.q[0], st.q[1], st.q[2], st.q[3]).normalize();
    if (P.first) { P.d.copy(td); P.q.copy(qq); P.first = false; }
    P.d.lerp(td, clamp(dt * 10, 0, 1)); P.q.slerp(qq, clamp(dt * 12, 0, 1));
    V.root.position.set(boat.position.x + P.d.x, P.d.y, boat.position.z + P.d.z); V.root.quaternion.copy(P.q);
    V.root.updateMatrixWorld(true);
    computePose(st.c, st.l, st.g || null, st.g ? 1 : 0, !!st.ho, st.rl || 0, st.sw ? -1 : 1);
    poseHuman(V.h, J);
    // la cuerda: de la torre de la Tatanka a las manos
    peerTmp.tow.copy(BOAT.towLocal).applyMatrix4(boat.matrixWorld);
    if (V.h.knuckL) { V.h.knuckL.getWorldPosition(peerTmp.hand); V.h.knuckR.getWorldPosition(peerTmp.a); peerTmp.hand.add(peerTmp.a).multiplyScalar(0.5); }
    else peerTmp.hand.copy(V.root.position).add(V3(0, 1, 0));
    if (!st.ho) peerTmp.hand.lerp(peerTmp.tow, 0.4).setY(0.1);
    setRod(V.rope, 0.009, peerTmp.tow, peerTmp.hand);
  }
}

// =====================================================================================
//  BUCLE
// =====================================================================================
const GAME = { running: false, paused: false, t: 0 };
function togglePause() { if (!GAME.running) return; GAME.paused = !GAME.paused; msg(GAME.paused ? 'PAUSA' : ''); sfxUpdate(); musicUpdate(); }
$('bPause').onclick = togglePause; $('bCam').onclick = nextCam;
// Omar y su tabla (si el móvil tiene guardado un index.html viejo sin ellos, se añaden aquí)
if (!document.querySelector('#riders .opt[data-r="omar"]')) {
  const c = document.querySelector('#riders .opt[data-r="rupert"]').cloneNode(true); c.dataset.r = 'omar'; c.classList.remove('sel');
  c.querySelector('.portrait').style.backgroundImage = 'url(avatar-omar.jpg)'; c.querySelector('.face').style.backgroundImage = 'url(avatar-omar.jpg)';
  c.querySelector('b').textContent = 'Omar'; c.querySelector('em').textContent = 'Neopreno Billabong · tatuaje en el tobillo';
  $('riders').appendChild(c);
}
if (!document.querySelector('#riders .opt[data-r="juanp"]')) {
  const c = document.querySelector('#riders .opt[data-r="rupert"]').cloneNode(true); c.dataset.r = 'juanp'; c.classList.remove('sel');
  c.querySelector('.portrait').style.backgroundImage = 'url(avatar-juanp.jpg)'; c.querySelector('.face').style.backgroundImage = 'url(avatar-juanp.jpg)';
  c.querySelector('b').textContent = 'JuanP'; c.querySelector('em').textContent = 'Neopreno corto · faro y onda tatuados';
  $('riders').appendChild(c);
}
if (!$('patrons')) {
  const t = document.createElement('div'); t.className = 'ptitle'; t.style.fontSize = '30px'; t.textContent = 'Patrón';
  const g = document.createElement('div'); g.className = 'cards'; g.id = 'patrons'; g.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
  for (const [k, nm, av] of [['rupert', 'Rupert', 'avatar-rupert.jpg'], ['senen', 'Senén', 'avatar.jpg'], ['omar', 'Omar', 'avatar-omar.jpg'], ['juanp', 'JuanP', 'avatar-juanp.jpg']]) {
    const b = document.createElement('button'); b.className = 'opt card'; b.dataset.p = k;
    b.innerHTML = `<span class="portrait" style="aspect-ratio:1;background-image:url(${av})"></span><b style="font-size:16px">${nm}</b>`;
    g.appendChild(b);
  }
  const tabla = $('boards').previousElementSibling; tabla.before(t, g);
  const sub = document.querySelector('#pChars .psub'); if (sub) sub.textContent = 'Elige quién hace wake y quién lleva la barca';
}
if (!document.querySelector('#boards .opt[data-b="3"]')) {
  const c = document.querySelector('#boards .opt[data-b="2"]').cloneNode(true); c.dataset.b = '3'; c.classList.remove('sel');
  c.querySelector('b').textContent = 'Blanca'; c.querySelector('em').textContent = 'Camuflaje gris';
  $('boards').appendChild(c);
}
document.querySelectorAll('#boards .opt').forEach(b => b.onclick = () => { document.querySelectorAll('#boards .opt').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); setBoard(+b.dataset.b); });
document.querySelectorAll('#cams .opt').forEach(b => b.onclick = () => setCam(+b.dataset.c));
const RIDER_INFO = { senen: ['Senén', 'avatar.jpg', 0], rupert: ['Rupert', 'avatar-rupert.jpg', 2], omar: ['Omar', 'avatar-omar.jpg', 3], juanp: ['JuanP', 'avatar-juanp.jpg', 1] };
document.querySelectorAll('#riders .opt').forEach(b => b.onclick = () => {
  document.querySelectorAll('#riders .opt').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
  const [name, av, board] = RIDER_INFO[b.dataset.r];
  setRider(b.dataset.r); $('riderName').textContent = name; $('avatar').style.backgroundImage = `url(${av})`;
  try { localStorage.setItem('wake-rider', b.dataset.r); } catch (e) {}
  document.querySelector(`#boards .opt[data-b="${board}"]`).click();
  pickPatron();
});
document.querySelectorAll('#patrons .opt').forEach(b => b.onclick = () => {
  PATRON = b.dataset.p; try { localStorage.setItem('wake-patron', PATRON); } catch (e) {}
  pickPatron();
});
function showPanel(id) { for (const p of ['pMain', 'pChars', 'pControls', 'pStats', 'pResult', 'pSettings']) if ($(p)) $(p).hidden = p !== id; }
$('toChars').onclick = () => showPanel('pChars'); $('charsOk').onclick = () => showPanel('pMain');
$('toControls').onclick = () => showPanel('pControls'); $('controlsOk').onclick = () => showPanel('pSettings');
// ---- MÚSICA: cada uno elige su canción del móvil. No se sube a internet: se guarda solo en ese móvil
//      (IndexedDB) y suena durante la sesión, junto con los efectos del agua y del motor
const MUSIC = { el: document.createElement('audio'), on: true, has: false, name: '' };
MUSIC.el.loop = true; MUSIC.el.setAttribute('playsinline', ''); MUSIC.el.volume = 0.55; document.body.appendChild(MUSIC.el);
try { MUSIC.on = localStorage.getItem('wake-music') !== 'off'; } catch (e) {}
function musicDB(fn) {
  try {
    const rq = indexedDB.open('wake', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('musica');
    rq.onsuccess = () => { try { fn(rq.result.transaction('musica', 'readwrite').objectStore('musica')); } catch (e) {} };
  } catch (e) {}
}
function musicSet(blob, name) {
  if (MUSIC.el.src) URL.revokeObjectURL(MUSIC.el.src);
  MUSIC.el.src = URL.createObjectURL(blob); MUSIC.has = true; MUSIC.name = name; musicLabel();
}
const musPick = document.createElement('input'); musPick.type = 'file'; musPick.accept = 'audio/*,video/mp4,.mp3,.m4a,.mp4'; musPick.hidden = true; document.body.appendChild(musPick);
const musBtn = document.createElement('button'); musBtn.className = 'mbtn'; musBtn.id = 'musBtn';
const musOff = document.createElement('button'); musOff.className = 'mbtn'; musOff.id = 'musOff';
// volumen de la música y de los efectos (se recuerdan en el móvil)
const VOL = { music: 70, fx: 90 };
try { const v = JSON.parse(localStorage.getItem('wake-vol') || '{}'); if (v.music != null) VOL.music = v.music; if (v.fx != null) VOL.fx = v.fx; } catch (e) {}
{ const st = document.createElement('style'); st.textContent = `
  .volrow { display: flex; align-items: center; gap: 10px; font-family: var(--stamp); font-size: 14px; text-shadow: 0 1px 4px rgba(0,0,0,.6); }
  .volrow span { width: 118px; } .volrow input { flex: 1; max-width: 190px; accent-color: #ffc56b; }`; document.head.appendChild(st); }
const volBox = document.createElement('div');
volBox.innerHTML = `<label class="volrow"><span>Volumen música</span><input type="range" min="0" max="100" id="volMusic"></label>
  <label class="volrow"><span>Volumen efectos</span><input type="range" min="0" max="100" id="volFx"></label>`;
$('loadLine').after(volBox);
$('volMusic').value = VOL.music; $('volFx').value = VOL.fx;
const volSave = () => { try { localStorage.setItem('wake-vol', JSON.stringify(VOL)); } catch (e) {} };
$('volMusic').oninput = e => { VOL.music = +e.target.value; volSave(); if (typeof ytUpdate === 'function') ytUpdate(); };
$('volFx').oninput = e => { VOL.fx = +e.target.value; volSave(); sfxInit(); sfxUpdate(); };
function musicLabel() {
  musBtn.textContent = MUSIC.has ? '🎵 ' + MUSIC.name.slice(0, 22) : '🎵 Elegir canción';
  musOff.textContent = 'Música: ' + (MUSIC.on ? 'sí' : 'no'); musOff.hidden = !MUSIC.has;
}
musicLabel();
musBtn.onclick = () => musPick.click();
musPick.onchange = () => {
  const f = musPick.files && musPick.files[0]; if (!f) return;
  const name = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\b(official|hd|video|audio|lyrics)\b/gi, '').replace(/\s+/g, ' ').trim() || 'Mi canción';
  musicSet(f, name);
  musicDB(st => st.put({ blob: f, name }, 'cancion'));
  musPick.value = '';
};
musOff.onclick = () => { MUSIC.on = !MUSIC.on; try { localStorage.setItem('wake-music', MUSIC.on ? 'on' : 'off'); } catch (e) {} musicLabel(); musicUpdate(); };
function musicUpdate() {   // suena mientras navegas (no en pausa, ni en el menú, ni con el sonido quitado)
  if (typeof ytUpdate === 'function') ytUpdate();
  const want = MUSIC.has && MUSIC.on && SFX.on && GAME.running && !GAME.paused && !document.hidden;
  if (want && MUSIC.el.paused) { const pr = MUSIC.el.play(); if (pr && pr.catch) pr.catch(() => {}); }
  else if (!want && !MUSIC.el.paused) MUSIC.el.pause();
}
document.addEventListener('visibilitychange', musicUpdate);
// ---- MÚSICA DE YOUTUBE para todos: el vídeo oficial de «Insane in the Brain» (canal CypressHillVEVO),
//      reproducido con el reproductor de YouTube (no se copia la canción). El reproductor no se ve: solo suena.
//      Si en el móvil se ha elegido una canción propia, suena esa
const YTM = { id: 'RijB8wnJCN0', title: 'Cypress Hill · Insane in the Brain', player: null, ready: false, on: true, playing: false };
try { YTM.on = localStorage.getItem('wake-yt') !== 'off'; } catch (e) {}
{ const st = document.createElement('style'); st.textContent = `
  #ytBox { position: fixed; z-index: -1; width: 200px; height: 113px; left: 0; bottom: 0; opacity: 0.001; pointer-events: none; overflow: hidden; }   /* solo suena: no se ve */
  #ytBox iframe { width: 100%; height: 100%; border: 0; }`; document.head.appendChild(st); }
const ytBox = document.createElement('div'); ytBox.id = 'ytBox'; ytBox.innerHTML = '<div id="ytPlayer"></div>'; document.body.appendChild(ytBox);
window.onYouTubeIframeAPIReady = () => {
  YTM.player = new window.YT.Player('ytPlayer', {
    videoId: YTM.id, width: 200, height: 113,
    playerVars: { playsinline: 1, controls: 1, rel: 0, modestbranding: 1, loop: 1, playlist: YTM.id },
    events: {
      onReady: () => { YTM.ready = true; ytUpdate(); },
      onError: e => { YTM.err = e.data; console.warn('YouTube error', e.data); },
      onStateChange: e => { if (e.data === 0) { YTM.player.seekTo(0); YTM.player.playVideo(); } YTM.playing = e.data === 1; },
    },
  });
};
loadScript('https://www.youtube.com/iframe_api').catch(() => {});
function ytWanted() { return VOL.music > 0 && SFX.on && GAME.running && !GAME.paused && !document.hidden; }
function ytUpdate() {
  const want = ytWanted();
  if (!YTM.ready) return;
  try { YTM.player.setVolume(VOL.music); } catch (e) {}
  try { if (want && !YTM.playing) YTM.player.playVideo(); else if (!want && YTM.playing) YTM.player.pauseVideo(); } catch (e) {}
}
const ytBtn = document.createElement('button'); ytBtn.className = 'mbtn'; ytBtn.id = 'ytBtn';
const ytLabel = () => { ytBtn.textContent = '▶ YouTube: ' + (YTM.on ? 'Insane in the Brain' : 'no'); };

ytBtn.onclick = () => { YTM.on = !YTM.on; try { localStorage.setItem('wake-yt', YTM.on ? 'on' : 'off'); } catch (e) {} ytLabel(); ytUpdate(); };
document.addEventListener('visibilitychange', ytUpdate);
$('camBtn').onclick = () => { setCam((CAM.mode + 1) % CAM.names.length); $('camBtn').textContent = 'Cámara: ' + CAM.names[CAM.mode].toLowerCase(); };
// en el móvil se pone en pantalla completa sola al primer toque (el navegador no deja hacerlo sin tocar)
function autoFullscreen(e) {
  const d = document.documentElement;
  if (!IS_MOBILE || document.fullscreenElement || !d.requestFullscreen || (e.target && e.target.id === 'fsBtn')) return;
  d.requestFullscreen({ navigationUI: 'hide' }).then(unlockOrientation).catch(() => {});
}
// la orientación queda libre: se juega en horizontal o en vertical, según se gire el móvil
function unlockOrientation() { try { const o = screen.orientation; if (o && o.unlock) o.unlock(); } catch (er) {} }
addEventListener('pointerup', autoFullscreen, true); addEventListener('touchend', autoFullscreen, true);
// AJUSTES: volúmenes, cámara y controles en su propia pestaña. La pantalla completa ya se pone sola;
// el botón solo sale en iPhone/iPad, donde el navegador no deja hacerlo desde la web
{
  const pn = document.createElement('div'); pn.className = 'panel wide'; pn.id = 'pSettings'; pn.hidden = true;
  pn.innerHTML = '<div class="ptitle">Ajustes</div><div id="setBox" style="display:flex;flex-direction:column;gap:12px"></div><nav class="mainmenu" id="setNav"></nav>';
  $('pMain').after(pn);
  $('setBox').appendChild(volBox);
  const nav = $('setNav'); nav.appendChild($('camBtn')); nav.appendChild($('toControls'));
  const back = document.createElement('button'); back.className = 'btn'; back.textContent = 'Volver'; back.onclick = () => showPanel('pMain'); nav.appendChild(back);
  const b = document.createElement('button'); b.className = 'mbtn'; b.id = 'toSettings'; b.textContent = 'Ajustes'; b.onclick = () => showPanel('pSettings');
  $('toStats').after(b);
  const IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!IOS) $('fsBtn').hidden = true;
}
$('fsBtn').onclick = () => {
  if (!document.documentElement.requestFullscreen && !document.fullscreenElement) { $('fsBtn').textContent = 'Compartir → «Añadir a inicio»'; return; }
   const d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen().catch(() => {}); };
try { const n = localStorage.getItem('wake-nick'); if (n) $('nick').value = n; } catch (e) {}
$('nick').addEventListener('input', () => { try { localStorage.setItem('wake-nick', $('nick').value.trim()); } catch (e) {} });
// ---- SESIONES de 2 minutos y medio: al acabar, la puntuación, el mejor truco y el récord
const SESSION = { len: 150, t: 0, tricks: 0, best: '', bestPts: 0 };
{ const tm = document.createElement('div'); tm.id = 'timer';
  tm.style.cssText = 'position:absolute;right:max(14px,env(safe-area-inset-right));top:calc(62px + env(safe-area-inset-top));font:800 20px/1 system-ui,sans-serif;letter-spacing:.06em;text-shadow:0 2px 6px rgba(0,0,0,.6);pointer-events:none';
  $('hud').appendChild(tm);
  const pn = document.createElement('div'); pn.className = 'panel wide'; pn.id = 'pResult'; pn.hidden = true;
  pn.innerHTML = `<div class="ptitle">¡Sesión terminada!</div><div class="rec" id="resBox"></div>
    <nav class="mainmenu"><button class="btn" id="again">Otra sesión</button><button class="mbtn" id="resMenu">Menú</button></nav>`;
  $('pMain').after(pn); }
function startSession() {
  const R = RIDER; R.score = 0; R.history = {}; $('score').textContent = '0';
  REC.lastScore = 0; REC.counted = false; REC.bestTrick = ''; REC.bestTrickPts = 0;
  SESSION.t = SESSION.len; SESSION.tricks = 0; SESSION.best = ''; SESSION.bestPts = 0;
}
function tickSession(dt) {
  SESSION.t -= dt;
  const s_ = Math.max(0, Math.ceil(SESSION.t)), el = $('timer');
  el.textContent = `${Math.floor(s_ / 60)}:${String(s_ % 60).padStart(2, '0')}`;
  el.style.color = s_ <= 10 ? '#ff5a4e' : '#fff';
  if (SESSION.t <= 0 && RIDER.state !== 'air') endSession();      // si va en el aire, se espera a que caiga
}
function endSession() {
  const R = RIDER, prev = (REC.data && REC.data.best) || 0, sc = R.score;
  recSave();                                                       // se guarda con el juego aún en marcha
  GAME.running = false; $('hud').hidden = true; $('menu').hidden = false; showPanel('pResult'); musicUpdate();
  const list = Object.entries(REC.all || {}).map(([k, v]) => ({ me: k === REC.dev, best: k === REC.dev ? Math.max(sc, prev) : ((v.st || {}).best || 0) })).sort((a, b) => b.best - a.best);
  const pos = list.findIndex(v => v.me) + 1, fmt = v => (v || 0).toLocaleString('es-ES');
  $('resBox').innerHTML = `<b>Puntos</b><span style="font:400 34px var(--display, sans-serif)">${fmt(sc)}</span>
    <b>Mejor truco</b><span>${SESSION.best ? esc(SESSION.best) + ' · ' + fmt(SESSION.bestPts) : '—'}</span>
    <b>Trucos</b><span>${SESSION.tricks}</span>
    <b>Tu récord</b><span>${sc > prev ? '🏆 ¡Nuevo récord! (antes ' + fmt(prev) + ')' : fmt(prev)}</span>
    ${pos ? `<b>Ranking</b><span>${pos}º de ${list.length}</span>` : ''}`;
  msg('');
}
$('again').onclick = () => $('go').onclick();
$('resMenu').onclick = () => showPanel('pMain');
$('go').onclick = () => {
  setTimeout(musicUpdate, 50);
  pickLane(); startSession();
  $('menu').hidden = true; $('hud').hidden = false; GAME.running = true; getUp(); setCam(CAM.mode);
  if (IS_MOBILE) {
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).then(unlockOrientation).catch(() => {});
  }
};
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); sprayMat.uniforms.uScale.value = innerHeight * 0.5; });

// =====================================================================================
//  FOTOS 3D DEL MENÚ: las tablas y los riders, renderizados con el mismo motor del juego
// =====================================================================================
const snapC = document.createElement('canvas');
function snapshot(sc, cam, w, h) {
  const pr = renderer.getPixelRatio(), cv = renderer.domElement;
  w = Math.min(w, innerWidth); h = Math.min(h, innerHeight);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  renderer.setScissorTest(true); renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
  renderer.render(sc, cam);
  snapC.width = Math.round(w * pr); snapC.height = Math.round(h * pr);
  snapC.getContext('2d').drawImage(cv, 0, cv.height - snapC.height, snapC.width, snapC.height, 0, 0, snapC.width, snapC.height);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  return snapC.toDataURL('image/jpeg', 0.88);
}
function boardShots() {
  const sc = new T.Scene(); sc.environment = scene.environment; sc.background = new T.Color(0x16202e);
  const l = new T.DirectionalLight(0xffffff, 2.6); l.position.set(1.5, 3, 2); sc.add(l, new T.HemisphereLight(0xdfeaff, 0x223040, 0.6));
  const cam = new T.PerspectiveCamera(26, 2, 0.05, 20);
  BOARDS.forEach((b, i) => {
    const m = b.clone(); m.rotation.set(0.32, -0.28, 0.06); sc.add(m);
    cam.position.set(0.04, 1.25, 1.2); cam.lookAt(0, 0.03, 0);
    const url = snapshot(sc, cam, 360, 170); sc.remove(m);
    const sw = document.querySelector(`#boards .opt[data-b="${i}"] .swatch`); if (sw) { sw.style.background = `#16202e url(${url}) center/cover`; sw.classList.add('shot'); }
  });
}
// los riders en el agua, de cuerpo entero y de tres cuartos (se hace una vez, cuando ya van surcando)
function riderShots() {
  const cam = new T.PerspectiveCamera(34, 0.8, 0.1, 3000), keep = RIDER_NAME, rp = riderRoot.position;
  const toBoat = V3().subVectors(towW, rp).setY(0).normalize();
  for (const name of ['senen', 'rupert', 'omar', 'juanp']) {
    if (!RIDERS[name]) continue;
    setRider(name); poseBody(J); riderRoot.updateMatrixWorld(true);
    cam.position.copy(rp).addScaledVector(CAM.chest, 2.5).addScaledVector(toBoat, 1.2).add(V3(0, 1.15, 0));
    cam.lookAt(rp.x, rp.y + 0.85, rp.z);
    const url = snapshot(scene, cam, 280, 350);
    const pt = document.querySelector(`#riders .opt[data-r="${name}"] .portrait`);
    if (pt) { pt.style.backgroundImage = `url(${url})`; pt.classList.add('shot'); }
  }
  setRider(keep); poseBody(J);
}

const clock = new T.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!GAME.paused) {
    GAME.t += dt;
    const t = GAME.t;
    U.uTime.value = t; skyMat.uniforms.uTime.value = t;
    netSyncBoat(dt);
    updateBoat(dt, t);
    poseDriver(BOAT.turn || 0, t);
    updateRider(dt, t);
    updateSpray(dt);
    updateTrail(dt, t);
    updatePeers(dt);
    sfxUpdate();
    checkPush(); drawPushBtn();
    netSend(dt);
    if (GAME.running) recTick(dt);
    if (GAME.running) tickSession(dt);
    $('speed').textContent = `${Math.round(BOAT.speed * 3.6)} KM/H · CUERDA ${ROPE.toFixed(0)} M`;
  }
  if (!window.__freeCam) updateCamera(dt);   // __freeCam: cámara libre para revisar el escenario
  // el agua cercana y la sombra siguen al rider
  const rp = riderRoot.position;
  waterNear.position.set(Math.round(rp.x / 2) * 2, 0, Math.round(rp.z / 2) * 2);
  sun.position.copy(rp).addScaledVector(SUN_DIR, 80); sun.target.position.copy(rp); sun.target.updateMatrixWorld();
  sky.position.copy(camera.position);
  if (READY.on && !READY.shots && READY.extras && GAME.t - READY.t > 2 && RIDER.state === 'ride') {
    READY.shots = true; try { riderShots(); } catch (e) { console.warn(e); }
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// en el menú: la barca ya navega y la cámara la sigue
updateBoat(0, 0); RIDER.theta = 0.05; updateRider(0.016, 0);
CAM.pos.copy(riderRoot.position).add(V3(-8, 4, -8));
try { boardShots(); } catch (e) { console.warn(e); }
loadModels();
$('load').textContent = '';
frame();
window.__game = { RIDER, BOAT, CAM, setCam, scene, camera, renderer, IN, GAME, wakeFrame, wakeR, startRollers };
