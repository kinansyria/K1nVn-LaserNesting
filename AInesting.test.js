// اختبارات LaserNesting.jsx خارج الإليستريتور (Node.js >= 12)
// التشغيل:  node tests/nesting.test.js
var fs = require("fs");
var vm = require("vm");
var path = require("path");
var assert = require("assert");

var src = fs.readFileSync(path.join(__dirname, "..", "LaserNesting.jsx"), "utf8").replace(/^#target.*$/m, "");

// ---------- محاكاة مبسطة للإليستريتور ----------
function MockItem(l, t, w, h) { this.l = l; this.t = t; this.w = w; this.h = h; this.typename = "PathItem"; }
Object.defineProperty(MockItem.prototype, "geometricBounds", { get: function () { return [this.l, this.t, this.l + this.w, this.t - this.h]; } });
Object.defineProperty(MockItem.prototype, "visibleBounds", { get: function () { return [this.l, this.t, this.l + this.w, this.t - this.h]; } });
MockItem.prototype.translate = function (dx, dy) { this.l += dx; this.t += dy; };
MockItem.prototype.rotate = function () { var cx = this.l + this.w / 2, cy = this.t - this.h / 2, nw = this.h, nh = this.w; this.w = nw; this.h = nh; this.l = cx - nw / 2; this.t = cy + nh / 2; this.rotatedTimes = (this.rotatedTimes || 0) + 1; };
MockItem.prototype.duplicate = function () { var d = new MockItem(this.l, this.t, this.w, this.h); mock.created.push(d); return d; };

var mock;
function makeCtx(artboards, selection) {
    var abs = artboards.map(function (a) { return { artboardRect: a.slice(0), name: "" }; });
    abs.getActiveArtboardIndex = function () { return 0; };
    abs.add = function (r) { var x = { artboardRect: r.slice(0), name: "" }; abs.push(x); return x; };
    mock = { created: [], alerts: [] };
    var doc = { selection: selection, artboards: abs };
    var ctx = {
        NESTING_NO_AUTORUN: true,
        app: { documents: { length: 1 }, activeDocument: doc, redraw: function () {}, coordinateSystem: 0 },
        CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 1 },
        alert: function (m) { mock.alerts.push(m); }
    };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    ctx.__doc = doc;
    return ctx;
}

var MM = 72 / 25.4;
var baseOpts = { source: "frame", gapMM: 3, marginMM: 3, sort: "auto", rotate: false, useVisible: false, newSheets: false, maxSheets: 0, createArtboards: true, overflow: false, sheetGapMM: 20 };
function opts(o) { var r = {}, k; for (k in baseOpts) r[k] = baseOpts[k]; for (k in o) r[k] = o[k]; return r; }

function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

function overlap(a, b, gap) {
    return a.l < b.l + b.w + gap - 1e-3 && b.l < a.l + a.w + gap - 1e-3 &&
           a.t > b.t - b.h - gap + 1e-3 && b.t > a.t - a.h - gap + 1e-3;
}
function assertNoOverlap(items, gapPt, label) {
    for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++)
        assert(!overlap(items[i], items[j], gapPt), label + ": عنصران يتداخلان/يخالفان المسافة " + i + "," + j);
}
function inside(it, r, m) {
    return it.l >= r.l + m - 1e-3 && it.l + it.w <= r.r - m + 1e-3 && it.t <= r.t - m + 1e-3 && it.t - it.h >= r.b + m - 1e-3;
}

var passed = 0;
function test(name, fn) { fn(); passed++; console.log("  ✓ " + name); }

// ---------- 1) كل العناصر تتسع: لا يُترك أي عنصر ----------
test("تجميع 40 عنصراً عشوائياً داخل الإطار دون ترك أي عنصر", function () {
    var r = rng(7), frame = new MockItem(0, 0, 600 * MM, 400 * MM), items = [];
    for (var i = 0; i < 40; i++) items.push(new MockItem(5000 + i * 3, -5000, (20 + r() * 60) * MM, (20 + r() * 60) * MM));
    var ctx = makeCtx([[0, 400 * MM, 600 * MM, 0]], [frame].concat(items));
    var res = ctx.main(opts({}));
    assert.strictEqual(res.inside, 40); assert.strictEqual(res.left, 0);
    var fr = { l: 0, t: 0, r: 600 * MM, b: -400 * MM };
    items.forEach(function (it) { assert(inside(it, fr, 3 * MM), "خارج الإطار"); });
    assertNoOverlap(items, 3 * MM, "t1");
});

// ---------- 2) الحالة الأصلية: لا يتوقف عند أول عنصر لا يتسع ----------
test("عنصر ضخم لا يتسع لا يمنع وضع بقية العناصر (الخلل الأصلي)", function () {
    var frame = new MockItem(0, 0, 300 * MM, 200 * MM), big = new MockItem(9000, 0, 400 * MM, 20 * MM), small = [];
    for (var i = 0; i < 10; i++) small.push(new MockItem(9000, -900 - i * 50, 40 * MM, 40 * MM));
    var ctx = makeCtx([[0, 200 * MM, 300 * MM, 0]], [frame, big].concat(small));
    var res = ctx.main(opts({}));
    assert.strictEqual(res.inside, 10); assert.strictEqual(res.left, 1);
    assert.strictEqual(big.l, 9000, "العنصر الذي لم يتسع يجب أن يبقى مكانه");
});

