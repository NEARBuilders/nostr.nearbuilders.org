import type { NearNostrComment } from "./types";

export type OrphanPolicy = "promote" | "hide";
export type ThreadNode = NearNostrComment & { children: ThreadNode[] };

export function buildThreads(
  comments: NearNostrComment[],
  opts?: { orphans?: OrphanPolicy },
): ThreadNode[] {
  const orphans = opts?.orphans ?? "promote";
  const nodes = new Map<string, ThreadNode>(
    comments.map((c) => [c.eventId, { ...c, children: [] }]),
  );
  const roots: ThreadNode[] = [];
  const parentOf = new Map(comments.map((c) => [c.eventId, c.parentId]));

  // Relay events are untrusted: a self-parent or a parent cycle (A replies to
  // B replies to A) would recurse forever in the renderer. Attaching `child`
  // under `parent` is only safe when walking up from `parent` never reaches
  // `child`. Cyclic nodes fall through to the orphan branch below.
  const reaches = (from: string | undefined, target: string): boolean => {
    const seen = new Set<string>();
    let cur = from;
    while (cur) {
      if (cur === target) return true;
      if (seen.has(cur)) return false;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  };

  for (const comment of comments) {
    const node = nodes.get(comment.eventId)!;
    const pid = comment.parentId;
    if (pid && pid !== comment.eventId && nodes.has(pid) && !reaches(pid, comment.eventId)) {
      nodes.get(pid)!.children.push(node);
    } else if (pid) {
      if (orphans === "promote") roots.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (node: ThreadNode) => {
    node.children.sort((a, b) => a.createdAt - b.createdAt);
    for (const child of node.children) sortChildren(child);
  };

  roots.sort((a, b) => b.createdAt - a.createdAt);
  for (const root of roots) sortChildren(root);

  return roots;
}
