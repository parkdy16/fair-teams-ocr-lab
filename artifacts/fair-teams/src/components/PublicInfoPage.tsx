import { useStripesTranslation } from "@/i18n";

type PublicPage = "privacy" | "terms" | "support";

export function PublicInfoPage({ page }: { page: PublicPage }) {
  const { t } = useStripesTranslation();
  const content = {
    privacy: {
      eyebrow: t("public.info.privacy.eyebrow"),
      title: t("public.info.privacy.title"),
      intro: t("public.info.privacy.intro"),
    },
    terms: {
      eyebrow: t("public.info.terms.eyebrow"),
      title: t("public.info.terms.title"),
      intro: t("public.info.terms.intro"),
    },
    support: {
      eyebrow: t("public.info.support.eyebrow"),
      title: t("public.info.support.title"),
      intro: t("public.info.support.intro"),
    },
  }[page];

  return (
    <main className="min-h-screen bg-[#fbfcfd] text-[#102A43]">
      <div className="mx-auto w-full max-w-4xl px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-slate-200/80 py-5">
          <a href="/" className="flex items-center gap-3">
            <div className="font-['Fredoka'] text-2xl font-semibold tracking-[-0.03em]">
              {t("common.brand.stripes")}
            </div>
            <span className="hidden text-[11px] font-semibold text-slate-400 sm:inline">
              {t("public.brand.tagline")}
            </span>
          </a>

          <a
            href="/app"
            className="inline-flex h-9 items-center rounded-xl bg-[#102A43] px-4 text-xs font-bold text-white"
          >
            {t("public.openStripes")}
          </a>
        </header>

        <article className="py-14 sm:py-20">
          <div className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#2f6f65]">
            {content.eyebrow}
          </div>

          <h1 className="mt-3 font-['Fredoka'] text-[38px] font-semibold leading-tight tracking-[-0.03em] sm:text-[48px]">
            {content.title}
          </h1>

          <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-slate-600">
            {content.intro}
          </p>

          <div className="mt-10 rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-9">
            {page === "privacy" && <PrivacyContent />}
            {page === "terms" && <TermsContent />}
            {page === "support" && <SupportContent />}
          </div>

          <div className="mt-8 flex flex-wrap gap-4 text-xs font-bold text-slate-500">
            <a href="/" className="hover:text-[#102A43]">
              {t("public.info.home")}
            </a>
            <a href="/privacy" className="hover:text-[#102A43]">
              {t("public.info.privacy.eyebrow")}
            </a>
            <a href="/terms" className="hover:text-[#102A43]">
              {t("public.info.terms.eyebrow")}
            </a>
            <a href="/support" className="hover:text-[#102A43]">
              {t("public.info.support.eyebrow")}
            </a>
          </div>
        </article>

        <footer className="border-t border-slate-200/80 py-6 text-[11px] font-medium text-slate-400">
          {t("public.brand.footer")}
        </footer>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 py-6 first:pt-0 last:border-0 last:pb-0">
      <h2 className="font-['Fredoka'] text-xl font-semibold text-[#102A43]">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm font-medium leading-7 text-slate-600">
        {children}
      </div>
    </section>
  );
}

