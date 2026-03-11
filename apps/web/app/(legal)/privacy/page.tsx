import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Chat Automations",
  description:
    "Privacy Policy for Chat Automations - Learn how we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-invert prose-neutral max-w-none">
      <h1 className="mb-2 text-4xl font-bold text-white">Privacy Policy</h1>
      <p className="mb-8 text-neutral-400">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">1. Introduction</h2>
        <p className="text-neutral-300">
          Chat Automations Inc. ("we", "our", or "us") is committed to protecting your privacy. This
          Privacy Policy explains how we collect, use, disclose, and safeguard your information when
          you use our AI-powered chat automation platform (the "Service").
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">2. Information We Collect</h2>
        <h3 className="text-xl font-medium text-white">Personal Information</h3>
        <ul className="text-neutral-300">
          <li>Account information (name, email address, profile photo from Google OAuth)</li>
          <li>Chat messages and conversation history</li>
          <li>Integration data from connected services (Google Workspace, etc.)</li>
          <li>Usage analytics and interaction data</li>
        </ul>

        <h3 className="text-xl font-medium text-white">Automatically Collected Information</h3>
        <ul className="text-neutral-300">
          <li>Device information (browser type, operating system)</li>
          <li>IP address and location data</li>
          <li>Cookies and similar tracking technologies</li>
          <li>Log data and usage patterns</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">3. How We Use Your Information</h2>
        <p className="text-neutral-300">We use the collected information to:</p>
        <ul className="text-neutral-300">
          <li>Provide, maintain, and improve our Service</li>
          <li>Process your chat automation requests and AI interactions</li>
          <li>Communicate with you about updates, support, and promotional content</li>
          <li>Analyze usage to enhance user experience</li>
          <li>Ensure the security and integrity of our platform</li>
          <li>Comply with legal obligations</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">4. Third-Party Services</h2>
        <p className="text-neutral-300">
          Our Service integrates with third-party platforms including Google APIs. When you connect
          these services, we may access and store data from them according to your permissions.
          These third parties have their own privacy policies governing their use of your
          information.
        </p>
        <p className="mt-4 text-neutral-300">
          <strong>Google API Services User Data Policy:</strong> Our use of information received
          from Google APIs adheres to the Google API Services User Data Policy, including the
          Limited Use requirements.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">5. Data Security</h2>
        <p className="text-neutral-300">
          We implement industry-standard security measures including encryption, secure servers, and
          regular security audits. However, no method of transmission over the Internet is 100%
          secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">6. Data Retention</h2>
        <p className="text-neutral-300">
          We retain your personal information for as long as your account is active or as needed to
          provide services. You may request deletion of your account and associated data at any
          time.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">7. Your Rights</h2>
        <p className="text-neutral-300">Depending on your location, you may have the right to:</p>
        <ul className="text-neutral-300">
          <li>Access and receive a copy of your personal data</li>
          <li>Correct inaccurate personal data</li>
          <li>Delete your personal data</li>
          <li>Object to or restrict processing of your data</li>
          <li>Data portability</li>
          <li>Withdraw consent at any time</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">8. Children's Privacy</h2>
        <p className="text-neutral-300">
          Our Service is not intended for children under 13 (or 16 in certain jurisdictions). We do
          not knowingly collect personal information from children.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">9. Changes to This Policy</h2>
        <p className="text-neutral-300">
          We may update this Privacy Policy periodically. We will notify you of significant changes
          by posting the new policy on this page and updating the "Last updated" date.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold text-white">10. Contact Us</h2>
        <p className="text-neutral-300">
          If you have questions about this Privacy Policy, please contact us at:
        </p>
        <ul className="text-neutral-300">
          <li>Email: sayandeten@gmail.com</li>
          <li>Address: Kolkata, India</li>
        </ul>
      </section>
    </article>
  );
}
