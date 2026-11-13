import { DI, Welcome } from "./services.ts";

export default function Home() {
  return <h1>{DI.get(Welcome).message()}</h1>;
}
