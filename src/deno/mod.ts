import type { ParcelApp } from "../parcel.ts";

export function serve(parcelApp: ParcelApp<{}>) {
  Deno.serve(parcelApp.init());
}
