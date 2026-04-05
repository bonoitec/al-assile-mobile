// i18n - Lightweight translation system for Al Assile Mobile
// Supports: English (en), Arabic (ar)

const translations = {
  en: {
    // Login
    welcomeBack: 'Welcome back',
    signInToContinue: 'Sign in to continue',
    username: 'Username',
    password: 'Password',
    enterUsername: 'Enter username',
    enterPassword: 'Enter password',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    loginError: 'Please enter your username and password',
    invalidCredentials: 'Invalid credentials',
    networkError: 'Network error. Check your connection.',
    mobileSales: 'Mobile Sales',

    // Products
    allProducts: 'All Products',
    favorites: 'Favorites',
    searchProducts: 'Search products...',
    loadingProducts: 'Loading products...',
    noProductsFound: 'No products found',
    noResultsFor: 'No results for',
    noProductsInCategory: 'No products in this category',
    tryAgain: 'Try Again',
    salesperson: 'Salesperson',
    outOfStock: 'Out of Stock',
    low: 'Low',
    inStock: 'in stock',

    // Cart
    cart: 'Cart',
    cartEmpty: 'Cart is empty',
    addProductsToStart: 'Add products to start a sale',
    browseProducts: 'Browse Products',
    clear: 'Clear',
    each: 'each',
    client: 'Client',
    walkinCustomer: 'Walk-in Customer',
    clientOwes: 'Client owes',
    existingBalance: 'Existing balance before this sale',
    discount: 'Discount',
    items: 'items',
    total: 'Total',
    subtotal: 'Subtotal',
    checkout: 'Checkout',
    processing: 'Processing...',

    // Payment
    payment: 'Payment',
    totalDue: 'Total Due',
    cash: 'Cash',
    credit: 'Credit',
    amountPaid: 'Amount Paid',
    exact: 'Exact',
    change: 'Change',
    remaining: 'Remaining',
    completeSale: 'Complete Sale',
    notesOptional: 'Notes (optional)',
    clientRequired: 'Client required',
    clientRequiredDesc: 'You must select a client for partial payments or credit sales. Go back and select a client first.',
    remainingDebt: 'Remaining debt',
    willBeAddedToBalance: 'will be added to client balance',
    fullCreditNotice: 'Full amount will be recorded as credit',
    addedToBalance: 'added to client balance',

    // Sale Complete
    saleComplete: 'Sale Complete!',
    soldTo: 'Sold to',
    walkinSaleRecorded: 'Walk-in sale recorded',
    newSale: 'New Sale',
    viewTodaysSales: "View Today's Sales",

    // Sales
    todaysSales: "Today's Sales",
    sales: 'Sales',
    searchSales: 'Search by ID or client name...',
    resultsFor: 'results for',
    noSalesToday: 'No sales today',
    noSalesOnDate: 'No sales on this date',
    salesAppearHere: 'Sales you complete will appear here',
    tryDifferentDate: 'Try selecting a different date',
    noResults: 'No results',
    noSalesMatch: 'No sales match',
    walkin: 'Walk-in',
    paid: 'Paid',
    pending: 'Pending',
    due: 'Due',
    netSales: 'Net Sales',
    collected: 'Collected',
    outstanding: 'Outstanding',
    itemsSold: 'Items Sold',
    returnItems: 'Return',
    loadingSales: 'Loading sales...',
    today: 'Today',

    // Return
    returnSale: 'Return Items',
    returnFrom: 'Return from Sale',
    date: 'Date',
    selectItemsToReturn: 'Select items to return',
    returnReason: 'Return reason (optional)',
    processReturn: 'Process Return',
    returning: 'Returning...',
    returnTotal: 'Return Total',

    // Barcode
    scanBarcode: 'Scan a product barcode',
    scanning: 'Scanning...',
    pointCamera: 'Point your camera at a barcode',
    added: 'Added',
    noProductForBarcode: 'No product found for barcode',

    // Receipt
    printReceipt: 'Print Receipt',
    shareReceipt: 'Share Receipt',
    searchingPrinter: 'Searching for printer...',
    sendingReceipt: 'Sending receipt...',
    receiptPrinted: 'Receipt printed',
    printFailed: 'Print failed',
    printed: 'Printed',
    connecting: 'Connecting...',
    printing: 'Printing...',
    receiptCopied: 'Receipt copied to clipboard',
    couldNotCopy: 'Could not copy receipt',
    shareInstead: 'Share instead',

    // Client Selector
    selectClient: 'Select Client',
    searchClients: 'Search clients...',
    noClientsFound: 'No clients found',
    noClientsMatch: 'No clients match your search',
    noClient: 'No Client (Walk-in)',
    owes: 'Owes',
    creditBalance: 'Credit',
    addNewClient: 'Add New Client',
    clientName: 'Client name',
    clientPhone: 'Phone number',
    creating: 'Creating...',
    create: 'Create',

    // Navigation
    products: 'Products',

    // User menu
    logOut: 'Log Out',
    logOutConfirm: 'Are you sure you want to log out?',
    cancel: 'Cancel',

    // Misc
    noItemDetails: 'No item details',
    noClientRecord: 'No client record',
    noItemDetailsAvailable: 'No item details available',
    selectAtLeastOne: 'Select at least one item to return',
    alAssile: 'Al Assile',

    // Copyright
    copyright: 'Al Assile Mobile Sales',
  },

  ar: {
    // Login
    welcomeBack: 'مرحباً بعودتك',
    signInToContinue: 'سجل الدخول للمتابعة',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    enterUsername: 'أدخل اسم المستخدم',
    enterPassword: 'أدخل كلمة المرور',
    signIn: 'تسجيل الدخول',
    signingIn: 'جاري الدخول...',
    loginError: 'يرجى إدخال اسم المستخدم وكلمة المرور',
    invalidCredentials: 'بيانات الدخول غير صحيحة',
    networkError: 'خطأ في الشبكة. تحقق من الاتصال.',
    mobileSales: 'المبيعات المتنقلة',

    // Products
    allProducts: 'جميع المنتجات',
    favorites: 'المفضلة',
    searchProducts: 'بحث عن منتج...',
    loadingProducts: 'جاري تحميل المنتجات...',
    noProductsFound: 'لا توجد منتجات',
    noResultsFor: 'لا نتائج لـ',
    noProductsInCategory: 'لا توجد منتجات في هذه الفئة',
    tryAgain: 'حاول مرة أخرى',
    salesperson: 'بائع',
    outOfStock: 'نفذ المخزون',
    low: 'منخفض',
    inStock: 'متوفر',

    // Cart
    cart: 'السلة',
    cartEmpty: 'السلة فارغة',
    addProductsToStart: 'أضف منتجات لبدء عملية بيع',
    browseProducts: 'تصفح المنتجات',
    clear: 'مسح',
    each: 'للوحدة',
    client: 'العميل',
    walkinCustomer: 'زبون عابر',
    clientOwes: 'العميل مدين بـ',
    existingBalance: 'الرصيد الحالي قبل هذه العملية',
    discount: 'خصم',
    items: 'عناصر',
    total: 'المجموع',
    subtotal: 'المجموع الفرعي',
    checkout: 'إتمام الدفع',
    processing: 'جاري المعالجة...',

    // Payment
    payment: 'الدفع',
    totalDue: 'المبلغ المستحق',
    cash: 'نقداً',
    credit: 'آجل',
    amountPaid: 'المبلغ المدفوع',
    exact: 'المبلغ بالضبط',
    change: 'الباقي',
    remaining: 'المتبقي',
    completeSale: 'إتمام البيع',
    notesOptional: 'ملاحظات (اختياري)',
    clientRequired: 'يجب تحديد عميل',
    clientRequiredDesc: 'يجب اختيار عميل للدفع الجزئي أو البيع بالآجل. عد واختر عميلاً أولاً.',
    remainingDebt: 'الدين المتبقي',
    willBeAddedToBalance: 'سيضاف إلى رصيد العميل',
    fullCreditNotice: 'سيتم تسجيل كامل المبلغ كدين',
    addedToBalance: 'يضاف إلى رصيد العميل',

    // Sale Complete
    saleComplete: 'تمت عملية البيع!',
    soldTo: 'بيع إلى',
    walkinSaleRecorded: 'تم تسجيل بيع مباشر',
    newSale: 'بيع جديد',
    viewTodaysSales: 'عرض مبيعات اليوم',

    // Sales
    todaysSales: 'مبيعات اليوم',
    sales: 'المبيعات',
    searchSales: 'بحث برقم العملية أو اسم العميل...',
    resultsFor: 'نتائج لـ',
    noSalesToday: 'لا مبيعات اليوم',
    noSalesOnDate: 'لا مبيعات في هذا التاريخ',
    salesAppearHere: 'ستظهر المبيعات هنا عند إتمامها',
    tryDifferentDate: 'جرب اختيار تاريخ آخر',
    noResults: 'لا نتائج',
    noSalesMatch: 'لا توجد مبيعات مطابقة',
    walkin: 'زبون عابر',
    paid: 'مدفوع',
    pending: 'معلق',
    due: 'مستحق',
    netSales: 'صافي المبيعات',
    collected: 'المحصل',
    outstanding: 'المستحق',
    itemsSold: 'العناصر المباعة',
    returnItems: 'إرجاع',
    loadingSales: 'جاري تحميل المبيعات...',
    today: 'اليوم',

    // Return
    returnSale: 'إرجاع المنتجات',
    returnFrom: 'إرجاع من عملية البيع',
    date: 'التاريخ',
    selectItemsToReturn: 'اختر المنتجات للإرجاع',
    returnReason: 'سبب الإرجاع (اختياري)',
    processReturn: 'تنفيذ الإرجاع',
    returning: 'جاري الإرجاع...',
    returnTotal: 'مجموع الإرجاع',

    // Barcode
    scanBarcode: 'امسح باركود المنتج',
    scanning: 'جاري المسح...',
    pointCamera: 'وجّه الكاميرا نحو الباركود',
    added: 'تمت الإضافة',
    noProductForBarcode: 'لا يوجد منتج لهذا الباركود',

    // Receipt
    printReceipt: 'طباعة الإيصال',
    shareReceipt: 'مشاركة الإيصال',
    searchingPrinter: 'جاري البحث عن الطابعة...',
    sendingReceipt: 'جاري إرسال الإيصال...',
    receiptPrinted: 'تمت طباعة الإيصال',
    printFailed: 'فشلت الطباعة',
    printed: 'تمت الطباعة',
    connecting: 'جاري الاتصال...',
    printing: 'جاري الطباعة...',
    receiptCopied: 'تم نسخ الإيصال',
    couldNotCopy: 'تعذر نسخ الإيصال',
    shareInstead: 'مشاركة بدلاً عن ذلك',

    // Client Selector
    selectClient: 'اختر العميل',
    searchClients: 'بحث عن عميل...',
    noClientsFound: 'لا يوجد عملاء',
    noClientsMatch: 'لا يوجد عملاء مطابقين',
    noClient: 'بدون عميل (زبون عابر)',
    owes: 'مدين بـ',
    creditBalance: 'رصيد دائن',
    addNewClient: 'إضافة عميل جديد',
    clientName: 'اسم العميل',
    clientPhone: 'رقم الهاتف',
    creating: 'جاري الإنشاء...',
    create: 'إنشاء',

    // Navigation
    products: 'المنتجات',

    // User menu
    logOut: 'تسجيل الخروج',
    logOutConfirm: 'هل أنت متأكد من تسجيل الخروج؟',
    cancel: 'إلغاء',

    // Misc
    noItemDetails: 'لا توجد تفاصيل',
    noClientRecord: 'لا يوجد سجل عميل',
    noItemDetailsAvailable: 'لا توجد تفاصيل للعناصر',
    selectAtLeastOne: 'اختر عنصراً واحداً على الأقل للإرجاع',
    alAssile: 'الأصيل',

    // Copyright
    copyright: 'الأصيل - المبيعات المتنقلة',
  }
};

let currentLang = localStorage.getItem('mobile_lang') || 'en';

export function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('mobile_lang', lang);
}

export function getLanguage() {
  return currentLang;
}

export function t(key) {
  return translations[currentLang]?.[key] || translations.en[key] || key;
}
