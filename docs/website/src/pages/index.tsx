import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <header className={`hero hero--primary ${styles.heroBanner}`}>
        <div className="container">
          <Heading as="h1" className="hero__title">
            RCField
          </Heading>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link className="button button--secondary button--lg" to="/docs/spec/overview">
              Đọc tài liệu →
            </Link>
            <Link className="button button--outline button--secondary button--lg" to="/specs/user-login/spec">
              Feature Specs →
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section style={{ padding: '3rem 0' }}>
          <div className="container">
            <div className="row">
              <Card
                title="Business Spec"
                to="/docs/spec/overview"
                description="Domain model, state machine, payment engine, inspection flow và API contracts."
              />
              <Card
                title="Architecture"
                to="/docs/architecture/system-overview"
                description="System overview, booking-session flow và architecture decision records."
              />
              <Card
                title="Sequence Diagrams"
                to="/docs/diagrams/sequence/sequence-flow-booking-lifecycle"
                description="Booking lifecycle, provider onboarding và các luồng hệ thống."
              />
              <Card
                title="Feature Specs"
                to="/specs/fb-messenger-channel/spec"
                description="4 feature specs với plan, data model, research và API contracts."
              />
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

function Card({ title, to, description }: { title: string; to: string; description: string }) {
  return (
    <div className="col col--3">
      <div className="card margin-bottom--md" style={{ height: '100%' }}>
        <div className="card__header">
          <Heading as="h3">{title}</Heading>
        </div>
        <div className="card__body">
          <p>{description}</p>
        </div>
        <div className="card__footer">
          <Link className="button button--primary button--block" to={to}>
            Xem →
          </Link>
        </div>
      </div>
    </div>
  );
}
