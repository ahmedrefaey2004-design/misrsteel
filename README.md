# مصر ستيل — MISR STEEL Website
## دليل التشغيل الكامل على GitHub و Netlify

---

## 📁 محتوى المشروع

```
misrsteel_new/
├── index.html                    ← الصفحة الرئيسية
├── shop.html                     ← المتجر + سلة المشتريات + Paymob
├── login.html                    ← تسجيل دخول العملاء
├── affiliate-login.html          ← بوابة المسوّقين
├── contracts.html                ← صفحة العقود
├── misrsteel_sales_contract.docx ← عقد البيع (Word)
├── misrsteel_affiliate_contract.docx ← عقد المسوّق (Word)
└── images/                       ← 87 صورة للمنتجات
    ├── p01-rose-gold-chair.jpg
    ├── p02-linen-armchair.jpg
    ├── p03-barrel-gold.jpg
    ├── ... (وكل صور المنتجات والـ variants)
    ├── showroom-lounge.jpg
    └── showroom-cage.jpg
```

---

## 🚀 الخطوة 1: رفع الملفات على GitHub

### أولاً: إنشاء Repository

1. افتح **github.com** وادخل بحسابك
2. اضغط الزرار الأخضر **"New"** في الشمال
3. في خانة **Repository name** اكتب: `misrsteel-website`
4. اختار **Public**
5. اضغط **"Create repository"**

---

### ثانياً: رفع الملفات

1. في الصفحة اللي فتحت اضغط **"uploading an existing file"**
2. افتح فولدر `misrsteel_new` على جهازك
3. **اضغط Ctrl+A** لاختيار كل الملفات
4. اسحبهم كلهم في المربع الكبير على GitHub
5. استنى لحد ما يخلص الرفع (الصور ممكن تاخد 2-3 دقائق)

---

### ثالثاً: رفع فولدر الصور

> **مهم جداً** — GitHub لا يرفع فولدرات فاضية، الصور لازم ترفعها منفصلة

1. بعد رفع الملفات الأساسية، اضغط **"Add file"** → **"Upload files"**
2. افتح فولدر `images` على جهازك
3. **اضغط Ctrl+A** لاختيار كل الصور الـ 87
4. اسحبهم في المربع
5. في خانة **"Commit changes"** اكتب: `إضافة صور المنتجات`
6. اضغط **"Commit changes"**

---

### رابعاً: تأكيد اكتمال الرفع

تأكد إن الـ repository يحتوي على:
- ✅ `index.html`
- ✅ `shop.html`
- ✅ `login.html`
- ✅ `affiliate-login.html`
- ✅ `contracts.html`
- ✅ فولدر `images/` فيه 87 صورة
- ✅ ملفات الـ `.docx`

---

## 🌐 الخطوة 2: نشر الموقع على Netlify

### أولاً: إنشاء حساب

1. افتح **app.netlify.com**
2. اضغط **"Sign up"**
3. اختار **"Sign up with GitHub"** (مهم — مش إيميل)
4. اضغط **"Authorize Netlify"**

---

### ثانياً: ربط المشروع

1. بعد الدخول اضغط **"Add new site"**
2. اضغط **"Import an existing project"**
3. اضغط **"Deploy with GitHub"**
4. هيطلب منك إذن — اضغط **"Authorize"**
5. من القائمة اختار **"misrsteel-website"**

---

### ثالثاً: إعدادات النشر

هتظهر صفحة إعدادات:
- **Branch**: `main` ← اتركه
- **Publish directory**: اتركه فاضي
- اضغط **"Deploy misrsteel-website"**

---

### رابعاً: انتظار النشر

```
⏳ Building... (دقيقة)
✅ Your site is live!
```

هيديك رابط زي:
```
https://amazing-name-123.netlify.app
```

**افتح الرابط — موقعك شغال! 🎉**

---

## ✏️ تغيير اسم الرابط

1. في Netlify اضغط **"Site configuration"**
2. اضغط **"Change site name"**
3. اكتب: `misrsteel` أو `misr-steel`
4. الرابط يبقى: **`misrsteel.netlify.app`**

---

## 🔄 تحديث الموقع بعد كده

لو عاوز تعدل أي ملف:

**الطريقة السهلة:**
1. افتح GitHub → الـ repository
2. اضغط على الملف اللي عاوز تعدله
3. اضغط أيقونة القلم ✏️
4. عدّل وانتا عارف
5. اضغط **"Commit changes"**
6. Netlify يحدّث الموقع تلقائياً خلال دقيقة ✅

