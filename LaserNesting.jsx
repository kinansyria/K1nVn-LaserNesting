#target illustrator by TG:@K1nVn

function laserNesting() {
    if (app.documents.length === 0) {
        alert("الرجاء فتح مستند جديد في برنامج اليستريتور أولاً.");
        return;
    }

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length < 2) {
        alert("الرجاء تحديد إطار العمل (المستطيل الخارجي كآخر عنصر أو أوله) مع العناصر المراد توزيعها (يجب أن يكون المجموع عنصرين على الأقل).");
        return;
    }

    // افتراض أن العنصر الأكبر أو المحدد أولاً كإطار، أو يمكننا البحث عن مستطيل ليتم اعتباره الإطار
    // لسهولة الاستخدام: سنعتبر العنصر الأول في التحديد هو إطار الاحتواء (Container) وباقي العناصر هي المراد توزيعها
    var container = selection[0];
    var itemsToDistribute = [];

    for (var i = 1; i < selection.length; i++) {
        itemsToDistribute.push(selection[i]);
    }

    // إحداثيات الإطار
    var cBounds = container.geometricBounds; // [left, top, right, bottom]
    var cLeft = cBounds[0];
    var cTop = cBounds[1];
    var cRight = cBounds[2];
    var cBottom = cBounds[3];
    var cWidth = cRight - cLeft;
    var cHeight = cTop - cBottom;

    // مسافة الأمان بين العناصر بالنقاط (1 سنتيمتر تقريبا = 28.34 نقطة، هنا سنترك 5 نقاط كمسافة أمان افتراضية)
    var padding = 10; 

    var currentX = cLeft + padding;
    var currentY = cTop - padding;
    var maxHeightInRow = 0;

    for (var j = 0; j < itemsToDistribute.length; j++) {
        var item = itemsToDistribute[j];
        var iBounds = item.geometricBounds; // [left, top, right, bottom]
        var iWidth = iBounds[2] - iBounds[0];
        var iHeight = iBounds[1] - iBounds[3];

        // التحقق مما إذا كان العنصر سيتجاوز عرض الإطار، والانتقال للسطر التالي
        if (currentX + iWidth > cRight - padding) {
            currentX = cLeft + padding;
            currentY = currentY - maxHeightInRow - padding;
            maxHeightInRow = 0;
        }

        // التحقق من تجاوز ارتفاع الإطار
        if (currentY - iHeight < cBottom - padding) {
            alert("تنبيه: مساحة الإطار غير كافية لتوزيع كافة العناصر!");
            break;
        }

        // نقل العنصر إلى الموقع الجديد
        var deltaX = currentX - iBounds[0];
        var deltaY = currentY - iBounds[1];
        item.translate(deltaX, deltaY);

        // تحديث المؤشرات
        if (iHeight > maxHeightInRow) {
            maxHeightInRow = iHeight;
        }

        currentX += iWidth + padding;
    }

    alert("تم الانتهاء من توزيع العناصر بنجاح لقص الليزر!");
}

laserNesting();
