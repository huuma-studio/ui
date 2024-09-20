import { Cargo, type CargoContext, type CargoOptions } from "@cargo/cargo";
import type { Handler, RequestContext } from "@cargo/cargo/http/request";
import { type Middleware, walkthroughAndHandle } from "@cargo/cargo/middleware";
import { vNodeToString } from "./platform/server/mod.ts";
import { create, type VComponent } from "./ant/mod.ts";
import { jsx, type JSX } from "./jsx-runtime/mod.ts";

export interface PageLikeProps<T = undefined> extends JSX.ElementProps {
  params: Record<string, string>;
  data: T;
}

export type PageLike = (props: PageLikeProps) => JSX.Element<JSX.Component>;

export interface PageProps {
  root: JSX.Element<string>;
  page: PageLike;
  layouts: PageLike[];
  middleware: Middleware[];
  statusCode: number;
}

export interface RenderProps<T> {
  root: JSX.Element<string>;
  page: PageLike;
  layouts?: PageLike[];
  scripts?: string[];
  params: Record<string, string | undefined>;
  data: T;
}

export function Parcel<T extends CargoContext>(
  root: JSX.Element<string>,
): ParcelApp<T> {
  return new ParcelApp(root);
}

export class ParcelApp<T extends CargoContext> extends Cargo {
  #root: JSX.Element<string>;

  constructor(root: JSX.Element<string>, options?: CargoOptions<T>) {
    super(options);
    this.#root = root;
  }

  get root(): JSX.Element<string> {
    return this.#root;
  }

  pageHandler(props: PageProps): Handler<{ State: { state: unknown } }> {
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
    return vNodeToString(
      <VComponent<unknown>>create(
        this.#applyLayouts(
          jsx(<JSX.Component>props.page, {
            params: props.params,
            data: props.data,
          }),
          props.layouts,
          props.params,
          props.data,
        ),
      ),
    );
  }

  #applyLayouts(
    page: JSX.Element<string | JSX.Component | 0>,
    layouts?: PageLike[],
    params?: Record<string, string | undefined>,
    data?: unknown,
  ): JSX.Element<string | 0 | JSX.Component> {
    if (layouts?.length) {
      return layouts.reduce<JSX.Element<string | JSX.Component | 0>>(
        (accumulator, currentLayout) => {
          return jsx(<JSX.Component>currentLayout, {
            params,
            data,
            children: [accumulator],
          });
        },
        page,
      );
    }
    return page;
  }
}
