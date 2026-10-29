#target illustrator
/*
 * LaserNesting v3.0  —  ترتيب العناصر لقص الليزر
 * Original author: TG:@K1nVn   |   License: GPL-3.0 (see LICENSE)
 *
 * طريقة الاستخدام:
 *   1) حدّد العناصر المراد ترتيبها (ومعها الإطار إن أردت استخدام إطار).
 *   2) File > Scripts > Other Script...  ثم اختر هذا الملف.
 *   3) اضبط الخيارات في النافذة ثم "تنفيذ".
 *
 * ملاحظة للمطورين: الملف مكتوب بصيغة ES3 (متوافق مع ExtendScript):
 * لا let/const ولا => ولا forEach/map/filter ولا JSON.
 * كل النصوص الظاهرة للمستخدم موجودة في الكائن STR لتسهيل الترجمة.
 */

var NESTING_VERSION = "3.0";
var MM = 72 / 25.4; // عدد النقاط في المليمتر الواحد

/* =====================================================================
 *  النصوص (STR)
 * ===================================================================== */
var STR = {
    title: "ترتيب العناصر لقص الليزر  v" + NESTING_VERSION,
    noDoc: "الرجاء فتح مستند في برنامج الإليستريتور أولاً.",
    noSel: "الرجاء تحديد العناصر المراد ترتيبها (ومعها الإطار إن أردت استخدام إطار).",
    needTwo: "وضع «أكبر عنصر محدد = الإطار» يحتاج تحديد عنصرين على الأقل: الإطار + عنصر واحد للتوزيع.\n\nحدّد المزيد من العناصر، أو اختر «لوحة العمل الحالية» كمساحة.",
    badSheet: "مساحة العمل أصغر من الهوامش المحددة. قلّل الهامش أو كبّر المساحة.",
    noItems: "لا توجد عناصر صالحة للتوزيع.",

    grpSource: "مساحة العمل (الورقة)",
    srcFrame: "أكبر عنصر محدد = الإطار",
    srcArtboard: "لوحة العمل الحالية (Artboard)",
    srcAll: "كل لوحات العمل (كل لوحة = ورقة)",

    grpSpacing: "المسافات",
    gap: "المسافة بين العناصر (مم):",
    margin: "الهامش من حافة المساحة (مم):",

    grpPack: "طريقة التجميع",
    sort: "ترتيب العناصر:",
    sortAuto: "تلقائي (تجربة عدة طرق واختيار الأفضل)",
    sortArea: "الأكبر مساحة أولاً",
    sortSide: "الأطول ضلعاً أولاً",
    sortNone: "حسب ترتيب التحديد",
    rotate: "السماح بتدوير العناصر 90° لتوفير المساحة",
    visible: "احتساب سُمك الحد (Visible Bounds)",

    grpOverflow: "عندما لا تتسع المساحة",
    newSheets: "توزيع الباقي على مساحات عمل إضافية",
    maxSheets: "الحد الأقصى لعدد المساحات (0 = بلا حد):",
    createAb: "إنشاء لوحة عمل (Artboard) لكل مساحة جديدة",
    overflow: "السماح بالتجميع خارج المساحة (تجاوز الحدود)",
    sheetGap: "المسافة بين المساحات (مم):",

    grpMode: "طريقة الترتيب",
    modeShape: "تداخل الأشكال الفعلية (مثل Deepnest) — أدق وأبطأ",
    modeRect: "مستطيلات محيطة — سريع",
    precision: "الدقة (حجم الخلية):",
    precFast: "سريع (2 مم)",
    precNormal: "متوسط (1 مم)",
    precFine: "دقيق (0.5 مم)",
    timeLimit: "زمن تحسين الترتيب (ثانية، 0 = بدون):",
    rotation: "التدوير:",
    rotNone: "بدون تدوير",
    rot2: "0° / 90°",
    rot4: "كل 90° (4 زوايا)",
    rot8: "كل 45° (8 زوايا)",
    working: "جاري حساب أفضل ترتيب... (أبقِ Esc مضغوطاً للإيقاف)",
    rPlaced: "عناصر مُرتّبة: ",
    rGen: "محاولات التحسين: ",

    ok: "تنفيذ",
    cancel: "إلغاء",

    doneTitle: "تم الانتهاء من الترتيب",
    rItems: "عدد العناصر: ",
    rInside: "داخل المساحات: ",
    rOutside: "خارج المساحة (تجاوز الحدود): ",
    rLeft: "لم تُنقل (لا تتسع): ",
    rSheets: "عدد المساحات المستخدمة: ",
    rNew: "مساحات جديدة أُنشئت: ",
    rRotated: "عناصر تم تدويرها: ",
    rSkipped: "عناصر تم تجاهلها (حجمها صفر): ",
    rFailed: "عناصر فشل نقلها: ",
    rHint: "\nلتجميع العناصر المتبقية: فعّل «السماح بالتجميع خارج المساحة» أو «توزيع الباقي على مساحات إضافية».",
    rUndo: "\n(للتراجع: Ctrl+Z)"
};

/* =====================================================================
 *  محرك التجميع (Engine)
 *  خوارزمية MaxRects: تضع كل عنصر في أفضل فراغ متاح بدل التوزيع
 *  الأعمى صفاً بصف.  كل الإحداثيات هنا محلية: نقطة الأصل أعلى-يسار
 *  المساحة والمحور y يزداد للأسفل.  لا علاقة له بالإليستريتور.
 * ===================================================================== */
