import { NotFoundException } from "@huuma/route/http/exception/not-found-exception";
import { HttpStatus } from "@huuma/route/http/http-status";
import type { AppContext } from "@huuma/route";

import { $scope } from "../hooks/scope.ts";
import { Fragment, type JSX, jsx } from "../jsx-runtime/mod.ts";
import { VNodeProps } from "../v-node/mod.ts";
import type { UIApp } from "../platform/server/mod.ts";

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

export function setupI18n<T extends AppContext>(
  app: UIApp<T>,
  config: I18nConfig,
): Required<I18nConfig> {
  if (!config.languages) {
    throw new Error("Languages are required");
  }

  app.get("/", ({ request }) => {
    const root = new URL(request.url);
    return Response.redirect(
      new URL(
        [config.defaultLanguage ?? defaultLanguage, root.search, root.hash]
          .join(""),
        root.origin,
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

export interface TProps extends JSX.ComponentProps {
  name: string;
  props?: Record<string, string>;
  dangerouslyInnerHTML?: {
    name: string;
    props?: JSX.ComponentProps & { key?: string };
  };
}

export function T(
  props: TProps,
): JSX.Element {
  const { name, props: _p, dangerouslyInnerHTML } = props;
  const language = $config().i18n.activeLanguage;

  if (dangerouslyInnerHTML) {
    const { key, ...elementProps } = dangerouslyInnerHTML.props ?? {};
    elementProps.children = undefined;
    elementProps.dangerouslySetInnerHTML = { __html: t(language, name, _p) };
    return jsx(dangerouslyInnerHTML.name, elementProps, key);
  }
  return jsx(Fragment, { children: [t(language, name, _p)] });
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

export function $activeLang(): string {
  const { url, i18n } = $config();
  return langFrom(url.pathname, i18n.config.pattern) ??
    i18n.config.defaultLanguage;
}
/** @deprecated Use $activeLang */
export const getActiveLang = $activeLang;

export function $languages(): string[] {
  return $config().i18n.availableLanguages;
}

/** @deprecated Use $languages */
export const getLanguages = $languages;

export function langFrom(
  url: string,
  pattern: I18nTransferState["config"]["pattern"],
): string | undefined {
  return new RegExp(pattern.source, pattern.flags).exec(url)?.[1];
}

function t(
  language: Language,
  key: string,
  params?: Record<string, string>,
): string {
  if (language) {
    const keys = key.split(".");
    if (params) {
      return replaceParams(unnest([...keys], language, "") ?? key, params);
    }
    return unnest([...keys], language, "") ?? key;
  }
  return key;
}

export function $t(key: string, params?: Record<string, string>): string {
  const language = $config().i18n.activeLanguage;
  return t(language, key, params);
}

function $config(): { url: URL; i18n: I18nTransferState } {
  const globalOptions = $scope()[VNodeProps.OPTIONS]._GLOBAL;
  const config = {
    url: globalOptions.url,
    i18n: globalOptions.transferState.i18n,
  };

  if (config.url && config.i18n) {
    return config;
  }
  throw new Error("Could not find I18N config. Is I18N correctly setup?");
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
