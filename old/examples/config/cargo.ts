import { Assets } from "cargo/http/tasks/mod.ts";
import { Parcel } from "parcel/cargo/tasks/mod.ts";

export default {
  tasks: {
    onBootstrap: [
      Assets("assets"),
      await Parcel(),
    ],
  },
};
