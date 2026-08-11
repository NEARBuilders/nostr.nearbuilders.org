import { useRef, useEffect } from "react";

export type LogLine = { text: string; cls: string };

export function Log({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <pre ref={ref} className="log">
      {lines.map((l, i) => (
        <div key={i} className={l.cls}>{l.text}</div>
      ))}
    </pre>
  );
}
