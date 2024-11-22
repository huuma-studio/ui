import { Cargo, type CargoContext, type CargoOptions } from "@cargo/cargo";
import type { Handler, RequestContext } from "@cargo/cargo/http/request";
import { type Middleware, walkthroughAndHandle } from "@cargo/cargo/middleware";
import { renderToString, vNodeToString } from "./platform/server/mod.ts";
import { jsx, type JSX } from "./jsx-runtime/mod.ts";
import { create } from "./v-node/mod.ts";
import { findIslands, type Island } from "./islands/islands.ts";
import { parse } from "@std/path/parse";

export interface PageLikeProps<T = undefined> extends JSX.ElementProps {
  params: Record<string, string>;
  data: T;
}

export type PageLike = (props: PageLikeProps) => JSX.Node;

export interface PageProps {
  root: PageLike;
  page: PageLike;
  layouts: PageLike[];
  middleware: Middleware[];
  statusCode: number;
}

export interface RenderProps<T> {
  root: PageLike;
  page: PageLike;
  layouts?: PageLike[];
  scripts?: string[];
  params: Record<string, string | undefined>;
  data: T;
}

export function Parcel<T extends CargoContext>(root: PageLike): ParcelApp<T> {
  return new ParcelApp(root);
}

export class ParcelApp<T extends CargoContext> extends Cargo {
  #root: PageLike;
  #islands: { name: string; path: string; island: JSX.Component }[] = [];
  #entryPoints: Record<string, string> = {};

  get entryPoints() {
    return { ...this.#entryPoints };
  }

  constructor(root: PageLike, options?: CargoOptions<T>) {
    super(options);
    this.#root = root;
  }

  addPage(path: string, props: Omit<PageProps, "root">) {
    return this.get(path, this.pageHandler({ root: this.#root, ...props }));
  }

  addIsland(path: string, island: JSX.Component) {
    const name = parse(path).name;
    this.#islands.push({
      name: name.substring(0, name.length - 1),
      path,
      island,
    });
    this.registerEntryPoint({ name: `./${path}` });
  }

  registerEntryPoint(entryPoint: Record<string, string>) {
    this.#entryPoints = {
      ...this.#entryPoints,
      ...entryPoint,
    };
  }

  private pageHandler(
    props: PageProps,
  ): Handler<{ State: { state: unknown } }> {
    return (ctx) => {
      return walkthroughAndHandle(
        ctx,
        props.middleware,
        (ctx: RequestContext<{ State: { data: unknown } }>) => {
          return new Response(
            this.render({
              root: this.#root,
              page: props.page,
              layouts: props.layouts,
              params: ctx.params ?? {},
              data: ctx.get("data") ?? {},
            }),
            {
              status: props.statusCode,
              headers: {
                "Content-Type": "text/html",
              },
            },
          );
        },
      );
    };
  }

  render<T>(props: RenderProps<T>): string {
    let _islands: Island[] = [];

    const vNode = create(
      this.#applyLayoutsToPage(
        props.page,
        props.layouts,
        props.params,
        props.data,
      ),
    );

    if (this.#islands) {
      _islands = findIslands(vNode, this.#islands);
    }

    return renderToString(
      jsx(<JSX.Component>this.#root, {
        children: [
          {
            templates: [vNodeToString(vNode)],
            nodes: [""],
          },
        ],
        params: props.params,
        data: props.data,
      }),
    );
  }

  #applyLayoutsToPage(
    page: PageLike,
    layouts?: PageLike[],
    params?: Record<string, string | undefined>,
    data?: unknown,
  ): JSX.Element<string | 0 | JSX.Component> {
    return (layouts?.length ? [...layouts] : []).reduce<
      JSX.Element<string | JSX.Component | 0>
    >(
      (accumulator, currentLayout) => {
        return jsx(<JSX.Component>currentLayout, {
          params,
          data,
          children: [accumulator],
        });
      },
      jsx(<JSX.Component>page, {
        params: params,
        data: data,
      }),
    );
  }
}
