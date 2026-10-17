// The UPlan mark: two oak leaves that form the "U", then "plan" in Chewy, stretched and leaned as the design
// draws it. A screen reader hears "UPlan" once: the picture and the visible letters are hidden, and the name is
// given as text. Server-safe: no state, no hooks.
export function Brand({ size = "md" }: { size?: "sm" | "md" }) {
  const isSmall = size === "sm";
  return (
    <span className="inline-flex items-end gap-1.5 text-cream">
      <img
        src="/brand/uplan-leaf.png"
        alt=""
        width={142}
        height={120}
        className={isSmall ? "h-[22px] w-auto" : "h-[30px] w-auto"}
      />
      <span
        aria-hidden="true"
        // The stretch doesn't widen the layout box, so the right margin makes room for the extra 30%.
        className={`-ml-0.5 mr-[0.6em] inline-block origin-bottom-left scale-x-[1.3] -skew-x-6 font-brand leading-none tracking-[1px] ${
          isSmall ? "text-lg" : "text-2xl"
        }`}
      >
        plan
      </span>
      <span className="sr-only">UPlan</span>
    </span>
  );
}
