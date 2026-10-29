// اختبارات نمط "تداخل الأشكال" — التشغيل: node tests/shape.test.js
var fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
var src = fs.readFileSync(path.join(__dirname, "..", "LaserNesting.jsx"), "utf8").replace(/^#target.*$/m, "");
var MM = 72 / 25.4;

/* ---------- محاكاة عناصر الإليستريتور (مسارات بيزيه حقيقية) ---------- */
function P(x, y) { return { anchor: [x, y], leftDirection: [x, y], rightDirection: [x, y] }; }
function sample(pts, closed, steps) {
    var out = [], n = pts.length, segs = closed ? n : n - 1, i, k, a, b, t, m;
    for (i = 0; i < segs; i++) {
        a = pts[i]; b = pts[(i + 1) % n];
        for (k = 0; k < steps; k++) {
            t = k / steps; m = 1 - t;
            out.push([m*m*m*a.anchor[0] + 3*m*m*t*a.rightDirection[0] + 3*m*t*t*b.leftDirection[0] + t*t*t*b.anchor[0],
                      m*m*m*a.anchor[1] + 3*m*m*t*a.rightDirection[1] + 3*m*t*t*b.leftDirection[1] + t*t*t*b.anchor[1]]);
        }
    }
    if (!closed) out.push(pts[n - 1].anchor.slice());
    return out;
}
function MockPath(pts, closed) { this.typename = "PathItem"; this.pathPoints = pts; this.closed = closed; this.guides = false; this.clipping = false; }
function MockCompound(paths) { this.typename = "CompoundPathItem"; this.pathItems = paths; }
function MockGroup(items) { this.typename = "GroupItem"; this.pageItems = items; this.clipped = false; }
function allPaths(it) { if (it.typename === "PathItem") return [it]; var arr = it.pathItems || it.pageItems, o = [], i; for (i = 0; i < arr.length; i++) o = o.concat(allPaths(arr[i])); return o; }
function visiblePaths(it) {
    if (it.typename === "GroupItem" && it.clipped) return it.pageItems.filter(function (c) { return c.typename === "PathItem" && c.clipping; });
    if (it.typename === "PathItem") return [it];
    var arr = it.pathItems || it.pageItems, o = [];
    arr.forEach(function (c) { o = o.concat(visiblePaths(c)); });
    return o;
}
function bounds(it) {
    if (it.typename === "TextFrame") return [it.l, it.t, it.l + it.w, it.t - it.h];
    var ps = visiblePaths(it), mnx = 1e30, mxx = -1e30, mny = 1e30, mxy = -1e30;
    ps.forEach(function (p) { sample(p.pathPoints, p.closed, 40).forEach(function (q) { mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]); }); });
    return [mnx, mxy, mxx, mny];
}
function xform(it, f) { allPaths(it).forEach(function (p) { p.pathPoints.forEach(function (q) { q.anchor = f(q.anchor); q.leftDirection = f(q.leftDirection); q.rightDirection = f(q.rightDirection); }); }); }
[MockPath, MockCompound, MockGroup].forEach(function (C) {
    Object.defineProperty(C.prototype, "geometricBounds", { get: function () { return bounds(this); } });
    Object.defineProperty(C.prototype, "visibleBounds", { get: function () { return bounds(this); } });
    C.prototype.translate = function (dx, dy) { xform(this, function (p) { return [p[0] + dx, p[1] + dy]; }); };
    C.prototype.rotate = function (deg) {
        var b = bounds(this), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, th = deg * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
        xform(this, function (p) { var dx = p[0] - cx, dy = p[1] - cy; return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs]; });
    };
    C.prototype.duplicate = function () { return this; };
});
function MockText(l, t, w, h) { this.typename = "TextFrame"; this.l = l; this.t = t; this.w = w; this.h = h; }
Object.defineProperty(MockText.prototype, "geometricBounds", { get: function () { return bounds(this); } });
Object.defineProperty(MockText.prototype, "visibleBounds", { get: function () { return bounds(this); } });
MockText.prototype.translate = function (dx, dy) { this.l += dx; this.t += dy; };
MockText.prototype.rotate = function () { var cx = this.l + this.w / 2, cy = this.t - this.h / 2, nw = this.h, nh = this.w; this.w = nw; this.h = nh; this.l = cx - nw / 2; this.t = cy + nh / 2; };
function poly(coords) { return new MockPath(coords.map(function (c) { return P(c[0], c[1]); }), true); }
function rect(l, t, w, h) { return poly([[l, t], [l + w, t], [l + w, t - h], [l, t - h]]); }
function circle(cx, cy, r) {
    var k = 0.5522847498 * r;
    return new MockPath([
        { anchor: [cx + r, cy], leftDirection: [cx + r, cy - k], rightDirection: [cx + r, cy + k] },
        { anchor: [cx, cy + r], leftDirection: [cx + k, cy + r], rightDirection: [cx - k, cy + r] },
        { anchor: [cx - r, cy], leftDirection: [cx - r, cy + k], rightDirection: [cx - r, cy - k] },
        { anchor: [cx, cy - r], leftDirection: [cx - k, cy - r], rightDirection: [cx + k, cy - r] }], true);
}
function mm(v) { return v * MM; }

