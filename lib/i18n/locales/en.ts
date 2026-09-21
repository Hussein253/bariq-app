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
    rights: '© {year} Bariq — Al-Mandoob Express Delivery',
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
