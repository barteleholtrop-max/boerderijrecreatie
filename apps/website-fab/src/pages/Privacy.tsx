// Privacybeleid: de tekst komt uit de backoffice (Marketing & website → Privacy · alle sites), via /api/public/v1/privacy.
// Elke site van Boer Bart toont hetzelfde beleid; hier staat geen eigen kopie (wens eigenaar 15 november 2026).
import { useEffect, useState } from "react";
import { Seo } from "../components/Seo";
import { site } from "../content/site";
import { paths } from "../routes";
import { loadPrivacy, policyDate, type Block, type PrivacyPolicy } from "../content/privacy";

const Blocks = ({ blocks }: { blocks: Block[] }) => <>{blocks.map((b, i) => (b.type === "kop" ? <h3 key={i}>{b.text}</h3> : <p key={i} style={{ whiteSpace: "pre-line" }}>{b.text}</p>))}</>;

export function Privacy() {
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { loadPrivacy().then(setPolicy).catch(() => setFailed(true)); }, []);
  const email = policy?.controller.email || site.email;
  return (
    <>
      <Seo page="privacy" title="Privacybeleid | Boer Bart" desc="Hoe Boer Bart omgaat met gegevens uit de website, WhatsApp, Messenger en Instagram: wat we bewaren, waarom, hoe lang en hoe je ze laat verwijderen." crumbs={[{ name: "Privacy", path: paths.privacy }]} />
      <section className="section section--top">
        <div className="wrap narrow prose">
          <p className="eyebrow">Privacy</p>
          <h1 className="h1">{policy?.title || "Privacybeleid"}</h1>
          {failed ? <p className="notice">Het privacybeleid is nu niet te laden. Probeer het straks nog eens, of mail je vraag naar <a href={`mailto:${email}`}>{email}</a>.</p>
            : !policy ? <p>Het privacybeleid wordt geladen…</p>
            : <>
              <Blocks blocks={policy.intro} />
              {policy.sections.map((s, i) => <div key={i}><h2 className="h3">{s.heading}</h2><Blocks blocks={s.blocks} /></div>)}
              {policyDate(policy.effectiveFrom) && <p className="small">Dit privacybeleid geldt vanaf {policyDate(policy.effectiveFrom)}.</p>}
            </>}
        </div>
      </section>
    </>
  );
}
