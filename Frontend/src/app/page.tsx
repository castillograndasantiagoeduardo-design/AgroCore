import Layout from "./(panel)/layout";
import { ExplorarVista } from "@/features/explorar/components/ExplorarVista";

/** Flujo directo: la raíz muestra inmediatamente el motor de recomendación sin pasos intermedios. */
export default function HomePage() {
  return (
    <Layout>
      <ExplorarVista />
    </Layout>
  );
}
