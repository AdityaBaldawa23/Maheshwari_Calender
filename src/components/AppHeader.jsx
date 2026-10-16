/** Slim maroon masthead with a gold "toran" edge, like the top of a printed calendar. */
export function AppHeader() {
  return (
    <header className="safe-top shrink-0 bg-maroon text-white">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-1.5">
        <span aria-hidden="true" className="font-display text-xl leading-none text-gold-soft">
          ॐ
        </span>
        <h1 className="font-display text-lg leading-tight">सांगली जिल्हा माहेश्वरी युवा संगठन</h1>
      </div>
      <div className="toran" aria-hidden="true" />
    </header>
  );
}