/* ---------- هندسة التحقق (مستقلة عن المحرك) ---------- */
function ringsOf(it) { return visiblePaths(it).map(function (p) { return { pts: sample(p.pathPoints, p.closed, 16), closed: p.closed }; }); }
function segDist(a, b, c, d) { // أقل مسافة بين قطعتين مستقيمتين
    function pd(p, s, e) { var vx = e[0]-s[0], vy = e[1]-s[1], l = vx*vx+vy*vy, t = l ? Math.max(0, Math.min(1, ((p[0]-s[0])*vx + (p[1]-s[1])*vy) / l)) : 0, x = s[0]+t*vx-p[0], y = s[1]+t*vy-p[1]; return Math.sqrt(x*x+y*y); }
    function inter(p1, p2, p3, p4) { function o(a, b, c) { return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]); } var d1 = o(p3,p4,p1), d2 = o(p3,p4,p2), d3 = o(p1,p2,p3), d4 = o(p1,p2,p4); return d1*d2 < 0 && d3*d4 < 0; }
    if (inter(a, b, c, d)) return 0;
    return Math.min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b));
}
function minDist(A, B) {
    var best = 1e30;
    ringsOf(A).forEach(function (ra) { ringsOf(B).forEach(function (rb) {
        var na = ra.pts.length, nb = rb.pts.length, i, j;
        for (i = 0; i < (ra.closed ? na : na - 1); i++) for (j = 0; j < (rb.closed ? nb : nb - 1); j++)
            best = Math.min(best, segDist(ra.pts[i], ra.pts[(i+1)%na], rb.pts[j], rb.pts[(j+1)%nb]));
    }); });
    return best;
}
function solid(it, pt) { // هل النقطة داخل مادة القطعة (الثقوب مستثناة)
    function pip(poly, p) { var c = false, i, j; for (i = 0, j = poly.length - 1; i < poly.length; j = i++) if (((poly[i][1] > p[1]) !== (poly[j][1] > p[1])) && (p[0] < (poly[j][0]-poly[i][0]) * (p[1]-poly[i][1]) / (poly[j][1]-poly[i][1]) + poly[i][0])) c = !c; return c; }
    if (it.typename === "PathItem") return it.closed && pip(sample(it.pathPoints, true, 16), pt);
    if (it.typename === "CompoundPathItem") { var n = 0; it.pathItems.forEach(function (p) { if (pip(sample(p.pathPoints, true, 16), pt)) n++; }); return n % 2 === 1; }
    return (it.clipped ? visiblePaths(it) : it.pageItems).some(function (c) { return solid(c, pt); });
}
function firstPt(it) { return visiblePaths(it)[0].pathPoints[0].anchor; }
function assertSeparated(items, gap, tol, label) {
    var worst = 1e30, i, j;
    for (i = 0; i < items.length; i++) for (j = i + 1; j < items.length; j++) {
        assert(!solid(items[j], firstPt(items[i])) && !solid(items[i], firstPt(items[j])), label + ": قطعتان متداخلتان " + i + "," + j);
        var d = minDist(items[i], items[j]);
        worst = Math.min(worst, d);
        assert(d >= gap - tol, label + ": المسافة " + (d / MM).toFixed(2) + "مم أقل من المطلوب بين " + i + "," + j);
    }
    return worst;
}
function allPts(it) { var o = []; ringsOf(it).forEach(function (r) { o = o.concat(r.pts); }); return o; }
function assertInRect(it, l, t, r, b, label) { allPts(it).forEach(function (p) { assert(p[0] >= l - 0.05 && p[0] <= r + 0.05 && p[1] <= t + 0.05 && p[1] >= b - 0.05, label + ": جزء خارج المساحة"); }); }

