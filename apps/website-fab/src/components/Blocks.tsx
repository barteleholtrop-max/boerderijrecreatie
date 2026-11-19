import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Picture } from "./Picture";
import { Icon } from "./Icon";
import { paths } from "../routes";

export function PageHero({ eyebrow, title, lead, photo, alt, children }: { eyebrow: string; title: string; lead: ReactNode; photo: string; alt: string; children?: ReactNode }) {
  return (
    <section className="phero">
      <div className="wrap phero__grid">
        <div className="phero__text">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="h1">{title}</h1>
          <div className="lead">{lead}</div>
          {children ? <div className="phero__cta">{children}</div> : null}
        </div>
        <div className="phero__photo arch">
          <Picture slug={photo} alt={alt} sizes="(min-width: 900px) 46vw, 100vw" priority />
        </div>
      </div>
    </section>
  );
}

export function Facts({ items }: { items: [string, string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([icon, label, value]) => (
        <div key={label} className="facts__item">
          <dt><Icon name={icon} />{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="checks">
      {items.map((i) => (
        <li key={i}><Icon name="check" />{i}</li>
      ))}
    </ul>
  );
}

export function CtaBand({ title, text, cta, href = `${paths.contact}#bezoek` }: { title: string; text: string; cta: string; href?: string }) {
  return (
    <section className="ctaband">
      <div className="wrap ctaband__inner">
        <div>
          <h2 className="h2">{title}</h2>
          <p className="lead">{text}</p>
        </div>
        <Link className="btn btn--light" to={href}>{cta}<Icon name="arrow" /></Link>
      </div>
    </section>
  );
}

export function Gallery({ items }: { items: [string, string][] }) {
  return (
    <div className="gallery">
      {items.map(([slug, alt]) => (
        <figure key={slug} className="gallery__item">
          <Picture slug={slug} alt={alt} sizes="(min-width: 900px) 33vw, 50vw" />
        </figure>
      ))}
    </div>
  );
}
