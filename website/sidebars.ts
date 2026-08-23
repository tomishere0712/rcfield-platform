import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    {
      type: 'category',
      label: 'Business Spec',
      collapsible: false,
      items: [
        'spec/overview',
        'spec/domain-model',
        'spec/state-machine',
        'spec/payment-engine',
        'spec/inspection-flow',
        'spec/api-contracts',
        'spec/database',
        'spec/contest',
        'spec/universal-racing-network',
        {
          type: 'category',
          label: 'Business Rules',
          collapsed: true,
          items: [
            'spec/business-rules/BR-booking',
            'spec/business-rules/BR-payment',
            'spec/business-rules/BR-inspection',
            'spec/business-rules/BR-extension',
            'spec/business-rules/BR-fleet',
            'spec/business-rules/BR-fnb',
            'spec/business-rules/BR-dispute',
            'spec/business-rules/BR-promotions',
            'spec/business-rules/BR-contest',
            'spec/business-rules/BR-racing-network',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: [
        'architecture/system-overview',
        'architecture/booking-session',
        'architecture/ai-chat-rag',
        'architecture/contest',
        'architecture/RCField_ArchitectureOverview',
        'architecture/AI-Chat-RAG-ArchitectureOverview',
        {
          type: 'category',
          label: 'Diagrams',
          collapsed: true,
          items: [
            'architecture/diagrams/booking-data-flow',
            'architecture/diagrams/booking-lifecycle-flow',
            'architecture/diagrams/contest-lifecycle-flow',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Sequence Diagrams',
      collapsed: false,
      items: [
        'diagrams/sequence/sequence-flow-booking-lifecycle',
        'diagrams/sequence/sequence-flow-provider-onboarding-subscription',
        'diagrams/sequence/sequence-flow-rag-chat',
        'diagrams/sequence/sequence-flow-redis-usage',
        'diagrams/sequence/sequence-flow-contest-lifecycle',
        'diagrams/sequence/sequence-flow-contest-knockout',
        'diagrams/sequence/sequence-flow-contest-vehicle-operations',
      ],
    },
    {
      type: 'category',
      label: 'Activity Diagrams',
      collapsed: false,
      items: [
        'diagrams/activity/activity-flow-booking-full',
      ],
    },
    {
      type: 'category',
      label: 'Screen Flow Diagrams',
      collapsed: false,
      items: [
        'diagrams/screen-flow/admin-screen-flow',
      ],
    },
    {
      type: 'category',
      label: 'ERD',
      collapsed: false,
      items: [
        'diagrams/erd/operation-service-database-design',
      ],
    },
    {
      type: 'category',
      label: 'Developer Guides',
      collapsed: false,
      items: [
        'developer/system-knowledge-base',
        'developer/contribution-evidence',
        'developer/provider-subscription-enforcement',
        'developer/bank-transfer-demo-setup',
        {
          type: 'category',
          label: 'Contest Delivery',
          collapsed: true,
          items: [
            // Docusaurus strip tiền tố số khỏi tên file, nên id KHÔNG có '01-'.
            // Giữ tiền tố ở đây là sidebar trỏ vào id không tồn tại và cả site
            // không build được.
            'developer/contest-delivery/README',
            'developer/contest-delivery/roadmap-and-scope',
            'developer/contest-delivery/database-and-backend-rollout',
            'developer/contest-delivery/frontend-rollout',
            'developer/contest-delivery/testing-commit-and-release-checklist',
            'developer/contest-delivery/contest-current-backend-vs-requested-flow',
            'developer/contest-delivery/frontend-refactor-report',
            'developer/contest-delivery/contest-flow-audit',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'ADR',
      collapsed: true,
      items: [
        'adr/tenant-ui-model',
        'adr/backend-framework-express',
      ],
    },
  ],
};

export default sidebars;