/* ---------- بيئة التشغيل ---------- */
var mock;
function makeCtx(artboards, selection) {
    var abs = artboards.map(function (a) { return { artboardRect: a.slice(0), name: "" }; });
    abs.getActiveArtboardIndex = function () { return 0; };
    abs.add = function (r) { var x = { artboardRect: r.slice(0), name: "" }; abs.push(x); return x; };
    mock = { alerts: [] };
    var doc = { selection: selection, artboards: abs };
    var ctx = { NESTING_NO_AUTORUN: true, app: { documents: { length: 1 }, activeDocument: doc, redraw: function () {}, coordinateSystem: 0 },
        CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 1 }, alert: function (m) { mock.alerts.push(m); } };
    vm.createContext(ctx); vm.runInContext(src, ctx); ctx.__doc = doc; return ctx;
}
var base = { mode: "shape", cellMM: 1, timeLimit: 0, rotation: "none", source: "frame", gapMM: 3, marginMM: 3, sort: "auto", useVisible: false, newSheets: false, maxSheets: 0, createArtboards: true, overflow: false, sheetGapMM: 20 };
function opts(o) { var r = {}, k; for (k in base) r[k] = base[k]; for (k in o) r[k] = o[k]; return r; }
function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
var passed = 0;
function test(name, fn) { var t0 = Date.now(); fn(); passed++; console.log("  ✓ " + name + "  (" + (Date.now() - t0) + "ms)"); }

/* ---------- الاختبارات ---------- */
test("مثلثات قائمة: التداخل يتّسع لعدد أكبر مما تتّسع له المستطيلات المحيطة", function () {
    function build() { var f = rect(0, mm(200), mm(200), mm(200)), tri = [], i; for (i = 0; i < 20; i++) tri.push(poly([[mm(900), mm(900 + i * 70)], [mm(960), mm(900 + i * 70)], [mm(900), mm(840 + i * 70)]])); return { f: f, tri: tri }; }
    var s = build(), c1 = makeCtx([[0, mm(200), mm(200), 0]], [s.f].concat(s.tri));
    var rectRes = c1.main(opts({ mode: "rect" }));
    s = build(); var c2 = makeCtx([[0, mm(200), mm(200), 0]], [s.f].concat(s.tri));
    var shapeRes = c2.main(opts({ rotation: "four", timeLimit: 0 }));
    console.log("    مستطيلات: " + rectRes.inside + "  |  أشكال فعلية: " + shapeRes.inside);
    assert(shapeRes.inside > rectRes.inside, "يجب أن يتّسع عدد أكبر");
    var placed = s.tri.filter(function (t) { return bounds(t)[0] < mm(500); });
    assert.strictEqual(placed.length, shapeRes.inside);
    placed.forEach(function (t) { assertInRect(t, mm(3), mm(197), mm(197), mm(3), "مثلث"); });
    assertSeparated(placed, mm(3), mm(0.5), "مثلثات");
});

