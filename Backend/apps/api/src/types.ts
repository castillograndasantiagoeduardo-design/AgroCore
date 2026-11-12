import type { AppContainer } from "@duitamacrece/composition";
import type { ContextoActor } from "@duitamacrece/core";

export type AppEnv = {
  Variables: {
    container: AppContainer;
    actor: ContextoActor;
  };
};