// ---------- 3) خيار التجاوز ----------
test("خيار التجمع خارج المساحة: كل شيء يُوضع ولا يتداخل", function () {
    var frame = new MockItem(0, 0, 200 * MM, 100 * MM), items = [];
    for (var i = 0; i < 30; i++) items.push(new MockItem(9000, -3000 - i, 50 * MM, 30 * MM));
    var ctx = makeCtx([[0, 100 * MM, 200 * MM, 0]], [frame].concat(items));
    var res = ctx.main(opts({ overflow: true }));
    assert.strictEqual(res.left, 0); assert.strictEqual(res.inside + res.outside, 30); assert(res.outside > 0);
    assertNoOverlap(items, 3 * MM, "t3");
    var fr = { l: 0, t: 0, r: 200 * MM, b: -100 * MM };
    items.forEach(function (it) { if (!inside(it, fr, 3 * MM)) assert(it.t <= fr.b + 1e-3, "عنصر المتجاوز يجب أن يكون تحت الإطار"); });
});

// ---------- 4) مساحات إضافية ----------
test("توزيع على مساحات إضافية مع إنشاء لوحات عمل ونسخ الإطار", function () {
    var frame = new MockItem(0, 0, 200 * MM, 100 * MM), items = [];
    for (var i = 0; i < 30; i++) items.push(new MockItem(9000, -3000 - i, 50 * MM, 30 * MM));
    var ctx = makeCtx([[0, 100 * MM, 200 * MM, 0]], [frame].concat(items));
    var res = ctx.main(opts({ newSheets: true }));
    assert(res.sheets >= 2 && res.created === res.sheets - 1); assert.strictEqual(res.inside, 30); assert.strictEqual(res.outside, 0);
    assert.strictEqual(mock.created.length, res.created, "نسخ الإطار");
    assert.strictEqual(ctx.__doc.artboards.length, res.sheets, "لوحات العمل");
    assertNoOverlap(items, 3 * MM, "t4");
    // كل عنصر داخل واحد من الإطارات
    var frames = [{ l: 0, t: 0, r: 200 * MM, b: -100 * MM }].concat(mock.created.map(function (f) { return { l: f.l, t: f.t, r: f.l + f.w, b: f.t - f.h }; }));
    items.forEach(function (it) { assert(frames.some(function (f) { return inside(it, f, 3 * MM); }), "عنصر خارج كل الإطارات"); });
});

test("الحد الأقصى لعدد المساحات (2) ثم تجاوز للباقي", function () {
    var frame = new MockItem(0, 0, 200 * MM, 100 * MM), items = [];
    for (var i = 0; i < 40; i++) items.push(new MockItem(9000, -3000 - i, 50 * MM, 30 * MM));
    var ctx = makeCtx([[0, 100 * MM, 200 * MM, 0]], [frame].concat(items));
    var res = ctx.main(opts({ newSheets: true, maxSheets: 2, overflow: true, createArtboards: false }));
    assert.strictEqual(res.sheets, 2); assert(res.outside > 0); assert.strictEqual(res.left, 0);
    assert.strictEqual(ctx.__doc.artboards.length, 1, "لا لوحات عمل عند تعطيل الخيار");
    assertNoOverlap(items, 3 * MM, "t5");
});

test("الحد الأقصى 2 بدون تجاوز: يبقى الفائض مكانه ويُبلَّغ عنه", function () {
    var frame = new MockItem(0, 0, 200 * MM, 100 * MM), items = [];
    for (var i = 0; i < 40; i++) items.push(new MockItem(9000, -3000 - i, 50 * MM, 30 * MM));
    var ctx = makeCtx([[0, 100 * MM, 200 * MM, 0]], [frame].concat(items));
    var res = ctx.main(opts({ newSheets: true, maxSheets: 2 }));
    assert.strictEqual(res.sheets, 2); assert(res.left > 0); assert.strictEqual(res.inside + res.left, 40);
});

// ---------- 5) التدوير ----------
test("التدوير 90° يُدخل عنصراً لا يتسع بوضعه الأصلي", function () {
    var frame = new MockItem(0, 0, 100 * MM, 300 * MM), long = new MockItem(9000, 0, 200 * MM, 50 * MM);
    var ctx = makeCtx([[0, 300 * MM, 100 * MM, 0]], [frame, long]);
    var off = ctx.main(opts({ rotate: false })); assert.strictEqual(off.left, 1);
    frame = new MockItem(0, 0, 100 * MM, 300 * MM); long = new MockItem(9000, 0, 200 * MM, 50 * MM);
    ctx = makeCtx([[0, 300 * MM, 100 * MM, 0]], [frame, long]);
    var on = ctx.main(opts({ rotate: true })); assert.strictEqual(on.inside, 1); assert.strictEqual(on.rotated, 1);
    assert(inside(long, { l: 0, t: 0, r: 100 * MM, b: -300 * MM }, 3 * MM));
});