var Engine = (function () {
    var EPS = 0.0001;
    var BIG = 1000000; // ارتفاع "لا نهائي" لمنطقة التجاوز

    /* ---------- صندوق MaxRects ---------- */
    function Bin(w, h, rotate) {
        this.w = w;
        this.h = h;
        this.rotate = rotate;
        this.ox = 0; // إزاحة الصندوق داخل المساحة (الهامش)
        this.oy = 0;
        this.maxY = 0;
        this.free = (w > 0 && h > 0) ? [{ x: 0, y: 0, w: w, h: h }] : [];
    }

    function splitFree(f, u, out) {
        if (u.x >= f.x + f.w - EPS || u.x + u.w <= f.x + EPS ||
            u.y >= f.y + f.h - EPS || u.y + u.h <= f.y + EPS) {
            return false; // لا يتقاطعان
        }
        if (u.x > f.x + EPS) {
            out.push({ x: f.x, y: f.y, w: u.x - f.x, h: f.h });
        }
        if (u.x + u.w < f.x + f.w - EPS) {
            out.push({ x: u.x + u.w, y: f.y, w: f.x + f.w - (u.x + u.w), h: f.h });
        }
        if (u.y > f.y + EPS) {
            out.push({ x: f.x, y: f.y, w: f.w, h: u.y - f.y });
        }
        if (u.y + u.h < f.y + f.h - EPS) {
            out.push({ x: f.x, y: u.y + u.h, w: f.w, h: f.y + f.h - (u.y + u.h) });
        }
        return true;
    }

    function contains(a, b) { // هل a يحتوي b
        return b.x >= a.x - EPS && b.y >= a.y - EPS &&
               b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;
    }

    function prune(list) {
        var res = [], i, j, a, b, dead;
        for (i = 0; i < list.length; i++) {
            a = list[i];
            if (a.w <= EPS || a.h <= EPS) { continue; }
            dead = false;
            for (j = 0; j < list.length; j++) {
                if (i === j) { continue; }
                b = list[j];
                if (contains(b, a) && !(contains(a, b) && j > i)) { dead = true; break; }
            }
            if (!dead) { res.push(a); }
        }
        return res;
    }

    Bin.prototype.place = function (node) {
        var nf = [], i, f;
        for (i = 0; i < this.free.length; i++) {
            f = this.free[i];
            if (!splitFree(f, node, nf)) { nf.push(f); }
        }
        this.free = prune(nf);
        if (node.y + node.h > this.maxY) { this.maxY = node.y + node.h; }
    };

    // method: "bssf" (أفضل تطابق للضلع الأقصر) | "baf" (أفضل تطابق للمساحة) | "bl" (أسفل-يسار)
    Bin.prototype.insert = function (w, h, method) {
        var best = null, i, r, f, iw, ih, s1, s2, lw, lh, maxR = this.rotate ? 2 : 1;
        for (i = 0; i < this.free.length; i++) {
            f = this.free[i];
            for (r = 0; r < maxR; r++) {
                if (r === 1 && Math.abs(w - h) < EPS) { continue; }
                iw = (r === 0) ? w : h;
                ih = (r === 0) ? h : w;
                if (iw > f.w + EPS || ih > f.h + EPS) { continue; }
                lw = f.w - iw;
                lh = f.h - ih;
                if (method === "bl") {
                    s1 = f.y + ih;
                    s2 = f.x;
                } else if (method === "baf") {
                    s1 = f.w * f.h - iw * ih;
                    s2 = Math.min(lw, lh);
                } else {
                    s1 = Math.min(lw, lh);
                    s2 = Math.max(lw, lh);
                }
                if (best === null || s1 < best.s1 - EPS ||
                    (Math.abs(s1 - best.s1) <= EPS && s2 < best.s2 - EPS)) {
                    best = { x: f.x, y: f.y, w: iw, h: ih, rot: (r === 1), s1: s1, s2: s2 };
                }
            }
        }
        if (best === null) { return null; }
        this.place(best);
        return best;
    };

    /* ---------- أدوات مساعدة ---------- */
    function sorter(key) {
        return function (a, b) {
            var d = 0;
            if (key === "area") { d = b.w * b.h - a.w * a.h; }
            else if (key === "side") { d = Math.max(b.w, b.h) - Math.max(a.w, a.h); }
            else if (key === "height") { d = b.h - a.h; }
            else if (key === "width") { d = b.w - a.w; }
            else if (key === "perim") { d = (b.w + b.h) - (a.w + a.h); }
            if (Math.abs(d) > EPS) { return d; }
            return a.order - b.order; // ثبات الترتيب
        };
    }

    function fitsEmpty(w, h, bw, bh, rotate) {
        if (w <= bw + EPS && h <= bh + EPS) { return true; }
        return rotate && h <= bw + EPS && w <= bh + EPS;
    }

    /* ---------- تشغيل واحد لاستراتيجية واحدة ---------- */
    function packOnce(input, items, order, method) {
        var gap = input.gap, m = input.margin, rotate = input.rotate;
        var bins = [], placements = [], unplaced = [];
        var overflowBin = null, k, i, it, iw, ih, node, bin, binIdx, nb;
        var unplacedArea = 0, overflowArea = 0;

        function makeSheetBin(w, h) {
            var b = new Bin(w - 2 * m + gap, h - 2 * m + gap, rotate);
            b.ox = m;
            b.oy = m;
            return b;
        }

        for (k = 0; k < input.sheets.length; k++) {
            bins.push(makeSheetBin(input.sheets[k].w, input.sheets[k].h));
        }
        var tplW = input.template.w - 2 * m + gap;
        var tplH = input.template.h - 2 * m + gap;

        for (i = 0; i < order.length; i++) {
            it = order[i];
            iw = it.w + gap;
            ih = it.h + gap;
            node = null;
            bin = null;
            binIdx = -1;

            // 1) المساحات الموجودة (أول مساحة تتسع)
            for (k = 0; k < bins.length && node === null; k++) {
                node = bins[k].insert(iw, ih, method);
                if (node !== null) { bin = bins[k]; binIdx = k; }
            }

            // 2) مساحة جديدة
            if (node === null && input.newSheets &&
                (input.maxSheets <= 0 || bins.length < input.maxSheets) &&
                fitsEmpty(iw, ih, tplW, tplH, rotate)) {
                nb = makeSheetBin(input.template.w, input.template.h);
                bins.push(nb);
                node = nb.insert(iw, ih, method);
                if (node !== null) { bin = nb; binIdx = bins.length - 1; }
            }

            if (node !== null) {
                placements.push({
                    id: it.id,
                    sheet: binIdx,
                    x: bin.ox + node.x,
                    y: bin.oy + node.y,
                    w: node.rot ? it.h : it.w,
                    h: node.rot ? it.w : it.h,
                    rotated: node.rot
                });
                continue;
            }

            // 3) خارج المساحة (تجاوز الحدود)
            if (input.overflow) {
                if (overflowBin === null) {
                    overflowBin = new Bin(Math.max(input.overflowWidth, 1), BIG, rotate);
                }
                node = overflowBin.insert(iw, ih, method);
            }
            if (node !== null) {
                overflowArea += it.w * it.h;
                placements.push({
                    id: it.id,
                    sheet: -1,
                    x: node.x,
                    y: node.y,
                    w: node.rot ? it.h : it.w,
                    h: node.rot ? it.w : it.h,
                    rotated: node.rot
                });
            } else {
                unplacedArea += it.w * it.h;
                unplaced.push(it.id);
            }
        }

        return {
            placements: placements,
            unplaced: unplaced,
            sheetCount: bins.length,
            score: [
                unplacedArea,
                overflowArea,
                bins.length,
                overflowBin ? overflowBin.maxY : 0,
                bins.length ? bins[bins.length - 1].maxY : 0
            ]
        };
    }

    function better(a, b) {
        var i, d;
        for (i = 0; i < a.score.length; i++) {
            d = a.score[i] - b.score[i];
            if (Math.abs(d) > 0.01) { return d < 0; }
        }
        return false;
    }

    /* ---------- الواجهة العامة ----------
     * input = {
     *   items:    [{id, w, h}],
     *   sheets:   [{w, h}],        // المساحات الموجودة
     *   template: {w, h},          // مقاس المساحات الجديدة
     *   gap, margin,               // بنفس وحدة الأبعاد
     *   rotate, newSheets, maxSheets, overflow,
     *   sort: "auto" | "area" | "side" | "none"
     * }
     */
    function solve(input) {
        var prepared = [], i, s, m, sorts, methods, best = null, res, order, label, maxUsable = 0, widest = 0, w;

        for (i = 0; i < input.items.length; i++) {
            prepared.push({ id: input.items[i].id, w: input.items[i].w, h: input.items[i].h, order: i });
        }
        if (prepared.length === 0) {
            return { placements: [], unplaced: [], sheetCount: input.sheets.length, strategy: "-" };
        }

        // عرض منطقة التجاوز: عرض أوسع مساحة، أو أوسع عنصر إن كان أكبر
        for (i = 0; i < input.sheets.length; i++) {
            maxUsable = Math.max(maxUsable, input.sheets[i].w - 2 * input.margin);
        }
        maxUsable = Math.max(maxUsable, input.template.w - 2 * input.margin);
        for (i = 0; i < prepared.length; i++) {
            w = input.rotate ? Math.min(prepared[i].w, prepared[i].h) : prepared[i].w;
            widest = Math.max(widest, w);
        }
        input.overflowWidth = Math.max(maxUsable, widest) + input.gap;

        if (input.sort === "none") { sorts = ["none"]; }
        else if (input.sort === "area" || input.sort === "side") { sorts = [input.sort]; }
        else { sorts = ["area", "side", "height", "width", "perim"]; }
        methods = ["bssf", "baf", "bl"];
        if (prepared.length > 300 && sorts.length > 2) { // حفاظاً على السرعة مع الأعداد الكبيرة
            sorts = ["area", "side"];
            methods = ["bssf", "baf"];
        }

        for (s = 0; s < sorts.length; s++) {
            order = prepared.slice(0);
            order.sort(sorter(sorts[s]));
            for (m = 0; m < methods.length; m++) {
                res = packOnce(input, prepared, order, methods[m]);
                label = sorts[s] + "/" + methods[m];
                if (best === null || better(res, best)) {
                    best = res;
                    best.strategy = label;
                }
            }
        }
        return best;
    }

    return { solve: solve };
})();

