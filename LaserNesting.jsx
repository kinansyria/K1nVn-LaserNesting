#target illustrator
/*
 * LaserNesting v2.0  —  ترتيب العناصر لقص الليزر
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

var NESTING_VERSION = "2.0";
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
    var gSort = pPack.add("group");
    gSort.add("statictext", undefined, STR.sort);
    var ddSort = gSort.add("dropdownlist", undefined, [STR.sortAuto, STR.sortArea, STR.sortSide, STR.sortNone]);
    ddSort.selection = 0;
    var chkRot = pPack.add("checkbox", undefined, STR.rotate);
    chkRot.value = false;
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
    }
    chkNew.onClick = sync;
    rbFrame.onClick = sync;
    rbArt.onClick = sync;
    rbAll.onClick = sync;
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
    return {
        source: rbFrame.value ? "frame" : (rbArt.value ? "artboard" : "all"),
        gapMM: num(etGap, 3, 0),
        marginMM: num(etMargin, 3, 0),
        sort: sorts[ddSort.selection ? ddSort.selection.index : 0],
        rotate: chkRot.value,
        useVisible: chkVis.value,
        newSheets: chkNew.value,
        maxSheets: Math.floor(num(etMax, 0, 0)),
        createArtboards: chkAb.value,
        overflow: chkOv.value,
        sheetGapMM: num(etSheetGap, 20, 0)
    };
}

/* =====================================================================
 *  التنفيذ
 * ===================================================================== */
function run(doc, sel, o) {
    var gap = o.gapMM * MM;
    var margin = o.marginMM * MM;
    var sheetGap = o.sheetGapMM * MM;
    var i, k, p, b;

    // ---- 1) تحديد المساحات والعناصر ----
    var sheetRects = [];
    var itemObjs = [];
    var frame = null;

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

    var items = [], byId = {}, skipped = 0;
    for (i = 0; i < itemObjs.length; i++) {
        b = getBounds(itemObjs[i], o.useVisible);
        if (b.w <= 0 || b.h <= 0) { skipped++; continue; }
        items.push({ id: items.length, w: b.w, h: b.h });
        byId[items.length - 1] = itemObjs[i];
    }
    if (items.length === 0) { alert(STR.noItems); return null; }

    var tpl = sheetRects[sheetRects.length - 1];
    var existing = sheetRects.length;

    // ---- 2) الحساب ----
    var sheetsIn = [];
    for (i = 0; i < sheetRects.length; i++) { sheetsIn.push({ w: sheetRects[i].w, h: sheetRects[i].h }); }

    var plan = Engine.solve({
        items: items,
        sheets: sheetsIn,
        template: { w: tpl.w, h: tpl.h },
        gap: gap,
        margin: margin,
        rotate: o.rotate,
        newSheets: o.newSheets,
        maxSheets: o.maxSheets,
        overflow: o.overflow,
        sort: o.sort
    });

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
        var left, top;
        if (p.sheet >= 0) {
            left = sheetRects[p.sheet].l + p.x;
            top = sheetRects[p.sheet].t - p.y;
        } else {
            left = ovLeft + p.x;
            top = ovTop - p.y;
        }
        try {
            if (p.rotated) { item.rotate(90); rotatedCount++; }
            var cb = getBounds(item, o.useVisible);
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
        strategy: plan.strategy
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
