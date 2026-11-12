/**
 * Formateadores transversales de la UI.
 */

export function formatearFecha(valor: string | Date | null): string {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(valor));
}

export function formatearMoneda(valor: number, moneda = "USD"): string {
  return new Intl.NumberFormat("es", { style: "currency", currency: moneda }).format(valor);
}
