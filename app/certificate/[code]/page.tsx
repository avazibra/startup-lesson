import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import type { Certificate } from "@/lib/types";

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

  return (
    <main className="certificate-page">
      <section className="certificate-document" aria-label="Verified certificate">
        <p className="eyebrow">Startup Fundamentals</p>
        <h1>Certificate of Completion</h1>
        <p className="certificate-lead">This certifies that</p>
        <strong className="certificate-name">{issuedCertificate.recipient_name}</strong>
        <p className="certificate-lead">successfully completed</p>
        <h2>{issuedCertificate.lesson_title}</h2>
        <p className="muted">Part of {issuedCertificate.course_title}</p>
        <div className="certificate-meta">
          <span>Issued {issuedDate}</span>
          <span>Verification code: {issuedCertificate.verification_code}</span>
        </div>
      </section>
      <Link className="tab active" href="/">
        Back to course
      </Link>
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
