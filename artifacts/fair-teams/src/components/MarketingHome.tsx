import {
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  PackageOpen,
  Shuffle,
  Users,
} from "lucide-react";
import { useStripesTranslation } from "@/i18n";

export function MarketingHome() {
  const { t } = useStripesTranslation();
  return (
    <main className="min-h-[100dvh] bg-[#f7faf9] text-[#102A43]">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4 py-5">
          <a href="/" className="flex items-center gap-2.5" aria-label={t("public.homeAria")}>
            <img
              src="/stripes-logo-mark.png"
              alt=""
              className="h-10 w-10 object-contain"
            />
            <div>
              <div className="font-['Fredoka'] text-[22px] font-semibold leading-none tracking-tight">
                {t("common.brand.stripes")}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                {t("public.brand.tagline")}
              </div>
            </div>
          </a>

          <a
            href="/app"
            className="stripes-type-ui inline-flex h-10 items-center gap-2 rounded-2xl bg-[#102A43] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#173c5e]"
          >
            {t("public.openStripes")}
            <ArrowRight className="h-4 w-4" />
          </a>
        </header>

        <section className="grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-20 lg:pt-16">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-[11px] font-bold text-[#2f6f65] shadow-sm">
              {t("public.marketing.hero.badge")}
            </div>

            <h1 className="font-['Fredoka'] text-[44px] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-[58px] lg:text-[70px]">
              {t("public.marketing.hero.titleLine1")}
              <br />
              {t("public.marketing.hero.titleLine2")}
            </h1>

            <p className="mt-6 max-w-xl text-[17px] font-medium leading-relaxed text-slate-600 sm:text-[19px]">
              {t("public.marketing.hero.body")}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/app"
                className="stripes-type-ui inline-flex h-12 items-center gap-2 rounded-2xl bg-[#102A43] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#173c5e]"
              >
                {t("public.openStripes")}
                <ArrowRight className="h-4 w-4" />
              </a>
              <span className="text-xs font-semibold text-slate-400">
                {t("public.marketing.hero.browser")}
              </span>
            </div>
          </div>

          <HeroPreview />
        </section>

        <section className="border-t border-slate-200/80 py-20 lg:py-24">
          <SectionIntro
            eyebrow={t("public.marketing.roster.eyebrow")}
            title={t("public.marketing.roster.title")}
            body={t("public.marketing.roster.body")}
          />

          <div className="mt-10 grid gap-3 lg:grid-cols-3">
            <Step
              number="1"
              icon={<Users className="h-5 w-5" />}
              title={t("public.marketing.roster.step1.title")}
              body={t("public.marketing.roster.step1.body")}
            />
            <Step
              number="2"
              icon={<CalendarCheck2 className="h-5 w-5" />}
              title={t("public.marketing.roster.step2.title")}
              body={t("public.marketing.roster.step2.body")}
            />
            <Step
              number="3"
              icon={<Shuffle className="h-5 w-5" />}
              title={t("public.marketing.roster.step3.title")}
              body={t("public.marketing.roster.step3.body")}
            />
          </div>
        </section>

        <section className="grid gap-12 border-t border-slate-200/80 py-20 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-600">
              {t("public.marketing.club.eyebrow")}
            </div>
            <h2 className="mt-3 font-['Fredoka'] text-[34px] font-semibold leading-tight tracking-[-0.025em] sm:text-[42px]">
              {t("public.marketing.club.title")}
            </h2>
            <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-slate-600">
              {t("public.marketing.club.body")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ClubFeature
              icon={<CalendarCheck2 className="h-5 w-5" />}
              title={t("public.marketing.club.attendance.title")}
              body={t("public.marketing.club.attendance.body")}
            />
            <ClubFeature
              icon={<ClipboardList className="h-5 w-5" />}
              title={t("public.marketing.club.actionBoard.title")}
              body={t("public.marketing.club.actionBoard.body")}
            />
            <ClubFeature
              icon={<PackageOpen className="h-5 w-5" />}
              title={t("public.marketing.club.equipment.title")}
              body={t("public.marketing.club.equipment.body")}
            />
            <ClubFeature
              icon={<Users className="h-5 w-5" />}
              title={t("public.marketing.club.organizers.title")}
              body={t("public.marketing.club.organizers.body")}
            />
          </div>
        </section>

        <section className="border-t border-slate-200/80 py-20 lg:py-24">
          <SectionIntro
            eyebrow={t("public.marketing.inside.eyebrow")}
            title={t("public.marketing.inside.title")}
            body={t("public.marketing.inside.body")}
          />

          <div className="mt-10 grid gap-8">
            <ProductScreenshot
              eyebrow={t("public.marketing.inside.club.eyebrow")}
              title={t("public.marketing.inside.club.title")}
              body={t("public.marketing.inside.club.body")}
              src="/site/club-desktop.png"
              alt={t("public.marketing.inside.club.alt")}
            />

            <ProductScreenshot
              eyebrow={t("public.marketing.inside.actionBoard.eyebrow")}
              title={t("public.marketing.inside.actionBoard.title")}
              body={t("public.marketing.inside.actionBoard.body")}
              src="/site/action-board-desktop.png"
              alt={t("public.marketing.inside.actionBoard.alt")}
            />
          </div>
        </section>

        <section className="border-t border-slate-200/80 py-20 lg:py-24">
          <div className="rounded-[2rem] bg-[#102A43] px-6 py-8 text-white sm:px-9 sm:py-10 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:px-12">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.15em] text-emerald-200">
                {t("public.marketing.chat.eyebrow")}
              </div>
              <h2 className="mt-3 max-w-2xl font-['Fredoka'] text-[30px] font-semibold leading-tight sm:text-[38px]">
                {t("public.marketing.chat.title")}
              </h2>
              <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-slate-300 sm:text-base">
                {t("public.marketing.chat.body")}
              </p>
            </div>

            <a
              href="/app"
              className="mt-7 inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-[#102A43] lg:mt-0"
            >
              {t("public.marketing.chat.cta")}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="border-t border-slate-200/80 py-16 text-center">
          <h2 className="font-['Fredoka'] text-[32px] font-semibold tracking-tight sm:text-[40px]">
            {t("public.marketing.cta.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-relaxed text-slate-500 sm:text-base">
            {t("public.marketing.cta.body")}
          </p>
          <a
            href="/app"
            className="mt-7 inline-flex h-12 items-center gap-2 rounded-2xl bg-[#102A43] px-6 text-sm font-bold text-white"
          >
            {t("public.openStripes")}
            <ArrowRight className="h-4 w-4" />
          </a>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 py-6 text-[11px] font-medium text-slate-400">
          <span>{t("public.brand.footer")}</span>
          <div className="flex flex-wrap items-center gap-4">
            <span>{t("public.marketing.footer.meetup")}</span>
            <a href="/privacy" className="font-bold text-slate-500 hover:text-[#102A43]">
              {t("public.marketing.footer.privacy")}
            </a>
            <a href="/terms" className="font-bold text-slate-500 hover:text-[#102A43]">
              {t("public.marketing.footer.terms")}
            </a>
            <a href="/support" className="font-bold text-slate-500 hover:text-[#102A43]">
              {t("public.marketing.footer.support")}
            </a>
            <a href="/app" className="font-bold text-slate-600 hover:text-[#102A43]">
              {t("public.marketing.footer.openApp")}
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

function HeroPreview() {
  const { t } = useStripesTranslation();
  return (
    <div className="relative">
      <div className="absolute -left-8 -top-10 h-44 w-44 rounded-full bg-violet-100/65 blur-3xl" />
      <div className="absolute -bottom-10 -right-8 h-44 w-44 rounded-full bg-emerald-100/75 blur-3xl" />

      <div className="relative mx-auto w-fit rounded-[2.25rem] border border-white/90 bg-white/80 p-2.5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white">
          <img
            src="/site/teams-mobile.png"
            alt={t("public.marketing.preview.alt")}
            className="block h-auto w-full max-w-[17rem]"
          />
        </div>
      </div>

      <div className="relative mx-auto mt-4 max-w-sm text-center text-[11px] font-semibold leading-relaxed text-slate-400">
        {t("public.marketing.preview.caption")}
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
            className="block max-h-[380px] h-auto w-full scale-[1.03] object-contain"
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