function PrivacyContent() {
  const { t } = useStripesTranslation();
  return (
    <>
      <p className="mb-7 text-xs font-semibold text-slate-400">
        {t("public.info.lastUpdated")}
      </p>

      <Section title={t("public.info.privacy.storage.title")}>
        <p>
          {t("public.info.privacy.storage.local")}
        </p>
        <p>
          {t("public.info.privacy.storage.organizers")}
        </p>
      </Section>

      <Section title={t("public.info.privacy.accounts.title")}>
        <p>
          {t("public.info.privacy.accounts.shared")}
        </p>
        <p>
          {t("public.info.privacy.accounts.use")}
        </p>
      </Section>

      <Section title={t("public.info.privacy.google.title")}>
        <p>
          {t("public.info.privacy.google.optional")}
        </p>
        <p>
          {t("public.info.privacy.google.use")}
        </p>
        <p>
          {t("public.info.privacy.google.policy")}
        </p>
      </Section>

      <Section title={t("public.info.privacy.ai.title")}>
        <p>
          {t("public.info.privacy.ai.body")}
        </p>
      </Section>

      <Section title={t("public.info.privacy.notifications.title")}>
        <p>
          {t("public.info.privacy.notifications.body")}
        </p>
      </Section>

      <Section title={t("public.info.privacy.processing.title")}>
        <p>
          {t("public.info.privacy.processing.body")}
        </p>
      </Section>

      <Section title={t("public.info.privacy.retention.title")}>
        <p>
          {t("public.info.privacy.retention.body")}
        </p>
        <p>
          {t("public.info.privacy.retention.providers")}
        </p>
      </Section>

      <Section title={t("public.info.privacy.rights.title")}>
        <p>
          {t("public.info.privacy.rights.body")}
        </p>
        <p>
          {t("public.info.privacy.rights.contact")}{" "}
          <a
            href="mailto:support@stripes.work"
            className="font-bold text-[#2f6f65] hover:underline"
          >
            {t("public.supportEmail")}
          </a>
          .
        </p>
      </Section>

      <Section title={t("public.info.privacy.changes.title")}>
        <p>
          {t("public.info.privacy.changes.body")}
        </p>
      </Section>
    </>
  );
}

function TermsContent() {
  const { t } = useStripesTranslation();
  return (
    <>
      <p className="mb-7 text-xs font-semibold text-slate-400">
        {t("public.info.lastUpdated")}
      </p>

      <Section title={t("public.info.terms.using.title")}>
        <p>
          {t("public.info.terms.using.body")}
        </p>
      </Section>

      <Section title={t("public.info.terms.data.title")}>
        <p>
          {t("public.info.terms.data.responsibility")}
        </p>
        <p>
          {t("public.info.terms.data.minimum")}
        </p>
      </Section>

      <Section title={t("public.info.terms.accounts.title")}>
        <p>
          {t("public.info.terms.accounts.body")}
        </p>
      </Section>

      <Section title={t("public.info.terms.providers.title")}>
        <p>
          {t("public.info.terms.providers.body")}
        </p>
      </Section>

      <Section title={t("public.info.terms.availability.title")}>
        <p>
          {t("public.info.terms.availability.body")}
        </p>
      </Section>

      <Section title={t("public.info.terms.responsibility.title")}>
        <p>
          {t("public.info.terms.responsibility.body")}
        </p>
      </Section>

      <Section title={t("public.info.terms.rights.title")}>
        <p>
          {t("public.info.terms.rights.body")}
        </p>
      </Section>

      <Section title={t("public.info.terms.changes.title")}>
        <p>
          {t("public.info.terms.changes.body")}
        </p>
        <p>
          {t("public.info.terms.changes.contact")}{" "}
          <a
            href="mailto:support@stripes.work"
            className="font-bold text-[#2f6f65] hover:underline"
          >
            {t("public.supportEmail")}
          </a>
          .
        </p>
      </Section>
    </>
  );
}

function SupportContent() {
  const { t } = useStripesTranslation();
  return (
    <>
      <Section title={t("public.info.support.email.title")}>
        <p>
          {t("public.info.support.email.contact")}{" "}
          <a
            href="mailto:support@stripes.work"
            className="font-bold text-[#2f6f65] hover:underline"
          >
            {t("public.supportEmail")}
          </a>
          .
        </p>
        <p>
          {t("public.info.support.email.details")}
        </p>
      </Section>

      <Section title={t("public.info.support.privacy.title")}>
        <p>
          {t("public.info.support.privacy.body")}
        </p>
      </Section>

      <Section title={t("public.info.support.sensitive.title")}>
        <p>
          {t("public.info.support.sensitive.body")}
        </p>
      </Section>

      <Section title={t("public.info.support.meetup.title")}>
        <p>
          {t("public.info.support.meetup.body")}
        </p>
      </Section>
    </>
  );
}
