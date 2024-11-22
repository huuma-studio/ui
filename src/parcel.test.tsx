import { ParcelApp } from "./parcel.ts";

Deno.test(ParcelApp.name, () => {
  const app = new ParcelApp((children) => <div>{children}</div>);
  app.handle
});