/* =====================================================================
 *  محرك تداخل الأشكال (ShapeEngine)  —  على طريقة Deepnest
 *
 *  Deepnest يحسب "No-Fit Polygon" بالمجموع المنكوفسكي (كود C++) ثم يحسّن
 *  الترتيب بخوارزمية جينية.  هنا لا يمكن تشغيل كود C++ داخل الإليستريتور،
 *  لذلك يُستعاض عن الـ NFP بشبكة خلايا (Raster) محافظة:
 *    - كل شكل يتحول إلى خلايا (مع الثقوب الداخلية) ثم يُوسَّع بنصف المسافة.
 *    - لا يُسمح لخلايا قطعتين بالتداخل، فلا تتقاطع الأشكال الحقيقية أبداً.
 *    - البحث عن الموضع يتم بالأعلى-يسار (Gravity) مع خوارزمية جينية
 *      تعدّل الترتيب والتدوير وتحتفظ بأفضل نتيجة ضمن الزمن المحدد.
 *  الدقة = حجم الخلية (مم): كلما صغرت زادت الدقة وزاد الوقت.
 *  كل الإحداثيات: y للأعلى (مثل الإليستريتور) عند الإدخال، وداخلياً الصفوف
 *  تنزل من الأعلى.  لا علاقة لهذا القسم بالإليستريتور نفسه.
 * ===================================================================== */
