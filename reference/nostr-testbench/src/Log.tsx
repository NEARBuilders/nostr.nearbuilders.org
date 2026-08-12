import { useEffect, useRef } from "react";

export type LogLine = { text: string; cls: string };

export function Log({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, []);

  return (
    <pre ref={ref} className="log">
      {lines.map((l, _i) => (
        <div key={l.text} className={l.cls}>
          {l.text}
        </div>
      ))}
    </pre>
  );
}
