import { Info } from "lucide-react";

export function IllustrativeDataNotice({ detail, className = "" }: { detail: string; className?: string }) {
  return (
    <div role="note" className={`flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3 text-[10px] leading-relaxed text-amber-100/80 ${className}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
      <p><b className="text-amber-200">Illustrative example data.</b> {detail}</p>
    </div>
  );
}