var ShapeEngine = (function () {
    var BIG_H = 100000;
    var SUB = [0.05, 0.5, 0.95];
    var X_WEIGHT = 0.25;

    function nowMs() { return new Date().getTime(); }

    function params(gap, c) {
        var Rf = gap / (2 * c) + 0.75;
        return { Rf: Rf, H: Math.ceil(Rf) };
    }

    /* ---------- أدوات المقاطع (runs): [a0,b0,a1,b1,...] شاملة الطرفين ---------- */
    function mergeRuns(a) {
        var n = Math.floor(a.length / 2), idx = [], i, out, s, e, ps, pe;
        if (n <= 1) { return a; }
        for (i = 0; i < n; i++) { idx.push(i); }
        idx.sort(function (p, q) { return a[2 * p] - a[2 * q]; });
        out = [];
        s = a[2 * idx[0]];
        e = a[2 * idx[0] + 1];
        for (i = 1; i < n; i++) {
            ps = a[2 * idx[i]];
            pe = a[2 * idx[i] + 1];
            if (ps <= e + 1) { if (pe > e) { e = pe; } }
            else { out.push(s, e); s = ps; e = pe; }
        }
        out.push(s, e);
        return out;
    }

    function gapMax(runs, gw) {
        var prev = 0, best = 0, i, g;
        for (i = 0; i < runs.length; i += 2) {
            g = runs[i] - prev;
            if (g > best) { best = g; }
            prev = runs[i + 1] + 1;
        }
        g = gw - prev;
        return g > best ? g : best;
    }

    // توسيع بقرص نصف قطره rad (خلايا).  rows: مصفوفة صفوف.  النتيجة: outH صف.
    function dilateRows(rows, nRows, rad, offX, offY, outW, outH) {
        var out = [], hw = [], dyMax = Math.floor(rad), i, r, runs, k, dy, w, tgt, lo, hi;
        for (i = 0; i < outH; i++) { out.push([]); }
        for (dy = 0; dy <= dyMax; dy++) {
            hw.push(Math.floor(Math.sqrt(Math.max(0, rad * rad - dy * dy))));
        }
        for (r = 0; r < nRows; r++) {
            runs = rows[r];
            if (!runs || runs.length === 0) { continue; }
            for (dy = -dyMax; dy <= dyMax; dy++) {
                tgt = r + offY + dy;
                if (tgt < 0 || tgt >= outH) { continue; }
                w = hw[dy < 0 ? -dy : dy];
                for (k = 0; k < runs.length; k += 2) {
                    lo = runs[k] + offX - w;
                    hi = runs[k + 1] + offX + w;
                    if (lo < 0) { lo = 0; }
                    if (hi > outW - 1) { hi = outW - 1; }
                    if (lo <= hi) { out[tgt].push(lo, hi); }
                }
            }
        }
        for (i = 0; i < outH; i++) { out[i] = mergeRuns(out[i]); }
        return out;
    }

    /* ---------- تحويل مكوّن (حلقات) إلى خلايا ---------- */
    function rasterComp(comp, minX, maxY, c, cw, ch, acc) {
        var rings = comp.rings, closed = comp.closed, cross = {}, ri, pts, n, segCount, i, j;
        var x1, y1, x2, y2, L, steps, t, px, py, cx, cy, lastCx, lastCy, s, y, x, key, ymin, ymax, rowLo, rowHi, ry, xs, k, a, b;
        for (ri = 0; ri < rings.length; ri++) {
            pts = rings[ri];
            n = Math.floor(pts.length / 2);
            if (n < 1) { continue; }
            segCount = closed[ri] ? n : n - 1;
            if (n === 1) { segCount = 1; }
            for (i = 0; i < segCount; i++) {
                j = (i + 1) % n;
                x1 = pts[2 * i]; y1 = pts[2 * i + 1];
                x2 = pts[2 * j]; y2 = pts[2 * j + 1];
                // وسم الخلايا التي يمر بها الضلع
                L = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
                steps = Math.max(1, Math.ceil(L / (c * 0.5)));
                lastCx = -1; lastCy = -1;
                for (t = 0; t <= steps; t++) {
                    px = x1 + (x2 - x1) * t / steps;
                    py = y1 + (y2 - y1) * t / steps;
                    cx = Math.floor((px - minX) / c);
                    cy = Math.floor((maxY - py) / c);
                    if (cx < 0) { cx = 0; } else if (cx > cw - 1) { cx = cw - 1; }
                    if (cy < 0) { cy = 0; } else if (cy > ch - 1) { cy = ch - 1; }
                    if (cx !== lastCx || cy !== lastCy) { acc[cy].push(cx, cx); lastCx = cx; lastCy = cy; }
                }
                // تقاطعات خطوط المسح (للمناطق المغلقة فقط)
                if (closed[ri] && y1 !== y2) {
                    ymin = y1 < y2 ? y1 : y2;
                    ymax = y1 < y2 ? y2 : y1;
                    rowLo = Math.floor((maxY - ymax) / c) - 1;
                    rowHi = Math.floor((maxY - ymin) / c) + 1;
                    if (rowLo < 0) { rowLo = 0; }
                    if (rowHi > ch - 1) { rowHi = ch - 1; }
                    for (ry = rowLo; ry <= rowHi; ry++) {
                        for (s = 0; s < 3; s++) {
                            y = maxY - (ry + SUB[s]) * c;
                            if (y >= ymin && y < ymax) {
                                x = x1 + (y - y1) * (x2 - x1) / (y2 - y1);
                                key = ry * 3 + s;
                                if (!cross[key]) { cross[key] = []; }
                                cross[key].push(x);
                            }
                        }
                    }
                }
            }
        }
        for (key in cross) {
            xs = cross[key];
            xs.sort(function (p, q) { return p - q; });
            ry = Math.floor(key / 3);
            for (k = 0; k + 1 < xs.length; k += 2) {
                a = Math.floor((xs[k] - minX) / c);
                b = Math.floor((xs[k + 1] - minX) / c);
                if (a < 0) { a = 0; }
                if (b > cw - 1) { b = cw - 1; }
                if (a <= b && ry >= 0 && ry < ch) { acc[ry].push(a, b); }
            }
        }
    }

    function newAcc(n) {
        var acc = [], i;
        for (i = 0; i < n; i++) { acc.push([]); }
        return acc;
    }

    /* ---------- Raster لقطعة بزاوية معينة ---------- */
    function makeRaster(part, ang, c, Rf, H) {
        var th = ang * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
        var comps = [], ci, ri, k, src, pts, rr, x, y, dx, dy;
        var minX = 1e30, maxX = -1e30, minY = 1e30, maxY = -1e30;
        for (ci = 0; ci < part.comps.length; ci++) {
            src = part.comps[ci];
            var rings = [];
            for (ri = 0; ri < src.rings.length; ri++) {
                pts = src.rings[ri];
                rr = [];
                for (k = 0; k < pts.length; k += 2) {
                    if (ang === 0) { x = pts[k]; y = pts[k + 1]; }
                    else {
                        dx = pts[k] - part.cx;
                        dy = pts[k + 1] - part.cy;
                        x = part.cx + dx * cs - dy * sn;
                        y = part.cy + dx * sn + dy * cs;
                    }
                    rr.push(x, y);
                    if (x < minX) { minX = x; } if (x > maxX) { maxX = x; }
                    if (y < minY) { minY = y; } if (y > maxY) { maxY = y; }
                }
                rings.push(rr);
            }
            comps.push({ rings: rings, closed: src.closed });
        }
        var cw = Math.max(1, Math.ceil((maxX - minX) / c - 1e-6));
        var ch = Math.max(1, Math.ceil((maxY - minY) / c - 1e-6));
        var acc = newAcc(ch), core = [], r, area = 0, i;
        for (ci = 0; ci < comps.length; ci++) { rasterComp(comps[ci], minX, maxY, c, cw, ch, acc); }
        for (r = 0; r < ch; r++) {
            core.push(mergeRuns(acc[r]));
            for (i = 0; i < core[r].length; i += 2) { area += core[r][i + 1] - core[r][i] + 1; }
        }
        var pw = cw + 2 * H, ph = ch + 2 * H;
        var rows = dilateRows(core, ch, Rf, H, H, pw, ph);
        var longest = [], order = [], l, m, keyRows = [];
        for (r = 0; r < ph; r++) {
            l = 0;
            for (i = 0; i < rows[r].length; i += 2) { m = rows[r][i + 1] - rows[r][i] + 1; if (m > l) { l = m; } }
            longest.push(l);
            order.push(r);
        }
        order.sort(function (p, q) { return longest[q] - longest[p] || p - q; });
        for (i = 0; i < order.length && keyRows.length < 4; i++) {
            if (longest[order[i]] > 0) { keyRows.push(order[i]); }
        }
        var sumX = 0, sumY = 0, cnt = 0, len;
        for (r = 0; r < ph; r++) {
            for (i = 0; i < rows[r].length; i += 2) {
                len = rows[r][i + 1] - rows[r][i] + 1;
                cnt += len;
                sumX += (rows[r][i] + rows[r][i + 1]) / 2 * len;
                sumY += r * len;
            }
        }
        return {
            rows: rows, pw: pw, ph: ph, cw: cw, ch: ch, area: area, longest: longest, keyRows: keyRows, ang: ang,
            cgx: cnt ? sumX / cnt : 0, cgy: cnt ? sumY / cnt : 0
        };
    }

    /* ---------- تعريف المساحة (ورقة) ----------
     * spec: { w, h, margin (نقاط), c, Rf, H, comps (اختياري: شكل إطار حر), l, t }
     * يرجع: { uw, uh, blocked, ox, oy }  حيث ox/oy إزاحة نقطة أصل الشبكة عن أعلى-يسار المستطيل
     */
    function makeSheetDef(spec) {
        var c = spec.c, H = spec.H, def, uw, uh, r, i, y;
        if (!spec.comps) {
            uw = Math.floor((spec.w - 2 * spec.margin) / c);
            uh = Math.floor((spec.h - 2 * spec.margin) / c);
            return { uw: Math.max(uw, 0), uh: Math.max(uh, 0), blocked: null, ox: spec.margin, oy: spec.margin };
        }
        uw = Math.max(1, Math.ceil(spec.w / c - 1e-6));
        uh = Math.max(1, Math.ceil(spec.h / c - 1e-6));
        var acc = newAcc(uh), inside = [], outside = [], prev, runs;
        for (i = 0; i < spec.comps.length; i++) { rasterComp(spec.comps[i], spec.l, spec.t, c, uw, uh, acc); }
        for (r = 0; r < uh; r++) {
            runs = mergeRuns(acc[r]);
            prev = 0;
            var o = [];
            for (i = 0; i < runs.length; i += 2) {
                if (runs[i] > prev) { o.push(prev, runs[i] - 1); }
                prev = runs[i + 1] + 1;
            }
            if (prev <= uw - 1) { o.push(prev, uw - 1); }
            outside.push(o);
        }
        var rad = Math.max(0.75, spec.margin / c - spec.Rf + 0.75);
        var gw = uw + 2 * H, gh = uh + 2 * H;
        var rows = dilateRows(outside, uh, rad, H, H, gw, gh), blocked = {};
        for (y = 0; y < gh; y++) { if (rows[y].length > 0) { blocked[y] = rows[y]; } }
        return { uw: uw, uh: uh, blocked: blocked, ox: 0, oy: 0 };
    }

    /* ---------- ورقة قيد التعبئة ---------- */
    function Sheet(def, H) {
        var y;
        this.gw = def.uw + 2 * H;
        this.gh = def.uh + 2 * H;
        this.rows = {};
        this.gmax = {};
        this.hints = {};
        this.maxY = 0;
        if (def.blocked) {
            for (y in def.blocked) {
                this.rows[y] = def.blocked[y];
                this.gmax[y] = gapMax(def.blocked[y], this.gw);
            }
        }
    }

    // أول موضع (الأعلى ثم الأيسر) تتسع فيه القطعة، ابتداءً من الصف startY
    function findPos(sheet, rs, startY) {
        var maxX = sheet.gw - rs.pw, maxY = sheet.gh - rs.ph;
        var y, k, r, g, ok, iv, srow, prow, i, j, lo, hi, x, moved, c0, d0;
        if (maxX < 0 || maxY < 0) { return null; }
        var keys = rs.keyRows, lon = rs.longest, gm = sheet.gmax, rowsS = sheet.rows, rowsP = rs.rows, ph = rs.ph;
        for (y = startY; y <= maxY; y++) {
            ok = true;
            for (k = 0; k < keys.length; k++) {
                r = keys[k];
                g = gm[y + r];
                if (g !== undefined && g < lon[r]) { ok = false; break; }
            }
            if (!ok) { continue; }
            iv = [];
            for (r = 0; r < ph; r++) {
                srow = rowsS[y + r];
                if (!srow) { continue; }
                prow = rowsP[r];
                if (prow.length === 0) { continue; }
                for (i = 0; i < prow.length; i += 2) {
                    for (j = 0; j < srow.length; j += 2) {
                        lo = srow[j] - prow[i + 1];
                        hi = srow[j + 1] - prow[i];
                        if (hi < 0 || lo > maxX) { continue; }
                        iv.push(lo, hi);
                    }
                }
            }
            x = 0;
            do {
                moved = false;
                for (k = 0; k < iv.length; k += 2) {
                    if (iv[k] <= x && x <= iv[k + 1]) { x = iv[k + 1] + 1; moved = true; }
                }
            } while (moved && x <= maxX);
            if (x <= maxX) { return { x: x, y: y }; }
        }
        return null;
    }

    function addRuns(sheet, rs, x, y) {
        var r, prow, add, i, yy, cur;
        for (r = 0; r < rs.ph; r++) {
            prow = rs.rows[r];
            if (prow.length === 0) { continue; }
            add = [];
            for (i = 0; i < prow.length; i += 2) { add.push(prow[i] + x, prow[i + 1] + x); }
            yy = y + r;
            cur = sheet.rows[yy];
            sheet.rows[yy] = cur ? mergeRuns(cur.concat(add)) : add;
            sheet.gmax[yy] = gapMax(sheet.rows[yy], sheet.gw);
        }
        if (y + rs.ch > sheet.maxY) { sheet.maxY = y + rs.ch; }
    }

    /* ---------- سياق الحل ---------- */
    function getRaster(ctx, part, a) {
        var key = part.key + "|" + a, rs = ctx.cache[key];
        if (!rs) {
            rs = makeRaster(part, ctx.angles[a], ctx.c, ctx.Rf, ctx.H);
            ctx.cache[key] = rs;
        }
        return rs;
    }

    function tryPlace(ctx, sheet, part, angList) {
        var best = null, i, a, rs, key, start, pos, score;
        for (i = 0; i < angList.length; i++) {
            a = angList[i];
            rs = getRaster(ctx, part, a);
            key = part.key + "|" + a;
            start = sheet.hints[key];
            if (start === undefined) { start = 0; }
            if (start === Infinity) { continue; }
            pos = findPos(sheet, rs, start);
            if (pos === null) { sheet.hints[key] = Infinity; continue; }
            sheet.hints[key] = pos.y;
            score = (pos.y + rs.cgy) + X_WEIGHT * (pos.x + rs.cgx); // الجاذبية: مركز ثقل القطعة (أعلى ثم أيسر)
            if (best === null || score < best.score - 1e-9) {
                best = { x: pos.x, y: pos.y, a: a, rs: rs, score: score };
            }
        }
        if (best === null) { return null; }
        addRuns(sheet, best.rs, best.x, best.y);
        return best;
    }

    function evaluate(ctx, order, genes, multi) {
        var input = ctx.input, sheets = [], placements = [], unplaced = [], overflow = null, angOf = {};
        var unplacedArea = 0, overflowArea = 0, i, s, pi, part, angList, r, si, ns, ek;
        for (s = 0; s < ctx.sheetDefs.length; s++) { sheets.push(new Sheet(ctx.sheetDefs[s], ctx.H)); }
        for (i = 0; i < order.length; i++) {
            pi = order[i];
            part = ctx.parts[pi];
            angList = multi ? ctx.allAng : [genes[pi]];
            r = null;
            si = -1;
            for (s = 0; s < sheets.length && r === null; s++) {
                r = tryPlace(ctx, sheets[s], part, angList);
                if (r !== null) { si = s; }
            }
            if (r === null && input.newSheets && (input.maxSheets <= 0 || sheets.length < input.maxSheets)) {
                ek = part.key + "|" + angList.join("-");
                if (!ctx.emptyFail[ek]) {
                    ns = new Sheet(ctx.tplDef, ctx.H);
                    r = tryPlace(ctx, ns, part, angList);
                    if (r !== null) { sheets.push(ns); si = sheets.length - 1; }
                    else { ctx.emptyFail[ek] = true; }
                }
            }
            if (r === null && input.overflow) {
                if (overflow === null) { overflow = new Sheet(ctx.ovDef, ctx.H); }
                r = tryPlace(ctx, overflow, part, angList);
                if (r !== null) { si = -1; overflowArea += part.area; }
            }
            if (r === null) {
                unplaced.push(part.id);
                unplacedArea += part.area;
                continue;
            }
            placements.push({ id: part.id, sheet: si, x: r.x, y: r.y, ang: ctx.angles[r.a] });
            angOf[pi] = r.a;
        }
        return {
            placements: placements,
            unplaced: unplaced,
            sheetCount: sheets.length,
            angOf: angOf,
            score: [
                unplacedArea,
                overflowArea,
                sheets.length,
                overflow ? overflow.maxY : 0,
                sheets.length ? sheets[sheets.length - 1].maxY : 0
            ]
        };
    }

    function better(a, b) {
        var i, d;
        for (i = 0; i < a.score.length; i++) {
            d = a.score[i] - b.score[i];
            if (Math.abs(d) > 0.5) { return d < 0; }
        }
        return false;
    }

    /* ---------- الخوارزمية الجينية ---------- */
    function makeRng(seed) {
        var s = seed % 2147483647;
        if (s <= 0) { s += 2147483646; }
        return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    }

    function crossover(a, b, rnd) {
        var n = a.order.length, i, lo = Math.floor(rnd() * n), hi = Math.floor(rnd() * n), t, taken = {}, order = [], genes = [];
        if (lo > hi) { t = lo; lo = hi; hi = t; }
        for (i = 0; i < n; i++) { order.push(-1); }
        for (i = lo; i <= hi; i++) { order[i] = a.order[i]; taken[a.order[i]] = true; }
        var p = 0;
        for (i = 0; i < n; i++) {
            if (taken[b.order[i]]) { continue; }
            while (order[p] !== -1) { p++; }
            order[p] = b.order[i];
        }
        for (i = 0; i < n; i++) { genes.push(rnd() < 0.5 ? a.genes[i] : b.genes[i]); }
        return { order: order, genes: genes };
    }

    function mutate(ind, rnd, nAng) {
        var n = ind.order.length, i, j, t, swaps = 1 + Math.floor(rnd() * 3);
        for (i = 0; i < swaps && n > 1; i++) {
            j = Math.floor(rnd() * n);
            t = Math.floor(rnd() * n);
            if (rnd() < 0.5) { t = (j + 1) % n; }
            var tmp = ind.order[j]; ind.order[j] = ind.order[t]; ind.order[t] = tmp;
        }
        if (nAng > 1) {
            for (i = 0; i < n; i++) { if (rnd() < 0.1) { ind.genes[i] = Math.floor(rnd() * nAng); } }
        }
        return ind;
    }

    /* ---------- الواجهة العامة ----------
     * input = {
     *   parts: [{id, comps:[{rings:[[x,y,...]], closed:[bool], eo}], sig}],
     *   cell, gap,                       // نقاط
     *   sheetDefs: [def], tplDef: def,   // من makeSheetDef
     *   overflowCells,
     *   angles: [deg...],
     *   newSheets, maxSheets, overflow,
     *   timeLimit (ثوانٍ), seed,
     *   progress: function(info) -> true للإيقاف
     * }
     */
    function solve(input) {
        var t0 = nowMs(), p = params(input.gap, input.cell), n = input.parts.length, i, k, part;
        var angles = (input.angles && input.angles.length) ? input.angles : [0];
        var ctx = {
            input: input, c: input.cell, Rf: p.Rf, H: p.H, angles: angles, allAng: [],
            parts: [], cache: {}, emptyFail: {}, sheetDefs: input.sheetDefs, tplDef: input.tplDef,
            ovDef: { uw: Math.max(1, input.overflowCells), uh: BIG_H, blocked: null }
        };
        for (k = 0; k < angles.length; k++) { ctx.allAng.push(k); }
        if (n === 0) { return { placements: [], unplaced: [], sheetCount: input.sheetDefs.length, strategy: "-" }; }

        for (i = 0; i < n; i++) {
            part = input.parts[i];
            var sx = 0, sy = 0, cnt = 0, minX = 1e30, maxX = -1e30, minY = 1e30, maxY = -1e30, ci, ri, q, pts;
            for (ci = 0; ci < part.comps.length; ci++) {
                for (ri = 0; ri < part.comps[ci].rings.length; ri++) {
                    pts = part.comps[ci].rings[ri];
                    for (q = 0; q < pts.length; q += 2) {
                        if (pts[q] < minX) { minX = pts[q]; } if (pts[q] > maxX) { maxX = pts[q]; }
                        if (pts[q + 1] < minY) { minY = pts[q + 1]; } if (pts[q + 1] > maxY) { maxY = pts[q + 1]; }
                    }
                }
            }
            ctx.parts.push({
                id: part.id, comps: part.comps, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
                key: part.sig ? part.sig : ("u" + part.id), area: 0
            });
        }
        for (i = 0; i < n; i++) { ctx.parts[i].area = getRaster(ctx, ctx.parts[i], 0).area; }

        // الأساس: الأكبر مساحة أولاً + تجربة كل الزوايا لكل قطعة
        var order = [], genes = [], rnd = makeRng(input.seed || 12345);
        for (i = 0; i < n; i++) { order.push(i); genes.push(0); }
        order.sort(function (a, b) { return (ctx.parts[b].area - ctx.parts[a].area) || (a - b); });
        var base = evaluate(ctx, order, genes, angles.length > 1);
        for (i = 0; i < n; i++) { if (base.angOf[i] !== undefined) { genes[i] = base.angOf[i]; } }
        var best = { order: order.slice(0), genes: genes.slice(0), res: base };
        var generations = 0, stop = false;

        function report() {
            if (input.progress) { stop = input.progress({ elapsed: (nowMs() - t0) / 1000, placed: best.res.placements.length, total: n, evals: generations }) === true; }
        }
        report();

        var deadline = t0 + (input.timeLimit > 0 ? input.timeLimit * 1000 : 0);
        if (input.timeLimit > 0 && n > 1 && !stop) {
            var pop = [best], P = 6, child, a, b, tmpSort;
            while (nowMs() < deadline && !stop) {
                if (pop.length < P) {
                    child = mutate({ order: best.order.slice(0), genes: best.genes.slice(0) }, rnd, angles.length);
                } else {
                    a = pop[Math.floor(rnd() * rnd() * pop.length)];
                    b = pop[Math.floor(rnd() * pop.length)];
                    child = mutate(crossover(a, b, rnd), rnd, angles.length);
                }
                child.res = evaluate(ctx, child.order, child.genes, false);
                generations++;
                if (pop.length < P) { pop.push(child); }
                else if (better(child.res, pop[pop.length - 1].res)) { pop[pop.length - 1] = child; }
                pop.sort(function (x, y) { return better(x.res, y.res) ? -1 : (better(y.res, x.res) ? 1 : 0); });
                if (better(pop[0].res, best.res)) { best = pop[0]; }
                report();
            }
        }
        var out = best.res;
        out.strategy = "shape/ga(" + generations + ")";
        out.generations = generations;
        return out;
    }

    return { solve: solve, makeSheetDef: makeSheetDef, params: params };
})();

