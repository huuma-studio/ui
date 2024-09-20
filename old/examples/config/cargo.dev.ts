import { Assets } from "cargo/http/tasks/mod.ts";
import { Manifest, Parcel } from "parcel/cargo/tasks/mod.ts";

export default {
  tasks: {
    onBootstrap: [Assets("assets"), await Manifest(), await Parcel()],
  },
};
