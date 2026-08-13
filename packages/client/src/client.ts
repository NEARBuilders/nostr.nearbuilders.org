import type { ContractType } from "@every-plugin/nostr/contract";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

export interface NostrClientOptions {
  apiKey?: string;
}

export function createNostrClient(baseUrl: string, options?: NostrClientOptions) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/rpc`;

  const headers: Record<string, string> = {};
  if (options?.apiKey) {
    headers["x-api-key"] = options.apiKey;
  }

  const link = new RPCLink({
    url,
    headers,
    fetch: (requestUrl, requestOptions) =>
      fetch(requestUrl, { ...requestOptions, credentials: "include" }),
  });

  return createORPCClient(link) as ContractRouterClient<ContractType>;
}
