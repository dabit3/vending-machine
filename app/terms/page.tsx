import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { LegalSection } from "@/components/LegalPage";
import { APP_URL, getAppName } from "@/lib/app-name";

const UPDATED = "September 23, 2026";

export const metadata: Metadata = {
  title: `Terms of Service · ${getAppName()}`,
  description: `Terms of Service for ${getAppName()}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const name = getAppName();
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" updated={UPDATED}>
      <LegalSection title="1. What this service is">
        <p>
          {name} ({APP_URL}) lets event organizers distribute promotional
          credit codes to attendees. Attendees sign in, and if they are on an
          event&apos;s participant list, claim a code for that event. By using
          the service you agree to these terms.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility and accounts">
        <p>
          You must be at least 18 years old, or the age of majority where you
          live, to use the service. You sign in with a third-party account
          (such as Google or X). You are responsible for keeping that account
          secure and for everything done through it.
        </p>
      </LegalSection>

      <LegalSection title="3. Codes">
        <ul>
          <li>Codes are offered at the organizer&apos;s discretion, while supplies last, and may have an expiration date shown at claim time.</li>
          <li>Each eligible attendee may claim one code per event unless the organizer states otherwise.</li>
          <li>Codes have no cash value, may not be resold or transferred, and are subject to the terms of the product or service they are redeemed against.</li>
          <li>We may cancel or refuse codes obtained through fraud, automation, duplicate accounts, or in violation of these terms.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <p>
          Do not attempt to claim codes you are not eligible for, impersonate
          another person, interfere with the service, scrape it, or use it in
          violation of applicable law.
        </p>
      </LegalSection>

      <LegalSection title="5. Organizers">
        <p>
          Organizers are responsible for the participant information they
          upload and for having a lawful basis to share it with us. Organizers
          must not upload information about people who have not agreed to take
          part in their event.
        </p>
      </LegalSection>

      <LegalSection title="6. Disclaimers and liability">
        <p>
          The service is provided &quot;as is&quot; without warranties of any
          kind. To the fullest extent permitted by law, we are not liable for
          any indirect, incidental, or consequential damages, or for the value
          of any code, arising from your use of the service.
        </p>
      </LegalSection>

      <LegalSection title="7. Changes and termination">
        <p>
          We may update these terms or discontinue the service at any time.
          Material changes will be reflected by the date at the top of this
          page. Continued use after a change means you accept the new terms.
        </p>
      </LegalSection>

      <LegalSection title="8. Privacy">
        <p>
          How we handle your information is described in our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          Questions about these terms can be raised on the project&apos;s{" "}
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