---

## 🔑 إعداد Paymob للدفع الأونلاين

1. سجّل على **accept.paymob.com**
2. أكمل بيانات النشاط التجاري
3. من **Settings → API Keys** خد الـ **Secret Key**
4. من **Integrations** عمل integration جديد وخد الـ **Integration ID**
5. من **Iframes** عمل iframe وخد الـ **iFrame ID**
6. افتح `shop.html` على GitHub
7. ابحث عن: `PAYMOB_API_KEY`
8. ضع بياناتك

---

## 📞 معلومات التواصل في الموقع

الرقم الموجود في الموقع حالياً:
```
+201050595250
```

لو محتاج تغيير أي معلومة تانية:
- ابحث عن `info@misrsteel.com` واستبدل بإيميلك
- ابحث عن `القاهرة، مصر` واستبدل بعنوانك الكامل

---

## ❓ مشاكل شائعة وحلولها

| المشكلة | الحل |
|---------|------|
| الموقع يظهر "Page Not Found" | تأكد إن الملف الرئيسي اسمه `index.html` بالظبط |
| الصور مش بتظهر | تأكد إن فولدر `images` اتحمل على GitHub |
| التعديلات مش بتظهر | انتظر دقيقة وعمل refresh للصفحة |
| Netlify مش بيلاقي GitHub | اضغط "Configure Netlify app" وادي صلاحية لكل الـ repositories |

---

## 📱 روابط مهمة

- **الموقع بعد النشر**: `https://misrsteel.netlify.app`
- **GitHub**: `https://github.com/USERNAME/misrsteel-website`
- **Netlify Dashboard**: `https://app.netlify.com`
- **Paymob**: `https://accept.paymob.com`
- **WhatsApp**: `https://wa.me/201050595250`

---

**مصر ستيل — MISR STEEL · القاهرة، مصر 🇪🇬**

---

## ✅ أسئلة مهمة: الداتا – الداشبورد – النشر – رفع المنتجات

### 1) هل الموقع بيحتفظ بالداتا؟
- **سلة المشتريات/اللغة/سعر الدولار**: بتتخزن على جهاز العميل في `localStorage`.
- **بيانات مستخدمي الـ AI والرصيد**: بتتخزن على السيرفر في ملف:
  - `data/users.json`
- **بيانات المحتوى (منتجات/أقسام/أزرار...)**: بتتخزن على السيرفر في:
  - `data/site-config.json`

> مهم: لو السيرفر اتمسح أو اتغير بدون Backup هتفقد البيانات. لازم تعمل نسخ احتياطي دوري.

### 2) أدخل الداشبورد وأعدل إزاي؟
1. شغّل الباك‑إند:
   ```bash
   npm install
   ADMIN_TOKEN=your_strong_token npm start
   ```
2. افتح:
   - `http://localhost:3000/admin.html`
3. اكتب:
   - **API Base URL** = `http://localhost:3000`
   - **Admin Token** = نفس قيمة `ADMIN_TOKEN`
4. اضغط **تحميل**، وبعدها تقدر:
   - تعدل JSON كامل وتحفظ
   - تضيف/تحذف منتجات أو أقسام من جزء **إضافة عنصر**

### 3) هل نقدر ننشره للعملاء دلوقتي؟
- **ينفع كتجربة تشغيلية**.
- للإطلاق التجاري الكامل، لازم قبل النشر:
  1. تثبيت `ADMIN_TOKEN` قوي (مش القيمة الافتراضية).
  2. إعداد HTTPS + دومين.
  3. تفعيل Backup يومي لمجلد `data/`.
  4. ربط الدفع الفعلي وتأكيد الدفع عبر webhook.

### 4) نرفع منتجات الأقسام ووصفها إزاي؟
- من `admin.html`:
  - اختر `collection = products`
  - أضف JSON للمنتج (مثال):
    ```json
    {
      "id": "chair-royal-gold",
      "nameAr": "كرسي رويال ذهبي",
      "nameEn": "Royal Gold Chair",
      "section": "hall",
      "descriptionAr": "كرسي ستانلس فاخر مناسب للقاعات.",
      "descriptionEn": "Premium stainless chair for halls.",
      "priceUsd": 45,
      "image": "images/p01-rose-gold-chair.jpg"
    }
    ```
- لإضافة أقسام:
  - اختر `collection = sections` وأضف عنصر فيه `id` واسم عربي/إنجليزي.
