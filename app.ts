import Parcel from "./root.tsx";
import { pack } from "./src/pack.ts";

Deno.serve(pack(Parcel));
