import type { Middleware } from "@cargo/cargo/middleware";
import type { RequestContext } from "@cargo/cargo/http/request";

import {
  type I18nConfig,
  type I18nTransferState,
  langFrom,
  LanguageNotSupportedException,
  NoLanguageSpecifiedException,
} from "../mod.ts";

export function useI18n(
  config: Required<I18nConfig>,
): Middleware {
  return (ctx, next) => {
    const lang = langFrom(new URL(ctx.request.url).pathname, config.pattern);

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
        defaultLanguage: config.defaultLanguage,
        pattern: {
          source: config.pattern.source,
          flags: config.pattern.flags,
        },
      },
    };

    return next();
  };
}

export function redirectNoLanguageSpecifiedTo(
  redirectionPath: string,
): Middleware {
  return async (ctx, next) => {
    try {
      return await next();
    } catch (e) {
      if (
        e instanceof NoLanguageSpecifiedException
      ) {
        const defaultLanguage = ctx.get("transferState").i18n
          ?.detfaultLanguage;
        if (typeof defaultLanguage !== "string") {
          // TODO: Add link to documentation as soon it exists
          throw new Error(
            "Default language not specified! Setup I18n properly",
          );
        }
        return Response.redirect(
          `${new URL(ctx.request.url).origin}/${
            redirectionPath ?? defaultLanguage
          }`,
        );
      }
      throw e;
    }
  };
}

export function redirectLanguageNotSupportedExceptionTo(
  redirectionPath: string,
): Middleware {
  return async (ctx, next) => {
    try {
      return await next();
    } catch (e) {
      if (
        e instanceof LanguageNotSupportedException
      ) {
        return redirectLanguageExceptionTo(
          redirectionPath,
          // TODO: Add link to documentation as soon it exists
          `Requested language is not supported! Add it to the I18n configuration`,
          ctx,
        );
      }
      throw e;
    }
  };
}

function redirectLanguageExceptionTo(
  redirectionPath: string,
  exceptionMessage: string,
  ctx: RequestContext,
) {
  const defaultLanguage = ctx.get("transferState").i18n
    ?.detfaultLanguage;
  if (typeof defaultLanguage !== "string") {
    throw new Error(exceptionMessage);
  }
  return Response.redirect(
    `${new URL(ctx.request.url).origin}/${redirectionPath ?? defaultLanguage}`,
  );
}
