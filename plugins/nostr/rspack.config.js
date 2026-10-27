import path from "node:path";
import { fileURLToPath } from "node:url";
import { rspack } from "@rspack/core";
import {
  EmitPluginManifest,
  EveryPluginDevServer,
  FixMfDataUriPlugin,
} from "every-plugin/build/rspack";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const shouldDeploy = process.env.DEPLOY === "true";
const bosConfigPath = path.resolve(__dirname, "../../bos.config.json");

const baseConfig = {
  externals: [],
  devtool: shouldDeploy ? false : "source-map",
  plugins: [
    new EmitPluginManifest(),
    new rspack.DefinePlugin({
      "process.env.WS_NO_BUFFER_UTIL": JSON.stringify("1"),
      "process.env.WS_NO_UTF_8_VALIDATE": JSON.stringify("1"),
    }),
    new EveryPluginDevServer({ dts: false }),
    new FixMfDataUriPlugin(),
  ],
  infrastructureLogging: {
    level: "error",
  },
  stats: "errors-warnings",
};

export default baseConfig;
