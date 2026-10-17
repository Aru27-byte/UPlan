// The design's ambient backdrop behind every page: a faint gold grid that fades out downward and three soft
// glows in green, blue, and gold (globals.css, `.backdrop-*`). The glows drift slowly and stop for anyone who
// prefers reduced motion. Decorative: hidden from assistive technology and never in the way of a click.
// `className` positions it: "absolute" inside a page that scrolls with it, "fixed" behind the signed-in app.
export function Backdrop({ className }: { className: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none inset-0 -z-10 overflow-hidden ${className}`}>
      <div className="backdrop-grid absolute inset-x-0 top-0 h-[1100px] max-h-full" />
      <div className="backdrop-glow backdrop-glow-green" />
      <div className="backdrop-glow backdrop-glow-blue" />
      <div className="backdrop-glow backdrop-glow-gold" />
    </div>
  );
}
