/**
 * English dictionary.
 * ===================
 * English is the only left-to-right locale in the platform, so it is also the
 * one that exercises the layout mirroring: any component that hardcodes a
 * right-to-left assumption (a chevron pointing left, a value pinned to the
 * right) shows up here first. Test a layout change against `en` before
 * shipping it.
 */

import type { Dictionary } from './ar'
import { enApp } from './en.app'

export const en: Dictionary = {
  app: enApp,

  brand: {
    name: 'Bariq',
    latin: 'BARIQ PLATFORM',
    tagline: 'Automation and logistics platform',
  },

  ui: {
    language: 'Language',
    chooseLanguage: 'Choose interface language',
    darkMode: 'Dark mode',
    lightMode: 'Light mode',
    theme: 'Appearance',
  },

  nav: {
    about: 'About us',
    capabilities: 'Capabilities',
    audience: 'Who it is for',
    start: 'How to start',
    pricing: 'Pricing',
    faq: 'FAQ',
    enterPlatform: 'Enter platform',
  },

  hero: {
    badge: 'Built for social commerce in Iraq — from the message to the customer’s door',
    titleLead: 'Your direct messages really do sell —',
    titleAccent: 'and Bariq ships them too',
    subtitle:
      'An AI sales agent answers your customers on Instagram, Facebook and WhatsApp in the local dialect, takes orders and books appointments around the clock — then turns every confirmed order into a shipment with a tracking number and a ready-to-print label, without leaving the platform.',
    ctaPrimary: 'Start free now',
    ctaSecondary: 'See live conversations',
    note: 'Free forever plan · No credit card · Set up in {n} minutes',
    trust: [
      { label: 'Official Meta APIs', sub: 'Approved' },
      { label: 'Local dialect', sub: 'Replies in market language' },
      { label: 'ZainCash & Qi Card', sub: 'Local payment in IQD' },
      { label: 'Same-day delivery', sub: 'All governorates' },
    ],
  },

  problem: {
    eyebrow: 'The problem',
    title: 'Managing social messages is exhausting',
    body: 'Iraqi businesses receive hundreds of messages a day, and every enquiry you miss is a lost sale. Direct messages are not going away — they are becoming the real storefront.',
    cards: [
      {
        title: 'Lost opportunities',
        body: 'Price enquiries disappear into the notification stream, and the prospect moves to whichever competitor replied first.',
      },
      {
        title: 'Time drained',
        body: 'Hours spent answering the same questions by hand every day, instead of growing your business.',
      },
      {
        title: 'Orders typed twice',
        body: 'The order is taken in the chat and then re-entered into the shipping book — a duplicated step that breeds mistakes.',
      },
    ],
  },

  noApp: {
    eyebrow: 'A different view',
    title: 'Why build an e-commerce app when your direct messages already are the app?',
    body: 'You do not need an online store, and you do not need to ask customers to download anything. Bariq turns the conversations you already have on Instagram and Facebook into both a storefront and a back office — selling at the front, running the shipping behind it.',
    points: ['No app to build', 'No app for your customer to install', 'Just the chat they already use'],
  },

  about: {
    eyebrow: 'About us',
    title: 'From a chat message to a shipment, with no step repeated',
    body: 'Bariq was born inside Al-Mandoob Express Delivery — not a software team imagining how delivery ought to work from the outside, but a company that ships every day across every governorate of Iraq. We built it for ourselves first: to close the gap between a customer message on WhatsApp or Instagram and the shipment arriving at their door, without an order ever being re-typed or lost between the chat and the shipping log.',
    items: [
      {
        icon: 'truck',
        title: 'From a real delivery company',
        body: 'Shipment status rules and financial reconciliation come from our own daily operations — not a desk-bound guess at how delivery is supposed to work.',
      },
      {
        icon: 'activity',
        title: 'From message to settlement, one step',
        body: 'A confirmed order inside the chat becomes a shipment with a tracking number automatically, and its settlement is calculated with it — no manual copying between tools.',
      },
      {
        icon: 'radar',
        title: 'Our system status is public',
        body: 'We publish our database and live services’ status in real time on a public page — not a promise of reliability, but a number you can check yourself.',
      },
    ],
  },

  capabilities: {
    eyebrow: 'Capabilities',
    title: 'Everything you need to automate social commerce',
    exclusive: 'Only in Bariq',
    items: [
      {
        icon: 'brain',
        title: 'Knowledge Core',
        subtitle: 'Knowledge Core',
        body: 'The AI agent learns your products, services and policies, then answers every customer from your own knowledge base — never from guesswork.',
      },
      {
        icon: 'inbox',
        title: 'Unified Inbox',
        subtitle: 'Unified Inbox',
        body: 'WhatsApp, Instagram and Messenger on one screen. Every message lands where it belongs, and no enquiry is lost among notifications.',
      },
      {
        icon: 'clipboard',
        title: 'Smart Capture',
        subtitle: 'Smart Capture',
        body: 'Every order and appointment is written to the database the moment it is confirmed inside the chat — no retyping, no manual copying.',
      },
      {
        icon: 'truck',
        title: 'Logistics Bridge',
        subtitle: 'Logistics Bridge',
        body: 'What sets Bariq apart: an order confirmed in chat becomes a shipment with a tracking number and a thermal label ready to print, without leaving the platform.',
      },
      {
        icon: 'ticket',
        title: 'Instant Rewards',
        subtitle: 'Instant Rewards',
        body: 'The customer applies a discount code inside the conversation; it is validated and deducted from the total immediately.',
      },
      {
        icon: 'mapPin',
        title: 'Live Profile',
        subtitle: 'Live Profile',
        body: 'Location, opening hours, delivery and return policies — your business details are available to the customer at any hour they ask.',
      },
      {
        icon: 'radar',
        title: 'Deal Radar',
        subtitle: 'Deal Radar',
        body: 'Wholesale requests, partnership and sponsorship offers are detected and flagged, so a deal worth following never drowns in daily messages.',
      },
      {
        icon: 'activity',
        title: 'Always-On',
        subtitle: 'Always-On',
        body: 'The platform runs around the clock — while you sleep, while you are busy, and when peak season doubles the load.',
      },
    ],
  },

  audience: {
    eyebrow: 'Who it is for',
    title: 'Is Bariq right for you?',
    body: 'Whether you sell products or services, run one page or a hundred — if your customers order through direct messages, Bariq was built for you.',
    items: [
      {
        icon: 'store',
        title: 'Instagram and Facebook shop owners',
        body: 'Whether you have just started selling or already run an established shop, Bariq covers both with the same setup.',
      },
      {
        icon: 'users',
        title: 'Social account managers',
        body: 'Managing pages on behalf of their owners? Every page gets its own independent AI agent with its own knowledge base.',
      },
      {
        icon: 'layers',
        title: 'Marketing agencies',
        body: 'Client messages outgrowing your team? Bariq handles those conversations at whatever scale you need.',
      },
      {
        icon: 'package',
        title: 'Merchants who ship daily',
        body: 'From the chat to the customer’s door: booking, label, courier, tracking, then precise financial settlement.',
      },
    ],
  },

  iraq: {
    eyebrow: 'The proof · Built for Iraq',
    title: 'We understand what doing business in Iraq takes',
    items: [
      {
        icon: 'shield',
        title: 'Your data is safe',
        body: 'Encrypted, with access governed by strict row-level policies — only your team sees your customers.',
      },
      {
        icon: 'languages',
        title: 'Arabic, Kurdish and English',
        body: 'A full interface in the language of your market and in the correct writing direction, with consistent numerals on every screen and every shipping label.',
      },
      {
        icon: 'card',
        title: 'Local payments',
        body: 'ZainCash, Qi Card and Mastercard, plus cash on delivery in every governorate.',
      },
      {
        icon: 'mapPin',
        title: 'Precise Iraqi addresses',
        body: 'A directory of {n} delivery areas that separates look-alike names across governorates before an address is locked in.',
      },
    ],
  },

  start: {
    eyebrow: 'How to start',
    title: 'Ready to work in {n} steps',
    note: 'From signing up to a working AI agent in about {n} minutes.',
    steps: [
      {
        title: 'Create your account',
        body: 'Sign up on the free Spark plan — no credit card, no time limit.',
      },
      {
        title: 'Build your knowledge base',
        body: 'Add your products, services, prices and policies so the AI agent answers accurately.',
      },
      {
        title: 'Connect your channels',
        body: 'Link an Instagram or Facebook business account through the official Meta API in two clicks.',
      },
      {
        title: 'Set the tone and go live',
        body: 'Choose the reply tone, switch the service on, and let Bariq take over conversations and shipping.',
      },
    ],
  },

  pricing: {
    eyebrow: 'Pricing · in Iraqi dinars',
    title: 'Simple, transparent pricing',
    subtitle: 'Start free on the Spark plan, and move up when your message volume is ready for the next step.',
    empty: 'No plan has been published yet.',
    loadError: 'Plans could not be loaded right now. Please try again shortly.',
    calc: {
      title: 'Not sure which plan fits?',
      hint: 'Tell us your daily volume and we will recommend the right plan.',
      dailyCustomers: 'New customers per day',
      messagesPerChat: 'Average messages per conversation',
      estimated: 'Estimated actions per month',
      recommended: 'Recommended plan',
    },
    badge: {
      recommended: 'Fits your volume',
      popular: 'Most popular',
    },
    price: {
      soon: 'Coming soon',
      soonHint: 'The price of this plan is being finalised',
      freeForever: 'Free forever',
      monthly: 'per month',
      currency: 'IQD',
    },
    cta: {
      free: 'Start free',
      start: 'Get started',
    },
    specs: {
      social: '{social} social accounts (up to {agents} AI agents)',
      actions: '{actions} actions per month',
      catalogs: '{catalogs} product and service catalogues',
      products: '{products} products and services account-wide',
      orderBooks: '{orderBooks} order books',
      seats: '{seats} team seats',
      analyticsBasic: 'Basic analytics',
      analyticsAdvanced: 'Advanced analytics',
      supportPriority: 'Priority support',
      supportVip: 'Dedicated VIP support',
      api: 'Full API access',
    },
    notes: [
      'One action = one message the AI agent handles on your behalf.',
      'Products and services are a single allowance across your whole account; spread it across catalogues as you like. If you move to a smaller plan everything you added stays — only adding pauses until you are back under the limit.',
      'No contracts and no cancellation fees — pause your AI agent with one click whenever you want.',
    ],
  },

  faq: {
    eyebrow: 'Frequently asked',
    title: 'Straight answers before you connect your page',
    items: [
      {
        question: 'Does the AI agent speak the Iraqi dialect?',
        answer:
          'Yes. Replies are tuned to Iraqi market vocabulary and phrasing, with a polite professional tone that suits local e-commerce.',
      },
      {
        question: 'What happens when the AI agent does not know the answer?',
        answer:
          'It stops guessing and escalates the conversation to you immediately, tagged “escalated” in the unified inbox, so you see it at the top of the list and take over yourself.',
      },
      {
        question: 'Can I step into a conversation manually?',
        answer:
          'At any moment. Pausing the AI agent on a specific conversation takes one button; you continue the chat and re-enable it whenever you like.',
      },
      {
        question: 'Could my Instagram or Facebook account get restricted?',
        answer:
          'The connection runs through Meta’s official approved APIs (WhatsApp Cloud API, Messenger and Instagram Messaging) and within their policies — no unofficial automation and no access outside approved channels.',
      },
      {
        question: 'How does an order become a shipment?',
        answer:
          'When the order is confirmed in the chat it is created automatically in the order book with a tracking number and a thermal label, then moves through the shipment lifecycle to financial settlement with the merchant.',
      },
      {
        question: 'What counts as an “action”?',
        answer:
          'One action = one message the AI agent handles on your behalf. Messages you send yourself are not counted.',
      },
    ],
  },

  finalCta: {
    title: 'Ready to automate your sales and your shipping together?',
    body: 'Start on the free plan today and let conversations and shipments run themselves while you focus on growth.',
    cta: 'Start free — no credit card',
    note: 'Setup under {n} minutes · Cancel any time · Support around the clock',
  },

  footer: {
    brandLine: 'Bariq platform',
    admin: 'Owner console',
    workspace: 'Merchant workspace',
    operations: 'Operations console',
    support: 'Customer support',
    tracking: 'Shipment tracking',
    status: 'System status',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    rights: '© {year} Bariq — Al-Mandoob Express Delivery',
  },

  status: {
    metaTitle: 'System status | Bariq',
    title: 'System status',
    subtitle: 'Live updates on the health of the Bariq platform',
    overallOperational: 'All systems operational',
    overallDegraded: 'Some systems need attention',
    lastChecked: 'Last checked: {time}',
    backToPlatform: 'Back to the platform page',
    components: {
      api: 'API',
      dashboard: 'Merchant dashboard',
      database: 'Database',
      metaWebhooks: 'WhatsApp event intake (Meta)',
      aiBrain: 'Reply automation (n8n)',
    },
    states: {
      operational: 'Operational',
      down: 'Down',
      configured: 'Configured',
      not_configured: 'Not configured',
    },
    legendNote:
      'These checks are real and run on every visit. "Configured" means the path has its required secret or URL set — not that an external event actually reached it this instant: this app has no visibility inside Meta’s network or n8n’s workflow.',
  },

  legal: {
    eyebrow: 'Legal',
    documents: 'Legal documents',
    lastUpdated: 'Last updated',
    onThisPage: 'On this page',
    backToTop: 'Back to top',
    company: 'Al-Mandoob Express Delivery',
  },

  terms: {
    metaTitle: 'Terms of Service | Bariq',
    title: 'Terms of Service',
    intro:
      'Welcome to Bariq. These Terms of Service (“Terms”) govern your access to and use of the Bariq website, products and services (together, the “Platform”) operated by Bariq (“we” or “us”). By accessing or using the Platform, you agree to be bound by these Terms. If you do not agree, you must not use the Platform.',
    sections: [
      {
        id: 'use',
        title: 'Use of the Platform',
        body: [
          'You may use the Platform only if:',
          [
            'You are at least {age} years old or the age of majority in your jurisdiction.',
            'You have the legal capacity to enter into a binding agreement.',
            'You comply with all applicable laws and these Terms.',
          ],
          'You agree to use the Platform only for lawful business or educational purposes. You may not use it for:',
          [
            'Personal, malicious, illegal or exploitative purposes',
            'Activities that may harm individuals, businesses or society',
            'Reverse engineering the Platform, distilling its models or replicating any of its features — including using its outputs to train, fine-tune or benchmark a competing AI system — or using the Platform in ways it was not designed for',
          ],
        ],
      },
      {
        id: 'accounts',
        title: 'User accounts',
        body: [
          'Certain features require you to create an account. You are responsible for:',
          [
            'Keeping your login credentials confidential',
            'All activity that takes place under your account',
            'Notifying us immediately of any unauthorized access or breach',
          ],
          'We reserve the right to suspend or delete accounts for violations of these Terms, misuse or security risks.',
        ],
      },
      {
        id: 'ai-agents',
        title: 'AI agents and automation',
        body: [
          'Our Platform lets you create AI agents that automate communications, analytics or operations by integrating with services such as WhatsApp, Facebook, Instagram and internal tools. By using this functionality, you agree that:',
          [
            'You alone are responsible for the behavior and outputs of your AI agents.',
            'You will not create AI agents that produce harmful, false, discriminatory or illegal content.',
            'AI-generated content may not always be accurate and should be monitored by humans.',
          ],
          'We provide built-in oversight tools and safeguards to promote ethical use.',
        ],
      },
      {
        id: 'integrations',
        title: 'Third-party integrations',
        body: [
          'When you connect external services (such as Meta, WhatsApp, Facebook Messenger, Instagram and Supabase):',
          [
            'You grant us permission to access, store and process the relevant data within the scope of your authorization.',
            'You must comply with those third parties’ terms.',
            'Revoking access may affect the Platform’s functionality.',
          ],
          'We will never use your data beyond your explicit consent.',
        ],
      },
      {
        id: 'payments',
        title: 'Fees and payments',
        body: [
          [
            'Some features require a paid subscription. All prices and renewal terms are stated clearly before payment.',
            'Payments are collected in advance and are generally non-refundable unless required by law.',
            'Non-payment may result in account suspension.',
          ],
        ],
      },
      {
        id: 'intellectual-property',
        title: 'Intellectual property',
        body: [
          'The Platform’s technology, trademark and content are owned by Bariq or its licensors. You may not:',
          [
            'Reverse engineer, copy or resell any part of the Platform',
            'Use our trademark without written permission',
          ],
          'Your data, content and AI agent designs remain your property.',
        ],
      },
      {
        id: 'data',
        title: 'Data and privacy',
        body: [
          [
            'Use of the Platform is subject to our Privacy Policy, which describes how we handle your data.',
            'We apply strong security measures but cannot guarantee absolute protection.',
          ],
          'You grant Bariq the right to use conversation data from your account, in anonymized and aggregated form, to improve AI models and the service. Identifying details are removed first, and one business’s data is never disclosed to another. See the Privacy Policy for what this covers.',
        ],
      },
      {
        id: 'liability',
        title: 'Limitation of liability',
        body: [
          'To the maximum extent permitted by law, Bariq is not liable for:',
          [
            'Losses arising from the behavior of AI agents or third-party integrations',
            'Business interruption, loss of profits or loss of data',
            'Indirect or consequential damages',
          ],
          'The Platform is provided “as is”, without warranties of any kind.',
        ],
      },
      {
        id: 'termination',
        title: 'Termination',
        body: [
          'We may suspend or terminate your account if:',
          [
            'You violate these Terms',
            'You misuse AI in harmful or unethical ways',
            'We have reasonable cause to protect our Platform or other users',
          ],
          'You may close your account at any time. Your data will be handled in accordance with our retention policy.',
        ],
      },
      {
        id: 'changes',
        title: 'Changes',
        body: [
          'We may update these Terms from time to time and will notify you of material changes. Continuing to use the Platform after an update means you accept the revised Terms.',
        ],
      },
    ],
    contact: {
      title: 'Contact us',
      emailLine: 'Questions about these Terms? Email us at {email} and someone from our team will get back to you.',
      operator: 'These Terms are entered into with {company}, the company that operates the Bariq platform.',
    },
  },

  privacy: {
    metaTitle: 'Privacy Policy | Bariq',
    title: 'Privacy Policy',
    intro:
      'This Privacy Policy explains how Bariq (“we” or “us”) collects, uses, shares and protects personal data — whether you are a merchant using the Platform or a customer messaging a merchant who uses Bariq on WhatsApp, Instagram or Messenger. Read it together with the Terms of Service.',
    sections: [
      {
        id: 'scope',
        title: 'Scope of this policy',
        body: [
          'This policy applies to:',
          [
            'Merchants and members of their teams who have accounts on the Platform.',
            'Merchants’ customers who message them through channels connected to the Platform, or whose orders and shipments are recorded in it.',
            'Visitors to the Platform’s public pages.',
          ],
          'Merchants collect their customers’ data to serve them, and we process it to provide the Platform’s services to the merchant and to deliver their shipments. We process merchants’ account data to manage their account and subscription and to provide the service.',
        ],
      },
      {
        id: 'merchant-data',
        title: 'Merchant and account data',
        body: [
          'When you create an account and use the Platform, we collect:',
          [
            'Account data: your email address and your role on the Platform. Your password is stored in encrypted form by our sign-in provider; we never store it as readable text.',
            'Business details: store name and phone number, plus what you add for your customers to see, such as address, working hours, map link, offers and delivery rules.',
            'Store content: products, prices, stock and discount codes, and your AI agents’ settings and instructions.',
            'Connected accounts: the channel type (WhatsApp, Instagram or Messenger), its identifier, display name and connection status.',
            'Subscription and settlement data: your plan, subscription status and period, and the balance owed to you from shipment settlements.',
            'Ad campaign data, if you use it: the budgets and results recorded for each campaign.',
          ],
          'We also keep contact details for business partners we work with, such as marketers and couriers, to organize our work with them and calculate commissions where they apply.',
        ],
      },
      {
        id: 'customer-data',
        title: 'Merchants’ customer data',
        body: [
          'When a customer messages a merchant through a channel connected to the Platform, or an order or shipment is recorded for them, we process:',
          [
            'Contact details: phone number and name as they appear in the conversation or the order, and the channel they used.',
            'Conversation content: messages exchanged between the customer and the AI agent, the merchant’s team or our team.',
            'Order details: products, quantities and prices, the address (governorate, district, nearest landmark and address details) and a contact phone number.',
            'Shipment details: the recipient’s name, phone and address, the cash-on-delivery amount and delivery fee, the shipment’s status and stages, and any reasons for postponement or return.',
            'Conversation state: whether the AI agent is replying or a person has taken over, and the times of the latest messages.',
          ],
          'This data reaches us from the channel the customer used, is entered by the merchant or their team, or is sent by the merchant’s own system through our API.',
        ],
      },
      {
        id: 'cookies',
        title: 'Technical data and cookies',
        body: [
          'We only use cookies that are necessary to run the Platform:',
          [
            'Session cookies: keep you signed in, and end when you sign out or the session expires.',
            'Language cookie (bariq_locale): remembers the interface language you chose, for one year.',
            'Theme cookie (bariq_theme): remembers the light or dark appearance for one year; a copy is also kept in your browser as a fallback.',
          ],
          'We do not use advertising cookies, or third-party tracking or analytics tools.',
          'We process your IP address temporarily in server memory to limit repeated sign-in attempts, without storing it in our database. Our hosting provider may log technical request data, such as IP address and the page requested, for security and operations.',
        ],
      },
      {
        id: 'use',
        title: 'How we use data',
        body: [
          'We use data to:',
          [
            'Run the service: receive and reply to customer messages, record orders, and create, label, deliver and track shipments.',
            'Settle payments: calculate cash-on-delivery amounts, delivery fees and what merchants are owed.',
            'Provide customer service: authorized Bariq staff review conversations, orders and shipments to follow them up and resolve issues.',
            'Manage accounts and subscriptions and apply plan limits.',
            'Keep the Platform secure: protect accounts, limit repeated sign-in attempts, verify the source of data from connected systems, and investigate misuse.',
            'Send service messages, such as email confirmation and password-change links.',
            'Improve the Platform and AI models using anonymized, aggregated conversation data, after identifying details are removed and without disclosing one merchant’s data to another, as set out in the Terms of Service.',
          ],
          'We do not sell personal data, and we do not use it for advertising.',
        ],
      },
      {
        id: 'ai',
        title: 'Automated AI replies',
        body: [
          'When a merchant activates an AI agent on a channel, customer messages are processed automatically to generate replies, record orders and apply discount codes. This runs through automation workflows that send the conversation text to AI model providers to generate the reply.',
          'Automated replies can be wrong, so the merchant or their team can switch off automated replies in any conversation and take it over themselves at any time.',
        ],
      },
      {
        id: 'sharing',
        title: 'Who we share data with',
        body: [
          'We share data only as far as needed to provide the service, with:',
          [
            'The merchant concerned: they see their own customers’ conversations, orders and shipments, and no other merchant’s data.',
            'Couriers: they receive the recipient’s name, phone and address to deliver the shipment.',
            'Meta platforms (WhatsApp, Instagram and Messenger): to receive and send messages through connected accounts, under Meta’s own policies.',
            'Technical service providers: Supabase for the database and sign-in, Vercel for hosting the Platform, n8n for automation workflows, and AI model providers to generate replies.',
            'Competent authorities: when the law requires it, or to protect our rights or users’ safety.',
          ],
          'Data may be processed on these providers’ servers outside Iraq.',
          'We do not collect or store bank card numbers; any electronic payment is processed directly by the payment provider.',
        ],
      },
      {
        id: 'retention',
        title: 'How long we keep data',
        body: [
          [
            'Account data and content: for as long as the account exists.',
            'Conversations, orders and shipments: for as long as they are needed to serve the merchant and follow up shipments.',
            'Shipment, settlement and ended-subscription records: longer, because they are financial records we need for accounting and legal obligations.',
            'The log of platform-owner access to merchant workspaces: kept even after an account is deleted, because it shows who viewed the store’s data and when.',
          ],
          'When you close your account, we delete your data or anonymize it within a reasonable period, except what we must keep as described above.',
        ],
      },
      {
        id: 'security',
        title: 'How we protect data',
        body: [
          [
            'The Platform is served over an encrypted connection (HTTPS), and data is stored with a database provider that encrypts it at rest.',
            'Each merchant sees only their own store’s data, and these restrictions are enforced in both the database and the server.',
            'Authorized Bariq staff access data only for customer service and operations, and every time the platform owner’s account opens a merchant workspace is logged: who opened it and when.',
            'Phone numbers are masked in the Platform’s server logs, and message text is not recorded in them.',
            'We verify the source of data arriving from connected systems, and we limit repeated sign-in attempts.',
          ],
          'Even so, no method of transmission or storage is completely secure, and we cannot guarantee absolute protection.',
        ],
      },
      {
        id: 'rights',
        title: 'Your rights',
        body: [
          'You have the right to:',
          [
            'Access your data and request a copy of it.',
            'Correct your data: merchants can edit most of their store data directly in their workspace, and request correction of the rest.',
            'Request deletion of your data, subject to what we must keep (see “How long we keep data”).',
            'Unlink your channels from the Platform at any time.',
            'For merchants: know when your workspace was opened from the platform owner’s account, and by whom.',
          ],
          'If you are a customer who messaged a merchant using Bariq, the merchant decides how the data in your conversation with them is used, so contact them first. You can also contact us, and we will help or pass your request on to the merchant.',
          'To exercise any of these rights, contact us through the last section of this page. We may ask for proof of identity before acting on a request.',
        ],
      },
      {
        id: 'deletion',
        title: 'Data deletion',
        body: [
          'To delete your data from Bariq:',
          [
            'Merchants: request deletion of your account and its data through the last section of this page, from the email registered on the account. We verify the request, then delete the data or anonymize it, except what we must keep.',
            'Connected Meta accounts: unlink the account from your Bariq workspace, or remove Bariq’s access in your Facebook or Instagram settings (Apps or Business integrations). Removing access stops our access to the account, but does not delete data stored before then unless you request deletion.',
            'Merchants’ customers: ask the merchant you messaged to delete it, or ask us directly.',
          ],
        ],
      },
      {
        id: 'changes',
        title: 'Changes',
        body: [
          'We may update this policy from time to time, and we update the “Last updated” date at the top of the page with each change. We will notify you of material changes, and continuing to use the Platform afterwards means you accept the revised policy.',
        ],
      },
    ],
    contact: {
      title: 'Contact us',
      emailLine: 'Questions or requests about your data? Email us at {email} and someone from our team will get back to you.',
      operator: 'The party responsible for processing data under this policy is {company}, the company that operates the Bariq platform.',
    },
  },

  session: {
    enterWorkspace: 'Go to your workspace',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    roles: {
      platform_owner: 'Platform owner',
      staff: 'Bariq staff',
      merchant: 'Merchant',
    },
  },

  login: {
    metaTitle: 'Sign in | Bariq',
    email: 'Email',
    password: 'Password',
    forgot: 'Forgot your password?',
    submit: 'Sign in',
    submitting: 'Checking…',
    noAccount: 'No account yet? Create one',
    signupNote:
      'Create your account with an email and a password you keep, and a new store opens automatically — no separate application form and no banking details.',
    backToPlatform: 'Back to the platform page',
    linkErrors: {
      no_profile: 'Your account is not linked to a role yet — contact the platform owner',
      expired_link: 'This link has expired or was already used. Request a new one.',
      missing_code: 'This link is incomplete. Request a new password-change link.',
    },
    errors: {
      missingFields: 'Email and password are required',
      credentials: 'Email or password is incorrect',
      tooMany: 'Too many attempts. Wait {n} minutes and try again.',
    },
  },

  signup: {
    submit: 'Create account',
    submitting: 'Creating…',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least eight characters',
    confirm: 'Confirm password',
    haveAccount: 'Already have an account? Sign in',
    errors: {
      invalidEmail: 'Enter a valid email address',
      shortPassword: 'Password must be at least {n} characters',
      mismatch: 'The two passwords do not match',
      tooMany: 'Too many attempts. Wait {n} minutes and try again.',
      emailTaken: 'This email already has an account — sign in, or request a password change if you forgot it.',
      failed: 'The account could not be created. Try another password or retry shortly.',
      awaitingConfirmation:
        'Your account was created and only email confirmation is left. Open the message we sent, click the link, then sign in.',
    },
  },

  onboarding: {
    metaTitle: 'Finish store setup | Bariq',
    title: 'One last step',
    subtitle: 'Your account is created. Tell us your store name and we will set up your workspace',
    forAccount: 'For account',
    storeName: 'Your store name',
    optional: '(optional)',
    storeNamePlaceholder: 'e.g. Baghdad Style',
    storeNameHint:
      'This name appears to your customers in bot replies and on shipping labels — leave it as is and change it later from your store settings.',
    storePrefix: '{name} Store',
    submit: 'Go to your workspace',
    submitting: 'Creating…',
    planNote: 'You start on the Spark plan, free forever. No payment card needed now.',
    ownerFailedTitle: 'The owner account could not be prepared',
    errors: {
      verify: 'We could not verify your account — try again shortly',
      unexpectedState: 'Unexpected account state — contact the platform owner',
      ownerProvision: 'The owner account could not be completed',
      missingFreePlan: 'The free starter plan is not configured — contact the platform owner',
      merchantCreate: 'The store could not be created',
      subscription: 'The subscription could not be activated',
      profile: 'The account could not be completed',
    },
  },

  forgot: {
    metaTitle: 'Change password | Bariq',
    title: 'Change your password',
    subtitle: 'Enter your email and we will send you a link to choose a new password',
    email: 'Email',
    submit: 'Send the change link',
    submitting: 'Sending…',
    sentTitle: 'Check your email',
    sentBody:
      'If this email is registered on the platform, a message with a password-change link has been sent to it. The link is valid for a limited time and can be used once.',
    sentHint: 'Not there? Check your spam folder.',
    backToLogin: 'Back to sign in',
    errors: {
      invalidEmail: 'Enter a valid email address',
      tooMany: 'Too many attempts. Wait {n} minutes and try again.',
      rateLimited: 'Too many messages were requested in a short time. Wait a moment and try again.',
      service:
        'The link could not be sent right now — a temporary fault in our mail service, not in your inbox. Try again shortly.',
    },
  },

  reset: {
    metaTitle: 'New password | Bariq',
    title: 'New password',
    forAccount: 'For account',
    newPassword: 'New password',
    confirm: 'Repeat it to confirm',
    submit: 'Save password and sign in',
    submitting: 'Saving…',
    expiredTitle: 'This link is no longer valid',
    expiredBody:
      'Password-change links can be used once and expire after a short time. Request a new one.',
    requestNew: 'Request a new link',
    backToLogin: 'Back to sign in',
    errors: {
      shortPassword: 'Password must be at least {n} characters',
      mismatch: 'The two passwords do not match',
      expired: 'This link has expired. Request a new one from the password-change page.',
      failed: 'The password could not be changed. Try another one or request a new link.',
    },
  },
}
