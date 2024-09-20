import { RequestContext } from "@cargo/cargo/http/request";

type Context = RequestContext & {
  [key: string]: unknown;
};

let _context: Context | undefined;

export function setServerContext(ctx: RequestContext | undefined) {
  _context = ctx ? { ...ctx } : undefined;
}

export function getServerContext<T extends Context>(): T {
  if (_context) return <T>_context;
  throw Error("Request Context not set!");
}

export function getRequest() {
  assertRequestScope();
  return new URL(_context?.request?.url || window.location.href);
}

function assertRequestScope() {
  if (!_context?.request && !window.location) {
    throw Error("No request scope found!");
  }
}