// ---------- 6) وضع لوحة العمل / كل اللوحات ----------
test("لوحة العمل الحالية بدون إطار محدد", function () {
    var items = []; for (var i = 0; i < 12; i++) items.push(new MockItem(5000, -5000 - i, 40 * MM, 40 * MM));
    var ctx = makeCtx([[0, 200 * MM, 200 * MM, 0]], items);
    var res = ctx.main(opts({ source: "artboard" })); assert.strictEqual(res.inside, 12);
    items.forEach(function (it) { assert(inside(it, { l: 0, t: 200 * MM, r: 200 * MM, b: 0 }, 3 * MM)); });
    assertNoOverlap(items, 3 * MM, "t6");
});

test("كل لوحات العمل: توزيع على لوحتين موجودتين ثم إنشاء ثالثة", function () {
    var items = []; for (var i = 0; i < 30; i++) items.push(new MockItem(5000, -5000 - i, 60 * MM, 40 * MM));
    var ctx = makeCtx([[0, 100 * MM, 100 * MM, 0], [150 * MM, 100 * MM, 250 * MM, 0]], items);
    var res = ctx.main(opts({ source: "all", newSheets: true }));
    assert.strictEqual(res.inside, 30); assert(res.sheets >= 3);
    assert.strictEqual(ctx.__doc.artboards.length, res.sheets);
    var abs = ctx.__doc.artboards.map(function (a) { var r = a.artboardRect; return { l: r[0], t: r[1], r: r[2], b: r[3] }; });
    items.forEach(function (it) { assert(abs.some(function (a) { return inside(it, a, 3 * MM); })); });
    assertNoOverlap(items, 3 * MM, "t7");
});

// ---------- 7) اختبار عشوائي واسع ----------
test("200 حالة عشوائية: لا تداخل، لا خروج عن الحدود، العدّ صحيح", function () {
    for (var seed = 1; seed <= 200; seed++) {
        var r = rng(seed * 31), W = (150 + r() * 400) * MM, H = (100 + r() * 300) * MM;
        var n = 1 + Math.floor(r() * 60), items = [];
        for (var i = 0; i < n; i++) items.push(new MockItem(9000, -9000 - i, (5 + r() * 90) * MM, (5 + r() * 90) * MM));
        var frame = new MockItem(0, 0, W, H);
        var o = opts({ rotate: r() < 0.5, newSheets: r() < 0.5, maxSheets: r() < 0.5 ? 0 : 2, overflow: r() < 0.5, gapMM: Math.floor(r() * 6), marginMM: Math.floor(r() * 6) });
        var ctx = makeCtx([[0, H, W, 0]], [frame].concat(items));
        var res = ctx.main(o);
        assert.strictEqual(res.inside + res.outside + res.left + res.failed, n, "seed " + seed + " العدّ");
        var gap = o.gapMM * MM, m = o.marginMM * MM;
        var placed = items.filter(function (it) { return it.l < 8000; });
        assertNoOverlap(placed, gap, "seed " + seed);
        var frames = [{ l: 0, t: 0, r: W, b: -H }].concat(mock.created.map(function (f) { return { l: f.l, t: f.t, r: f.l + f.w, b: f.t - f.h }; }));
        var low = Math.min.apply(null, frames.map(function (f) { return f.b; }));
        var outCount = 0;
        placed.forEach(function (it) {
            if (frames.some(function (f) { return inside(it, f, m); })) return;
            outCount++; assert(it.t <= low + 1e-3, "seed " + seed + ": متجاوز ليس تحت المساحات");
        });
        assert.strictEqual(outCount, res.outside, "seed " + seed + " عدد المتجاوز");
        if (!o.overflow && !o.newSheets) assert.strictEqual(res.outside, 0);
        if (o.overflow) assert.strictEqual(res.left, 0, "seed " + seed + ": التجاوز مفعّل ويجب ألا يُترك شيء");
    }
});

test("أداء: 400 عنصراً بزمن معقول", function () {
    var r = rng(99), items = [], t0 = Date.now();
    for (var i = 0; i < 400; i++) items.push(new MockItem(9000, -9000 - i, (10 + r() * 50) * MM, (10 + r() * 50) * MM));
    var ctx = makeCtx([[0, 1000 * MM, 1000 * MM, 0]], [new MockItem(0, 0, 1000 * MM, 1000 * MM)].concat(items));
    var res = ctx.main(opts({ rotate: true, newSheets: true }));
    console.log("    (" + (Date.now() - t0) + "ms, sheets=" + res.sheets + ")");
    assert.strictEqual(res.left, 0);
});

console.log("\nكل الاختبارات نجحت: " + passed);
