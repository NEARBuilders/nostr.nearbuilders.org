/**
 * Rsbuild configuration with Module Federation for the UI remote.
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import { FixMfDataUriPlugin } from "every-plugin/build/rspack";
import { computeSriHashForUrl, reportDeployResult } from "everything-dev/integrity";
import { withZephyr } from "zephyr-rsbuild-plugin";
import pkg from "./package.json";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const normalizedName = pkg.name;
const shouldDeploy = process.env.DEPLOY === "true";
const buildTarget = process.env.BUILD_TARGET as "client" | "server" | undefined;
const isServerBuild = buildTarget === "server";

const resolvedConfigPath = path.resolve(__dirname, "../.bos/bos.resolved-config.json");
const bosConfigPath = path.resolve(__dirname, "../bos.config.json");
const bosConfig = fs.existsSync(resolvedConfigPath)
  ? (() => {
      const raw = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf8"));
      const { _resolved, ...data } = raw;
      return data;
    })()
  : JSON.parse(fs.readFileSync(bosConfigPath, "utf8"));

// Module Federation remotes this app consumes (#55). Kept out of bos.config.json: the bos
// config resolver only passes a fixed set of known top-level keys through to
// .bos/bos.resolved-config.json and silently drops anything else, so a custom "remotes" key
// there never survives resolution. Read straight off disk instead, the same way bosConfig is
// above. COMPONENTS_REMOTE_DEV_URL lets a developer override the "development" URL below —
// nearbuilders.org's own UI dev server defaults to the same port (3003) this app's UI dev
// server uses, so testing federation locally means running it with a PORT override, e.g.
// `PORT=3010 bun run dev:ui` from a nearbuilders.org checkout, matching the default here.
const remotesConfigPath = path.resolve(__dirname, "./remotes.config.json");
const remotesConfig = JSON.parse(fs.readFileSync(remotesConfigPath, "utf8")) as Record<
  string,
  {
    development: string;
    production: string;
    integrity: string;
    ssr: string | null;
    ssrIntegrity: string | null;
  }
>;
const componentsRemote = remotesConfig.components;
const componentsRemoteDevUrl =
  process.env.COMPONENTS_REMOTE_DEV_URL ?? componentsRemote.development;

function getInstalledVersion(pkgName: string, fallback: string): string {
  try {
    let currentDir = path.dirname(require.resolve(pkgName));
    for (let i = 0; i < 5; i += 1) {
      const packageJsonPath = path.join(currentDir, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        return (JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version: string })
          .version;
      }
      currentDir = path.dirname(currentDir);
    }

    throw new Error(`Could not resolve installed version for ${pkgName}`);
  } catch {
    const match = fallback.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
    return match ? match[0] : fallback.replace(/^[\^~>=<\s]+/, "");
  }
}

const SHARE_DEFAULTS = {
  requiredVersion: false,
  singleton: true,
  strictVersion: false,
  eager: false,
  shareScope: "default",
} as const;

const uiSharedDeps = {
  react: { version: getInstalledVersion("react", pkg.dependencies.react), ...SHARE_DEFAULTS },
  "react-dom": {
    version: getInstalledVersion("react-dom", pkg.dependencies["react-dom"]),
    ...SHARE_DEFAULTS,
  },
  "@orpc/client": {
    version: getInstalledVersion("@orpc/client", pkg.dependencies["@orpc/client"]),
    ...SHARE_DEFAULTS,
  },
  "@orpc/contract": {
    version: getInstalledVersion("@orpc/contract", pkg.dependencies["@orpc/contract"]),
    ...SHARE_DEFAULTS,
  },
  "@tanstack/react-query": {
    version: getInstalledVersion(
      "@tanstack/react-query",
      pkg.dependencies["@tanstack/react-query"],
    ),
    ...SHARE_DEFAULTS,
  },
  "@tanstack/react-router": {
    version: getInstalledVersion(
      "@tanstack/react-router",
      pkg.dependencies["@tanstack/react-router"],
    ),
    ...SHARE_DEFAULTS,
  },
};

const uiBosConfigPath = path.resolve(__dirname, "../bos.config.json");
function createClientConfig() {
  const plugins = [
    pluginReact(),
    pluginModuleFederation({
      name: normalizedName,
      filename: "remoteEntry.js",
      dts: false,
      exposes: {
        "./Router": "./src/router.tsx",
        "./Hydrate": "./src/hydrate.tsx",
        "./components": "./src/components/index.ts",
        "./providers": "./src/providers/index.tsx",
        "./hooks": "./src/hooks/index.ts",
      },
      shared: uiSharedDeps,
    }),
  ];

  if (shouldDeploy) {
    plugins.push(
      withZephyr({
        hooks: {
          onDeployComplete: async (info) => {
            console.log("🚀 UI Client Deployed:", info.url);
            const integrity = await computeSriHashForUrl(info.url);
            reportDeployResult({
              url: info.url,
              integrity,
              bosConfigPath: uiBosConfigPath,
              urlField: "app.ui.production",
              integrityField: "app.ui.integrity",
            });
          },
        },
      }),
    );
  }

  return defineConfig({
    plugins,
    source: {
      entry: {
        index: "./src/hydrate.tsx",
      },
      define: {
        "import.meta.env.APP_NAME": JSON.stringify(bosConfig.domain),
        "import.meta.env.APP_ACCOUNT": JSON.stringify(bosConfig.account),
        // Consumed by the loadRemote shim (#56) to call registerRemotes() at runtime — no
        // build-time `remotes` entry, per the citynode v2 pattern this ticket follows.
        "import.meta.env.COMPONENTS_REMOTE_DEV_URL": JSON.stringify(componentsRemoteDevUrl),
        "import.meta.env.COMPONENTS_REMOTE_PRODUCTION_URL": JSON.stringify(
          componentsRemote.production,
        ),
        // SRI hash of nearbuilders.org's current production remoteEntry.js (see
        // remotes.config.json for how it was computed). Passed by hydrate.tsx into
        // loadFederatedComponents(), which fetches and hashes the entry itself before
        // registerRemotes() — the MF runtime's registerRemotes() has no integrity option. Only
        // the production URL is pinned; the dev URL is a local, developer-controlled server and
        // stays unpinned.
        "import.meta.env.COMPONENTS_REMOTE_INTEGRITY": JSON.stringify(componentsRemote.integrity),
      },
    },
    resolve: {
      alias: {
        "@": "./src",
      },
    },
    dev: {
      lazyCompilation: false,
      progressBar: false,
      client: {
        overlay: false,
      },
    },
    server: {
      port: Number(process.env.PORT) || (isServerBuild ? 3004 : 3003),
      printUrls: ({ urls }) => urls.filter((url) => url.includes("localhost")),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
    tools: {
      rspack: (config) => {
        const { CssExtractRspackPlugin } = require("@rspack/core");
        const cssPlugin = config.plugins?.find((p) => p instanceof CssExtractRspackPlugin) as
          | { options?: Record<string, string> }
          | undefined;
        if (cssPlugin) {
          cssPlugin.options ??= {};
          cssPlugin.options.chunkFilename = "static/css/async/[name].[contenthash].css";
        }

        Object.assign(config, {
          target: "web",
          output: {
            ...(config.output ?? {}),
            uniqueName: normalizedName,
            chunkFilename: "static/js/async/[name].[contenthash].js",
          },
          resolve: {
            ...(config.resolve ?? {}),
            fallback: { bufferutil: false, "utf-8-validate": false },
          },
          infrastructureLogging: { level: "error" },
          stats: "errors-warnings",
          plugins: [
            ...(config.plugins ?? []),
            TanStackRouterRspack({ target: "react", autoCodeSplitting: true }),
            new FixMfDataUriPlugin(),
          ],
        });
      },
    },
    output: {
      distPath: { root: "dist", css: "static/css", js: "static/js" },
      assetPrefix: "auto",
      filename: { js: "[name].js", css: "style.css" },
      copy: [{ from: path.resolve(__dirname, "public"), to: "./" }],
    },
  });
}

function createServerConfig() {
  const plugins = [pluginReact()];

  plugins.push({
    name: "restore-manifest-public-path",
    setup(api) {
      api.onAfterBuild(() => {
        const manifestPath = path.resolve(__dirname, "dist/mf-manifest.json");
        if (!fs.existsSync(manifestPath)) return;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (manifest.metaData?.publicPath && manifest.metaData.publicPath !== "auto") {
          manifest.metaData.publicPath = "auto";
          fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        }
      });
    },
  });

  if (shouldDeploy) {
    plugins.push(
      withZephyr({
        snapshotType: "csr",
        hooks: {
          onDeployComplete: async (info) => {
            console.log("🚀 UI SSR Deployed:", info.url);
            const ssrEntryUrl = `${info.url.replace(/\/$/, "")}/remoteEntry.server.js`;
            const integrity = await computeSriHashForUrl(ssrEntryUrl, { resolveEntryUrl: false });
            reportDeployResult({
              url: info.url,
              integrity,
              bosConfigPath: uiBosConfigPath,
              urlField: "app.ui.ssr",
              integrityField: "app.ui.ssrIntegrity",
            });
          },
        },
      }),
    );
  }

  return defineConfig({
    plugins,
    source: {
      entry: {
        index: "./src/router.server.tsx",
      },
      define: {
        // Null today: nearbuilders.org#260 (SSR expose of components from its node build)
        // hasn't shipped, so there's no real SSR remote to point at yet (#55, #56).
        // loadFederatedComponents() no-ops on a null/undefined entry URL.
        "import.meta.env.COMPONENTS_REMOTE_SSR_URL": JSON.stringify(componentsRemote.ssr),
      },
    },
    resolve: {
      alias: {
        "@": "./src",
        "@tanstack/react-devtools": false,
        "@tanstack/react-router-devtools": false,
      },
    },
    server: {
      port: 3004,
      printUrls: ({ urls }) => urls.filter((url) => url.includes("localhost")),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
    tools: {
      rspack: {
        target: "async-node",
        output: {
          uniqueName: `${normalizedName}_server`,
          library: { type: "commonjs-module" },
        },
        resolve: {
          fallback: { bufferutil: false, "utf-8-validate": false },
        },
        externals: [/^node:/],
        infrastructureLogging: { level: "error" },
        stats: "errors-warnings",
        plugins: [
          TanStackRouterRspack({ target: "react", autoCodeSplitting: false }),
          new FixMfDataUriPlugin(),
          new ModuleFederationPlugin({
            name: normalizedName,
            filename: "remoteEntry.server.js",
            dts: false,
            runtimePlugins: [require.resolve("@module-federation/node/runtimePlugin")],
            library: { type: "commonjs-module" },
            exposes: { "./Router": "./src/router.server.tsx" },
            shared: uiSharedDeps,
          }),
        ],
      },
    },
    output: {
      distPath: { root: "dist" },
      assetPrefix: "/",
      cleanDistPath: false,
    },
  });
}

export default isServerBuild ? createServerConfig() : createClientConfig();
