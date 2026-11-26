/* ==========================================================
   Expense Tracker — app.js
   1. Constants  2. Storage  2b. Receipts  3. State  4. Helpers
   5. Translations  6. Settings  6b. Sample data  6c. Entry panel
   6d. Toast  6e. Budget  6f. Bills  6g. Calendar  7. Rendering  8. Events  9. Start
   ========================================================== */

'use strict';

/* ---------- 1. Constants ---------- */
const RATE = 3.75; // 1 USD = 3.75 SAR

const STORAGE_KEYS = {
  entries: 'et.entries',
  bills: 'et.bills',
  settings: 'et.settings',
};

const DEFAULT_SETTINGS = {
  currency: 'USD',
  lang: 'en',
  theme: 'light',
  budget: null,
  glass: 0,
};

const CATEGORIES = ['housing', 'food', 'transport', 'bills', 'fun', 'other'];
const INCOME_COLORS = { salary: 'housing', freelance: 'accent', other: 'other' };
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB

/* ---------- 2. Storage ---------- */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn('Could not read', key, error);
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('Could not save', key, error);
    return false;
  }
}

/* ---------- 2b. Receipts (IndexedDB) ---------- */
const RECEIPT_DB = 'et-receipts';
const RECEIPT_STORE = 'receipts';
let dbPromise = null;

function openReceiptDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(RECEIPT_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(RECEIPT_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function receiptRequest(mode, action) {
  const db = await openReceiptDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECEIPT_STORE, mode);
    const request = action(transaction.objectStore(RECEIPT_STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const receipts = {
  get: (id) => receiptRequest('readonly', (store) => store.get(id)),
  put: (id, record) => receiptRequest('readwrite', (store) => store.put(record, id)),
  remove: (id) => receiptRequest('readwrite', (store) => store.delete(id)),
  clear: () => receiptRequest('readwrite', (store) => store.clear()),
};

/* ---------- 3. State ---------- */
const state = {
  entries: load(STORAGE_KEYS.entries, []),
  bills: load(STORAGE_KEYS.bills, []),
  settings: { ...DEFAULT_SETTINGS, ...load(STORAGE_KEYS.settings, {}) },
  period: { month: new Date().getMonth(), year: new Date().getFullYear() },
  filters: { query: '', type: 'all', category: 'all' },
};

function saveEntries() {
  return save(STORAGE_KEYS.entries, state.entries);
}

function saveBills() {
  return save(STORAGE_KEYS.bills, state.bills);
}

function saveSettings() {
  return save(STORAGE_KEYS.settings, state.settings);
}

/* ---------- 4. Helpers ---------- */
function locale() {
  return state.settings.lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
}

function convert(amount, from, to) {
  if (from === to) return amount;
  return from === 'USD' ? amount * RATE : amount / RATE;
}

function formatMoney(amount, currency = state.settings.currency) {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function parseAmount(text) {
  const cleaned = String(text)
    .trim()
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/٫/g, '.')
    .replace(/,/g, '');

  const number = Number(cleaned);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 100) / 100;
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(iso, options = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat(locale(), options).format(parseDate(iso));
}

function monthName(index) {
  return new Intl.DateTimeFormat(locale(), { month: 'short' }).format(new Date(2026, index, 1));
}

function daysUntil(iso) {
  const ms = parseDate(iso) - parseDate(todayISO());
  return Math.round(ms / 86400000);
}

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function $(id) {
  return document.getElementById(id);
}

function isoDate(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dd}`;
}

function labelKey(entry) {
  return entry.type === 'income' ? `src.${entry.source}` : `cat.${entry.category}`;
}

function dotColor(entry) {
  return entry.type === 'income' ? INCOME_COLORS[entry.source] ?? 'other' : entry.category;
}

function newestFirst(entries) {
  return [...entries].reverse().sort((a, b) => b.date.localeCompare(a.date));
}

function formatSize(bytes) {
  const inMB = bytes >= 1024 * 1024;
  return new Intl.NumberFormat(locale(), {
    style: 'unit',
    unit: inMB ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: 1,
  }).format(inMB ? bytes / (1024 * 1024) : bytes / 1024);
}

async function compressImage(file, maxSide = 1600, quality = 0.8) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch (error) {
    console.warn('Could not compress image', error);
    return file;
  }
}

/* ---------- 5. Translations ---------- */
const TEXT = {
  'app.name': { en: 'Expense Tracker', ar: 'متتبع المصاريف' },
  'a11y.skip': { en: 'Skip to content', ar: 'انتقل إلى المحتوى' },
  'action.addExpense': { en: 'Add expense', ar: 'إضافة مصروف' },

  'nav.dashboard': { en: 'Dashboard', ar: 'لوحة التحكم' },
  'nav.transactions': { en: 'Transactions', ar: 'المعاملات' },
  'nav.bills': { en: 'Bills', ar: 'الفواتير' },
  'nav.stats': { en: 'Stats', ar: 'الإحصائيات' },

  'settings.currency': { en: 'Display currency', ar: 'عملة العرض' },
  'settings.language': { en: 'Language', ar: 'اللغة' },
  'settings.darkMode': { en: 'Dark mode', ar: 'الوضع الداكن' },

  'period.month': { en: 'Month', ar: 'الشهر' },
  'period.year': { en: 'Year', ar: 'السنة' },

  'summary.label': { en: 'Summary', ar: 'الملخص' },
  'summary.income': { en: 'Income', ar: 'الدخل' },
  'summary.balance': { en: 'Balance left', ar: 'الرصيد المتبقي' },
  'summary.spent': { en: 'Spent', ar: 'المصروف' },

  'budget.none': { en: 'No budget set', ar: 'لم تحدد ميزانية' },
  'budget.edit': { en: 'Edit budget', ar: 'تعديل الميزانية' },
  'budget.used': { en: '{percent}% of {total} used', ar: 'تم استخدام {percent}% من {total}' },
  'budget.title': { en: 'Monthly budget', ar: 'الميزانية الشهرية' },
  'budget.amount': { en: 'Amount per month', ar: 'المبلغ الشهري' },
  'budget.hint': { en: 'Shown in both currencies at the fixed 3.75 rate.', ar: 'تُعرض بالعملتين بسعر ثابت 3.75.' },
  'budget.remove': { en: 'Remove budget', ar: 'إزالة الميزانية' },

  'dash.byCategory': { en: 'By category', ar: 'حسب الفئة' },
  'dash.noSpending': { en: 'No spending this month.', ar: 'لا توجد مصاريف هذا الشهر.' },
  'dash.upcomingBills': { en: 'Upcoming bills', ar: 'الفواتير القادمة' },
  'dash.noBills': { en: 'No bills due in the next 30 days.', ar: 'لا توجد فواتير مستحقة خلال 30 يومًا.' },
  'dash.latest': { en: 'Latest transactions', ar: 'أحدث المعاملات' },
  'dash.noTransactions': { en: 'No transactions yet.', ar: 'لا توجد معاملات بعد.' },
  'action.viewAll': { en: 'View all', ar: 'عرض الكل' },

  'footer.privacy': { en: 'Your data is saved only in this browser. Nothing is sent to a server.', ar: 'بياناتك محفوظة في هذا المتصفح فقط، ولا يُرسل أي شيء إلى خادم.' },
  'footer.loadSample': { en: 'Load sample data', ar: 'تحميل بيانات تجريبية' },
  'footer.clearData': { en: 'Clear all data', ar: 'مسح كل البيانات' },
  'footer.builtBy': { en: 'Built by', ar: 'من تطوير' },

  'panel.newExpense': { en: 'New expense', ar: 'مصروف جديد' },
  'panel.newIncome': { en: 'New income', ar: 'دخل جديد' },
  'panel.editExpense': { en: 'Edit expense', ar: 'تعديل المصروف' },
  'panel.editIncome': { en: 'Edit income', ar: 'تعديل الدخل' },
  'panel.type': { en: 'Type', ar: 'النوع' },
  'panel.expense': { en: 'Expense', ar: 'مصروف' },
  'panel.income': { en: 'Income', ar: 'دخل' },
  'panel.amount': { en: 'Amount', ar: 'المبلغ' },
  'panel.currency': { en: 'Currency', ar: 'العملة' },
  'panel.category': { en: 'Category', ar: 'الفئة' },
  'panel.source': { en: 'Source', ar: 'المصدر' },
  'panel.description': { en: 'Description', ar: 'الوصف' },
  'panel.descriptionHint': { en: 'e.g. Weekly groceries', ar: 'مثال: مشتريات الأسبوع' },
  'panel.date': { en: 'Date', ar: 'التاريخ' },
  'panel.addNote': { en: 'Add note', ar: 'إضافة ملاحظة' },
  'panel.note': { en: 'Note', ar: 'ملاحظة' },
  'panel.noteHint': { en: 'Anything worth remembering', ar: 'أي شيء تريد تذكّره' },
  'panel.attachReceipt': { en: 'Attach receipt', ar: 'إرفاق إيصال' },
  'panel.receiptPick': { en: 'Choose a photo or PDF', ar: 'اختر صورة أو ملف PDF' },
  'panel.receiptLimit': { en: 'Up to 5 MB · saved only on this device', ar: 'حتى 5 ميجابايت · يُحفظ على هذا الجهاز فقط' },
  'panel.removeReceipt': { en: 'Remove receipt', ar: 'إزالة الإيصال' },
  'panel.shortcuts': { en: 'Esc to close · Enter to save', ar: 'Esc للإغلاق · Enter للحفظ' },

  'cat.housing': { en: 'Housing', ar: 'السكن' },
  'cat.food': { en: 'Food', ar: 'الطعام' },
  'cat.transport': { en: 'Transport', ar: 'المواصلات' },
  'cat.bills': { en: 'Bills', ar: 'الفواتير' },
  'cat.fun': { en: 'Fun', ar: 'الترفيه' },
  'cat.other': { en: 'Other', ar: 'أخرى' },
  'src.salary': { en: 'Salary', ar: 'الراتب' },
  'src.freelance': { en: 'Freelance', ar: 'عمل حر' },
  'src.other': { en: 'Other', ar: 'أخرى' },

  'error.amount': { en: 'Enter an amount greater than 0.', ar: 'أدخل مبلغًا أكبر من 0.' },
  'error.category': { en: 'Pick a category.', ar: 'اختر فئة.' },
  'error.description': { en: 'Add a short description.', ar: 'أضف وصفًا قصيرًا.' },
  'error.receipt': { en: 'That file is over 5 MB.', ar: 'حجم الملف أكبر من 5 ميجابايت.' },

  'action.close': { en: 'Close', ar: 'إغلاق' },
  'action.delete': { en: 'Delete', ar: 'حذف' },
  'action.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'action.save': { en: 'Save', ar: 'حفظ' },
  'action.saveAnother': { en: 'Save & add another', ar: 'حفظ وإضافة آخر' },
  'action.undo': { en: 'Undo', ar: 'تراجع' },

  'row.hasReceipt': { en: 'Has receipt', ar: 'يوجد إيصال' },

  'confirm.clear': { en: 'Delete all expenses, income, bills and your budget? This can’t be undone.', ar: 'حذف كل المصاريف والدخل والفواتير والميزانية؟ لا يمكن التراجع عن ذلك.' },
  'confirm.replace': { en: 'Replace your current data with sample data?', ar: 'استبدال بياناتك الحالية ببيانات تجريبية؟' },

  'due.overdue': { en: 'Overdue', ar: 'متأخرة' },
  'meta.separator': { en: ', ', ar: '، ' },

  'budget.leaves': { en: 'Leaves {amount} of your {total} budget', ar: 'يتبقى {amount} من ميزانيتك البالغة {total}' },
  'budget.over': { en: '{amount} over your {total} budget', ar: 'تتجاوز ميزانيتك البالغة {total} بمقدار {amount}' },

  'toast.saved': { en: 'Saved', ar: 'تم الحفظ' },
  'toast.deleted': { en: 'Deleted', ar: 'تم الحذف' },
  'toast.restored': { en: 'Restored', ar: 'تمت الاستعادة' },
  'toast.sampleLoaded': { en: 'Sample data loaded', ar: 'تم تحميل البيانات التجريبية' },
  'toast.cleared': { en: 'All data cleared', ar: 'تم مسح كل البيانات' },
  'toast.budgetSaved': { en: 'Budget saved', ar: 'تم حفظ الميزانية' },
  'toast.budgetRemoved': { en: 'Budget removed', ar: 'تمت إزالة الميزانية' },
  'toast.receiptFailed': { en: 'Couldn’t save the receipt. Storage may be full.', ar: 'تعذّر حفظ الإيصال، قد تكون مساحة التخزين ممتلئة.' },

  'tx.tools': { en: 'Search and filters', ar: 'البحث والتصفية' },
  'tx.searchLabel': { en: 'Search transactions', ar: 'البحث في المعاملات' },
  'tx.searchHint': { en: 'Search description or notes', ar: 'ابحث في الوصف أو الملاحظات' },
  'tx.all': { en: 'All', ar: 'الكل' },
  'tx.expenses': { en: 'Expenses', ar: 'المصاريف' },
  'tx.allCategories': { en: 'All categories', ar: 'كل الفئات' },
  'tx.export': { en: 'Export CSV', ar: 'تصدير CSV' },
  'tx.noMatch': { en: 'No transactions match.', ar: 'لا توجد معاملات مطابقة.' },
  'tx.hint': { en: 'Click a row to edit, delete or view its receipt.', ar: 'اضغط على أي صف لتعديله أو حذفه أو عرض إيصاله.' },
  'tx.countOne': { en: '1 transaction', ar: 'معاملة واحدة' },
  'tx.count': { en: '{count} transactions', ar: 'عدد المعاملات: {count}' },

  'bills.next30': { en: 'Due in the next 30 days', ar: 'المستحق خلال 30 يومًا' },
  'bills.add': { en: 'Add bill', ar: 'إضافة فاتورة' },
  'bills.all': { en: 'All bills', ar: 'كل الفواتير' },
  'bills.empty': { en: 'No bills yet. Add rent, phone or internet to get reminders.', ar: 'لا توجد فواتير بعد. أضف الإيجار أو الهاتف أو الإنترنت لتظهر لك التذكيرات.' },
  'bills.hint': { en: 'Reminders show here and on the Dashboard while this site is open. There are no phone notifications.', ar: 'تظهر التذكيرات هنا وفي لوحة التحكم أثناء فتح الموقع، ولا تصل إشعارات إلى الهاتف.' },
  'bills.countOne': { en: '1 bill', ar: 'فاتورة واحدة' },
  'bills.count': { en: '{count} bills', ar: 'عدد الفواتير: {count}' },
  'bills.overdueOne': { en: '1 bill is overdue.', ar: 'لديك فاتورة واحدة متأخرة.' },
  'bills.overdueMany': { en: '{count} bills are overdue.', ar: 'عدد الفواتير المتأخرة: {count}' },
  'bills.markPaid': { en: 'Mark as paid', ar: 'تحديد كمدفوعة' },
  'bills.markPaidLabel': { en: 'Mark {name} as paid', ar: 'تحديد {name} كمدفوعة' },
  'bills.editLabel': { en: 'Edit {name}', ar: 'تعديل {name}' },
  'bills.paid': { en: '{name} paid and logged', ar: 'تم دفع {name} وتسجيلها' },
  'status.overdue': { en: 'Overdue', ar: 'متأخرة' },
  'status.soon': { en: 'Due soon', ar: 'قريبًا' },
  'status.upcoming': { en: 'Upcoming', ar: 'قادمة' },
  'billPanel.new': { en: 'New bill', ar: 'فاتورة جديدة' },
  'billPanel.edit': { en: 'Edit bill', ar: 'تعديل الفاتورة' },
  'billPanel.name': { en: 'Name', ar: 'الاسم' },
  'billPanel.nameHint': { en: 'e.g. Internet', ar: 'مثال: الإنترنت' },
  'billPanel.nextDue': { en: 'Next due date', ar: 'تاريخ الاستحقاق القادم' },
  'billPanel.repeat': { en: 'Repeats', ar: 'التكرار' },
  'repeat.monthly': { en: 'Every month', ar: 'كل شهر' },
  'repeat.yearly': { en: 'Every year', ar: 'كل سنة' },
  'repeat.once': { en: 'Just once', ar: 'مرة واحدة' },
  'error.name': { en: 'Add a name.', ar: 'أضف اسمًا.' },
  'error.date': { en: 'Pick a date.', ar: 'اختر تاريخًا.' },
  'action.edit': { en: 'Edit', ar: 'تعديل' },

  'stats.keyNumbers': { en: 'Key numbers', ar: 'أرقام رئيسية' },
  'stats.daily': { en: 'Daily average', ar: 'المتوسط اليومي' },
  'stats.dailyNote': { en: 'Over {days} days', ar: 'على مدى {days} يوم' },
  'stats.biggest': { en: 'Biggest expense', ar: 'أكبر مصروف' },
  'stats.vsLast': { en: 'Vs last month', ar: 'مقارنة بالشهر الماضي' },
  'stats.less': { en: '{percent}% less than {month}', ar: 'أقل بنسبة {percent}% من {month}' },
  'stats.more': { en: '{percent}% more than {month}', ar: 'أكثر بنسبة {percent}% من {month}' },
  'stats.same': { en: 'Same as {month}', ar: 'مثل {month}' },
  'stats.noCompare': { en: 'No spending in {month} to compare', ar: 'لا توجد مصاريف في {month} للمقارنة' },
  'stats.chart': { en: 'Income vs spent', ar: 'الدخل مقابل المصروف' },
  'stats.chartMonth': { en: '{month}: income {income}, spent {spent}', ar: '{month}: الدخل {income}، المصروف {spent}' },
  'stats.top': { en: 'Top categories', ar: 'أعلى الفئات' },

  'settings.glass': { en: 'Card glass', ar: 'شفافية البطاقات' },

  'bills.calendarLabel': { en: 'Add {name} to calendar', ar: 'إضافة {name} إلى التقويم' },
  'calendar.title': { en: '{name} bill · {amount}', ar: 'فاتورة {name} · {amount}' },
  'calendar.note': { en: 'Added from Expense Tracker.', ar: 'تمت الإضافة من متتبع المصاريف.' },
  'calendar.reminder': { en: '{name} is due tomorrow', ar: 'موعد {name} غدًا' },
  'toast.calendar': { en: 'Calendar file downloaded. Open it to add the reminder.', ar: 'تم تنزيل ملف التقويم. افتحه لإضافة التذكير.' },
};

function t(key, values = {}) {
  const entry = TEXT[key];
  if (!entry) {
    console.warn('Missing text:', key);
    return key;
  }

  let text = entry[state.settings.lang] ?? entry.en;
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}

function applyLanguage() {
  const lang = state.settings.lang;
  const html = document.documentElement;

  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('app.name');

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAria));
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
}

/* ---------- 6. Settings ---------- */
function applyTheme() {
  const isDark = state.settings.theme === 'dark';
  document.documentElement.dataset.theme = state.settings.theme;

  document.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
    button.setAttribute('aria-pressed', String(isDark));
  });
}

function updateSettingButtons() {
  document.querySelectorAll('[data-set-currency]').forEach((button) => {
    const isOn = button.dataset.setCurrency === state.settings.currency;
    button.setAttribute('aria-pressed', String(isOn));
  });

  document.querySelectorAll('[data-set-lang]').forEach((button) => {
    const isOn = button.dataset.setLang === state.settings.lang;
    button.setAttribute('aria-pressed', String(isOn));
  });
}

function setCurrency(currency) {
  state.settings.currency = currency;
  saveSettings();
  updateSettingButtons();
  renderAll();
}

function setLanguage(lang) {
  state.settings.lang = lang;
  saveSettings();
  applyLanguage();
  updateSettingButtons();
  renderAll();
  if ($('entry-panel')?.open) updatePanelType();
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  saveSettings();
  applyTheme();
}

function applyGlass() {
  const glass = state.settings.glass;
  document.documentElement.style.setProperty('--glass', glass / 100);

  const range = $('glass-range');
  if (range) {
    range.value = glass;
    $('glass-value').textContent = `${glass}%`;
  }
}

function setGlass(value) {
  state.settings.glass = Number(value);
  applyGlass();
  saveSettings();
}

/* ---------- 6b. Sample data ---------- */
const SAMPLE_MONTH = [
  { type: 'income', source: 'salary', description: 'Salary', amount: 3000, currency: 'USD', day: 1 },
  { type: 'income', source: 'freelance', description: 'Freelance project', amount: 200, currency: 'USD', day: 12 },
  { type: 'expense', category: 'housing', description: 'Rent', amount: 900, currency: 'USD', day: 1 },
  { type: 'expense', category: 'food', description: 'Groceries', amount: 64, currency: 'USD', day: 4 },
  { type: 'expense', category: 'food', description: 'Coffee', amount: 18, currency: 'SAR', day: 8 },
  { type: 'expense', category: 'food', description: 'Groceries', amount: 71, currency: 'USD', day: 21 },
  { type: 'expense', category: 'bills', description: 'Electricity', amount: 280, currency: 'SAR', day: 6 },
  { type: 'expense', category: 'bills', description: 'Internet', amount: 45, currency: 'USD', day: 25 },
  { type: 'expense', category: 'transport', description: 'Uber', amount: 18.5, currency: 'USD', day: 14 },
  { type: 'expense', category: 'transport', description: 'Metro card', amount: 75, currency: 'SAR', day: 20 },
  { type: 'expense', category: 'fun', description: 'Cinema', amount: 18, currency: 'USD', day: 18 },
];

function createSampleData() {
  const today = todayISO();
  const now = new Date();
  const entries = [];

  for (let monthsBack = 5; monthsBack >= 0; monthsBack--) {
    SAMPLE_MONTH.forEach((item, index) => {
      const date = isoDate(now.getFullYear(), now.getMonth() - monthsBack, item.day);
      if (date > today) return;

      const wiggle = item.type === 'expense' && item.category !== 'housing'
        ? 1 + (((monthsBack * 7 + index * 3) % 9) - 4) / 20
        : 1;

      entries.push({
        id: createId(),
        type: item.type,
        category: item.category ?? null,
        source: item.source ?? null,
        description: item.description,
        amount: Math.round(item.amount * wiggle * 100) / 100,
        currency: item.currency,
        date,
        note: '',
        hasReceipt: false,
      });
    });
  }

  const bills = [
    { id: createId(), name: 'Internet', amount: 45, currency: 'USD', category: 'bills', nextDue: isoDate(now.getFullYear(), now.getMonth(), now.getDate() + 2) },
    { id: createId(), name: 'Phone', amount: 120, currency: 'SAR', category: 'bills', nextDue: isoDate(now.getFullYear(), now.getMonth(), now.getDate() + 5) },
    { id: createId(), name: 'Rent', amount: 900, currency: 'USD', category: 'housing', nextDue: isoDate(now.getFullYear(), now.getMonth() + 1, 1) },
  ];

  return { entries, bills };
}

function loadSample() {
  if (state.entries.length > 0 && !confirm(t('confirm.replace'))) return;

  receipts.clear().catch(() => {});
  const sample = createSampleData();
  state.entries = sample.entries;
  state.bills = sample.bills;
  state.settings.budget = { amount: 2800, currency: 'USD' };

  saveEntries();
  saveBills();
  saveSettings();
  renderAll();
  showToast(t('toast.sampleLoaded'));
}

function clearData() {
  if (!confirm(t('confirm.clear'))) return;

  receipts.clear().catch(() => {});
  state.entries = [];
  state.bills = [];
  state.settings.budget = null;

  saveEntries();
  saveBills();
  saveSettings();
  renderAll();
  showToast(t('toast.cleared'));
}

/* ---------- 6c. Entry panel ---------- */
let editingId = null;
let pendingReceipt;        // undefined = unchanged, null = removed, object = new file
let receiptUrl = null;

function entryForm() {
  return $('entry-form');
}

function currentType() {
  return entryForm().elements.type.value;
}

function openEntryPanel(entry = null) {
  const panel = $('entry-panel');
  const form = entryForm();
  if (!panel) return;

  editingId = entry ? entry.id : null;
  form.reset();
  clearErrors();
  form.elements.date.value = todayISO();
  form.elements.currency.value = state.settings.currency;

  if (entry) {
    form.elements.type.value = entry.type;
    form.elements.amount.value = entry.amount;
    form.elements.currency.value = entry.currency;
    form.elements.description.value = entry.description;
    form.elements.date.value = entry.date;
    form.elements.note.value = entry.note ?? '';
    if (entry.type === 'expense') form.elements.category.value = entry.category;
    else form.elements.source.value = entry.source;
  }

  form.querySelector('.extra').open = Boolean(entry?.note);
  $('receipt-extra').open = Boolean(entry?.hasReceipt);
  $('delete-btn').hidden = !entry;

  pendingReceipt = undefined;
  showReceiptPreview(null);
  if (entry?.hasReceipt) {
    receipts.get(entry.id)
      .then((record) => {
        if (editingId === entry.id && pendingReceipt === undefined) showReceiptPreview(record ?? null);
      })
      .catch((error) => console.warn('Could not load receipt', error));
  }

  updatePanelType();
  panel.showModal();
  form.elements.amount.focus();
}

function editEntry(button) {
  const entry = state.entries.find((item) => item.id === button.dataset.id);
  if (entry) openEntryPanel(entry);
}

function closePanel(button) {
  button.closest('dialog').close();
}

function updatePanelType() {
  const isIncome = currentType() === 'income';
  const categoryGroup = $('category-group');
  const sourceGroup = $('source-group');

  categoryGroup.hidden = isIncome;
  categoryGroup.disabled = isIncome;
  sourceGroup.hidden = !isIncome;
  sourceGroup.disabled = !isIncome;

  const titleKey = editingId
    ? (isIncome ? 'panel.editIncome' : 'panel.editExpense')
    : (isIncome ? 'panel.newIncome' : 'panel.newExpense');
  $('entry-title').textContent = t(titleKey);

  updateAmountHints();
}

function updateAmountHints() {
  const form = entryForm();
  const currency = form.elements.currency.value;
  const display = state.settings.currency;
  const amount = parseAmount(form.elements.amount.value);

  $('amount-symbol').textContent = currency === 'USD' ? '$' : 'SAR';
  $('amount-converted').textContent = amount && currency !== display
    ? `≈ ${formatMoney(convert(amount, currency, display))}`
    : '';

  const hint = $('budget-hint');
  const budget = state.settings.budget;
  const date = form.elements.date.value;
  if (!budget || !amount || !date || currentType() === 'income') {
    hint.hidden = true;
    return;
  }

  const limit = convert(budget.amount, budget.currency, display);
  const spentSoFar = total(
    entriesInMonth(date.slice(0, 7)).filter((entry) => entry.type === 'expense' && entry.id !== editingId)
  );
  const left = limit - spentSoFar - convert(amount, currency, display);

  hint.hidden = false;
  hint.classList.toggle('is-over', left < 0);
  hint.textContent = left >= 0
    ? t('budget.leaves', { amount: formatMoney(left), total: formatMoney(limit) })
    : t('budget.over', { amount: formatMoney(-left), total: formatMoney(limit) });
}

function showReceiptPreview(record) {
  const preview = $('receipt-preview');
  const img = $('receipt-img');
  const link = $('receipt-name');

  if (receiptUrl) URL.revokeObjectURL(receiptUrl);
  receiptUrl = null;

  if (!record) {
    preview.hidden = true;
    img.removeAttribute('src');
    link.removeAttribute('href');
    return;
  }

  receiptUrl = URL.createObjectURL(record.blob);
  const isImage = record.type.startsWith('image/');
  img.hidden = !isImage;
  if (isImage) img.src = receiptUrl;
  link.href = receiptUrl;
  link.textContent = `${record.name} · ${formatSize(record.blob.size)}`;
  preview.hidden = false;
}

async function pickReceipt(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;

  $('receipt-error').hidden = true;
  const blob = await compressImage(file);
  if (blob.size > MAX_RECEIPT_BYTES) {
    $('receipt-error').hidden = false;
    return;
  }

  pendingReceipt = { blob, name: file.name, type: blob.type || file.type };
  showReceiptPreview(pendingReceipt);
}

function removeReceipt() {
  pendingReceipt = null;
  showReceiptPreview(null);
}

async function storeReceipt(id) {
  try {
    if (pendingReceipt) {
      await receipts.put(id, pendingReceipt);
      return true;
    }
    if (pendingReceipt === null) await receipts.remove(id);
    return false;
  } catch (error) {
    console.warn('Could not save receipt', error);
    return null;
  }
}

function clearErrors() {
  const form = entryForm();
  form.querySelectorAll('.field__error').forEach((error) => { error.hidden = true; });
  form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
}

function readForm() {
  const form = entryForm();
  const type = form.elements.type.value;
  return {
    type,
    amount: parseAmount(form.elements.amount.value),
    currency: form.elements.currency.value,
    category: type === 'expense' ? form.elements.category.value || null : null,
    source: type === 'income' ? form.elements.source.value : null,
    description: form.elements.description.value.trim(),
    date: form.elements.date.value || todayISO(),
    note: form.elements.note.value.trim(),
  };
}

function validate(data) {
  clearErrors();
  const form = entryForm();
  const problems = [];

  if (!data.amount) problems.push([form.elements.amount, 'amount-error']);
  if (data.type === 'expense' && !data.category) problems.push([$('category-group'), 'category-error']);
  if (!data.description) problems.push([form.elements.description, 'description-error']);

  problems.forEach(([field, errorId]) => {
    field.setAttribute('aria-invalid', 'true');
    $(errorId).hidden = false;
  });

  if (problems.length > 0) {
    const [firstField] = problems[0];
    (firstField.matches('fieldset') ? firstField.querySelector('input') : firstField).focus();
  }
  return problems.length === 0;
}

async function saveEntry(event) {
  event.preventDefault();
  const data = readForm();
  if (!validate(data)) return;

  const id = editingId ?? createId();
  const existing = state.entries.find((entry) => entry.id === id);
  const stored = pendingReceipt === undefined ? undefined : await storeReceipt(id);
  const receiptFailed = stored === null;
  const hasReceipt = stored === undefined || receiptFailed ? Boolean(existing?.hasReceipt) : stored;

  if (existing) {
    Object.assign(existing, data, { hasReceipt });
  } else {
    state.entries.push({ id, ...data, hasReceipt });
  }

  saveEntries();
  const saved = parseDate(data.date);
  state.period = { month: saved.getMonth(), year: saved.getFullYear() };
  renderAll();

  if (event.submitter?.value === 'again') {
    openEntryPanel();
  } else {
    $('entry-panel').close();
    showToast(t(receiptFailed ? 'toast.receiptFailed' : 'toast.saved'));
  }
}

async function deleteEntry() {
  const index = state.entries.findIndex((entry) => entry.id === editingId);
  if (index === -1) return;

  const [removed] = state.entries.splice(index, 1);
  saveEntries();
  renderAll();
  $('entry-panel').close();

  let receipt = null;
  if (removed.hasReceipt) {
    receipt = await receipts.get(removed.id).catch(() => null);
    await receipts.remove(removed.id).catch(() => {});
  }

  showToast(t('toast.deleted'), () => {
    state.entries.splice(index, 0, removed);
    if (receipt) receipts.put(removed.id, receipt).catch(() => {});
    saveEntries();
    renderAll();
    showToast(t('toast.restored'));
  });
}

/* ---------- 6d. Toast ---------- */
let toastTimer = null;
let toastUndo = null;

function showToast(message, undo = null) {
  const toast = $('toast');
  if (!toast) return;

  $('toast-msg').textContent = message;
  $('toast-undo').hidden = !undo;
  toastUndo = undo;
  toast.classList.add('is-visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 6000 : 3000);
}

function hideToast() {
  $('toast')?.classList.remove('is-visible');
  toastUndo = null;
}

function undoLast() {
  const undo = toastUndo;
  hideToast();
  if (undo) undo();
}

/* ---------- 6e. Budget ---------- */
function openBudgetPanel() {
  const panel = $('budget-panel');
  const form = $('budget-form');
  if (!panel) return;

  form.reset();
  $('budget-error').hidden = true;
  form.elements.amount.removeAttribute('aria-invalid');

  const budget = state.settings.budget;
  if (budget) {
    form.elements.amount.value = budget.amount;
    form.elements.currency.value = budget.currency;
  } else {
    form.elements.currency.value = state.settings.currency;
  }

  $('remove-budget-btn').hidden = !budget;
  panel.showModal();
  form.elements.amount.focus();
}

function saveBudget(event) {
  event.preventDefault();
  const form = event.target;
  const amountField = form.elements.amount;
  const amount = parseAmount(amountField.value);

  if (!amount) {
    $('budget-error').hidden = false;
    amountField.setAttribute('aria-invalid', 'true');
    amountField.focus();
    return;
  }

  state.settings.budget = { amount, currency: form.elements.currency.value };
  saveSettings();
  renderAll();
  $('budget-panel').close();
  showToast(t('toast.budgetSaved'));
}

function removeBudget() {
  const previous = state.settings.budget;
  state.settings.budget = null;
  saveSettings();
  renderAll();
  $('budget-panel').close();

  showToast(t('toast.budgetRemoved'), () => {
    state.settings.budget = previous;
    saveSettings();
    renderAll();
  });
}

/* ---------- 6f. Bills ---------- */
let editingBillId = null;

function billForm() {
  return $('bill-form');
}

function billStatus(bill) {
  const days = daysUntil(bill.nextDue);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'soon';
  return 'upcoming';
}

function nextDueDate(bill) {
  const current = parseDate(bill.nextDue);
  const day = bill.dueDay ?? current.getDate();
  const monthsToAdd = bill.repeat === 'yearly' ? 12 : 1;
  const year = current.getFullYear();
  const month = current.getMonth() + monthsToAdd;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return isoDate(year, month, Math.min(day, lastDay));
}

function openBillPanel(bill = null) {
  const panel = $('bill-panel');
  const form = billForm();
  if (!panel) return;

  editingBillId = bill ? bill.id : null;
  form.reset();
  clearBillErrors();
  form.elements.currency.value = state.settings.currency;
  form.elements.nextDue.value = todayISO();

  if (bill) {
    form.elements.name.value = bill.name;
    form.elements.amount.value = bill.amount;
    form.elements.currency.value = bill.currency;
    form.elements.category.value = bill.category;
    form.elements.nextDue.value = bill.nextDue;
    form.elements.repeat.value = bill.repeat ?? 'monthly';
  }

  $('bill-title').textContent = t(bill ? 'billPanel.edit' : 'billPanel.new');
  $('delete-bill-btn').hidden = !bill;
  panel.showModal();
  form.elements.name.focus();
}

function editBill(button) {
  const bill = state.bills.find((item) => item.id === button.dataset.id);
  if (bill) openBillPanel(bill);
}

function clearBillErrors() {
  const form = billForm();
  form.querySelectorAll('.field__error').forEach((error) => { error.hidden = true; });
  form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
}

function saveBill(event) {
  event.preventDefault();
  const form = billForm();
  clearBillErrors();

  const data = {
    name: form.elements.name.value.trim(),
    amount: parseAmount(form.elements.amount.value),
    currency: form.elements.currency.value,
    category: form.elements.category.value,
    nextDue: form.elements.nextDue.value,
    repeat: form.elements.repeat.value,
  };

  const problems = [];
  if (!data.name) problems.push([form.elements.name, 'bill-name-error']);
  if (!data.amount) problems.push([form.elements.amount, 'bill-amount-error']);
  if (!data.nextDue) problems.push([form.elements.nextDue, 'bill-due-error']);

  problems.forEach(([field, errorId]) => {
    field.setAttribute('aria-invalid', 'true');
    $(errorId).hidden = false;
  });
  if (problems.length > 0) {
    problems[0][0].focus();
    return;
  }

  data.dueDay = parseDate(data.nextDue).getDate();
  const existing = state.bills.find((bill) => bill.id === editingBillId);
  if (existing) {
    Object.assign(existing, data);
  } else {
    state.bills.push({ id: createId(), ...data });
  }

  saveBills();
  renderAll();
  $('bill-panel').close();
  showToast(t('toast.saved'));
}

function deleteBill() {
  const index = state.bills.findIndex((bill) => bill.id === editingBillId);
  if (index === -1) return;

  const [removed] = state.bills.splice(index, 1);
  saveBills();
  renderAll();
  $('bill-panel').close();

  showToast(t('toast.deleted'), () => {
    state.bills.splice(index, 0, removed);
    saveBills();
    renderAll();
    showToast(t('toast.restored'));
  });
}

function payBill(button) {
  const index = state.bills.findIndex((bill) => bill.id === button.dataset.id);
  if (index === -1) return;

  const bill = state.bills[index];
  const before = { ...bill };
  const entry = {
    id: createId(),
    type: 'expense',
    category: bill.category,
    source: null,
    description: bill.name,
    amount: bill.amount,
    currency: bill.currency,
    date: todayISO(),
    note: '',
    hasReceipt: false,
  };

  state.entries.push(entry);
  if (bill.repeat === 'once') {
    state.bills.splice(index, 1);
  } else {
    bill.nextDue = nextDueDate(bill);
  }

  saveEntries();
  saveBills();
  renderAll();

  showToast(t('bills.paid', { name: bill.name }), () => {
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    if (bill.repeat === 'once') state.bills.splice(index, 0, before);
    else Object.assign(bill, before);
    saveEntries();
    saveBills();
    renderAll();
  });
}

/* ---------- 6g. Calendar (.ics) ---------- */
function icsDate(iso) {
  return iso.replaceAll('-', '');
}

function icsText(text) {
  return String(text)
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsRepeatRule(bill) {
  if (bill.repeat === 'once') return null;
  if (bill.repeat === 'yearly') return 'RRULE:FREQ=YEARLY';

  const day = bill.dueDay ?? parseDate(bill.nextDue).getDate();
  if (day <= 28) return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`;

  const days = [];
  for (let d = 28; d <= day; d++) days.push(d);
  return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${days.join(',')};BYSETPOS=-1`;
}

function downloadBillCalendar(button) {
  const bill = state.bills.find((item) => item.id === button.dataset.id);
  if (!bill) return;

  const start = parseDate(bill.nextDue);
  const end = isoDate(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const amount = formatMoney(bill.amount, bill.currency);
  const rule = icsRepeatRule(bill);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Expense Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${bill.id}@expense-tracker`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(bill.nextDue)}`,
    `DTEND;VALUE=DATE:${icsDate(end)}`,
    `SUMMARY:${icsText(t('calendar.title', { name: bill.name, amount }))}`,
    `DESCRIPTION:${icsText(t('calendar.note'))}`,
    rule,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(t('calendar.reminder', { name: bill.name }))}`,
    'TRIGGER:-PT15H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${bill.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'bill'}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast(t('toast.calendar'));
}

/* ---------- 7. Rendering ---------- */
function renderPeriod() {
  const monthSelect = $('month-select');
  const yearSelect = $('year-select');
  if (!monthSelect || !yearSelect) return;

  monthSelect.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    monthSelect.add(new Option(monthName(i), i));
  }

  const years = new Set([state.period.year, new Date().getFullYear()]);
  state.entries.forEach((entry) => years.add(Number(entry.date.slice(0, 4))));

  yearSelect.innerHTML = '';
  [...years].sort((a, b) => b - a).forEach((year) => {
    yearSelect.add(new Option(year, year));
  });

  monthSelect.value = state.period.month;
  yearSelect.value = state.period.year;
}

function entriesInMonth(prefix) {
  return state.entries.filter((entry) => entry.date.startsWith(prefix));
}

function entriesInPeriod() {
  const prefix = `${state.period.year}-${String(state.period.month + 1).padStart(2, '0')}`;
  return entriesInMonth(prefix);
}

function inDisplayCurrency(entry) {
  return convert(entry.amount, entry.currency, state.settings.currency);
}

function billInDisplayCurrency(bill) {
  return convert(bill.amount, bill.currency, state.settings.currency);
}

function total(entries) {
  return entries.reduce((sum, entry) => sum + inDisplayCurrency(entry), 0);
}

function renderSummary() {
  if (!$('income-total')) return;

  const entries = entriesInPeriod();
  const income = total(entries.filter((entry) => entry.type === 'income'));
  const spent = total(entries.filter((entry) => entry.type === 'expense'));

  $('income-total').textContent = formatMoney(income);
  $('spent-total').textContent = formatMoney(spent);
  $('balance-total').textContent = formatMoney(income - spent);

  renderBudget(spent);
}

function renderBudget(spent) {
  const bar = $('budget-bar');
  const fill = $('budget-fill');
  const text = $('budget-text');
  const budget = state.settings.budget;

  if (!budget) {
    text.textContent = t('budget.none');
    fill.style.width = '0%';
    bar.setAttribute('aria-valuenow', '0');
    bar.classList.remove('is-over');
    return;
  }

  const limit = convert(budget.amount, budget.currency, state.settings.currency);
  const percent = Math.round((spent / limit) * 100);

  fill.style.width = `${Math.min(percent, 100)}%`;
  bar.setAttribute('aria-valuenow', String(Math.min(percent, 100)));
  bar.classList.toggle('is-over', percent > 100);
  text.textContent = t('budget.used', { percent, total: formatMoney(limit) });
}

function categoryTotals(entries) {
  const expenses = entries.filter((entry) => entry.type === 'expense');
  return CATEGORIES
    .map((category) => ({ category, amount: total(expenses.filter((entry) => entry.category === category)) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

const DONUT_RADIUS = 54;
const DONUT_LENGTH = 2 * Math.PI * DONUT_RADIUS;

function renderDonut() {
  const group = $('donut-segments');
  if (!group) return;

  const slices = categoryTotals(entriesInPeriod());
  const sum = slices.reduce((s, slice) => s + slice.amount, 0);

  const legend = $('donut-legend');
  const template = $('legend-item-template');
  group.replaceChildren();
  legend.replaceChildren();
  group.closest('.donut-wrap').hidden = sum === 0;
  $('donut-empty').hidden = sum > 0;

  let offset = 0;
  const summary = [];

  slices.forEach(({ category, amount }) => {
    const length = (amount / sum) * DONUT_LENGTH;

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    arc.setAttribute('class', 'donut__seg');
    arc.setAttribute('cx', '70');
    arc.setAttribute('cy', '70');
    arc.setAttribute('r', String(DONUT_RADIUS));
    arc.setAttribute('stroke-dasharray', `${length} ${DONUT_LENGTH - length}`);
    arc.setAttribute('stroke-dashoffset', String(-offset));
    arc.style.stroke = `var(--cat-${category})`;
    group.append(arc);
    offset += length;

    const item = template.content.firstElementChild.cloneNode(true);
    item.querySelector('.dot').classList.add(`dot--${category}`);
    item.querySelector('.legend__name').textContent = t(`cat.${category}`);
    item.querySelector('.legend__amount').textContent = formatMoney(amount);
    legend.append(item);

    summary.push(`${t(`cat.${category}`)} ${Math.round((amount / sum) * 100)}%`);
  });

  $('donut-summary').textContent = summary.join(t('meta.separator'));
}

function dueLabel(iso) {
  const days = daysUntil(iso);
  const relative = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(days, 'day');
  const text = relative.charAt(0).toUpperCase() + relative.slice(1);
  return days < 0 ? `${t('due.overdue')} · ${text}` : text;
}

function createBillRow(bill) {
  const row = $('bill-row-template').content.firstElementChild.cloneNode(true);
  const days = daysUntil(bill.nextDue);
  const due = row.querySelector('.row__due');

  row.querySelector('.row__title').textContent = bill.name;
  row.querySelector('.row__amount').textContent = formatMoney(billInDisplayCurrency(bill));
  due.textContent = dueLabel(bill.nextDue);
  due.classList.toggle('row__due--overdue', days < 0);
  due.classList.toggle('row__due--soon', days >= 0 && days <= 7);
  return row;
}

function renderUpcomingBills() {
  const list = $('upcoming-bills');
  if (!list) return;

  const upcoming = state.bills
    .filter((bill) => daysUntil(bill.nextDue) <= 30)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 4);

  list.replaceChildren(...upcoming.map(createBillRow));
  $('bills-empty').hidden = upcoming.length > 0;
}

function createEntryRow(entry) {
  const row = $('tx-row-template').content.firstElementChild.cloneNode(true);
  const isIncome = entry.type === 'income';
  const amount = row.querySelector('.row__amount');

  row.querySelector('.row__btn').dataset.id = entry.id;
  row.querySelector('.dot').classList.add(`dot--${dotColor(entry)}`);
  row.querySelector('.row__title').textContent = entry.description;
  row.querySelector('.row__meta').textContent = t(labelKey(entry)) + t('meta.separator') + formatDate(entry.date);
  row.querySelector('.row__receipt').hidden = !entry.hasReceipt;

  amount.textContent = (isIncome ? '+' : '−') + formatMoney(inDisplayCurrency(entry));
  amount.classList.toggle('is-income', isIncome);

  return row;
}

function renderLatest() {
  const list = $('latest-list');
  if (!list) return;

  const latest = newestFirst(entriesInPeriod()).slice(0, 5);
  list.replaceChildren(...latest.map(createEntryRow));
  $('latest-empty').hidden = latest.length > 0;
}

function filteredTransactions() {
  const { query, type, category } = state.filters;
  const search = query.trim().toLowerCase();

  return newestFirst(entriesInPeriod()).filter((entry) => {
    if (type !== 'all' && entry.type !== type) return false;
    if (category !== 'all' && entry.category !== category) return false;
    if (!search) return true;

    const text = `${entry.description} ${entry.note ?? ''} ${t(labelKey(entry))}`;
    return text.toLowerCase().includes(search);
  });
}

function renderTransactions() {
  const list = $('tx-list');
  if (!list) return;

  const results = filteredTransactions();
  list.replaceChildren(...results.map(createEntryRow));
  $('tx-empty').hidden = results.length > 0;
  $('tx-count').textContent = results.length === 1
    ? t('tx.countOne')
    : t('tx.count', { count: results.length });

  document.querySelectorAll('[data-filter-type]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.filterType === state.filters.type));
  });

  const select = $('tx-category');
  select.value = state.filters.category;
  select.disabled = state.filters.type === 'income';
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const header = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Currency', 'Note', 'Receipt'];
  const rows = filteredTransactions().map((entry) => [
    entry.date,
    entry.type,
    entry.category ?? entry.source,
    entry.description,
    entry.amount.toFixed(2),
    entry.currency,
    entry.note,
    entry.hasReceipt ? 'yes' : 'no',
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `expenses-${todayISO()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createBillItem(bill) {
  const row = $('bill-item-template').content.firstElementChild.cloneNode(true);
  const status = billStatus(bill);
  const due = row.querySelector('.row__due');
  const badge = row.querySelector('.status');
  const payButton = row.querySelector('[data-action="pay-bill"]');
  const editButton = row.querySelector('[data-action="edit-bill"]');

  row.querySelector('.row__title').textContent = bill.name;
  row.querySelector('.row__amount').textContent = formatMoney(billInDisplayCurrency(bill));

  due.textContent = dueLabel(bill.nextDue);
  due.classList.toggle('row__due--overdue', status === 'overdue');
  due.classList.toggle('row__due--soon', status === 'soon');

  badge.textContent = t(`status.${status}`);
  if (status !== 'upcoming') badge.classList.add(`status--${status}`);

  payButton.dataset.id = bill.id;
  payButton.textContent = t('bills.markPaid');
  payButton.setAttribute('aria-label', t('bills.markPaidLabel', { name: bill.name }));

  editButton.dataset.id = bill.id;
  editButton.textContent = t('action.edit');
  editButton.setAttribute('aria-label', t('bills.editLabel', { name: bill.name }));

  const calendarButton = row.querySelector('[data-action="calendar-bill"]');
  if (calendarButton) {
    calendarButton.dataset.id = bill.id;
    calendarButton.setAttribute('aria-label', t('bills.calendarLabel', { name: bill.name }));
    calendarButton.title = t('bills.calendarLabel', { name: bill.name });
  }

  return row;
}

function renderBillsPage() {
  const list = $('bill-list');
  if (!list) return;

  const sorted = [...state.bills].sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  list.replaceChildren(...sorted.map(createBillItem));
  $('bill-empty').hidden = sorted.length > 0;

  const dueSoon = sorted.filter((bill) => daysUntil(bill.nextDue) <= 30);
  const sum = dueSoon.reduce((s, bill) => s + billInDisplayCurrency(bill), 0);
  $('bills-total').textContent = formatMoney(sum);
  $('bills-count').textContent = dueSoon.length === 1
    ? t('bills.countOne')
    : t('bills.count', { count: dueSoon.length });
}

function renderBillAlerts() {
  const overdue = state.bills.filter((bill) => billStatus(bill) === 'overdue').length;
  const dueSoon = state.bills.filter((bill) => billStatus(bill) !== 'upcoming').length;

  const badge = $('bills-badge');
  if (badge) {
    badge.textContent = dueSoon;
    badge.hidden = dueSoon === 0;
  }

  const banner = $('overdue-banner');
  if (banner) {
    banner.hidden = overdue === 0;
    $('overdue-text').textContent = overdue === 1
      ? t('bills.overdueOne')
      : t('bills.overdueMany', { count: overdue });
  }
}

function monthPrefix(year, monthIndex) {
  return isoDate(year, monthIndex, 1).slice(0, 7);
}

function renderStatTiles() {
  if (!$('stat-daily')) return;

  const { year, month } = state.period;
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const expenses = entriesInPeriod().filter((entry) => entry.type === 'expense');
  const spent = total(expenses);

  const days = isCurrentMonth ? today.getDate() : new Date(year, month + 1, 0).getDate();
  $('stat-daily').textContent = formatMoney(spent / days);
  $('stat-daily-note').textContent = t('stats.dailyNote', { days });

  const biggest = expenses.reduce(
    (max, entry) => (!max || inDisplayCurrency(entry) > inDisplayCurrency(max) ? entry : max),
    null
  );
  $('stat-biggest').textContent = biggest ? formatMoney(inDisplayCurrency(biggest)) : '–';
  $('stat-biggest-note').textContent = biggest ? `${biggest.description} · ${formatDate(biggest.date)}` : '';

  const lastMonth = new Date(year, month - 1, 1);
  const lastName = monthName(lastMonth.getMonth());
  const lastSpent = total(
    entriesInMonth(monthPrefix(year, month - 1)).filter((entry) =>
      entry.type === 'expense' && (!isCurrentMonth || parseDate(entry.date).getDate() <= today.getDate())
    )
  );

  const compare = $('stat-compare');
  const note = $('stat-compare-note');
  compare.classList.remove('is-good', 'is-bad');

  if (lastSpent === 0) {
    compare.textContent = '–';
    note.textContent = t('stats.noCompare', { month: lastName });
    return;
  }

  const change = Math.round(((spent - lastSpent) / lastSpent) * 100);
  if (change === 0) {
    compare.textContent = '0%';
    note.textContent = t('stats.same', { month: lastName });
  } else if (change < 0) {
    compare.textContent = `↓ ${-change}%`;
    compare.classList.add('is-good');
    note.textContent = t('stats.less', { percent: -change, month: lastName });
  } else {
    compare.textContent = `↑ ${change}%`;
    compare.classList.add('is-bad');
    note.textContent = t('stats.more', { percent: change, month: lastName });
  }
}

function renderBars() {
  const box = $('bars');
  if (!box) return;

  const { year, month } = state.period;
  const months = [];
  for (let back = 5; back >= 0; back--) {
    const date = new Date(year, month - back, 1);
    const entries = entriesInMonth(monthPrefix(date.getFullYear(), date.getMonth()));
    months.push({
      label: monthName(date.getMonth()),
      income: total(entries.filter((entry) => entry.type === 'income')),
      spent: total(entries.filter((entry) => entry.type === 'expense')),
      isCurrent: back === 0,
    });
  }

  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.spent)));
  const template = $('bar-month-template');
  const groups = months.map((m) => {
    const group = template.content.firstElementChild.cloneNode(true);
    group.classList.toggle('is-current', m.isCurrent);
    group.querySelector('.bars__label').textContent = m.label;
    return group;
  });
  box.replaceChildren(...groups);

  void box.offsetHeight;
  groups.forEach((group, i) => {
    group.querySelector('.bars__bar--income').style.height = `${(months[i].income / max) * 100}%`;
    group.querySelector('.bars__bar--spent').style.height = `${(months[i].spent / max) * 100}%`;
  });

  $('bars-summary').textContent = months
    .map((m) => t('stats.chartMonth', { month: m.label, income: formatMoney(m.income), spent: formatMoney(m.spent) }))
    .join('; ');
}

function renderTopCategories() {
  const list = $('top-categories');
  if (!list) return;

  const items = categoryTotals(entriesInPeriod()).slice(0, 4);
  const max = items[0]?.amount ?? 0;
  const template = $('top-cat-template');

  const rows = items.map(({ category, amount }) => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('.top-cat__name').textContent = t(`cat.${category}`);
    row.querySelector('.top-cat__amount').textContent = formatMoney(amount);
    row.querySelector('.top-cat__fill').style.background = `var(--cat-${category})`;
    return row;
  });
  list.replaceChildren(...rows);
  $('top-empty').hidden = items.length > 0;

  void list.offsetHeight;
  rows.forEach((row, i) => {
    row.querySelector('.top-cat__fill').style.width = `${(items[i].amount / max) * 100}%`;
  });
}

function renderAll() {
  renderPeriod();
  renderSummary();
  renderDonut();
  renderUpcomingBills();
  renderLatest();
  renderTransactions();
  renderBillsPage();
  renderBillAlerts();
  renderStatTiles();
  renderBars();
  renderTopCategories();
}

/* ---------- 8. Events ---------- */
const actions = {
  'toggle-theme': toggleTheme,
  'load-sample': loadSample,
  'clear-data': clearData,
  'open-add': () => openEntryPanel(),
  'edit-entry': editEntry,
  'close-panel': closePanel,
  'delete-entry': deleteEntry,
  'remove-receipt': removeReceipt,
  'edit-budget': openBudgetPanel,
  'remove-budget': removeBudget,
  'export-csv': exportCsv,
  'open-bill': () => openBillPanel(),
  'edit-bill': editBill,
  'delete-bill': deleteBill,
  'pay-bill': payBill,
  'calendar-bill': downloadBillCalendar,
};

document.addEventListener('click', (event) => {
  if (event.target instanceof HTMLDialogElement) {
    event.target.close();
    return;
  }

  if (event.target.closest('#toast-undo')) {
    undoLast();
    return;
  }

  const filterButton = event.target.closest('[data-filter-type]');
  if (filterButton) {
    state.filters.type = filterButton.dataset.filterType;
    if (state.filters.type === 'income') state.filters.category = 'all';
    renderTransactions();
    return;
  }

  const currencyButton = event.target.closest('[data-set-currency]');
  if (currencyButton) {
    setCurrency(currencyButton.dataset.setCurrency);
    return;
  }

  const langButton = event.target.closest('[data-set-lang]');
  if (langButton) {
    setLanguage(langButton.dataset.setLang);
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;

  const handler = actions[actionButton.dataset.action];
  if (handler) handler(actionButton, event);
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'month-select') state.period.month = Number(event.target.value);
  if (event.target.id === 'year-select') state.period.year = Number(event.target.value);
  if (event.target.matches('#month-select, #year-select')) renderAll();
  if (event.target.form?.id === 'entry-form' && event.target.name === 'type') updatePanelType();
  if (event.target.form?.id === 'entry-form' && event.target.name === 'currency') updateAmountHints();
  if (event.target.id === 'receipt') pickReceipt(event.target);
  if (event.target.id === 'tx-category') {
    state.filters.category = event.target.value;
    renderTransactions();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'glass-range') {
    setGlass(event.target.value);
    return;
  }

  if (event.target.id === 'tx-search') {
    state.filters.query = event.target.value;
    renderTransactions();
    return;
  }

  if (event.target.form?.id !== 'entry-form') return;
  if (event.target.name === 'amount' || event.target.name === 'date') updateAmountHints();
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'entry-form') saveEntry(event);
  if (event.target.id === 'budget-form') saveBudget(event);
  if (event.target.id === 'bill-form') saveBill(event);
});

document.addEventListener('keydown', (event) => {
  const typing = event.target.matches('input, textarea, select');
  const dialogOpen = document.querySelector('dialog[open]');
  if (event.key?.toLowerCase() === 'n' && !typing && !dialogOpen && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    openEntryPanel();
  }
});

/* ---------- 9. Start ---------- */
function init() {
  applyTheme();
  applyGlass();
  applyLanguage();
  updateSettingButtons();
  renderAll();
}

init();