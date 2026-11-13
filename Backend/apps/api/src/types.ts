import type { AppContainer } from "@duitamacrece/composition";
import type { ContextoSolicitud } from "@duitamacrece/core";

export type AppEnv = {
  Variables: {
    container: AppContainer;
    /** Origen de la solicitud ("api") e IP del cliente, para la auditoría (Regla 6). */
    contexto: ContextoSolicitud;
  };
};
