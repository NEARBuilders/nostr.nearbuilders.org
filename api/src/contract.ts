import "@orpc/openapi/extensions/route";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const contract = oc.router({
  ping: oc.route({ method: "GET", path: "/ping" }).output(
    z.object({
      status: z.literal("ok"),
      timestamp: z.iso.datetime(),
    }),
  ),
});

export type ContractType = typeof contract;
