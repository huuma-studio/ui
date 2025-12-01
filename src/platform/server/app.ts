import { DEFAULT_STYLES_PATH, type Stylesheet } from "./stylesheet.ts";
import type { Handler, SearchParams } from "@huuma/route/http/request";
import { App, type AppContext, type AppOptions } from "@huuma/route";
import { type Island, markIslands } from "../../islands/islands.ts";
import { handle, type Middleware } from "@huuma/route/middleware";
import { renderToString, vNodeToString } from "./render.ts";
import { type JSX, jsx } from "../../jsx-runtime/mod.ts";
import { isProd } from "@huuma/route/utils/environment";
import type { Route } from "@huuma/route/http/route";
import { info } from "@huuma/route/utils/logger";
import { create } from "../../v-node/async.ts";
import { parse } from "@std/path/parse";

export type TransferStateItem =
  | TransferState
  | string
  | number
  | boolean
  | null;

export interface TransferState {
  [key: string]: TransferStateItem;
}

export type Metadata = {
  title?: string;
  description: string;
  headers?: Record<string, string>;
};

export type MetadataGenerator<T> = (ctx: {
  request: Request;
  params: Record<string, string | undefined>;
  searchParams: SearchParams;
  auth: unknown;
  data: T;
  transferState?: TransferState;
}) => Metadata | Promise<Metadata>;

export type PageLike<T> = (
  props: PageLikeProps<T>,
) => JSX.Element | Promise<JSX.Element>;

export interface PageLikeProps<T = undefined> extends JSX.ComponentProps {
  params: Record<string, string>;
  searchParams: Record<string, string>;
  request: Request;
  auth: unknown;
  data: T;
  transferState?: TransferState;
}

export interface PageProps<T> {
  page: PageLike<T>;
  layouts: PageLike<T>[];
  middleware: Middleware[];
  statusCode: number;
  metadata?: Metadata | MetadataGenerator<T>;
}

type PageHandlerProps<T> = PageProps<T> & {
  root: PageLike<T>;
};

export interface PageScripts {
  nonce: string;
  head: { entryPoints: Script[] };
  body: {
    runtime?: Script;
    islands: Script[];
    entryPoints: Script[];
  };
}

export type RootPageProps<T> = PageLikeProps<T> & {
  scripts?: PageScripts;
  stylesheets?: Stylesheet[];
  islands?: Island[];
  metadata?: Metadata;
};

export type RootPage<T> = (
  props: RootPageProps<T>,
) => JSX.Element | Promise<JSX.Element>;

export interface RenderProps<T> {
  root: PageLike<T>;
  page: PageLike<T>;
  layouts?: PageLike<T>[];
  params: Record<string, string | undefined>;
  searchParams: SearchParams;
  data: T;
  transferState: TransferState;
  nonce: string;
  request: Request;
  auth?: unknown;
  metadata?: Metadata;
}

export interface Script {
  path: string;
  name: string;
  imports?: string[];
  isEntryPoint?: boolean;
  isIsland?: boolean;
  isRuntime?: boolean;
  head?: boolean;
}
interface ScriptWithImports {
  imports?: string[];
}

export function createUIApp<
  D,
  T extends AppContext = { State: { data: D; transferState: TransferState } },
>(
  root: RootPage<D>,
  options?: AppOptions<T>,
): UIApp<D, T> {
  return new UIApp<D, T>(root, options);
}

export class UIApp<
  D,
  T extends AppContext = { State: { data: D; transferState: TransferState } },