/* =====================================================================
 *  أدوات الإليستريتور
 * ===================================================================== */
function getBounds(item, useVisible) {
    var b = useVisible ? item.visibleBounds : item.geometricBounds;
    var l = Math.min(b[0], b[2]);
    var r = Math.max(b[0], b[2]);
    var t = Math.max(b[1], b[3]);
    var bt = Math.min(b[1], b[3]);
    return { l: l, t: t, r: r, b: bt, w: r - l, h: t - bt };
}

function rectFromArtboard(ab) {
    var a = ab.artboardRect;
    var l = Math.min(a[0], a[2]);
    var r = Math.max(a[0], a[2]);
    var t = Math.max(a[1], a[3]);
    var bt = Math.min(a[1], a[3]);
    return { l: l, t: t, r: r, b: bt, w: r - l, h: t - bt };
}

function collectSelection(doc) {
    var out = [], sel = doc.selection, i;
    if (!sel || typeof sel.length === "undefined" || typeof sel === "string") { return out; }
    for (i = 0; i < sel.length; i++) {
        try {
            if (sel[i] && typeof sel[i].geometricBounds !== "undefined") { out.push(sel[i]); }
        } catch (e) { /* عنصر غير مدعوم (مثل نص محدد) */ }
    }
    return out;
}

