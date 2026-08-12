import {
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  PackageOpen,
  Shuffle,
  Users,
} from "lucide-react";

export function MarketingHome() {
  return (
    <main className="min-h-[100dvh] bg-[#f7faf9] text-[#102A43]">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4 py-5">
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

        <section className="grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-20 lg:pt-16">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-[11px] font-bold text-[#2f6f65] shadow-sm">
              Built for recreational sports organizers
            </div>

            <h1 className="font-['Fredoka'] text-[44px] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-[58px] lg:text-[70px]">
              Fair teams.
              <br />
              A better organized club.
            </h1>

            <p className="mt-6 max-w-xl text-[17px] font-medium leading-relaxed text-slate-600 sm:text-[19px]">
              Generate balanced teams in under a minute, then keep the useful
              organizer work — attendance, decisions, equipment and follow-through —
              together in one place.
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

          <HeroPreview />
        </section>

        <section className="border-t border-slate-200/80 py-20 lg:py-24">
          <SectionIntro
            eyebrow="From roster to game"
            title="Fair teams without the pre-game spreadsheet."
            body="Keep one roster, choose who is playing today, and let Stripes build balanced teams."
          />

          <div className="mt-10 grid gap-3 lg:grid-cols-3">
            <Step
              number="1"
              icon={<Users className="h-5 w-5" />}
              title="Keep your roster"
              body="Players, ratings and the information you actually need each week."
            />
            <Step
              number="2"
              icon={<CalendarCheck2 className="h-5 w-5" />}
              title="Choose today's players"
              body="Mark who is here and make the final adjustments before you start."
            />
            <Step
              number="3"
              icon={<Shuffle className="h-5 w-5" />}
              title="Generate teams"
              body="Create balanced teams quickly, then swap or adjust when real life gets in the way."
            />
          </div>
        </section>

        <section className="grid gap-12 border-t border-slate-200/80 py-20 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-600">
              Club organizer
            </div>
            <h2 className="mt-3 font-['Fredoka'] text-[34px] font-semibold leading-tight tracking-[-0.025em] sm:text-[42px]">
              The things organizers usually have to remember themselves.
            </h2>
            <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-slate-600">
              Stripes gives organizers a shared place for the information that gets
              lost between games, messages and different people.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ClubFeature
              icon={<CalendarCheck2 className="h-5 w-5" />}
              title="Attendance memory"
              body="Keep simple records of tardies, last-minute cancellations, no-shows and conduct issues."
            />
            <ClubFeature
              icon={<ClipboardList className="h-5 w-5" />}
              title="Action Board"
              body="Make decisions, assign follow-up and keep the outcome visible after the chat has moved on."
            />
            <ClubFeature
              icon={<PackageOpen className="h-5 w-5" />}
              title="Equipment"
              body="Know which bags, balls and other club gear you have — and who currently has them."
            />
            <ClubFeature
              icon={<Users className="h-5 w-5" />}
              title="Shared organizers"
              body="Give the people running the club access to the same working information."
            />
          </div>
        </section>

        <section className="border-t border-slate-200/80 py-20 lg:py-24">
          <SectionIntro
            eyebrow="Inside Stripes"
            title="One workflow from game day to club work."
            body="The team generator stays fast and focused, while the Club workspace gives organizers room for the things that need to last beyond one session."
          />

          <div className="mt-10 grid gap-8">
            <ProductScreenshot
              eyebrow="Club workspace"
              title="The organizer view."
              body="Player management, club access, decisions, notes, equipment and Help live together without turning Stripes into another chat app."
              src="/site/club-desktop.png"
              alt="Stripes Club organizer workspace on desktop"
            />

            <ProductScreenshot
              eyebrow="Action Board"
              title="Decisions that don't disappear in chat."
              body="Keep a topic visible from idea to decision to follow-through, with voting, ownership, due dates, links, comments and history when they are useful."
              src="/site/action-board-desktop.png"
              alt="Stripes Action Board with card details open on desktop"
            />
          </div>
        </section>

        <section className="border-t border-slate-200/80 py-20 lg:py-24">
          <div className="rounded-[2rem] bg-[#102A43] px-6 py-8 text-white sm:px-9 sm:py-10 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:px-12">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.15em] text-emerald-200">
                Keep your group chat
              </div>
              <h2 className="mt-3 max-w-2xl font-['Fredoka'] text-[30px] font-semibold leading-tight sm:text-[38px]">
                Stripes is not another place your club has to talk.
              </h2>
              <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-slate-300 sm:text-base">
                Signal, WhatsApp and other group chats are good at conversation.
                Stripes is for what chat handles poorly: durable decisions, ownership,
                attendance memory and club information you need to find again.
              </p>
            </div>

            <a
              href="/app"
              className="mt-7 inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-[#102A43] lg:mt-0"
            >
              Try Stripes
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="border-t border-slate-200/80 py-16 text-center">
          <h2 className="font-['Fredoka'] text-[32px] font-semibold tracking-tight sm:text-[40px]">
            Spend less time organizing the game.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-relaxed text-slate-500 sm:text-base">
            Keep the roster ready, build the teams, and give the organizers one place
            for the work that needs to survive beyond today.
          </p>
          <a
            href="/app"
            className="mt-7 inline-flex h-12 items-center gap-2 rounded-2xl bg-[#102A43] px-6 text-sm font-bold text-white"
          >
            Open Stripes
            <ArrowRight className="h-4 w-4" />
          </a>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 py-6 text-[11px] font-medium text-slate-400">
          <span>Stripes · Team generator and club organizer</span>
          <div className="flex items-center gap-4">
            <span>Meetup import planned</span>
            <a href="/app" className="font-bold text-slate-600 hover:text-[#102A43]">
              Open app →
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

function HeroPreview() {
  return (
    <div className="relative">
      <div className="absolute -left-8 -top-10 h-44 w-44 rounded-full bg-violet-100/65 blur-3xl" />
      <div className="absolute -bottom-10 -right-8 h-44 w-44 rounded-full bg-emerald-100/75 blur-3xl" />

      <div className="relative mx-auto w-fit rounded-[2.25rem] border border-white/90 bg-white/80 p-2.5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white">
          <img
            src="/site/teams-mobile.png"
            alt="Stripes generated teams on mobile"
            className="block h-auto w-full max-w-[17rem]"
          />
        </div>
      </div>

      <div className="relative mx-auto mt-4 max-w-sm text-center text-[11px] font-semibold leading-relaxed text-slate-400">
        Choose who is playing, generate balanced teams, then adjust when you need to.
      </div>
    </div>
  );
}

function ProductScreenshot({
  eyebrow,
  title,
  body,
  src,
  alt,
}: {
  eyebrow: string;
  title: string;
  body: string;
  src: string;
  alt: string;
}) {
  return (
    <article className="mx-auto w-full max-w-4xl overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(14rem,0.4fr)_minmax(0,0.6fr)] lg:items-center lg:gap-7 lg:p-6">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
            {eyebrow}
          </div>
          <h3 className="mt-2 font-['Fredoka'] text-[25px] font-semibold leading-tight tracking-[-0.02em] text-[#102A43] lg:text-[30px]">
            {title}
          </h3>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-500">
            {body}
          </p>
        </div>

        <figure className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-slate-50 shadow-sm">
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className="block max-h-[380px] h-auto w-full object-contain"
          />
        </figure>
      </div>
    </article>
  );
}

function SectionIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#2f6f65]">
        {eyebrow}
      </div>
      <h2 className="mt-3 font-['Fredoka'] text-[34px] font-semibold leading-tight tracking-[-0.025em] sm:text-[42px]">
        {title}
      </h2>
      <p className="mt-4 text-base font-medium leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

function Step({
  number,
  icon,
  title,
  body,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef6f3] text-[#2f6f65]">
          {icon}
        </div>
        <span className="font-['Fredoka'] text-2xl font-semibold text-slate-200">
          {number}
        </span>
      </div>
      <h3 className="mt-4 font-['Fredoka'] text-xl font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}

function ClubFeature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-violet-100/70 bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
        {icon}
      </div>
      <h3 className="mt-3 font-['Fredoka'] text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}