test("وضع قطع صغيرة داخل ثقب قطعة كبيرة (مثل Deepnest)", function () {
    var ring = new MockCompound([rect(0, mm(130), mm(120), mm(120)), rect(mm(20), mm(110), mm(80), mm(80))]);
    var small = [], i; for (i = 0; i < 4; i++) small.push(rect(mm(900), mm(900 + i * 50), mm(30), mm(30)));
    var f = rect(0, mm(130), mm(130), mm(130)), ctx = makeCtx([[0, mm(130), mm(130), 0]], [f, ring].concat(small));
    var res = ctx.main(opts({ rotation: "none" }));
    assert.strictEqual(res.inside, 5, "يجب وضع الحلقة والقطع الأربع الصغيرة"); assert.strictEqual(res.left, 0);
    assertSeparated([ring].concat(small), mm(3), mm(0.5), "ثقب");
    // القطع الأربع داخل الثقب فعلاً
    small.forEach(function (s) { var b = bounds(s), rb = bounds(ring); assert(b[0] > rb[0] + mm(15) && b[2] < rb[2] - mm(15), "القطعة ليست داخل الثقب"); });
});

test("أشكال منحنية (دوائر ببيزيه): لا تقاطع والمسافة محترمة", function () {
    var f = rect(0, mm(250), mm(250), mm(250)), cs = [], i, r = rng(3);
    for (i = 0; i < 18; i++) cs.push(circle(mm(900 + i * 5), mm(900), mm(10 + r() * 22)));
    var ctx = makeCtx([[0, mm(250), mm(250), 0]], [f].concat(cs));
    var res = ctx.main(opts({}));
    assert.strictEqual(res.left, 0);
    cs.forEach(function (c) { assertInRect(c, mm(3), mm(247), mm(247), mm(3), "دائرة"); });
    var worst = assertSeparated(cs, mm(3), mm(0.5), "دوائر");
    console.log("    أقل مسافة فعلية: " + (worst / MM).toFixed(2) + " مم (المطلوب 3)");
});

test("إطار دائري: كل القطع داخل الدائرة", function () {
    var R = mm(100), f = circle(R, R, R), sq = [], i;
    for (i = 0; i < 12; i++) sq.push(rect(mm(900), mm(900 + i * 60), mm(30), mm(30)));
    var ctx = makeCtx([[0, 2 * R, 2 * R, 0]], [f].concat(sq));
    var res = ctx.main(opts({}));
    assert(res.inside >= 8, "عدد قليل جداً: " + res.inside);
    sq.filter(function (s) { return bounds(s)[0] < mm(500); }).forEach(function (s) {
        allPts(s).forEach(function (p) { assert(Math.sqrt((p[0] - R) * (p[0] - R) + (p[1] - R) * (p[1] - R)) <= R - mm(2) + 1e-6, "خرج عن الدائرة"); });
    });
});

test("التدوير: شريط طويل لا يتسع إلا بعد تدويره", function () {
    var f = rect(0, mm(300), mm(60), mm(300)), bar = rect(mm(900), mm(900), mm(200), mm(20));
    var ctx = makeCtx([[0, mm(300), mm(60), 0]], [f, bar]);
    assert.strictEqual(ctx.main(opts({ rotation: "none" })).left, 1);
    f = rect(0, mm(300), mm(60), mm(300)); bar = rect(mm(900), mm(900), mm(200), mm(20)); ctx = makeCtx([[0, mm(300), mm(60), 0]], [f, bar]);
    var res = ctx.main(opts({ rotation: "two" })); assert.strictEqual(res.inside, 1); assert.strictEqual(res.rotated, 1);
    assertInRect(bar, mm(3), mm(297), mm(57), mm(3), "شريط");
});

