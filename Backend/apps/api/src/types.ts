import type { AppContainer } from "@agrocore/composition";
import type { ContextoSolicitud } from "@agrocore/core";

export type AppEnv = {
  Variables: {
    container: AppContainer;
    /** Origen de la solicitud ("api") e IP del cliente, para la auditoría (Regla 6). */
    contexto: ContextoSolicitud;
  };
};
