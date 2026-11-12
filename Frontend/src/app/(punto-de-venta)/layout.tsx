import type { ReactNode } from "react";

/** Layout del contexto (punto-de-venta): solo estructura, sin lógica de negocio. */
export default function Layout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl p-6">{children}</div>;
}