test("مساحات إضافية + تجاوز في نمط الأشكال", function () {
    var f = rect(0, mm(100), mm(100), mm(100)), cs = [], i; for (i = 0; i < 20; i++) cs.push(circle(mm(900 + i * 3), mm(900), mm(15)));
    var ctx = makeCtx([[0, mm(100), mm(100), 0]], [f].concat(cs));
    var res = ctx.main(opts({ newSheets: true, maxSheets: 2, overflow: true, createArtboards: true }));
    assert.strictEqual(res.left, 0); assert.strictEqual(res.sheets, 2); assert(res.outside > 0); assert.strictEqual(ctx.__doc.artboards.length, 2);
    assertSeparated(cs, mm(3), mm(0.5), "مساحات");
});

test("200 قطعة متطابقة: التخزين المؤقت يجعلها سريعة", function () {
    var f = rect(0, mm(600), mm(600), mm(600)), t = [], i;
    for (i = 0; i < 200; i++) t.push(poly([[mm(1500), mm(1500 + i * 40)], [mm(1535), mm(1500 + i * 40)], [mm(1500), mm(1465 + i * 40)]]));
    var ctx = makeCtx([[0, mm(600), mm(600), 0]], [f].concat(t)), t0 = Date.now();
    var res = ctx.main(opts({ rotation: "two" }));
    console.log("    وُضع " + res.inside + " من 200 خلال " + (Date.now() - t0) + "ms");
    assert(res.inside >= 190);
});

test("الخوارزمية الجينية لا تُسوّئ النتيجة وتعمل ضمن الزمن", function () {
    function mk() { var f = rect(0, mm(180), mm(180), mm(180)), r = rng(11), a = [], i; for (i = 0; i < 16; i++) a.push(poly([[mm(900), mm(900 + i * 90)], [mm(900 + 20 + r() * 50), mm(900 + i * 90)], [mm(900 + 20 + r() * 50), mm(900 + i * 90 - 20 - r() * 50)], [mm(900), mm(900 + i * 90 - 20 - r() * 50)]])); return [f, a]; }
    var m0 = mk(), c0 = makeCtx([[0, mm(180), mm(180), 0]], [m0[0]].concat(m0[1]));
    var r0 = c0.main(opts({ rotation: "four", timeLimit: 0, overflow: true }));
    var m1 = mk(), c1 = makeCtx([[0, mm(180), mm(180), 0]], [m1[0]].concat(m1[1])), t0 = Date.now();
    var r1 = c1.main(opts({ rotation: "four", timeLimit: 1.5, overflow: true }));
    var el = Date.now() - t0;
    console.log("    بدون تحسين: داخل " + r0.inside + " | مع تحسين: داخل " + r1.inside + " | محاولات " + r1.generations + " | " + el + "ms");
    assert(r1.inside >= r0.inside); assert(el < 6000);
});

