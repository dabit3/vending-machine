import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { LegalSection } from "@/components/LegalPage";
import { APP_URL, getAppName } from "@/lib/app-name";

const UPDATED = "September 23, 2026";

export const metadata: Metadata = {
  title: `Privacy Policy · ${getAppName()}`,
  description: `Privacy Policy for ${getAppName()}.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const name = getAppName();
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" updated={UPDATED}>
      <LegalSection title="1. Overview">
        <p>
          This policy explains what {name} ({APP_URL}) collects, why, and how
          it is used. We collect only what is needed to check whether you are
          eligible for an event and to hand you a code.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <ul>
          <li>
            <strong>Sign-in details.</strong> When you sign in through a
            provider such as Google or X, our authentication provider (Clerk)
            shares your verified email address and, for X, your X username.
            We do not receive your password.
          </li>
          <li>
            <strong>Participant lists.</strong> Event organizers upload the
            email addresses or X handles of people eligible for their event.
          </li>
          <li>
            <strong>Claims.</strong> When you claim a code we record which code
            was issued to which account, and when.
          </li>
          <li>
            <strong>Technical data.</strong> Standard server logs such as IP
            address, browser type, and timestamps, used for security and to
            keep the service running.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use it">
        <ul>
          <li>To confirm you are on an event&apos;s participant list.</li>
          <li>To issue a code and show it back to you when you return.</li>
          <li>To prevent duplicate or fraudulent claims.</li>
          <li>To let organizers see which participants have claimed.</li>
        </ul>
        <p>We do not sell your information or use it for advertising.</p>
      </LegalSection>

      <LegalSection title="4. Who we share it with">
        <p>
          Your data is processed by the vendors that run the service: Clerk
          (authentication), Convex (database and backend), and Vercel
          (hosting). Organizers can see the claim status of participants on
          their own events. We may disclose information if required by law.
        </p>
      </LegalSection>

      <LegalSection title="5. Retention">
        <p>
          Participant lists and claim records are kept for as long as the
          event exists so organizers can manage it and you can retrieve your
          code. Organizers may remove participants at any time, and events can
          be deleted.
        </p>
      </LegalSection>

      <LegalSection title="6. Your choices">
        <p>
          You can disconnect {name} from your Google or X account at any time
          through that provider&apos;s settings. To have your information
          removed from an event, contact the organizer who invited you, or
          reach us via the link below.
        </p>
      </LegalSection>

      <LegalSection title="7. Cookies">
        <p>
          We use only the cookies needed to keep you signed in and to protect
          the service. There are no advertising or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes">
        <p>
          We may update this policy from time to time. Changes will be
          reflected by the date at the top of this page. Our{" "}
          <Link href="/terms">Terms of Service</Link> also apply.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          Privacy questions can be raised on the project&apos;s{" "}
          <a
            href="https://github.com/dabit3/vending-machine"
            target="_blank"
            rel="noreferrer"
          >
            GitHub repository
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
