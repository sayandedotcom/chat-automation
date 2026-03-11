import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Chat Automations",
  description:
    "Terms of Service for Chat Automations - The rules and guidelines for using our platform.",
};

export default function TermsOfServicePage() {
  return (
    <article className="prose prose-invert prose-neutral max-w-none">
      <h1 className="mb-2 text-4xl font-bold text-white">Terms of Service</h1>
      <p className="mb-8 text-neutral-400">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">1. Acceptance of Terms</h2>
        <p className="text-neutral-300">
          By accessing or using Chat Automations ("Service"), provided by Chat Automations Inc.
          ("Company", "we", "us", or "our"), you agree to be bound by these Terms of Service
          ("Terms"). If you disagree with any part of these terms, you may not access the Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">2. Description of Service</h2>
        <p className="text-neutral-300">
          Chat Automations is an AI-powered chat automation platform that helps businesses automate
          customer interactions, manage conversations, and integrate with various third-party
          services including Google Workspace applications.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">3. Account Registration</h2>
        <ul className="text-neutral-300">
          <li>You must be at least 18 years old to use this Service.</li>
          <li>
            You are responsible for maintaining the confidentiality of your account credentials.
          </li>
          <li>
            You agree to accept responsibility for all activities that occur under your account.
          </li>
          <li>You must provide accurate and complete information during registration.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">4. Acceptable Use</h2>
        <p className="text-neutral-300">You agree NOT to:</p>
        <ul className="text-neutral-300">
          <li>Use the Service for any unlawful purpose or in violation of any laws</li>
          <li>Transmit viruses, malware, or any malicious code</li>
          <li>Attempt to gain unauthorized access to any part of the Service</li>
          <li>Interfere with or disrupt the Service or servers</li>
          <li>Use the Service to send spam or unsolicited communications</li>
          <li>Reverse engineer, decompile, or disassemble the Service</li>
          <li>Use automated systems to access the Service without permission</li>
          <li>Infringe upon intellectual property rights of others</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">5. Third-Party Integrations</h2>
        <p className="text-neutral-300">
          The Service may integrate with third-party applications and services, including Google
          APIs. Your use of these integrations is subject to the respective terms of service and
          privacy policies of those third parties.
        </p>
        <p className="mt-4 text-neutral-300">
          <strong>Google API Services:</strong> Your use of Google API services through our platform
          is subject to the Google API Services User Data Policy, including the Limited Use
          requirements.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">6. Intellectual Property</h2>
        <p className="text-neutral-300">
          The Service and its original content, features, and functionality are owned by Chat
          Automations Inc. and are protected by international copyright, trademark, and other
          intellectual property laws. You retain ownership of content you create or upload to the
          Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">7. Subscription and Payments</h2>
        <ul className="text-neutral-300">
          <li>Some features may require a paid subscription.</li>
          <li>You agree to pay all fees associated with your account.</li>
          <li>All payments are non-refundable unless otherwise stated.</li>
          <li>We reserve the right to modify pricing with reasonable notice.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">8. Termination</h2>
        <p className="text-neutral-300">
          We may terminate or suspend your account and access to the Service immediately, without
          prior notice, for any reason, including breach of these Terms. Upon termination, your
          right to use the Service will immediately cease.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">9. Limitation of Liability</h2>
        <p className="text-neutral-300">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL CHAT AUTOMATIONS INC. BE LIABLE
          FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING
          WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">10. Disclaimer</h2>
        <p className="text-neutral-300">
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER
          EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
          OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">11. Indemnification</h2>
        <p className="text-neutral-300">
          You agree to indemnify and hold harmless Chat Automations Inc. and its officers,
          directors, employees, and agents from any claims, damages, or expenses arising from your
          use of the Service or violation of these Terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">12. Governing Law</h2>
        <p className="text-neutral-300">
          These Terms shall be governed by and construed in accordance with the laws of [Your
          Jurisdiction], without regard to its conflict of law provisions.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">13. Changes to Terms</h2>
        <p className="text-neutral-300">
          We reserve the right to modify these Terms at any time. We will notify users of material
          changes by posting the updated Terms on this page. Your continued use of the Service after
          changes constitutes acceptance of the new Terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">14. Contact Information</h2>
        <p className="text-neutral-300">
          For questions about these Terms of Service, please contact us at:
        </p>
        <ul className="text-neutral-300">
          <li>Email: legal@chatautomations.com</li>
          <li>Address: [Your Business Address]</li>
        </ul>
      </section>
    </article>
  );
}