test("أنواع العناصر: مجموعة، مجموعة مقصوصة، نص (صندوق محيط)، مسار مفتوح", function () {
    var grp = new MockGroup([rect(mm(900), mm(900), mm(30), mm(30)), circle(mm(950), mm(880), mm(10))]);
    var clipPath = circle(mm(1100), mm(900), mm(20)); clipPath.clipping = true;
    var clipped = new MockGroup([rect(mm(1060), mm(940), mm(200), mm(200)), clipPath]); clipped.clipped = true;
    var txt = new MockText(mm(1300), mm(900), mm(60), mm(15));
    var line = new MockPath([P(mm(1500), mm(900)), P(mm(1560), mm(900))], false);
    var extra = [rect(mm(1700), mm(900), mm(40), mm(40)), circle(mm(1800), mm(900), mm(15))];
    var f = rect(0, mm(200), mm(200), mm(200)), all = [grp, clipped, txt, line].concat(extra);
    var ctx = makeCtx([[0, mm(200), mm(200), 0]], [f].concat(all));
    var res = ctx.main(opts({ rotation: "four" }));
    assert.strictEqual(res.inside, 6); assert.strictEqual(res.left, 0);
    var paths = [grp, clipped, line].concat(extra);
    // المجموعة المقصوصة تُعامل كدائرة القص فقط (لا كمحتواها الأكبر)
    var cb = bounds(clipped); assert(Math.abs((cb[2] - cb[0]) - mm(40)) < 1, "المجموعة المقصوصة يجب أن تبقى بحجم القص");
    all.forEach(function (it) { var b = bounds(it); assert(b[0] >= mm(3) - 0.1 && b[2] <= mm(197) + 0.1 && b[3] >= mm(3) - 0.1 && b[1] <= mm(197) + 0.1, "خارج المساحة"); });
    assertSeparated([grp, clipped, extra[0], extra[1]], mm(3), mm(0.5), "أنواع");
    // النص: صندوقه لا يتقاطع مع صناديق الآخرين
    var tb = bounds(txt);
    [grp, clipped, line].concat(extra).forEach(function (o) { var b = bounds(o); assert(tb[2] <= b[0] || b[2] <= tb[0] || tb[3] >= b[1] || b[3] >= tb[1], "النص يتقاطع مع عنصر"); });
});

test("اختبار عشوائي: أشكال متنوعة (محدبة/مقعّرة/ثقوب/دوائر) بدون أي تقاطع", function () {
    var seed, worstAll = 1e30;
    for (seed = 1; seed <= 12; seed++) {
        var r = rng(seed * 97), W = mm(150 + r() * 150), H = mm(150 + r() * 150), items = [], n = 6 + Math.floor(r() * 10), i, k;
        for (i = 0; i < n; i++) {
            var kind = Math.floor(r() * 4), bx = mm(2000 + i * 5), by = mm(2000), s = mm(15 + r() * 40), it;
            if (kind === 0) it = rect(bx, by, s, s * (0.4 + r()));
            else if (kind === 1) it = circle(bx, by, s / 2);
            else if (kind === 2) it = poly([[bx, by], [bx + s, by], [bx + s, by - s * 0.35], [bx + s * 0.35, by - s * 0.35], [bx + s * 0.35, by - s], [bx, by - s]]); // L
            else it = new MockCompound([rect(bx, by, s, s), rect(bx + s * 0.3, by - s * 0.3, s * 0.4, s * 0.4)]);
            items.push(it);
        }
        var f = rect(0, H, W, H), ctx = makeCtx([[0, H, W, 0]], [f].concat(items));
        var res = ctx.main(opts({ rotation: r() < 0.5 ? "four" : "none", overflow: true, cellMM: r() < 0.5 ? 1 : 2 }));
        assert.strictEqual(res.left, 0, "seed " + seed);
        var inRect = items.filter(function (t) { var b = bounds(t); return b[0] >= -1 && b[2] <= W + 1 && b[3] >= -1 && b[1] <= H + 1; });
        assert.strictEqual(inRect.length, res.inside, "seed " + seed + ": عدّ داخل المساحة");
        inRect.forEach(function (t) { assertInRect(t, mm(3), H - mm(3), W - mm(3), mm(3), "seed " + seed); });
        worstAll = Math.min(worstAll, assertSeparated(items, mm(3), mm(1.0), "seed " + seed));
        // المتجاوزة تحت الإطار
        items.filter(function (t) { return inRect.indexOf(t) < 0; }).forEach(function (t) { assert(bounds(t)[1] <= 0 + 1e-6, "seed " + seed + ": متجاوز ليس تحت المساحة"); });
    }
    console.log("    أقل مسافة عبر كل الحالات: " + (worstAll / MM).toFixed(2) + " مم (المطلوب 3)");
});

console.log("\nكل اختبارات الأشكال نجحت: " + passed);
