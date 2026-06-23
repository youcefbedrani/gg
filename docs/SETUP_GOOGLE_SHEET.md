# 📊 Google Sheets Setup Guide | دليل إعداد جدول بيانات جوجل

Follow these steps to link your Paint-by-Numbers store backend with a Google Sheet.

اتبع الخطوات التالية لربط لوحة تحكم متجرك بجدول بيانات جوجل لاستقبال الطلبات وتجهيز الخلطات.

---

## English Instructions

### Step 1: Create a Google Sheet
1. Open [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Give it a name (e.g. `Paint-by-Numbers Store Orders`).

### Step 2: Open Extensions & Create Apps Script
1. In the menu, click **Extensions** (الامتدادات) -> **Apps Script**.
2. Rename the project to `PaintByNumbersSheetConnector`.
3. Delete any default code in `Code.gs` and paste the contents of `google-apps-script/Code.gs` from this project.

### Step 3: Run the Initial Sheet Setup
1. In the toolbar of Apps Script, select `setupSheet` from the function dropdown next to "Run".
2. Click **Run**.
3. It will ask for permissions. Click **Review Permissions**, select your Google account, click **Advanced** -> **Go to PaintByNumbersSheetConnector (unsafe)**, and approve the authorization.
4. Go back to your Google Sheet. You should see the headers generated in row 1 in Arabic.

### Step 4: Deploy the Apps Script as a Web App
1. In the top right of the Apps Script page, click **Deploy** -> **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the deployment details:
   - **Description**: `PBN Order Receiver`
   - **Execute as**: `Me (your_email@gmail.com)`
   - **Who has access**: **Anyone** (This is crucial, otherwise Render won't be able to POST to it!).
4. Click **Deploy**.
5. Copy the **Web App URL** generated (it ends with `/exec`).

### Step 5: Update Env Variables
1. Paste this URL in your `.env` file under `GOOGLE_SCRIPT_URL`:
   ```env
   GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/xxxxxx-xxxxxx/exec
   ```
2. When deploying to Render, add `GOOGLE_SCRIPT_URL` as an environment variable in the dashboard.

> ⚠️ **Important**: Every time you modify `Code.gs`, you must deploy a **New version**: Click **Deploy** -> **Manage deployments** -> click the edit (pencil) icon -> select **Version: New version** -> **Deploy**.

---

## دليل الإعداد باللغة العربية

### الخطوة 1: إنشاء جدول بيانات جوجل
1. افتح [جداول بيانات جوجل](https://sheets.google.com) وأنشئ جدولاً فارغاً جديداً.
2. سمّه باسم مناسب (مثل: `طلبات متجر بهو الفنون`).

### الخطوة 2: فتح البرمجة النصية للتطبيقات (Apps Script)
1. من القائمة العلوية، اختر **الامتدادات** (Extensions) -> **Apps Script**.
2. سمّ المشروع باسم: `PaintByNumbersSheetConnector`.
3. احذف أي كود موجود في الملف الافتراضي `Code.gs` والصق محتوى ملف `google-apps-script/Code.gs` بالكامل.

### الخطوة 3: تهيئة أعمدة الجدول
1. من شريط الأدوات العلوي في Apps Script، اختر الدالة `setupSheet` من القائمة المنسدلة بجوار زر "تشغيل".
2. اضغط على زر **تشغيل** (Run).
3. ستظهر لك نافذة تطلب منح الصلاحيات. اضغط على **مراجعة الأذونات**، ثم اختر حساب جوجل الخاص بك، واضغط على **خيارات متقدمة** -> **انتقال إلى PaintByNumbersSheetConnector (غير آمن)**، وامنح الأذونات المطلوبة.
4. ارجع إلى جدول البيانات، وستجد الأعمدة قد تم إنشاؤها وتنسيقها باللغة العربية تلقائياً.

### الخطوة 4: نشر البرنامج النصي كويب ويب (Web App)
1. في أعلى يسار صفحة Apps Script، اضغط على **نشر** (Deploy) -> **نشر جديد** (New deployment).
2. اضغط على رمز الترس بجوار "تحديد النوع" واختر **تطبيق ويب** (Web app).
3. املأ البيانات كالتالي:
   - **الوصف**: `استقبال طلبات المتجر`
   - **تنفيذ باسم**: **أنا** (بريدك الإلكتروني الخاص)
   - **من يمكنه الوصول**: **أي شخص** (Anyone) - *هذه الخطوة مهمة جداً لتمكين السيرفر من كتابة الطلبات*.
4. اضغط على زر **نشر** (Deploy).
5. انسخ **عنوان URL لتطبيق الويب** الناتج (ينتهي بـ `/exec`).

### الخطوة 5: تحديث ملف البيئة
1. الصق عنوان URL المنسوخ في ملف `.env` الخاص بك تحت المفتاح `GOOGLE_SCRIPT_URL`:
   ```env
   GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/xxxxxx-xxxxxx/exec
   ```
2. عند الرفع على منصة Render، أضف هذا المتغير في قائمة Variables باللوحة الخاصة بك.

> ⚠️ **تنبيه هام**: في حال قمت بأي تعديل مستقبلي على كود Apps Script، يجب عليك نشر إصدار جديد لكي يتم تفعيل التعديلات: اذهب إلى **نشر** -> **إدارة عمليات النشر** -> اضغط على رمز القلم للتعديل -> اختر **الإصدار: إصدار جديد** (New version) -> ثم اضغط **نشر**.
