import { NotFoundException } from "@cargo/cargo/http/exception/not-found-exception";
import { Fragment, type JSX, jsx } from "../jsx-runtime/mod.ts";
import { getVNodeScope, VNodeProps } from "../v-node/mod.ts";
import type { Middleware } from "@cargo/cargo/middleware";

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

type I18nTransferState = {
  activeLanguage: Language;
  availableLanguages: string[];
  config: {
    defaultLanguage: string;
    pattern: { source: string; flags: string };
  };
};

const defaultPattern = /^\/([a-z]{2})?(?:\/|$)/i;
const defaultLanguage = "en";

export function setupI18n(
  config: I18nConfig,
): Middleware {
  const pattern = {
    source: config.pattern?.source ?? defaultPattern.source,
    flags: config.pattern?.flags ?? defaultPattern.flags,
  };

  return (ctx, next) => {
    const lang = langFrom(new URL(ctx.request.url).pathname, pattern);

    if (typeof lang === "undefined") {
      throw new NoLanguageSpecifiedException();
    }

    const availableLanguages = Object.keys(config.languages);

    if (!availableLanguages.includes(lang)) {
      throw new LanguageNotSupportedException();
    }
    const transferState = ctx.get("transferState");
    transferState.i18n = <I18nTransferState> {
      activeLanguage: config.languages[lang],
      availableLanguages,
      config: {
        defaultLanguage: config.defaultLanguage || defaultLanguage,
        pattern: {
          source: pattern.source,
          flags: pattern.flags,
        },
      },
    };

    return next();
  };
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

export function getActiveLang(): string {
  const { url, i18n } = getI18nConfig();
  return langFrom(new URL(url).pathname, i18n.config.pattern) ??
    i18n.config.defaultLanguage;
}

function langFrom(
  url: string,
  pattern: I18nTransferState["config"]["pattern"],
): string | undefined {
  return new RegExp(pattern.source, pattern.flags).exec(url)?.[1];
}

export function getLanguages(): string[] {
  return getI18nConfig().i18n.availableLanguages;
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

export function t(key: string, params?: Record<string, string>): string {
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

export interface TProps extends JSX.ElementProps {
  label: string;
  params?: Record<string, string>;
}

export function T(
  { label, params }: TProps,
): // deno-lint-ignore no-explicit-any
JSX.Element<any> {
  return jsx(Fragment, { children: [t(label, params)] });
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
