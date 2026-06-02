import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import type { Certificate } from "@/lib/types";
import { PrintButton } from "../print-button";

export const dynamic = "force-dynamic";

type CertificatePageProps = {
  params: Promise<{ code: string }>;
};

export default async function CertificatePage({ params }: CertificatePageProps) {
  const { code } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return <CertificateShell message="Certificate verification is not configured." />;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: certificate } = await supabase.from("certificates").select("*").eq("verification_code", code).maybeSingle();

  if (!certificate) {
    return <CertificateShell message="Certificate not found." />;
  }

  const issuedCertificate = certificate as Certificate;
  const issuedDate = new Date(issuedCertificate.issued_at).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const verificationUrl = `https://startup.unicorntech.uz/certificate/${issuedCertificate.verification_code}`;

  return (
    <main className="certificate-page">
      <section className="certificate-document" aria-label="Verified certificate">
        <div className="certificate-frame">
          <div className="certificate-brand-row">
            <div>
              <p className="eyebrow">UnicornTech</p>
              <strong>Startup Fundamentals</strong>
            </div>
            <span className="certificate-verified">Verified certificate</span>
          </div>

          <div className="certificate-main-copy">
            <p className="certificate-kicker">Certificate of Completion</p>
            <h1>{issuedCertificate.recipient_name}</h1>
            <p className="certificate-lead">has successfully completed</p>
            <h2>{issuedCertificate.lesson_title}</h2>
            <p className="muted">part of {issuedCertificate.course_title}</p>
          </div>

          <div className="certificate-signoff">
            <div>
              <span>Issued</span>
              <strong>{issuedDate}</strong>
            </div>
            <div>
              <span>Verification code</span>
              <strong>{issuedCertificate.verification_code}</strong>
            </div>
          </div>

          <div className="certificate-verification-box">
            <span>Verify this certificate at</span>
            <strong>{verificationUrl}</strong>
          </div>
        </div>
      </section>
      <div className="certificate-actions">
        <PrintButton />
        <Link className="tab active" href="/">
          Back to course
        </Link>
      </div>
    </main>
  );
}

function CertificateShell({ message }: { message: string }) {
  return (
    <main className="certificate-page">
      <section className="card card-pad">
        <h1>{message}</h1>
        <Link className="tab active" href="/">
          Back to course
        </Link>
      </section>
    </main>
  );
}
