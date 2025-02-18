import { NotFoundException } from "@cargo/cargo/http/exception/not-found-exception";
import { HttpStatus } from "@cargo/cargo/http/http-status";
import type { CargoContext } from "@cargo/cargo";

import { Fragment, type JSX, jsx } from "../jsx-runtime/mod.ts";
import { getVNodeScope, VNodeProps } from "../v-node/mod.ts";
import type { ParcelApp } from "../platform/server/mod.ts";

export interface I18nConfig {
  defaultLanguage?: string;
  pattern?: RegExp;
  languages: {
    [key: string]: Language | string;
  };
}

export interface Language {
  [key: string]: string | Language;
}

export type I18nTransferState = {
  activeLanguage: Language;
  availableLanguages: string[];
  config: {
    defaultLanguage: string;
    pattern: { source: string; flags: string };
  };
};

const defaultPattern = /^\/([a-z]{2})?(?:\/|$)/i;
const defaultLanguage = "en";

export function setupI18n<T extends CargoContext>(
  parcel: ParcelApp<T>,
  config: I18nConfig,
): Required<I18nConfig> {
  if (!config.languages) {
    throw new Error("Languages are required");
  }

  parcel.get("/", ({ request }) => {
    // TODO: Handle additional query parameters
    return Response.redirect(
      new URL(
        config.defaultLanguage ?? defaultLanguage,
        new URL(request.url).origin,
      ),
      HttpStatus.TEMORARY_REDIRECTED,
    );
  });

  return {
    pattern: config.pattern ?? defaultPattern,
    defaultLanguage: config.defaultLanguage ?? defaultLanguage,
    languages: config.languages,
  };
}

export interface TProps extends JSX.ElementProps {
  name: string;
  props?: Record<string, string>;
}

export function T(
  { children, props, name }: TProps,
): // deno-lint-ignore no-explicit-any
JSX.Element<any> {
  const element = children?.length && children[0] != null &&
      typeof children[0] === "object" && "type" in children[0] &&
      typeof children[0].type === "string"
    ? children[0]
    : null;

  if (element) {
    element.props.dangerouslySetInnerHTML = { __html: t(name, props) };
    element.props.children = [];
    return element;
  }
  return jsx(Fragment, { children: [t(name, props)] });
}

export const Translation = T;
export const I18n = T;

export class LanguageNotSupportedException extends NotFoundException {
  constructor() {
    super("Language not supported");
  }
}

export class NoLanguageSpecifiedException extends NotFoundException {
  constructor() {
    super("No language specified");
  }
}

export function getActiveLang(): string {
  const { url, i18n } = getI18nConfig();
  return langFrom(new URL(url).pathname, i18n.config.pattern) ??
    i18n.config.defaultLanguage;
}

export function getLanguages(): string[] {
  return getI18nConfig().i18n.availableLanguages;
}

export function langFrom(
  url: string,
  pattern: I18nTransferState["config"]["pattern"],
): string | undefined {
  return new RegExp(pattern.source, pattern.flags).exec(url)?.[1];
}

function t(key: string, params?: Record<string, string>): string {
  const language = getI18nConfig().i18n.activeLanguage;
  if (language) {
    const keys = key.split(".");
    if (params) {
      return replaceParams(unnest([...keys], language, "") ?? key, params);
    }
    return unnest([...keys], language, "") ?? key;
  }
  return key;
}

function assertVNodeScope() {
  const vNode = getVNodeScope()[0];
  if (!vNode) {
    throw new Error("This is only allowed in a vComponent scope");
  }
  return vNode;
}

function getI18nConfig(): { url: string; i18n: I18nTransferState } {
  const globalOptions = assertVNodeScope()[VNodeProps.OPTIONS]._GLOBAL;
  return { url: globalOptions.url, i18n: globalOptions.transferState.i18n };
}

function unnest(
  keys: string[],
  language: Language,
  path: string,
): string | undefined {
  const key = keys.shift();

  if (typeof key === "undefined") {
    console.info(
      "I18n",
      `Translation key is undefined. This most likely happens if the translation values is not of type "string"`,
    );
    return undefined;
  }

  if (key in language) {
    const translation = language[key];
    if (typeof translation === "string") {
      if (keys.length) {
        console.info(
          "I18n",
          `Key "${path}${key}" does not seems to be a final translation value. More nesting expected ${path}${key}(.${
            keys.join(
              ".",
            )
          })`,
        );
      }
      return translation;
    }
    return unnest(keys, translation, `${path}${key}.`);
  }
  console.info("I18n", `Translation value for key "${path}${key}" not found`);
  return undefined;
}

function replaceParams(label: string, params?: Record<string, string>): string {
  if (!params) {
    return label;
  }
  return Object.entries(params).reduce((label, [key, value]) => {
    return label.replace(new RegExp(`{{${key}}}`, "g"), value);
  }, label);
}
