import { log } from "@cargo/cargo/utils/logger";
import { RequestContext } from "@cargo/cargo/http/request";

export interface PluginTaskContext extends RequestContext {
  response?: Response;
}

export type BeforeRenderTask = (ctx: PluginTaskContext) => PluginTaskContext;

export interface AfterRenderTaskContext extends PluginTaskContext {
  pageHtml: string;
}

export type AfterRenderTask = (
  ctx: AfterRenderTaskContext,
) => AfterRenderTaskContext;

export interface PluginDefintions {
  scripts?: string[];
  entryPoints?: Record<string, string>;
  tasks?: {
    beforeRender?: BeforeRenderTask[];
    afterRender?: AfterRenderTask[];
  };
}

export type PluginContext = {
  assetsPath: string;
};

export interface Plugin {
  name: string;
  plugin(ctx: PluginContext): Promise<PluginDefintions> | PluginDefintions;
}

type PluginsConfig = {
  assetsPath: string;
  plugins?: Plugin[];
};
export async function plugins(
  config: PluginsConfig,
): Promise<PluginDefintions> {
  const scripts: PluginDefintions["scripts"] = [];
  let entryPoints: PluginDefintions["entryPoints"] = {};
  const beforeRender: BeforeRenderTask[] = [];
  const afterRender: AfterRenderTask[] = [];

  if (config.plugins?.length) {
    for (const plugin of config.plugins) {
      const pluginDefinition = await plugin.plugin({
        assetsPath: config.assetsPath,
      });
      if (pluginDefinition.scripts) {
        scripts.push(...pluginDefinition.scripts);
      }
      if (pluginDefinition.entryPoints) {
        entryPoints = { ...entryPoints, ...pluginDefinition.entryPoints };
      }
      if (pluginDefinition.tasks?.beforeRender?.length) {
        beforeRender.push(...pluginDefinition.tasks.beforeRender);
      }
      if (pluginDefinition.tasks?.afterRender?.length) {
        afterRender.push(...pluginDefinition.tasks.afterRender);
      }
      log("Plugin", `${plugin.name} loaded!`);
    }
  }
  return {
    scripts,
    entryPoints,
    tasks: {
      beforeRender,
      afterRender,
    },
  };
}
