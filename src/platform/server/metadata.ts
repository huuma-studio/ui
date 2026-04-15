import type { SearchParams } from "@huuma/route/http/request";
import type { TransferState } from "./transfer-state.ts";

export type Metadata = {
  title?: string;
  description: string;
  headers?: Record<string, string>;
};

export type MetadataGenerator<R = undefined, T = undefined> = (ctx: {
  request: Request;
  params: Record<string, string | undefined>;
  searchParams: SearchParams;
  auth: unknown;
  data: T;
  transferState?: TransferState;
  resolved: R;
}) => Metadata | Promise<Metadata>;