> extends App<T> {
  #root: RootPage<D>;
  #islands: { path: string; island: JSX.Component }[] = [];
  #scripts: Script[] = [];
  #stylesheets: Stylesheet[] = [];
  #transferState: TransferState = {};
  #entryPoints?: [string, string][];

  constructor(root: RootPage<D>, options?: AppOptions<T>) {
    super(options);
    this.#root = root;
  }

  deliver(): App["handle"] {
    return this.init();
  }

  addPage(path: string, props: PageProps<D>): Route<T> {
    return this.get(path, this.#pageHandler({ root: this.#root, ...props }));
  }

  addEntryPoint(name: string, path: string): void {
    if (!this.#entryPoints) {
      this.#entryPoints = [];
    }
    this.#entryPoints.push([name, path]);
  }

  getEntryPoints(): [string, string][] {
    return this.#entryPoints ? [...this.#entryPoints] : [];
  }

  addIsland(
    island: JSX.Component,
    script: {
      path: string;
      contents: Uint8Array<ArrayBuffer>;
      imports?: string[];
    },
  ): void {
    this.addScript(script.path, script.contents, {
      isIsland: true,
      imports: script.imports,
    });
    this.#islands.push({ path: script.path, island });
  }

  addScript(
    path: string,
    content: Uint8Array<ArrayBuffer>,
    options?: ScriptWithImports,
  ): void;
  addScript(
    path: string,
    content: Uint8Array<ArrayBuffer>,
    options?: {
      isEntryPoint: boolean;
      head?: boolean;
    } & ScriptWithImports,
  ): void;
  addScript(
    path: string,
    content: Uint8Array<ArrayBuffer>,
    options?: {
      isIsland: boolean;
    } & ScriptWithImports,
  ): void;
  addScript(
    path: string,
    content: Uint8Array<ArrayBuffer>,
    options?: {
      isRuntime: boolean;
    } & ScriptWithImports,
  ): void;
  addScript(
    path: string,
    content: Uint8Array<ArrayBuffer>,
    options?: {
      isEntryPoint?: boolean;
      isIsland?: boolean;
      isRuntime?: boolean;
      head?: boolean;
      imports?: string[];
    },
  ) {
    this.#scripts.push({
      path,
      isRuntime: options?.isRuntime,
      isEntryPoint: options?.isEntryPoint,
      isIsland: options?.isIsland,
      name: parse(path).name,
      imports: options?.imports,
      head: options?.head,
    });
    this.get(`/${path}`, () => {
      return new Response(content, {
        headers: {
          "Content-Type": "application/javascript",
          ...(isProd()
            ? { "Cache-Control": "public, max-age=604800, immutable" }
            : {}),
        },
      });
    });
  }

  addStylesheet(stylesheet: Stylesheet) {
    const existing = this.#stylesheets.find((s) => s.name === stylesheet.name);
    if (!existing) {
      if (stylesheet.entrypoint) {
        this.#stylesheets.push(stylesheet);
      }
      this.get(`${DEFAULT_STYLES_PATH}/${stylesheet.name}`, () => {
        return new Response(stylesheet.content, {
          headers: {
            "Content-Type": "text/css",
            ...(isProd() ? { "Cache-Control": "max-age=3600" } : {}),
          },
        });
      });
    } else {
      info(
        "STYLESHEET",
        `Skipped stylesheet. Stylesheet "${stylesheet.name}" already registered.`,
        "Huuma/UI",
      );
    }
  }

  addTransferState(key: string, state: TransferStateItem) {
    this.#transferState[key] = state;
  }

  #pageHandler(props: PageHandlerProps<D>): Handler<T> {
    return (ctx) => {
      // TODO: Fix type
      // deno-lint-ignore no-explicit-any
      ctx.set<any>("transferState", {});
      const nonce = crypto.randomUUID();

      return handle(ctx, props.middleware, async (ctx) => {
        const request = ctx.request;
        const transferState = {
          ...ctx.get("transferState"),
          ...this.#transferState,
        };
        const params = ctx.params ?? {};
        const searchParams = ctx.search ?? {};
        const data = ctx.get("data") ?? ({} as D);
        const auth = ctx.auth;

        const metadata = typeof props.metadata === "function"
          ? await props.metadata({
            request,
            params,
            searchParams,
            transferState,
            data,
            auth,
          })
          : props.metadata;

        return new Response(
          await this.#render({
            root: this.#root,
            page: props.page,
            layouts: props.layouts,
            params,
            searchParams,
            data,
            transferState,
            nonce,
            auth,
            request,
            metadata,
          }),
          {
            status: props.statusCode,
            headers: {
              "Content-Type": "text/html",
              "Content-Security-Policy":
                `script-src 'none'; script-src-elem 'nonce-${nonce}';`,
              ...(isProd() ? metadata?.headers : {}),
            },
          },
        );
      });
    };
  }

  async #render({
    page,
    layouts,
    params,
    searchParams,
    request,
    auth,
    transferState,
    data,
    nonce,
    metadata,
  }: RenderProps<D>): Promise<string> {
    const islands: Island[] = [];

    const node = this.#applyLayouts({
      page,
      layouts,
      params,
      searchParams,
      data,
      auth,
      request,
    });

    const url = new URL(request.url);
    const vNode = await create(node, {
      transferState,
      url,
      ...(this.#islands.length
        ? { beforeCreate: markIslands(this.#islands, islands) }
        : undefined),
    });
    return `<!DOCTYPE html>${await renderToString(
      jsx(<JSX.Component> this.#root, {
        children: [
          {
            templates: [vNodeToString(vNode)],
            nodes: [""],
          },
        ],
        params,
        searchParams,
        request,
        auth,
        data,
        metadata,
        scripts: this.#splitScripts(this.#scripts, islands, nonce),
        stylesheets: this.#stylesheets,
        islands,
        transferState,
      } as RootPageProps<D>),
      { transferState, url },
    )}`;
  }

  #splitScripts(
    scripts: Script[],
    islands: Island[],
    nonce: string,
  ): PageScripts | undefined {
    if (!scripts.length && !islands.length) {
      return undefined;
    }

    const _scripts: PageScripts = {
      nonce,
      head: { entryPoints: [] },
      body: {
        islands: [],
        entryPoints: [],
      },
    };

    for (const script of scripts) {
      if (script.head && script.isEntryPoint) {
        _scripts.head.entryPoints.push(script);
        continue;
      }
      if (script.isRuntime) {
        _scripts.body.runtime = script;
        continue;
      }
      if (
        this.#islands.length &&
        script.isIsland &&
        !!islands.filter((island) => parse(island.path).name === script.name)
          .length
      ) {
        _scripts.body.islands.push(script);
        continue;
      }
      if (script.isEntryPoint) {
        _scripts.body.entryPoints.push(script);
        continue;
      }
    }
    // If no islands remove the runtime
    if (!_scripts.body.islands.length) {
      _scripts.body.runtime = undefined;
    }
    return _scripts;
  }

  #applyLayouts(props: {
    page: PageLike<D>;
    layouts: PageLike<D>[] | undefined;
    params: Record<string, string | undefined>;
    searchParams: SearchParams;
    data: D | undefined;
    auth: unknown;
    request: Request;
  }): JSX.Element {
    const { page, layouts, params, searchParams, data, auth, request } = props;
    return (layouts?.length ? [...layouts] : []).reduce<JSX.Element>(
      (accumulator, currentLayout) => {
        return jsx(<JSX.Component> currentLayout, {
          params,
          searchParams,
          request,
          auth,
          data,
          children: [accumulator],
        });
      },
      jsx(<JSX.Component> page, {
        params,
        searchParams,
        request,
        auth,
        data,
      }),
    );
  }
}
