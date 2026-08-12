import { ArrowRight, CheckCircle2, ClipboardList, Shuffle, Users } from "lucide-react";

export function MarketingHome() {
  return (
    <main className="min-h-[100dvh] bg-[#f7faf9] text-[#102A43]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-5 pb-12 pt-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2.5" aria-label="Stripes home">
            <img
              src="/stripes-logo-mark.png"
              alt=""
              className="h-10 w-10 object-contain"
            />
            <div>
              <div className="font-['Fredoka'] text-[22px] font-semibold leading-none tracking-tight">
                Stripes
              </div>
              <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                Team generator and club organizer
              </div>
            </div>
          </a>

          <a
            href="/app"
            className="stripes-type-ui inline-flex h-10 items-center gap-2 rounded-2xl bg-[#102A43] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#173c5e]"
          >
            Open Stripes
            <ArrowRight className="h-4 w-4" />
          </a>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:py-20">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-[11px] font-bold text-[#2f6f65] shadow-sm">
              Built for recreational clubs
            </div>

            <h1 className="font-['Fredoka'] text-[42px] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-[56px] lg:text-[68px]">
              Fair teams.
              <br />
              Less organizer work.
            </h1>

            <p className="mt-6 max-w-xl text-[17px] font-medium leading-relaxed text-slate-600 sm:text-[19px]">
              Build balanced teams in under a minute, then keep the useful club
              stuff — attendance, decisions, equipment and follow-through — in one place.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/app"
                className="stripes-type-ui inline-flex h-12 items-center gap-2 rounded-2xl bg-[#102A43] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#173c5e]"
              >
                Open Stripes
                <ArrowRight className="h-4 w-4" />
              </a>
              <span className="text-xs font-semibold text-slate-400">
                Works in your browser
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-8 -top-10 h-40 w-40 rounded-full bg-violet-100/60 blur-3xl" />
            <div className="absolute -bottom-10 -right-8 h-40 w-40 rounded-full bg-emerald-100/70 blur-3xl" />

            <div className="relative grid gap-3 rounded-[2rem] border border-white/90 bg-white/80 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur sm:p-4">
              <FeatureCard
                icon={<Users className="h-5 w-5" />}
                title="Roster"
                body="Keep your players, ratings and club roster ready for the next game."
              />
              <FeatureCard
                icon={<Shuffle className="h-5 w-5" />}
                title="Teams"
                body="Choose who is playing and generate balanced teams quickly."
              />
              <FeatureCard
                icon={<ClipboardList className="h-5 w-5" />}
                title="Club"
                body="Remember attendance issues, make decisions, track equipment and get things done."
              />
            </div>
          </div>
        </section>

        <section className="grid gap-3 border-t border-slate-200/80 pt-8 sm:grid-cols-3">
          <Value
            title="Fast"
            body="Designed around the few minutes organizers actually have before a game."
          />
          <Value
            title="Shared"
            body="Club tools give organizers a common place for durable information."
          />
          <Value
            title="Not another group chat"
            body="Keep conversation in Signal or WhatsApp. Use Stripes for what chat handles poorly."
          />
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5 text-[11px] font-medium text-slate-400">
          <span>Stripes · Recreational sports organization</span>
          <a href="/app" className="font-bold text-slate-600 hover:text-[#102A43]">
            Open app →
          </a>
        </footer>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[1.45rem] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef6f3] text-[#2f6f65]">
        {icon}
      </div>
      <div>
        <div className="font-['Fredoka'] text-lg font-semibold">{title}</div>
        <p className="mt-0.5 text-sm font-medium leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  );
}

function Value({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-2.5 rounded-2xl px-1 py-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6f65]" />
      <div>
        <div className="text-sm font-bold text-[#102A43]">{title}</div>
        <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  );
}
