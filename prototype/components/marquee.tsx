import { cn } from "@/lib/utils";

export function Marquee({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex w-full overflow-hidden border-y border-ink", className)}>
      <div className="flex w-max animate-marquee items-center">
        {children}
        {children}
      </div>
    </div>
  );
}
