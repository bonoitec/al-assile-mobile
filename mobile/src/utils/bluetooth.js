// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT: [ESC, 0x40],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_HEIGHT_ON: [GS, 0x21, 0x01],
  DOUBLE_HEIGHT_OFF: [GS, 0x21, 0x00],
  CUT: [GS, 0x56, 0x41, 0x10],
  FEED: [ESC, 0x64, 0x04],
};

// Common thermal printer Bluetooth service UUIDs
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic thermal
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip RN4020
  '0000ff00-0000-1000-8000-00805f9b34fb', // Common generic serial
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Peripage / similar
];

const PRINTER_CHARACTERISTICS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  'bf3fbd80-906d-408f-a480-1e67bde89d59',
  'be9eb3d6-000c-4a13-a5c7-d8b9f9cb7699',
];

export function isSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

let printerDevice = null;
let printerChar = null;

export async function connectPrinter() {
  if (!isSupported()) throw new Error('Web Bluetooth is not supported in this browser');

  const device = await navigator.bluetooth.requestDevice({
    filters: [
      { services: [PRINTER_SERVICES[0]] },
      { services: [PRINTER_SERVICES[1]] },
      { services: [PRINTER_SERVICES[2]] },
      { services: [PRINTER_SERVICES[3]] },
      { namePrefix: 'POS' },
      { namePrefix: 'Printer' },
      { namePrefix: 'RPP' },
      { namePrefix: 'PT' },
    ],
    optionalServices: PRINTER_SERVICES,
  });

  const server = await device.gatt.connect();
  printerDevice = device;

  // Try each service until one works
  for (const serviceUUID of PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceUUID);
      for (const charUUID of PRINTER_CHARACTERISTICS) {
        try {
          printerChar = await service.getCharacteristic(charUUID);
          return { success: true, name: device.name || 'Printer' };
        } catch {
          // Try next characteristic
        }
      }
    } catch {
      // Try next service
    }
  }

  throw new Error('Could not find writable characteristic on printer');
}

export function isConnected() {
  return printerDevice && printerDevice.gatt && printerDevice.gatt.connected;
}

export async function disconnect() {
  if (printerDevice && printerDevice.gatt.connected) {
    printerDevice.gatt.disconnect();
  }
  printerDevice = null;
  printerChar = null;
}

function encode(text) {
  return new TextEncoder().encode(text);
}

function bytes(...cmds) {
  const flat = cmds.flat();
  return new Uint8Array(flat);
}

function pad(str, width, right = false) {
  const s = String(str);
  if (s.length >= width) return s.slice(0, width);
  return right ? s.padStart(width) : s.padEnd(width);
}

async function writeChunked(data) {
  const CHUNK = 20;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    await printerChar.writeValue(chunk);
    // Small delay between chunks for stability
    await new Promise(r => setTimeout(r, 30));
  }
}

