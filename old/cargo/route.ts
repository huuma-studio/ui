import { getRequest } from "./context.ts";

function url(): URL {
  return getRequest();
}

function navigate(url: string) {
  if (!globalThis.location) {
    throw Error("Not allowed to navigate on the server side");
  }
  return globalThis.location.assign(url);
}

export const Route = {
  url,
  navigate,
};
