type PublicPage = "privacy" | "terms" | "support";

export function PublicInfoPage({ page }: { page: PublicPage }) {
  const content = {
    privacy: {
      eyebrow: "Privacy",
      title: "Privacy Policy",
      intro:
        "Stripes is designed to help recreational sports organizers build teams and manage shared club work without collecting more information than the service needs.",
    },
    terms: {
      eyebrow: "Terms",
      title: "Terms of Use",
      intro:
        "These terms describe the basic rules for using Stripes. They are written for a practical organizer tool rather than as a substitute for rights you may have under applicable law.",
    },
    support: {
      eyebrow: "Support",
      title: "How can we help?",
      intro:
        "Questions, problems, privacy requests, or feedback about Stripes can be sent directly to support.",
    },
  }[page];

  return (
    <main className="min-h-screen bg-[#fbfcfd] text-[#102A43]">
      <div className="mx-auto w-full max-w-4xl px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-slate-200/80 py-5">
          <a href="/" className="flex items-center gap-3">
            <div className="font-['Fredoka'] text-2xl font-semibold tracking-[-0.03em]">
              Stripes
            </div>
            <span className="hidden text-[11px] font-semibold text-slate-400 sm:inline">
              Team generator and club organizer
            </span>
          </a>

          <a
            href="/app"
            className="inline-flex h-9 items-center rounded-xl bg-[#102A43] px-4 text-xs font-bold text-white"
          >
            Open Stripes
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
              ← Stripes home
            </a>
            <a href="/privacy" className="hover:text-[#102A43]">
              Privacy
            </a>
            <a href="/terms" className="hover:text-[#102A43]">
              Terms
            </a>
            <a href="/support" className="hover:text-[#102A43]">
              Support
            </a>
          </div>
        </article>

        <footer className="border-t border-slate-200/80 py-6 text-[11px] font-medium text-slate-400">
          Stripes · Team generator and club organizer
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
  return (
    <>
      <p className="mb-7 text-xs font-semibold text-slate-400">
        Last updated: August 12, 2026
      </p>

      <Section title="What Stripes stores">
        <p>
          A local roster can be stored directly in your browser on your device.
          Shared club features can store roster, attendance, equipment, notes,
          ratings, decisions, actions, organizer access, and related account
          information using Firebase services.
        </p>
        <p>
          Organizers decide what member information they enter into Stripes and
          are responsible for using that information appropriately within their club.
        </p>
      </Section>

      <Section title="Accounts and shared club data">
        <p>
          Shared features use Firebase Authentication and Firebase/Firestore
          services so authorized organizers can access and update the same club
          information.
        </p>
        <p>
          We use this information to provide the features you request, maintain
          account access, synchronize shared data, protect the service, and respond
          to support requests.
        </p>
      </Section>

      <Section title="Google Drive and Google Sheets">
        <p>
          Connecting Google is optional. When you choose to connect Google Drive
          or Google Sheets, Stripes requests access only so it can perform
          user-initiated features such as creating, reading, backing up, sharing,
          importing, or updating Stripes roster files.
        </p>
        <p>
          Google user data is not sold or used for advertising. Stripes uses data
          received from Google APIs only to provide or improve the user-facing
          features you request, maintain security, comply with law, or when you
          explicitly authorize another use.
        </p>
        <p>
          Stripes&apos; use and transfer of information received from Google APIs
          adheres to the Google API Services User Data Policy, including the
          Limited Use requirements.
        </p>
      </Section>

      <Section title="Stripes Help and AI">
        <p>
          When you intentionally use an AI-powered Stripes Help feature, the
          information needed to answer that request may be sent to an AI service
          provider such as OpenAI. Do not put information into an AI request that
          you do not want processed for that request.
        </p>
      </Section>

      <Section title="Notifications">
        <p>
          When an organizer chooses to send a Stripes notification, information
          required to deliver that message, such as the recipient address and
          notification content, may be processed by email delivery providers such
          as Resend.
        </p>
      </Section>

      <Section title="Why information is processed">
        <p>
          Depending on the feature and circumstances, Stripes processes information
          because it is necessary to provide a service you requested, because you
          consented to an optional connection such as Google, because there is a
          legitimate interest in operating and securing the service, or because
          processing is required by law.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          Local roster information remains on the device until it is removed by the
          user, the browser storage is cleared, or the application removes it.
          Shared information is retained while it is needed to provide the relevant
          Stripes feature or until it is deleted, subject to necessary security,
          backup, and legal retention.
        </p>
        <p>
          Third-party service providers may also retain limited operational or
          security records according to their own applicable policies.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on applicable law, you may have rights to request access,
          correction, deletion, restriction, objection, or portability of personal
          information. You may also have the right to complain to your competent
          data protection supervisory authority.
        </p>
        <p>
          For a privacy request, email{" "}
          <a
            href="mailto:support@stripes.work"
            className="font-bold text-[#2f6f65] hover:underline"
          >
            support@stripes.work
          </a>
          .
        </p>
      </Section>

      <Section title="Changes">
        <p>
          This policy may be updated as Stripes changes. The current version will
          remain available at this page with its latest update date.
        </p>
      </Section>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <p className="mb-7 text-xs font-semibold text-slate-400">
        Last updated: August 12, 2026
      </p>

      <Section title="Using Stripes">
        <p>
          Stripes is a team-generation and club-organization tool for recreational
          sports. You may use it only in compliance with applicable law and these
          terms.
        </p>
      </Section>

      <Section title="Your club data">
        <p>
          You are responsible for information you add to Stripes and for having an
          appropriate reason or permission to use information about players,
          members, organizers, or other people.
        </p>
        <p>
          Do not use Stripes to store information that is unnecessary for organizing
          your recreational sports activities.
        </p>
      </Section>

      <Section title="Accounts and access">
        <p>
          You are responsible for keeping access to your account and connected
          services secure. Shared-organizer features are intended only for people
          who have been authorized to access the relevant club information.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>
          Some optional Stripes features depend on services provided by third
          parties, including Google, Firebase, OpenAI, and email delivery providers.
          Their availability and their own terms may affect those features.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          Stripes is under active development. Features may change, be interrupted,
          or occasionally contain errors. Important club decisions or records should
          not depend on Stripes being continuously available without an appropriate
          backup.
        </p>
      </Section>

      <Section title="Responsibility">
        <p>
          Stripes helps organizers make and record organizational decisions, but it
          does not make safety, disciplinary, medical, legal, or eligibility
          decisions for a club. Organizers remain responsible for those decisions.
        </p>
      </Section>

      <Section title="Applicable rights">
        <p>
          Nothing in these terms removes consumer, privacy, or other legal rights
          that cannot lawfully be excluded or limited.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          These terms may change as Stripes develops. Material changes will be
          reflected on this page.
        </p>
        <p>
          Questions can be sent to{" "}
          <a
            href="mailto:support@stripes.work"
            className="font-bold text-[#2f6f65] hover:underline"
          >
            support@stripes.work
          </a>
          .
        </p>
      </Section>
    </>
  );
}

function SupportContent() {
  return (
    <>
      <Section title="Email support">
        <p>
          Send questions or bug reports to{" "}
          <a
            href="mailto:support@stripes.work"
            className="font-bold text-[#2f6f65] hover:underline"
          >
            support@stripes.work
          </a>
          .
        </p>
        <p>
          For a technical problem, it helps to include what you were trying to do,
          what happened instead, and the device or browser you were using.
        </p>
      </Section>

      <Section title="Privacy requests">
        <p>
          You can use the same address for questions about your information or a
          request to access, correct, or delete personal information associated with
          Stripes. Putting “Privacy request” in the subject line will help identify it.
        </p>
      </Section>

      <Section title="Please don't send sensitive information">
        <p>
          Never send passwords, authentication codes, or unnecessary sensitive
          information about club members in a support email.
        </p>
      </Section>

      <Section title="Meetup">
        <p>
          Meetup import is planned but is not currently an available Stripes
          integration. Any future connection will be optional and will require the
          organizer to authorize access.
        </p>
      </Section>
    </>
  );
}
