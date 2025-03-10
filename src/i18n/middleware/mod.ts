import type { Middleware } from "@huuma/route/middleware";

import {
  type I18nConfig,
  type I18nTransferState,
  langFrom,
  LanguageNotSupportedException,
  NoLanguageSpecifiedException,
} from "../mod.ts";
import { HttpStatus } from "@huuma/route/http/http-status";

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

export function redirectNoLanguageSpecifiedExceptionTo(
  config: { defaultLanguage: string; redirectTo?: string },
): Middleware {
  return async (ctx, next) => {
    try {
      return await next();
    } catch (e) {
      if (
        e instanceof NoLanguageSpecifiedException
      ) {
        return Response.redirect(
          `${new URL(ctx.request.url).origin}/${
            config.redirectTo
              ? [config.defaultLanguage, config.redirectTo].join("/")
              : config.defaultLanguage
          }`,
          HttpStatus.TEMORARY_REDIRECTED,
        );
      }
      throw e;
    }
  };
}

export function redirectLanguageNotSupportedExceptionTo(
  config: { defaultLanguage: string; redirectTo?: string },
): Middleware {
  return async (ctx, next) => {
    try {
      return await next();
    } catch (e) {
      if (
        e instanceof LanguageNotSupportedException
      ) {
        return Response.redirect(
          `${new URL(ctx.request.url).origin}/${
            config.redirectTo
              ? [config.defaultLanguage, config.redirectTo].join("/")
              : config.defaultLanguage
          }`,
          HttpStatus.TEMORARY_REDIRECTED,
        );
      }
      throw e;
    }
  };
}
