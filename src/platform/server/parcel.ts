import { Cargo, type CargoContext, type CargoOptions } from "@cargo/cargo";
import type { Handler, RequestContext } from "@cargo/cargo/http/request";
import { type Middleware, walkthroughAndHandle } from "@cargo/cargo/middleware";
import { renderToString, vNodeToString } from "./render.ts";
import { type JSX, jsx } from "../../jsx-runtime/mod.ts";
import { create } from "../../v-node/mod.ts";
import { type Island, markIslands } from "../../islands/islands.ts";
import { parse } from "@std/path/parse";
import type { Route } from "@cargo/cargo/http/route";
import { isProd } from "@cargo/cargo/utils/environment";

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
) => JSX.Node;

export interface PageLikeProps<T> extends JSX.ElementProps {
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
  nonce: string;
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

export function Parcel<D>(
  root: PageLike<D>,
): ParcelApp<D> {
  return new ParcelApp<D>(root);
}

export class ParcelApp<D, T extends CargoContext = { State: { data: D } }>
  extends Cargo<T> {
  #root: PageLike<D>;
  #islands: { path: string; island: JSX.Component }[] = [];
  #scripts: Script[] = [];
  #transferState: TransferState = {};

  constructor(root: PageLike<D>, options?: CargoOptions<T>) {
    super(options);
    this.#root = root;
  }

  deliver(): Cargo["handle"] {
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
    // nonce should be created here.
    return (ctx) => {
      const nonce = crypto.randomUUID();
      return walkthroughAndHandle(
        ctx,
        props.middleware,
        (ctx: RequestContext<{ State: { data: D } }>) => {
          return new Response(
            this.#render({
              root: this.#root,
              page: props.page,
              layouts: props.layouts,
              params: ctx.params ?? {},
              data: ctx.get("data") ?? {} as D,
              nonce,
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

  #render(props: RenderProps<D>): string {
    const islands: Island[] = [];

    const node = this.#applyLayouts(
      props.page,
      props.layouts,
      props.params,
      props.data,
    );

    const vNode = create(
      node,
      {
        transferState: { ...this.#transferState },
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
          params: props.params,
          data: props.data,
          scripts: this.#splitScripts(this.#scripts, islands, props.nonce),
          islands,
          transferState: { ...this.#transferState },
        }),
        { transferState: { ...this.#transferState } },
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
  ): JSX.Element<string | 0 | JSX.Component> {
    return (layouts?.length ? [...layouts] : []).reduce<
      JSX.Element<string | JSX.Component | 0>
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