function setDocCoords() {
    var prev = null;
    try {
        prev = app.coordinateSystem;
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    } catch (e) { prev = null; }
    return prev;
}

function restoreCoords(prev) {
    if (prev === null) { return; }
    try { app.coordinateSystem = prev; } catch (e) { /* تجاهل */ }
}

/* =====================================================================
 *  استخراج الأشكال الحقيقية من عناصر الإليستريتور
 * ===================================================================== */
function samePt(p, q) {
    return Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
}

function dist2(p, q) {
    var dx = p[0] - q[0], dy = p[1] - q[1];
    return Math.sqrt(dx * dx + dy * dy);
}

// تحويل مسار (مع المنحنيات) إلى خط متعدد الأضلاع [x,y,x,y,...]
function flattenPath(path, c) {
    var pts = path.pathPoints, n = pts.length, out = [], i, k, p0, p1, a, rd, ld, b, segs, steps, t, mt, L, last;
    if (n < 1) { return null; }
    if (n === 1) { a = pts[0].anchor; return [a[0], a[1]]; }
    segs = path.closed ? n : n - 1;
    for (i = 0; i < segs; i++) {
        p0 = pts[i];
        p1 = pts[(i + 1) % n];
        a = p0.anchor; rd = p0.rightDirection; ld = p1.leftDirection; b = p1.anchor;
        if (samePt(rd, a) && samePt(ld, b)) {
            out.push(a[0], a[1]);
        } else {
            L = dist2(a, rd) + dist2(rd, ld) + dist2(ld, b);
            steps = Math.max(4, Math.min(60, Math.ceil(L / (c * 1.5))));
            for (k = 0; k < steps; k++) {
                t = k / steps;
                mt = 1 - t;
                out.push(
                    mt * mt * mt * a[0] + 3 * mt * mt * t * rd[0] + 3 * mt * t * t * ld[0] + t * t * t * b[0],
                    mt * mt * mt * a[1] + 3 * mt * mt * t * rd[1] + 3 * mt * t * t * ld[1] + t * t * t * b[1]
                );
            }
        }
    }
    if (!path.closed) {
        last = pts[n - 1].anchor;
        out.push(last[0], last[1]);
    }
    return out;
}

function boundsComp(item) {
    var b = getBounds(item, false);
    return { rings: [[b.l, b.t, b.r, b.t, b.r, b.b, b.l, b.b]], closed: [true], eo: false };
}

function isClipPath(ch) {
    try {
        if (ch.typename === "PathItem") { return ch.clipping === true; }
        if (ch.typename === "CompoundPathItem") { return ch.pathItems.length > 0 && ch.pathItems[0].clipping === true; }
    } catch (e) { /* تجاهل */ }
    return false;
}

// يجمع مكوّنات الشكل: مسار مفرد | مركّب (ثقوب even-odd) | مجموعة (اتحاد) | غير ذلك = مستطيل محيط
function collectComps(item, comps, c) {
    var t = item.typename, i, ring, rings, closed, ch, pi;
    try { if (item.hidden === true) { return; } } catch (e0) { /* تجاهل */ }
    if (t === "PathItem") {
        try { if (item.guides) { return; } } catch (e1) { /* تجاهل */ }
        ring = flattenPath(item, c);
        if (ring) { comps.push({ rings: [ring], closed: [item.closed === true], eo: false }); }
        return;
    }
    if (t === "CompoundPathItem") {
        rings = []; closed = [];
        for (i = 0; i < item.pathItems.length; i++) {
            pi = item.pathItems[i];
            ring = flattenPath(pi, c);
            if (ring) { rings.push(ring); closed.push(pi.closed === true); }
        }
        if (rings.length > 0) { comps.push({ rings: rings, closed: closed, eo: true }); }
        return;
    }
    if (t === "GroupItem") {
        if (item.clipped === true) {
            for (i = 0; i < item.pageItems.length; i++) {
                ch = item.pageItems[i];
                if (isClipPath(ch)) { collectComps(ch, comps, c); }
            }
            return;
        }
        for (i = 0; i < item.pageItems.length; i++) { collectComps(item.pageItems[i], comps, c); }
        return;
    }
    comps.push(boundsComp(item)); // نص/صورة/رمز ... = مستطيل محيط
}

function extractShape(item, c, id) {
    var comps = [], i, ri, k, pts, minX = 1e30, maxX = -1e30, minY = 1e30, maxY = -1e30, total = 0, sig, parts;
    try { collectComps(item, comps, c); } catch (e) { comps = []; }
    if (comps.length === 0) { comps.push(boundsComp(item)); }
    for (i = 0; i < comps.length; i++) {
        for (ri = 0; ri < comps[i].rings.length; ri++) {
            pts = comps[i].rings[ri];
            total += pts.length;
            for (k = 0; k < pts.length; k += 2) {
                if (pts[k] < minX) { minX = pts[k]; } if (pts[k] > maxX) { maxX = pts[k]; }
                if (pts[k + 1] < minY) { minY = pts[k + 1]; } if (pts[k + 1] > maxY) { maxY = pts[k + 1]; }
            }
        }
    }
    if (maxX - minX <= 0 && maxY - minY <= 0) { return null; }
    sig = null;
    if (total <= 4000) { // توقيع الشكل: القطع المتطابقة تشارك الحسابات
        parts = [];
        for (i = 0; i < comps.length; i++) {
            parts.push(comps[i].eo ? "E" : "S");
            for (ri = 0; ri < comps[i].rings.length; ri++) {
                pts = comps[i].rings[ri];
                parts.push(comps[i].closed[ri] ? "c" : "o");
                for (k = 0; k < pts.length; k += 2) {
                    parts.push(Math.round((pts[k] - minX) * 20) + "," + Math.round((pts[k + 1] - minY) * 20));
                }
            }
        }
        sig = parts.join(" ");
    }
    return { id: id, comps: comps, sig: sig, l: minX, t: maxY, w: maxX - minX, h: maxY - minY };
}

function isAxisRectShape(sh) {
    var c0, pts, n, i, eps = 0.01, xs, ys;
    if (sh.comps.length !== 1) { return false; }
    c0 = sh.comps[0];
    if (c0.rings.length !== 1 || !c0.closed[0]) { return false; }
    pts = c0.rings[0];
    n = pts.length / 2;
    if (n < 4 || n > 5) { return false; }
    for (i = 0; i < n; i++) {
        xs = Math.abs(pts[2 * i] - sh.l) < eps || Math.abs(pts[2 * i] - (sh.l + sh.w)) < eps;
        ys = Math.abs(pts[2 * i + 1] - sh.t) < eps || Math.abs(pts[2 * i + 1] - (sh.t - sh.h)) < eps;
        if (!xs || !ys) { return false; }
    }
    return true;
}

