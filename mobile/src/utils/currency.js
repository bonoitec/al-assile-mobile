export const formatCurrency = (v) =>
  new Intl.NumberFormat('fr-DZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0) + ' DA';

export const formatCurrencyShort = (v) => {
  const num = v || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M DA';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k DA';
  return formatCurrency(num);
};

export const parseAmount = (str) => {
  if (!str) return 0;
  const cleaned = String(str).replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};