export async function printReceipt(sale, settings = {}, lang = null) {
  if (!printerChar) throw new Error('Printer not connected');

  const isAr = (lang || (typeof localStorage !== 'undefined' && localStorage.getItem('mobile_lang')) || 'en') === 'ar';
  const businessName = settings.business_name_fr || settings.businessName || 'Al Assile';
  const address = settings.business_address || settings.address || '';
  const phone = settings.business_phone || settings.phone || '';
  const LINE = '--------------------------------';
  const NARROW = '- - - - - - - - - - - - - - - -';

  const date = new Date(sale.created_at || Date.now());
  const dateStr = date.toLocaleDateString('fr-DZ');
  const timeStr = date.toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' });

  const paid = sale.paid_amount || 0;
  const total = sale.total || 0;
  const change = paid - total;

  const lines = [];

  // Header
  lines.push({ cmd: CMD.INIT });
  lines.push({ cmd: CMD.ALIGN_CENTER });
  lines.push({ cmd: CMD.BOLD_ON });
  lines.push({ cmd: CMD.DOUBLE_HEIGHT_ON });
  lines.push({ text: businessName + '\n' });
  lines.push({ cmd: CMD.DOUBLE_HEIGHT_OFF });
  lines.push({ cmd: CMD.BOLD_OFF });
  lines.push({ text: address + '\n' });
  if (phone) lines.push({ text: 'Tel: ' + phone + '\n' });
  lines.push({ text: LINE + '\n' });

  // Sale info
  lines.push({ cmd: CMD.ALIGN_LEFT });
  lines.push({ text: `${isAr ? 'إيصال' : 'Receipt'} #${sale.id || 'N/A'}` + '\n' });
  lines.push({ text: `${isAr ? 'التاريخ' : 'Date'}: ${dateStr}  ${timeStr}` + '\n' });
  if (sale.client_name) lines.push({ text: `${isAr ? 'العميل' : 'Client'}: ${sale.client_name}` + '\n' });
  if (sale.salesperson) lines.push({ text: `${isAr ? 'البائع' : 'Salesperson'}: ${sale.salesperson}` + '\n' });
  lines.push({ text: LINE + '\n' });

  // Items header
  lines.push({ cmd: CMD.BOLD_ON });
  lines.push({ text: `${pad(isAr ? 'المنتج' : 'Item', 18)}${pad(isAr ? 'الكمية' : 'Qty', 5)}${pad(isAr ? 'المجموع' : 'Total', 9, true)}` + '\n' });
  lines.push({ cmd: CMD.BOLD_OFF });
  lines.push({ text: NARROW + '\n' });

  // Items
  const items = sale.items || sale.sale_items || [];
  for (const item of items) {
    const name = (item.product_name || item.name || 'Product').slice(0, 17);
    const qty = item.quantity || 1;
    const lineTotal = ((item.unit_price || item.selling_price || 0) * qty).toFixed(2);
    lines.push({ text: `${pad(name, 18)}${pad(qty, 5)}${pad(lineTotal, 9, true)}` + '\n' });
    // Show barcode on second line if present
    const barcode = item.barcode || item.product_barcode || null;
    if (barcode) {
      lines.push({ text: `  [${barcode}]` + '\n' });
    }
  }

  lines.push({ text: NARROW + '\n' });

  // Totals (TVA breakdown removed per shop policy — shown as a single total)
  lines.push({ cmd: CMD.ALIGN_RIGHT });
  lines.push({ cmd: CMD.BOLD_ON });
  lines.push({ text: `${isAr ? 'المجموع' : 'TOTAL'}: ${pad(total.toFixed(2) + ' DA', 12, true)}` + '\n' });
  lines.push({ cmd: CMD.BOLD_OFF });
  lines.push({ text: `${isAr ? 'المدفوع' : 'Paid'}:  ${paid.toFixed(2)} DA` + '\n' });

  if (change >= 0) {
    lines.push({ text: `${isAr ? 'الباقي' : 'Change'}: ${change.toFixed(2)} DA` + '\n' });
  } else {
    lines.push({ text: `${isAr ? 'المتبقي' : 'Due'}: ${Math.abs(change).toFixed(2)} DA` + '\n' });
  }

  // Footer
  lines.push({ cmd: CMD.ALIGN_CENTER });
  lines.push({ text: LINE + '\n' });
  lines.push({ text: (isAr ? 'شكراً لكم!\n' : 'Thank you!\n') });
  lines.push({ text: (isAr ? 'الأصيل - منتجات التمور\n' : 'Al Assile Date Products\n') });

  // Feed and cut
  lines.push({ cmd: CMD.FEED });
  lines.push({ cmd: CMD.CUT });

  // Encode and write all
  const parts = [];
  for (const line of lines) {
    if (line.cmd) parts.push(new Uint8Array(line.cmd));
    if (line.text) parts.push(encode(line.text));
  }

  // Merge into single buffer
  const totalBytes = parts.reduce((acc, p) => acc + p.length, 0);
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.length;
  }

  await writeChunked(buffer);
}

export function formatReceiptText(sale, settings = {}, lang = null) {
  const isAr = (lang || (typeof localStorage !== 'undefined' && localStorage.getItem('mobile_lang')) || 'en') === 'ar';
  const businessName = settings.business_name_fr || settings.businessName || 'Al Assile';
  const LINE = '================================';
  const NARROW = '- - - - - - - - - - - - - - - -';
  const date = new Date(sale.created_at || Date.now());

  const items = sale.items || sale.sale_items || [];
  const total = sale.total || 0;
  const paid = sale.paid_amount || 0;
  const change = paid - total;

  let text = `${businessName}\n`;
  text += `${isAr ? 'التاريخ' : 'Date'}: ${date.toLocaleString('fr-DZ')}\n`;
  text += `${isAr ? 'إيصال' : 'Receipt'} #${sale.id || 'N/A'}\n`;
  if (sale.client_name) text += `${isAr ? 'العميل' : 'Client'}: ${sale.client_name}\n`;
  text += `${LINE}\n`;

  for (const item of items) {
    const name = item.product_name || item.name || (isAr ? 'منتج' : 'Product');
    const qty = item.quantity || 1;
    const price = (item.unit_price || 0) * qty;
    text += `${name} x${qty} = ${price.toFixed(2)} DA\n`;
    const barcode = item.barcode || item.product_barcode || null;
    if (barcode) {
      text += `  [${barcode}]\n`;
    }
  }

  text += `${NARROW}\n`;
  text += `${isAr ? 'المجموع' : 'TOTAL'}:    ${total.toFixed(2)} DA\n`;
  text += `${isAr ? 'المدفوع' : 'Paid'}:         ${paid.toFixed(2)} DA\n`;
  text += change >= 0
    ? `${isAr ? 'الباقي' : 'Change'}: ${change.toFixed(2)} DA\n`
    : `${isAr ? 'المتبقي' : 'Due'}: ${Math.abs(change).toFixed(2)} DA\n`;
  text += `${LINE}\n${isAr ? 'شكراً لكم!' : 'Thank you!'}`;

  return text;
}