/* =====================================================================
 *  نافذة التقدم
 * ===================================================================== */
function openProgress() {
    var w, st;
    if (typeof Window === "undefined") { return null; }
    try {
        w = new Window("palette", STR.title);
        w.orientation = "column";
        w.alignChildren = "left";
        w.add("statictext", undefined, STR.working);
        st = w.add("statictext", undefined, "");
        st.characters = 44;
        w.show();
        try { w.update(); } catch (e0) { /* تجاهل */ }
        return { w: w, st: st };
    } catch (e) { return null; }
}

function updateProgress(p, text) {
    if (!p) { return; }
    try { p.st.text = text; p.w.update(); } catch (e) { /* تجاهل */ }
}

function closeProgress(p) {
    if (!p) { return; }
    try { p.w.close(); } catch (e) { /* تجاهل */ }
}

function escPressed() {
    try { return ScriptUI.environment.keyboardState.keyName === "Escape"; } catch (e) { return false; }
}

/* =====================================================================
 *  النافذة (ScriptUI)
 * ===================================================================== */
function showDialog(selCount) {
    var w = new Window("dialog", STR.title);
    w.orientation = "column";
    w.alignChildren = "fill";

    function numRow(parent, label, def) {
        var g = parent.add("group");
        g.orientation = "row";
        g.add("statictext", undefined, label);
        var et = g.add("edittext", undefined, String(def));
        et.characters = 6;
        return et;
    }
    function panel(label) {
        var p = w.add("panel", undefined, label);
        p.orientation = "column";
        p.alignChildren = "left";
        return p;
    }
    function dropRow(parent, label, items, sel) {
        var g = parent.add("group");
        g.add("statictext", undefined, label);
        var dd = g.add("dropdownlist", undefined, items);
        dd.selection = sel;
        return dd;
    }

    // --- الطريقة ---
    var pMode = panel(STR.grpMode);
    var rbShape = pMode.add("radiobutton", undefined, STR.modeShape);
    var rbRect = pMode.add("radiobutton", undefined, STR.modeRect);
    rbShape.value = true;
    var ddCell = dropRow(pMode, STR.precision, [STR.precFast, STR.precNormal, STR.precFine], 1);
    var etTime = numRow(pMode, STR.timeLimit, 15);

    // --- المساحة ---
    var pSrc = panel(STR.grpSource);
    var rbFrame = pSrc.add("radiobutton", undefined, STR.srcFrame);
    var rbArt = pSrc.add("radiobutton", undefined, STR.srcArtboard);
    var rbAll = pSrc.add("radiobutton", undefined, STR.srcAll);
    if (selCount >= 2) { rbFrame.value = true; } else { rbArt.value = true; }

    // --- المسافات ---
    var pSp = panel(STR.grpSpacing);
    var etGap = numRow(pSp, STR.gap, 3);
    var etMargin = numRow(pSp, STR.margin, 3);

    // --- التجميع ---
    var pPack = panel(STR.grpPack);
    var ddRot = dropRow(pPack, STR.rotation, [STR.rotNone, STR.rot2, STR.rot4, STR.rot8], 2);
    var ddSort = dropRow(pPack, STR.sort, [STR.sortAuto, STR.sortArea, STR.sortSide, STR.sortNone], 0);
    var chkVis = pPack.add("checkbox", undefined, STR.visible);
    chkVis.value = false;

    // --- عند عدم الاتساع ---
    var pOv = panel(STR.grpOverflow);
    var chkNew = pOv.add("checkbox", undefined, STR.newSheets);
    chkNew.value = false;
    var etMax = numRow(pOv, STR.maxSheets, 0);
    var chkAb = pOv.add("checkbox", undefined, STR.createAb);
    chkAb.value = true;
    var chkOv = pOv.add("checkbox", undefined, STR.overflow);
    chkOv.value = true;
    var etSheetGap = numRow(pOv, STR.sheetGap, 20);

    function sync() {
        etMax.enabled = chkNew.value;
        chkAb.enabled = chkNew.value && rbFrame.value;
        ddCell.enabled = rbShape.value;
        etTime.enabled = rbShape.value;
        ddSort.enabled = rbRect.value;
        chkVis.enabled = rbRect.value;
    }
    chkNew.onClick = sync;
    rbFrame.onClick = sync;
    rbArt.onClick = sync;
    rbAll.onClick = sync;
    rbShape.onClick = sync;
    rbRect.onClick = sync;
    sync();

    var gb = w.add("group");
    gb.alignment = "right";
    gb.add("button", undefined, STR.ok, { name: "ok" });
    gb.add("button", undefined, STR.cancel, { name: "cancel" });

    if (w.show() !== 1) { return null; }

    function num(et, def, min) {
        var v = parseFloat(String(et.text).replace(",", "."));
        if (isNaN(v)) { v = def; }
        if (v < min) { v = min; }
        return v;
    }
    var sorts = ["auto", "area", "side", "none"];
    var cells = [2, 1, 0.5];
    var rots = ["none", "two", "four", "eight"];
    return {
        mode: rbShape.value ? "shape" : "rect",
        cellMM: cells[ddCell.selection ? ddCell.selection.index : 1],
        timeLimit: num(etTime, 15, 0),
        rotation: rots[ddRot.selection ? ddRot.selection.index : 2],
        source: rbFrame.value ? "frame" : (rbArt.value ? "artboard" : "all"),
        gapMM: num(etGap, 3, 0),
        marginMM: num(etMargin, 3, 0),
        sort: sorts[ddSort.selection ? ddSort.selection.index : 0],
        useVisible: chkVis.value,
        newSheets: chkNew.value,
        maxSheets: Math.floor(num(etMax, 0, 0)),
        createArtboards: chkAb.value,
        overflow: chkOv.value,
        sheetGapMM: num(etSheetGap, 20, 0)
    };
}

function anglesFor(rotation) {
    if (rotation === "two") { return [0, 90]; }
    if (rotation === "four") { return [0, 90, 180, 270]; }
    if (rotation === "eight") { return [0, 45, 90, 135, 180, 225, 270, 315]; }
    return [0];
}

/* =====================================================================
 *  التنفيذ
 * ===================================================================== */
