export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`
