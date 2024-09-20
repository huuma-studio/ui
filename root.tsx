import { Parcel } from "./src/parcel.ts";

const parcel = Parcel((props: JSX.ElementProps) => {
  <html>
    <head></head>
    <body>{props.children}</body>
  </html>;
});

export default parcel;
