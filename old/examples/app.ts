import { bootstrap } from "cargo/mod.ts";
import {
  logTimeToResponse,
  redirectToWithoutSlash,
} from "cargo/middleware/mod.ts";

import cargoConfig from "config/cargo.ts";

const app = await bootstrap(cargoConfig);

app.middleware([logTimeToResponse, redirectToWithoutSlash]).run();
