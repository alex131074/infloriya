/* 3D-шляпная коробка: крышка поднимается, внутри цветы. Чистый WebGL, без библиотек. */
(function () {
  var cv = document.getElementById('hb');
  var gl = cv && (cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || cv.getContext('experimental-webgl'));
  if (!gl) { document.documentElement.classList.add('no-gl'); window.HB = { scroll: function () {}, live: function () {} }; return; }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PI = Math.PI;

  /* ---------- математика ---------- */
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trans(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scl(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, t) { var z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
  function basis(d) { var y = norm(d), up = Math.abs(y[2]) < .9 ? [0, 0, 1] : [1, 0, 0], x = norm(cross(up, y)), z = cross(x, y); return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]); }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }

  /* ---------- геометрия ---------- */
  function Geo() { this.d = []; }
  Geo.prototype.surf = function (F, nu, nv, M) { // F(u,v) -> [x,y,z,m], нормали по разностям
    M = M || ident(); var P = [], i, j, e = 1e-3;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = F(u, v), pu = F(Math.min(1, u + e), v), pu2 = F(Math.max(0, u - e), v), pv = F(u, Math.min(1, v + e)), pv2 = F(u, Math.max(0, v - e));
      var n = cross([pu[0] - pu2[0], pu[1] - pu2[1], pu[2] - pu2[2]], [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]]);
      if (!(n[0] || n[1] || n[2])) n = [0, 1, 0];
      P.push([p, norm(n)]);
    }
    var w = nu + 1;
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = P[j * w + i], b = P[j * w + i + 1], c = P[(j + 1) * w + i + 1], d = P[(j + 1) * w + i];
      this.tri(a, b, c, M); this.tri(a, c, d, M);
    }
  };
  Geo.prototype.tri = function () {
    var M = arguments[3], self = this;
    for (var k = 0; k < 3; k++) {
      var q = arguments[k], p = q[0], n = q[1];
      self.d.push(M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
        M[0] * n[0] + M[4] * n[1] + M[8] * n[2], M[1] * n[0] + M[5] * n[1] + M[9] * n[2], M[2] * n[0] + M[6] * n[1] + M[10] * n[2], p[3]);
    }
  };
  Geo.prototype.upload = function () {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.d), gl.STATIC_DRAW);
    var n = this.d.length / 7; this.d = null; return { b: b, n: n };
  };

  /* лепесток: растёт вдоль y, края загибаются к центру цветка, кончик отгибается наружу */
  function petal(g, o) {
    var F = function (u, v) {
      var s = u * 2 - 1, w = o.w * Math.pow(Math.sin(PI * (.08 + .86 * v)), o.sh || .6);
      var x = s * w, y = o.l * v, z = -o.cup * s * s * w + o.curl * v * v * v * o.l;
      y -= o.tipDip ? o.tipDip * s * s * v * v : 0;
      return [x, y, z, o.m === undefined ? v : o.m];
    };
    g.surf(F, o.nu || 7, o.nv || 8, chain(rotY(o.a), trans(0, o.y || 0, o.r), rotX(o.t)));
  }
  function disc(g, r, h, m, M) { // приплюснутая полусфера: серединка, чашелистик
    g.surf(function (u, v) { var a = u * 2 * PI, b = v * PI / 2; return [Math.cos(a) * Math.cos(b) * r, Math.sin(b) * h, Math.sin(a) * Math.cos(b) * r, m]; }, 18, 5, M);
  }

  /* роза: тугой бутон внутри, раскрытые лепестки снаружи */
  var rose = new Geo(), GA = 2.39996;
  [[5, .14, .32, .5, .2, .25, .02], [5, .45, .42, .62, .3, .4, .06], [6, .8, .52, .72, .38, .5, .12], [6, 1.12, .6, .76, .44, .55, .22]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(rose, { a: k / L[0] * 2 * PI + li * .7, t: L[1], w: L[2], l: L[3], r: L[4] * .35, cup: L[5], curl: L[6], y: -li * .05 });
  });
  disc(rose, .34, -.28, .1, ident());
  var roseB = rose.upload();

  /* кустовая роза: маленькая и раскрытая */
  var spray = new Geo();
  [[5, .5, .3, .4, .2, .35, .05], [6, 1.0, .36, .46, .3, .3, .15]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(spray, { a: k / L[0] * 2 * PI + li * .6, t: L[1], w: L[2], l: L[3], r: L[4] * .3, cup: L[5], curl: L[6] });
  });
  disc(spray, .2, -.18, .1, ident());
  var sprayB = spray.upload();

  /* хризантема-ромашка: серединка и два ряда узких лепестков */
  var daisy = new Geo();
  [[18, 1.25, .1, .78, .02], [16, 1.5, .09, .7, .1]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(daisy, { a: (k + li * .5) / L[0] * 2 * PI, t: L[1], w: L[2], l: L[3], r: .18, cup: .5, curl: L[4], sh: .45, nu: 3, nv: 6, y: .04 - li * .03 });
  });
  disc(daisy, .24, .14, 2, trans(0, .02, 0));
  var daisyB = daisy.upload();

  /* лист эвкалипта/зелени */
  var leaf = new Geo();
  petal(leaf, { a: 0, t: 0, w: .26, l: 1.25, r: 0, cup: .25, curl: .25, sh: .9, nv: 9 });
  var leafB = leaf.upload();

  /* ---------- шейдеры ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute float aM;uniform mat4 uVP;uniform mat4 uW;varying vec3 vW;varying vec3 vN;varying float vM;void main(){vec4 w=uW*vec4(aP,1.);vW=w.xyz;vN=mat3(uW[0].xyz,uW[1].xyz,uW[2].xyz)*aN;vM=aM;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vW;varying vec3 vN;varying float vM;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uE;uniform float uFade;' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uE-vW);if(dot(N,V)<0.)N=-N;' +
    'vec3 base=vM<1.5?uC1*mix(.58,1.,smoothstep(0.,.95,vM)):uC2;' +
    'vec3 L1=normalize(vec3(-.55,.85,.65));vec3 L2=normalize(vec3(.8,.15,.35));' +
    'float d1=max(0.,dot(N,L1)*.7+.3);float d2=max(0.,dot(N,L2))*.3;float bl=max(0.,dot(-N,L1))*.3;' +
    'float rim=pow(1.-max(dot(N,V),0.),2.5);vec3 H=normalize(L1+V);float sp=pow(max(dot(N,H),0.),36.)*.1;' +
    'float ao=mix(.5,1.,smoothstep(-3.4,1.4,vW.y));' +
    'vec3 c=base*(.26+d1*.82+d2)*ao+base*bl*.8+vec3(sp)+base*rim*.25+vec3(1.,.93,.88)*rim*.12;' +
    'gl_FragColor=vec4(min(c,vec3(1.))*uFade,uFade);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; }
  var pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  var A = { p: gl.getAttribLocation(pg, 'aP'), n: gl.getAttribLocation(pg, 'aN'), m: gl.getAttribLocation(pg, 'aM') };
  var U = {}; ['uVP', 'uW', 'uC1', 'uC2', 'uE', 'uFade'].forEach(function (n) { U[n] = gl.getUniformLocation(pg, n); });
  gl.useProgram(pg); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  [A.p, A.n, A.m].forEach(function (l) { gl.enableVertexAttribArray(l); });

  function draw(buf, W, c1, c2) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(A.m, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix4fv(U.uW, false, W); gl.uniform3fv(U.uC1, c1); gl.uniform3fv(U.uC2, c2 || c1);
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }

  /* ---------- шляпная коробка ---------- */
  var COL = {
    pink: [.94, .55, .62], rasp: [.78, .2, .38], cream: [.98, .88, .76], peach: [.98, .74, .6], blush: [.99, .8, .82], white: [.98, .97, .94],
    lilac: [.78, .66, .9], yolk: [.92, .78, .3], green: [.27, .45, .33], euc: [.52, .64, .58], box: [.99, .84, .84], boxIn: [.98, .9, .88], rib: [.11, .36, .29]
  };
  var BR = 2, BH = 1.7;
  function cylG(r, y0, y1, m0, m1, inward) {
    var g = new Geo();
    g.surf(function (u, v) { var a = (inward ? 1 - u : u) * 2 * PI; return [Math.cos(a) * r, y0 + (y1 - y0) * v, Math.sin(a) * r, m0 + (m1 - m0) * v]; }, 64, 4);
    return g;
  }
  var box = cylG(BR, -BH, 0, .35, .95);
  box.surf(function (u, v) { var a = u * 2 * PI, r = BR - v * .06; return [Math.cos(a) * r, -v * .02, Math.sin(a) * r, .95]; }, 64, 1); // кромка
  var inner = cylG(BR - .06, -BH + .1, -.02, .2, .6, true);
  box.d = box.d.concat(inner.d);
  box.surf(function (u, v) { var a = u * 2 * PI, r = (1 - v) * (BR - .06); return [Math.cos(a) * r, -BH + .1, Math.sin(a) * r, .3]; }, 48, 2); // дно
  box.surf(function (u, v) { var a = (1 - u) * 2 * PI, r = (1 - v) * BR; return [Math.cos(a) * r, -BH, Math.sin(a) * r, .2]; }, 48, 2);
  var boxB = box.upload();
  var band = cylG(BR + .015, -BH * .62, -BH * .38, 2, 2);
  var bandB = band.upload();
  var lid = cylG(BR + .07, -.42, 0, .5, 1);
  lid.surf(function (u, v) { var a = (1 - u) * 2 * PI, r = (1 - v) * (BR + .07); return [Math.cos(a) * r, 0, Math.sin(a) * r, 1]; }, 48, 3);
  lid.surf(function (u, v) { var a = u * 2 * PI, r = (1 - v) * (BR + .07); return [Math.cos(a) * r, -.42, Math.sin(a) * r, .7]; }, 48, 2);
  var lidB = lid.upload();
  var bow = new Geo(); // бант на крышке: две петли и хвосты
  [-1, 1].forEach(function (s) {
    bow.surf(function (u, v) { var a = v * 2 * PI, w = (u - .5) * .34; return [s * (.45 + Math.cos(a) * .42), .22 + Math.sin(a) * .22 + .05, w + Math.sin(a) * .05, 2]; }, 3, 18);
    bow.surf(function (u, v) { return [s * (.15 + v * .7), .02, (u - .5) * .26 + v * .5, 2]; }, 2, 6);
  });
  bow.surf(function (u, v) { var a = u * 2 * PI; return [Math.cos(a) * .17, .08 + v * .26 * Math.sin(v * PI), Math.sin(a) * .17, 2]; }, 16, 4);
  var lidBand = cylG(BR + .085, -.36, -.08, 2, 2);
  lidBand.d = lidBand.d.concat(bow.d);
  var lidBandB = lidBand.upload();

  /* цветы шапкой над краем коробки */
  var MAX = 38, RF = 1.8, FL = [];
  var TYPES = [[roseB, 'pink', 1], [sprayB, 'white', 1.1], [roseB, 'peach', 1], [daisyB, 'white', .9], [roseB, 'blush', 1], [sprayB, 'lilac', 1.05], [roseB, 'cream', 1], [roseB, 'rasp', .95], [sprayB, 'pink', 1.05]];
  for (var i = 0; i < MAX; i++) {
    var rho = RF * Math.sqrt((i + .4) / MAX), th = i * GA, k = rho / RF;
    var pos = [Math.cos(th) * rho, .0 + .55 * (1 - k * k), Math.sin(th) * rho];
    var T = TYPES[(i * 4) % TYPES.length];
    FL.push({ pos: pos, dir: norm([pos[0] * .55, 1, pos[2] * .55]), b: T[0], c: COL[T[1]], s: T[2] * (.55 + .12 * ((i * 7) % 5) / 4), spin: i * 1.9, cur: 0 });
  }
  var LV = [];
  for (i = 0; i < 14; i++) LV.push({ a: i / 14 * 2 * PI + .3, c: i % 2 ? COL.euc : COL.green, s: .55 + (i % 3) * .08 });

  /* ---------- кадр ---------- */
  var W = 0, H = 0, live = true, last = 0, time = 0, mx = 0, my = 0, tmx = 0, tmy = 0, fade = 0, open = 0, scr = 0, scrT = 0;
  function resize() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H);
  }
  addEventListener('resize', function () { resize(); if (reduce) kick(); });
  if (matchMedia('(hover:hover)').matches) addEventListener('pointermove', function (e) { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });

  function step(dt) {
    var k = 1 - Math.exp(-dt * 5);
    fade += (1 - fade) * (1 - Math.exp(-dt * 3));
    mx += (tmx - mx) * k; my += (tmy - my) * k; scr += (scrT - scr) * k;
    var target = time > .5 ? 1 : 0;
    open += (target - open) * (1 - Math.exp(-dt * 2.2));
    FL.forEach(function (f, i) { var on = open > .2 + i * .014 ? 1 : 0; f.cur += (on - f.cur) * (1 - Math.exp(-dt * 6)); });
  }
  function render() {
    if (!W) resize();
    var asp = W / H, d = 12.5 * Math.max(1, .9 / asp);
    var az = (reduce ? .5 : .5 + Math.sin(time * .3) * .25) + mx * .5 + scr * .9, el = .52 + my * .1, tg = [0, -.2, 0];
    var eye = [Math.sin(az) * Math.cos(el) * d, tg[1] + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d];
    var VP = mul(persp(.5, asp, 1, 80), lookAt(eye, tg));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3f(U.uE, eye[0], eye[1], eye[2]); gl.uniform1f(U.uFade, fade);
    var root = trans(0, reduce ? 0 : Math.sin(time * .9) * .05, 0);
    draw(boxB, root, COL.box);
    draw(bandB, root, COL.rib, COL.rib);
    /* зелень по краю */
    LV.forEach(function (l, i) {
      var e = Math.min(1, Math.max(0, (open - .2) * 2)), sc = l.s * e; if (sc < .01) return;
      var p = [Math.cos(l.a) * (BR - .35), .0, Math.sin(l.a) * (BR - .35)];
      draw(leafB, chain(root, trans(p[0], p[1], p[2]), basis([p[0], .55, p[2]]), scl(sc, sc, sc)), l.c);
    });
    FL.forEach(function (f, i) {
      if (f.cur < .01) return;
      var e = f.cur, sz = f.s * e * e * (3 - 2 * e), sw = reduce ? 0 : Math.sin(time * 1.2 + i) * .02;
      draw(f.b, chain(root, trans(f.pos[0] * (1 + sw), f.pos[1] - (1 - e) * .4, f.pos[2]), basis(f.dir), rotY(f.spin), scl(sz, sz, sz)), f.c, COL.yolk);
    });
    /* крышка: поднимается и откидывается назад */
    var o = open * open * (3 - 2 * open), lift = o * (2.25 + scr * .8), tilt = -o * .55;
    var LW = chain(root, trans(0, lift, -o * 1.25), rotX(tilt), trans(0, 0, 0));
    draw(lidB, LW, COL.box);
    draw(lidBandB, LW, COL.rib, COL.rib);
  }
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;
    step(dt); render();
    if (live) requestAnimationFrame(frame);
  }
  var pending = false;
  function kick() {
    if (!reduce || pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; time += 10; for (var i = 0; i < 80; i++) step(.05); render(); });
  }
  window.HB = {
    scroll: function (p) { scrT = Math.max(0, Math.min(1, p)); kick(); },
    live: function (v) { if (reduce || v === live) return; live = v; if (v) { last = performance.now(); requestAnimationFrame(frame); } }
  };
  resize();
  if (reduce) { kick(); live = false; } else requestAnimationFrame(frame);
})();
