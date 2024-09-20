import { bootstrap } from "cargo/mod.ts";
import {
  logTimeToResponse,
  redirectToWithoutSlash,
} from "cargo/middleware/mod.ts";

import cargoDevConfig from "config/cargo.dev.ts";

const app = await bootstrap(cargoDevConfig);

app.middleware([logTimeToResponse, redirectToWithoutSlash]).run();
