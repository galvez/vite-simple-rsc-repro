import { ok } from 'node:assert'
import { createHash } from "node:crypto";
import path from "node:path";
import { type ResolvedConfig, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { transformDirectiveProxyExport, transformServerActionServer } from "@hiogawa/transforms";
import { parseAstAsync } from "vite";
import { createVirtualPlugin, vitePluginSilenceDirectiveBuildWarning } from "./src/shell/plugins.ts";

export default defineConfig({
  plugins: [
    react(),
    {
      configResolved(config) {
        manager.config = config;
      },
      configureServer(server) {
        globalThis.server = server
      }
    },
    vitePluginUseClient(),
    vitePluginSilenceDirectiveBuildWarning(),
    // vitePluginServerAction(),
    // vitePluginEntryBootstrap(),
    // vitePluginServerCss({ manager }),
    virtualNormalizeUrlPlugin()
  ],
  build: {
    minify: false
  },
  builder: {
    async buildApp(builder) {
      console.log('buildApp()')
      // pre-pass to collect all server/client references
      // by traversing server module graph and going over client boundary
      // TODO: this causes single plugin to be reused by two react-server builds
      manager.buildStep = "scan";
      await builder.build(builder.environments["rsc"]);
      manager.buildStep = undefined;

      await builder.build(builder.environments.rsc)
      await builder.build(builder.environments.client)
      await builder.build(builder.environments.ssr)
    },
  },
  environments: {
    client: {
      dev: {
        optimizeDeps: {
          // [feedback] no optimizeDeps.entries for initial scan?
          // entries: []
          include: [
            "react",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-dom",
            "react-dom/client",
            "react-server-dom-webpack/client.browser"
          ],
        },
      },
      build: {
        outDir: "dist/client",
        minify: false,
        sourcemap: true,
        manifest: true,
      },
    },
    ssr: {
      build: {
        outDir: "dist/server",
        sourcemap: true,
        ssr: true,
        emitAssets: true,
        manifest: true,
        rollupOptions: {
          input: {
            index: "/src/entry-server.jsx",
          },
        },
      },
    },
    rsc: {
      resolve: {
        conditions: ['react-server'],
        noExternal: true,
      },
      dev: {
        optimizeDeps: {
          include: [
            "react",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-server-dom-webpack/server",
            "react-server-dom-webpack/server.edge",
          ],
        },
      },
      build: {
        outDir: "dist/rsc",
        sourcemap: true,
        ssr: true,
        emitAssets: true,
        manifest: true,
        rollupOptions: {
          input: {
            index: "/src/react-server.js",
          },
        },
      },
    },
  },
})


if (!process.argv.includes('build')) {
  delete globalThis.__VITE_REACT_SERVER_MANAGER
}

class PluginStateManager {
  config!: ResolvedConfig;
  buildStep?: "scan";
  clientReferenceMap = new Map<string, string>();
  serverReferenceMap = new Map<string, string>();
}

const manager = (globalThis.__VITE_REACT_SERVER_MANAGER ??= new PluginStateManager())

function vitePluginUseClient() {
  /*
    [input]

      "use client"
      export function Counter() {}

    [output]

      import { registerClientReference as $$register } from "...runtime..."
      export const Counter = $$register("<id>", "Counter");

  */
  const transformPlugin = {
    name: vitePluginUseClient.name + ":transform",
    async transform(code, id, _options) {
      if (!['rsc'].includes(this.environment.name)) {
        return;
      }
      manager.clientReferenceMap.delete(id);
      if (code.includes("use client")) {
        const runtimeId = await normalizeReferenceId(id, "client");
        const ast = await parseAstAsync(code);
        let output = await transformDirectiveProxyExport(ast, {
          directive: "use client",
          id: runtimeId,
          runtime: "$$register",
        });
        if (output) {
          manager.clientReferenceMap.set(id, runtimeId);
          if (manager.buildStep === "scan") {
            return;
          }
          output.prepend(
            `import { $$register } from "/src/react-server.js";\nconsole.log($$register)\n`,
          );
          return { 
            code: output.toString(), 
            map: output.generateMap() };
        }
      }
      return;
    },
  };

  /*
    [output]

      export default {
        "<id>": () => import("<id>"),
        ...
      }

  */
  const virtualPlugin = createVirtualPlugin(
    "client-references",
    function () {
      console.log('this.environment?.name', this.environment?.name)
      ok(this.environment?.mode === "build");

      return [
        `export default {`,
        ...[...manager.clientReferenceMap.entries()].map(
          ([id, runtimeId]) => `"${runtimeId}": () => import("${id}"),\n`,
        ),
        `}`,
      ].join("\n");
    },
  );

  return [transformPlugin, virtualPlugin];
}

async function normalizeReferenceId(id, name: "client" | "rsc" | "ssr") {
  if (manager.config.command === "build") {
    return hashString(path.relative(manager.config.root, id));
  }

  // need to align with what Vite import analysis would rewrite
  // to avoid double modules on browser and ssr.
  const devEnv = globalThis.server.environments[name];
  const transformed = await devEnv.transformRequest(
    "virtual:normalize-url/" + encodeURIComponent(id),
  );
  ok(transformed);
  let runtimeId: string | undefined;
  switch (name) {
    case 'client': {
      const m = transformed.code.match(/import\("(.*)"\)/);
      runtimeId = m?.[1];
      break;
    }
    case 'ssr': {
      const m = transformed.code.match(/import\("(.*)"\)/);
      runtimeId = m?.[1];
      break;
    }
    case 'rsc': {
      // `dynamicDeps` is available for ssrTransform
      runtimeId = transformed.dynamicDeps?.[0];
      break;
    }
  }
  console.log({ runtimeId })
  ok(runtimeId);
  return runtimeId;
}

function virtualNormalizeUrlPlugin() {
  return {
    name: virtualNormalizeUrlPlugin.name,
    apply: "serve",
    resolveId(source, _importer, _options) {
      if (source.startsWith("virtual:normalize-url/")) {
        return "\0" + source;
      }
      return;
    },
    load(id, _options) {
      if (id.startsWith("\0virtual:normalize-url/")) {
        id = id.slice("\0virtual:normalize-url/".length);
        id = decodeURIComponent(id);
        return `export default () => import("${id}")`;
      }
      return;
    },
  };
}

export function hashString(v: string) {
  return createHash("sha256").update(v).digest().toString("hex");
}