function run(doc, sel, o) {
    var shapeMode = (o.mode === "shape");
    var gap = o.gapMM * MM;
    var margin = o.marginMM * MM;
    var sheetGap = o.sheetGapMM * MM;
    var cell = (o.cellMM || 1) * MM;
    var angles = anglesFor(o.rotation);
    var rotateRect = (o.rotation !== undefined && o.rotation !== "none") || o.rotate === true;
    var i, k, p, b;

    // ---- 1) تحديد المساحات والعناصر ----
    var sheetRects = [];
    var itemObjs = [];
    var frame = null;
    var frameShape = null;

    if (o.source === "frame") {
        if (sel.length < 2) { alert(STR.needTwo); return null; }
        var bigIdx = 0, bigArea = -1, a;
        for (i = 0; i < sel.length; i++) {
            b = getBounds(sel[i], false);
            a = b.w * b.h;
            if (a > bigArea) { bigArea = a; bigIdx = i; }
        }
        frame = sel[bigIdx];
        sheetRects.push(getBounds(frame, false));
        for (i = 0; i < sel.length; i++) {
            if (i !== bigIdx) { itemObjs.push(sel[i]); }
        }
        if (shapeMode) { frameShape = extractShape(frame, cell, -1); }
    } else if (o.source === "artboard") {
        sheetRects.push(rectFromArtboard(doc.artboards[doc.artboards.getActiveArtboardIndex()]));
        itemObjs = sel.slice(0);
    } else {
        for (i = 0; i < doc.artboards.length; i++) { sheetRects.push(rectFromArtboard(doc.artboards[i])); }
        itemObjs = sel.slice(0);
    }

    for (i = 0; i < sheetRects.length; i++) {
        if (sheetRects[i].w - 2 * margin <= 0 || sheetRects[i].h - 2 * margin <= 0) {
            alert(STR.badSheet);
            return null;
        }
    }

    var items = [], parts = [], byId = {}, skipped = 0, sh;
    for (i = 0; i < itemObjs.length; i++) {
        if (shapeMode) {
            sh = extractShape(itemObjs[i], cell, items.length);
            if (!sh) { skipped++; continue; }
            items.push({ id: items.length, w: sh.w, h: sh.h });
            parts.push(sh);
        } else {
            b = getBounds(itemObjs[i], o.useVisible);
            if (b.w <= 0 || b.h <= 0) { skipped++; continue; }
            items.push({ id: items.length, w: b.w, h: b.h });
        }
        byId[items.length - 1] = itemObjs[i];
    }
    if (items.length === 0) { alert(STR.noItems); return null; }

    var existing = sheetRects.length;
    var tpl = sheetRects[sheetRects.length - 1];
    var plan, sheetDefs = [], tplDef = null, prog = null;

    // ---- 2) الحساب ----
    if (shapeMode) {
        var pr = ShapeEngine.params(gap, cell);
        for (i = 0; i < sheetRects.length; i++) {
            var spec = { w: sheetRects[i].w, h: sheetRects[i].h, margin: margin, c: cell, Rf: pr.Rf, H: pr.H, l: sheetRects[i].l, t: sheetRects[i].t, comps: null };
            if (i === 0 && frameShape && !isAxisRectShape(frameShape)) { spec.comps = frameShape.comps; }
            sheetDefs.push(ShapeEngine.makeSheetDef(spec));
        }
        tplDef = sheetDefs[(frame !== null) ? 0 : sheetDefs.length - 1];
        var maxUsable = 0, maxBw = 0;
        for (i = 0; i < sheetDefs.length; i++) { maxUsable = Math.max(maxUsable, sheetDefs[i].uw); }
        maxUsable = Math.max(maxUsable, tplDef.uw);
        for (i = 0; i < parts.length; i++) { maxBw = Math.max(maxBw, Math.ceil(parts[i].w / cell) + 1); }

        prog = openProgress();
        plan = ShapeEngine.solve({
            parts: parts,
            cell: cell,
            gap: gap,
            sheetDefs: sheetDefs,
            tplDef: tplDef,
            overflowCells: Math.max(maxUsable, maxBw),
            angles: angles,
            newSheets: o.newSheets,
            maxSheets: o.maxSheets,
            overflow: o.overflow,
            timeLimit: o.timeLimit,
            seed: 12345,
            progress: function (info) {
                updateProgress(prog, STR.rPlaced + info.placed + " / " + info.total + "   (" + Math.round(info.elapsed) + " s)");
                return escPressed();
            }
        });
        closeProgress(prog);
    } else {
        var sheetsIn = [];
        for (i = 0; i < sheetRects.length; i++) { sheetsIn.push({ w: sheetRects[i].w, h: sheetRects[i].h }); }
        plan = Engine.solve({
            items: items,
            sheets: sheetsIn,
            template: { w: tpl.w, h: tpl.h },
            gap: gap,
            margin: margin,
            rotate: rotateRect,
            newSheets: o.newSheets,
            maxSheets: o.maxSheets,
            overflow: o.overflow,
            sort: o.sort
        });
    }

    // ---- 3) إنشاء المساحات الجديدة ----
    var makeArtboards = (o.source !== "frame") || o.createArtboards;
    var newCount = plan.sheetCount - existing;
    if (newCount > 0) {
        var maxRight = -1e12;
        for (i = 0; i < sheetRects.length; i++) { maxRight = Math.max(maxRight, sheetRects[i].r); }
        if (makeArtboards) {
            for (i = 0; i < doc.artboards.length; i++) {
                maxRight = Math.max(maxRight, rectFromArtboard(doc.artboards[i]).r);
            }
        }
        var nextLeft = maxRight + sheetGap;
        for (k = 0; k < newCount; k++) {
            var nr = { l: nextLeft, t: tpl.t, r: nextLeft + tpl.w, b: tpl.t - tpl.h, w: tpl.w, h: tpl.h };
            nextLeft = nr.r + sheetGap;
            sheetRects.push(nr);
            if (frame !== null) {
                try {
                    var dup = frame.duplicate();
                    dup.translate(nr.l - sheetRects[0].l, 0);
                    dup.name = "Sheet " + (sheetRects.length);
                } catch (e1) { /* تجاهل */ }
            }
            if (makeArtboards) {
                try {
                    var ab = doc.artboards.add([nr.l, nr.t, nr.r, nr.b]);
                    ab.name = "Nesting " + (sheetRects.length);
                } catch (e2) { /* تجاهل */ }
            }
        }
    }

    // ---- 4) نقل العناصر ----
    var lowest = 1e12;
    for (i = 0; i < sheetRects.length; i++) { lowest = Math.min(lowest, sheetRects[i].b); }
    var ovLeft = sheetRects[0].l + margin;
    var ovTop = lowest - sheetGap;

    var inside = 0, outside = 0, rotatedCount = 0, failed = 0, moved = [];
    for (i = 0; i < plan.placements.length; i++) {
        p = plan.placements[i];
        var item = byId[p.id];
        var left, top, angle = 0, def;
        if (shapeMode) {
            angle = p.ang;
            if (p.sheet >= 0) {
                def = (p.sheet < sheetDefs.length) ? sheetDefs[p.sheet] : tplDef;
                left = sheetRects[p.sheet].l + def.ox + p.x * cell;
                top = sheetRects[p.sheet].t - def.oy - p.y * cell;
            } else {
                left = ovLeft + p.x * cell;
                top = ovTop - p.y * cell;
            }
        } else {
            angle = p.rotated ? 90 : 0;
            if (p.sheet >= 0) {
                left = sheetRects[p.sheet].l + p.x;
                top = sheetRects[p.sheet].t - p.y;
            } else {
                left = ovLeft + p.x;
                top = ovTop - p.y;
            }
        }
        try {
            if (angle !== 0) { item.rotate(angle); rotatedCount++; }
            var cb = getBounds(item, shapeMode ? false : o.useVisible);
            item.translate(left - cb.l, top - cb.t);
            moved.push(item);
            if (p.sheet >= 0) { inside++; } else { outside++; }
        } catch (e3) {
            failed++;
        }
    }

    try { doc.selection = moved; } catch (e4) { /* تجاهل */ }
    try { app.redraw(); } catch (e5) { /* تجاهل */ }

    return {
        total: items.length,
        inside: inside,
        outside: outside,
        left: plan.unplaced.length,
        sheets: plan.sheetCount,
        created: newCount > 0 ? newCount : 0,
        rotated: rotatedCount,
        skipped: skipped,
        failed: failed,
        strategy: plan.strategy,
        generations: plan.generations
    };
}

function buildReport(r) {
    var s = STR.doneTitle + "\n\n";
    s += STR.rItems + r.total + "\n";
    s += STR.rInside + r.inside + "\n";
    if (r.outside > 0) { s += STR.rOutside + r.outside + "\n"; }
    if (r.left > 0) { s += STR.rLeft + r.left + "\n"; }
    s += STR.rSheets + r.sheets + "\n";
    if (r.created > 0) { s += STR.rNew + r.created + "\n"; }
    if (r.rotated > 0) { s += STR.rRotated + r.rotated + "\n"; }
    if (r.skipped > 0) { s += STR.rSkipped + r.skipped + "\n"; }
    if (r.failed > 0) { s += STR.rFailed + r.failed + "\n"; }
    if (r.generations > 0) { s += STR.rGen + r.generations + "\n"; }
    if (r.left > 0) { s += STR.rHint; }
    s += STR.rUndo;
    return s;
}

function main(testOptions) {
    if (app.documents.length === 0) { alert(STR.noDoc); return null; }
    var doc = app.activeDocument;
    var sel = collectSelection(doc);
    if (sel.length === 0) { alert(STR.noSel); return null; }

    var opts = testOptions || showDialog(sel.length);
    if (!opts) { return null; }

    var prev = setDocCoords();
    var result = null;
    try {
        result = run(doc, sel, opts);
    } finally {
        restoreCoords(prev);
    }
    if (result) { alert(buildReport(result)); }
    return result;
}

if (typeof app !== "undefined" && typeof NESTING_NO_AUTORUN === "undefined") {
    main();
}
