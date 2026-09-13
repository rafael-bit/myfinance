import type { ReactNode } from "react";

export function PageTitle({
  kicker,
  children,
  action,
}: {
  kicker?: string;
  children: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4 motion-fade-in">
      <div>
        {kicker ? <p className="kicker mb-2">{kicker}</p> : null}
        <h1 className="text-[2rem] font-medium leading-none tracking-tight md:text-[2.35rem]">{children}</h1>
      </div>
      {action}
    </div>
  );
}
