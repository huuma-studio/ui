import { App, type AppContext, type AppOptions } from "@huuma/route";
import type { Handler } from "@huuma/route/http/request";
import { handle, type Middleware } from "@huuma/route/middleware";
import { renderToString, vNodeToString } from "./render.ts";
import { type JSX, jsx } from "../../jsx-runtime/mod.ts";
import { create } from "../../v-node/mod.ts";
import { type Island, markIslands } from "../../islands/islands.ts";
import { parse } from "@std/path/parse";
import type { Route } from "@huuma/route/http/route";
import { isProd } from "@huuma/route/utils/environment";

export type TransferStateItem =
  | TransferState
  | string
  | number
  | boolean
  | null;

export interface TransferState {
  [key: string]: TransferStateItem;
}

export type PageLike<T> = (
  props: PageLikeProps<T>,
) => JSX.Element;

export interface PageLikeProps<T> extends JSX.ComponentProps {
  params: Record<string, string>;
  data: T;
  scripts?: PageScripts;
  islands?: Island[];
  transferState?: TransferState;
}

export interface PageProps<T> {
  page: PageLike<T>;
  layouts: PageLike<T>[];
  middleware: Middleware[];
  statusCode: number;
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

export interface RenderProps<T> {
  root: PageLike<T>;
  page: PageLike<T>;
  layouts?: PageLike<T>[];
  params: Record<string, string | undefined>;
  data: T;
  transferState: TransferState;
  nonce: string;
  url: URL;
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

export function createUIApp<D>(
  root: PageLike<D>,
): UIApp<D> {
  return new UIApp<D>(root);
}

export class UIApp<
  D,
  T extends AppContext = { State: { data: D; transferState: TransferState } },
> extends App<T> {
  #root: PageLike<D>;
  #islands: { path: string; island: JSX.Component }[] = [];
  #scripts: Script[] = [];
  #transferState: TransferState = {};

  constructor(root: PageLike<D>, options?: AppOptions<T>) {
    super(options);
    this.#root = root;
  }

  deliver(): App["handle"] {
    return this.init();
  }

  addPage(path: string, props: PageProps<D>): Route<T> {
    return this.get(path, this.#pageHandler({ root: this.#root, ...props }));
  }

  addIsland(island: JSX.Component, script: {
    path: string;
    contents: Uint8Array;
    imports?: string[];
  }): void {
    this.addScript(script.path, script.contents, {
      isIsland: true,
      imports: script.imports,
    });
    this.#islands.push({ path: script.path, island });
  }

  addScript(
    path: string,
    content: Uint8Array,
    options?: ScriptWithImports,
  ): void;
  addScript(
    path: string,
    content: Uint8Array,
    options?:
      & {
        isEntryPoint: boolean;
        head?: boolean;
      }
      & ScriptWithImports,
  ): void;
  addScript(
    path: string,
    content: Uint8Array,
    options?: {
      isIsland: boolean;
    } & ScriptWithImports,
  ): void;
  addScript(
    path: string,
    content: Uint8Array,
    options?: {
      isRuntime: boolean;
    } & ScriptWithImports,
  ): void;
  addScript(path: string, content: Uint8Array, options?: {
    isEntryPoint?: boolean;
    isIsland?: boolean;
    isRuntime?: boolean;
    head?: boolean;
    imports?: string[];
  }) {
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

  addTransferState(key: string, state: TransferStateItem) {
    this.#transferState[key] = state;
  }

  #pageHandler(
    props: PageHandlerProps<D>,
  ): Handler<T> {
    return (ctx) => {
      // TODO: Fix type
      // deno-lint-ignore no-explicit-any
      ctx.set<any>("transferState", {});
      const nonce = crypto.randomUUID();
      return handle(
        ctx,
        props.middleware,
        (ctx) => {
          const transferState = {
            ...ctx.get("transferState"),
            ...this.#transferState,
          };
          return new Response(
            this.#render({
              root: this.#root,
              page: props.page,
              layouts: props.layouts,
              params: ctx.params ?? {},
              data: ctx.get("data") ??
                {} as D,
              transferState,
              nonce,
              url: new URL(ctx.request.url),
            }),
            {
              status: props.statusCode,
              headers: {
                "Content-Type": "text/html",
                "Content-Security-Policy":
                  `script-src 'none'; script-src-elem 'nonce-${nonce}';`,
              },
            },
          );
        },
      );
    };
  }

  #render(
    { page, layouts, params, transferState, data, nonce, url }: RenderProps<D>,
  ): string {
    const islands: Island[] = [];

    const node = this.#applyLayouts(
      page,
      layouts,
      params,
      data,
    );

    const vNode = create(
      node,
      {
        transferState,
        url,
        ...this.#islands.length
          ? { beforeCreate: markIslands(this.#islands, islands) }
          : undefined,
      },
    );

    return `<!DOCTYPE html>${
      renderToString(
        jsx(<JSX.Component> this.#root, {
          children: [
            {
              templates: [vNodeToString(vNode)],
              nodes: [""],
            },
          ],
          params: params,
          data: data,
          scripts: this.#splitScripts(this.#scripts, islands, nonce),
          islands,
          transferState,
        }),
        { transferState, url },
      )
    }`;
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
        script.isIsland && !!islands.filter((island) =>
          parse(island.path).name === script.name
        ).length
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

  #applyLayouts(
    page: PageLike<D>,
    layouts?: PageLike<D>[],
    params?: Record<string, string | undefined>,
    data?: D,
  ): JSX.Element {
    return (layouts?.length ? [...layouts] : []).reduce<
      JSX.Element
    >(
      (accumulator, currentLayout) => {
        return jsx(<JSX.Component> currentLayout, {
          params,
          data,
          children: [accumulator],
        });
      },
      jsx(<JSX.Component> page, {
        params: params,
        data: data,
      }),
    );
  }
}
