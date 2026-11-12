import type { ReactNode } from "react";

/** Layout del contexto (autenticacion): solo estructura, sin lógica de negocio. */
export default function Layout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl p-6">{children}</div>;
}
