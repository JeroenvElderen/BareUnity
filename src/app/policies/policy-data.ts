export const policyContact = {
  legalName: "BareUnity",
  domain: "BareUnity",
  email: "jeroen@bareunity.com",
} as const;

export type PolicyGroup = {
  id: string;
  eyebrow: string;
  title: string;
  body: string[];
  cards: string[];
};

export const policyGroups: PolicyGroup[] = [
  {
    id: "quick-summary",
    eyebrow: "Plain-language overview",
    title: "What BareUnity is — and is not",
    body: [
      "BareUnity is a private, adult-only naturist community built around consent, respect, safety, body acceptance, and non-sexualized naturist culture.",
      "Members can create profiles, share posts and gallery media, use discussion rooms and messages, discover naturist-friendly locations, and follow external links to venue-owned pages where available.",
      "BareUnity is not a hotel, resort, spa, tour operator, travel agent, payment processor, marketplace, booking agent, employment agency, escort service, dating service, medical provider, legal adviser, emergency service, or public authority.",
    ],
    cards: [
      "18+ only; age, identity, or community-fit verification may be required before full access.",
      "No sexual solicitation, exploitation, harassment, screenshots, reposts, doxxing, or non-consensual sharing.",
      "External venue links are informational only; all reservations and payments happen directly with third parties.",
      "These terms are designed to be protective, but a qualified lawyer should adapt them to your exact entity, location, and launch market.",
    ],
  },
  {
    id: "operator-details",
    eyebrow: "Operator & Legal Identity",
    title: "Who runs the service and how to contact BareUnity",
    body: [
      "The official legal name, trading name, and domain name for this service is BareUnity. All support, privacy, safety, copyright, accessibility, and legal contact should be sent to jeroen@bareunity.com unless a more specific in-product contact route is later published.",
      "If BareUnity later appoints a data protection officer, EU/UK representative, registered copyright agent, accessibility officer, or other statutory contact, BareUnity will add those details to this page and keep jeroen@bareunity.com available as the general contact route.",
      "If any law requires a country-specific notice, consumer notice, language version, cooling-off right, regulator details, or dispute-resolution route, BareUnity will add or provide that notice for the affected users where applicable.",
    ],
    cards: [
      "Official legal name/domain: BareUnity. Universal contact email: jeroen@bareunity.com.",
      "Keep an internal archive of every policy version and effective date.",
      "Use jeroen@bareunity.com for privacy, safety, copyright, accessibility, moderation, and legal requests.",
      "Do not rely on this template as a substitute for legal advice in your jurisdiction.",
    ],
  },
  {
    id: "eligibility",
    eyebrow: "Eligibility, Age & Verification",
    title: "Adult-only access and manual review",
    body: [
      "You must be at least 18 years old, legally able to enter a binding agreement, and legally allowed to access adult naturist community content in the place where you live and where you use BareUnity.",
      "BareUnity may require age checks, identity evidence, a consent quiz, human review, duplicate-account checks, sanctions checks, anti-fraud signals, or additional verification when safety, legal, or trust needs require it.",
      "If we learn or reasonably suspect that a user is underage, using false details, impersonating someone, evading enforcement, or creating risk, we may block registration, suspend access, preserve evidence, delete data where appropriate, and report serious issues to authorities.",
    ],
    cards: [
      "No minors may register, appear in nude or sexualized content, or be invited into private member spaces.",
      "Verification materials must be accurate, current, lawfully obtained, and belong to you.",
      "Approval is not guaranteed; BareUnity may refuse membership to protect the community.",
      "You must update information that becomes inaccurate or unsafe.",
    ],
  },
  {
    id: "privacy",
    eyebrow: "Privacy Policy",
    title: "Information we collect and why",
    body: [
      "We collect information you provide when registering, verifying your account, building your profile, posting content, messaging members, reporting safety issues, contacting support, changing settings, or otherwise using BareUnity.",
      "This may include name, display name, username, email, password/authentication data, date of birth or age confirmation, country, membership type, verification responses, identity-review materials, profile details, images, posts, comments, likes, friend requests, messages, reports, device/session data, approximate location signals, notification settings, and moderation history.",
      "We use this information to operate BareUnity, verify adult membership, protect member safety, personalize the community, prevent abuse, investigate reports, enforce policies, improve reliability, communicate service notices, defend legal claims, and comply with legal obligations.",
    ],
    cards: [
      "We do not knowingly allow children or teens to use BareUnity.",
      "We do not sell member personal information as a core business model.",
      "We limit access to sensitive verification data to review, trust, safety, fraud prevention, and legal purposes.",
      "We may process sensitive information where you provide it, where it is visibly included in content, or where needed for safety and legal compliance.",
    ],
  },
  {
    id: "lawful-bases",
    eyebrow: "Lawful Bases & Sensitive Data",
    title: "How privacy-law grounds may apply",
    body: [
      "Depending on your region, BareUnity may process personal information because it is needed to provide the service, because you consented, because we have legitimate interests in safety and platform operation, because processing is needed for legal claims, or because law requires it.",
      "Naturist-community content can reveal sensitive information such as body image, lifestyle, relationships, approximate location, or other private details. Only share what you are comfortable sharing with the intended audience and within the risk limits of an online community.",
      "Where explicit consent is required for sensitive processing, we will ask for it through registration, settings, posting flows, or other clear action. You may withdraw consent where applicable, but withdrawal may limit access or require account/content removal.",
    ],
    cards: [
      "Contract: account creation, authentication, profiles, messages, posts, and support.",
      "Legitimate interests: safety, moderation, fraud prevention, service security, diagnostics, and abuse prevention.",
      "Consent: optional profile details, certain sensitive disclosures, notifications, and marketing where required.",
      "Legal obligation/claims: court orders, regulatory requests, evidence preservation, and dispute handling.",
    ],
  },
  {
    id: "data-sharing",
    eyebrow: "Data Sharing & Processors",
    title: "When information may be disclosed",
    body: [
      "We may share information with vendors and processors that help provide hosting, authentication, database storage, email, security, analytics, moderation tooling, image processing, support, legal, accounting, and infrastructure services.",
      "We may disclose information to other members according to your actions and settings, to moderators and administrators for safety review, to third parties at your direction, to professional advisers, to law enforcement or regulators when appropriate, or to a successor if BareUnity is reorganized, sold, merged, or transferred.",
      "We do not authorize processors to use member information for their own unrelated purposes, and we expect them to apply appropriate confidentiality, security, and data-protection safeguards.",
    ],
    cards: [
      "Profile, post, comment, gallery, and message visibility depends on product settings and community context.",
      "Reports may disclose relevant content to moderators and, where necessary, affected parties or authorities.",
      "A business transfer may include account, content, and operational data subject to applicable law.",
      "External websites you visit from BareUnity process data under their own policies.",
    ],
  },
  {
    id: "retention-security",
    eyebrow: "Retention, Security & Breach Response",
    title: "How long data is kept and how it is protected",
    body: [
      "BareUnity keeps information for as long as needed to provide the service, maintain account history, comply with law, resolve disputes, enforce policies, preserve safety evidence, prevent repeat abuse, and maintain backups or audit records.",
      "Security controls may include authentication, access restrictions, encryption in transit, vendor safeguards, logging, moderation review, backups, and internal access limits. No online service can guarantee perfect security, so members must also protect their devices and credentials.",
      "If a security incident requires notice under applicable law, BareUnity will assess the incident, take reasonable containment steps, notify affected users or regulators where required, and document remediation.",
    ],
    cards: [
      "Deleted content may persist in backups, logs, reports, legal holds, or safety records for a limited period.",
      "Verification files should be retained only as long as necessary for review, fraud prevention, legal, or safety needs.",
      "Use strong passwords, passkeys/2FA where available, trusted devices, and private networks.",
      "Immediately report suspected account compromise or unauthorized access.",
    ],
  },
  {
    id: "international-transfers",
    eyebrow: "International Data Transfers",
    title: "Cross-border hosting and access",
    body: [
      "BareUnity, its operators, vendors, and infrastructure may process information in countries other than your own. Privacy laws in those countries may differ from the laws where you live.",
      "Where required, BareUnity should use appropriate safeguards for international transfers, such as contractual protections, transfer impact assessments, vendor due diligence, or other lawful mechanisms.",
      "By using a global online community, you understand that content and account data may be technically routed, stored, accessed, moderated, or supported across borders where lawful and operationally necessary.",
    ],
    cards: [
      "Do not post information that would create unacceptable risk if viewed from another jurisdiction.",
      "Some rights and remedies depend on your location and the operator’s establishment.",
      "Cross-border requests may be limited by identity verification, law, safety, and technical feasibility.",
      "Additional regional notices should be added if BareUnity targets specific countries.",
    ],
  },
  {
    id: "privacy-rights",
    eyebrow: "Privacy Rights",
    title: "Access, correction, deletion, portability, objection, and appeals",
    body: [
      "Depending on where you live, you may have rights to know what personal information we process, access a copy, correct inaccurate data, delete certain data, restrict or object to processing, receive portable data, withdraw consent, opt out of certain sharing, limit use of sensitive information, or appeal a privacy decision.",
      "Some requests may be limited when information must be kept for account security, fraud prevention, legal obligations, dispute resolution, safety investigations, freedom of expression, public-interest reasons, backups, or another lawful basis.",
      "To make a request, contact BareUnity support from the email connected to your account and describe the right you want to exercise. We may need to verify your identity and authority before acting on the request.",
    ],
    cards: [
      "California residents may have access, deletion, correction, opt-out, non-discrimination, and sensitive-information limitation rights where applicable.",
      "EU/UK-style rights may include access, rectification, erasure, restriction, portability, objection, complaint, and automated-decision rights.",
      "Authorized agents must provide proof of authority and identity verification where required.",
      "We will not discriminate against you for exercising valid privacy rights, but some rights may affect service availability.",
    ],
  },
  {
    id: "terms",
    eyebrow: "Terms & Conditions",
    title: "Your agreement with BareUnity",
    body: [
      "By creating an account, browsing public pages, or using BareUnity, you agree to these policies and any additional in-product rules shown during registration, posting, messaging, reporting, verification, or feature use.",
      "You must provide accurate information, keep your login credentials secure, use the service only for lawful personal community purposes, and respect naturist etiquette and member boundaries at all times.",
      "BareUnity may update, suspend, remove, or discontinue features; moderate content; restrict accounts; refuse access; or change eligibility requirements where needed for safety, legal compliance, platform integrity, business continuity, or community trust.",
    ],
    cards: [
      "You are responsible for content and interactions from your account.",
      "Community access is a privilege conditioned on respectful behavior and compliance with policy.",
      "If a provision cannot be enforced, the rest of the policies still apply.",
      "Conflicting in-product safety instructions or signed agreements may add to these baseline terms.",
    ],
  },
  {
    id: "account-security",
    eyebrow: "Account Security & Acceptable Use",
    title: "Rules for using the platform safely",
    body: [
      "You may not scrape, crawl, index, harvest, sell, rent, sublicense, reverse engineer, bypass security, probe systems, upload malware, overload infrastructure, interfere with service operation, or use BareUnity for spam, phishing, scams, fraud, illegal activity, or rights violations.",
      "You may not share accounts, sell usernames, create deceptive accounts, impersonate people or organizations, evade bans, hide your identity to cause harm, or use automated tools without written permission.",
      "You are responsible for keeping credentials, devices, email accounts, and recovery methods secure. Tell us immediately if you suspect unauthorized access or a compromised account.",
    ],
    cards: [
      "Do not test vulnerabilities without written authorization from BareUnity.",
      "Do not collect member data for marketing, profiling, AI training, surveillance, or off-platform contact lists.",
      "Do not use BareUnity to coordinate illegal gatherings, stalking, harassment, or exploitation.",
      "We may throttle, block, log, or investigate suspicious traffic and accounts.",
    ],
  },
  {
    id: "community",
    eyebrow: "Community & Conduct Policy",
    title: "Consent-first naturist standards",
    body: [
      "Naturism on BareUnity is non-sexual, respectful, and consent-centered. Nudity is not an invitation for sexual comments, image capture, private pressure, stalking, sexualized ratings, or boundary testing.",
      "Do not harass, threaten, shame, dox, impersonate, discriminate, exploit, manipulate, pressure, groom, blackmail, extort, or repeatedly contact someone after they ignore, decline, block, or report you.",
      "Do not post or request sexual services, explicit sexual content, fetish content, non-consensual intimate images, deepfakes, revenge content, child sexual abuse material, or anything involving minors in nudity, exploitation, or sexual contexts.",
    ],
    cards: [
      "Ask before moving a conversation to private, using someone’s image, or discussing sensitive topics.",
      "Respect ‘no’, silence, blocks, and changed boundaries immediately.",
      "Report unsafe behavior instead of escalating conflict publicly.",
      "Keep location and meetup details privacy-aware and safety-first.",
    ],
  },
  {
    id: "content",
    eyebrow: "User Content Policy",
    title: "Posting, licensing, ownership, and moderation",
    body: [
      "You keep ownership of content you create, subject to any rights you already granted elsewhere. By posting on BareUnity, you give BareUnity a worldwide, non-exclusive, royalty-free, sublicensable, transferable license to host, store, display, reproduce, process, resize, translate, moderate, analyze for safety, and technically distribute that content within or in connection with the service.",
      "Only upload content that you created, have permission to use, and are legally allowed to share. Do not upload private images of other people unless every identifiable person gave clear permission for that specific use and audience.",
      "BareUnity can remove, label, demote, restrict, preserve, or disable content that appears unsafe, unlawful, infringing, exploitative, spammy, misleading, privacy-invasive, low-quality, or inconsistent with naturist community standards.",
    ],
    cards: [
      "No screenshots, downloads, copying, reposting, AI training, or off-platform sharing of member media without explicit consent.",
      "No hidden-camera, voyeuristic, coerced, intoxicated, incapacitated, manipulated, or non-consensual material.",
      "No content that exposes private homes, documents, exact locations, contact details, workplaces, or family members without permission.",
      "Repeated or severe violations may permanently remove your content, access, and account.",
    ],
  },
  {
    id: "messages",
    eyebrow: "Messaging, Rooms & Notifications",
    title: "Private communication still has safety limits",
    body: [
      "BareUnity may provide direct messages, discussion rooms, video rooms, comments, notifications, and other social features. These tools are for respectful community communication, not sexual solicitation, pressure, harassment, illegal trade, spam, or commercial exploitation.",
      "Private messages are not a guarantee of absolute privacy. We may review message metadata, reports, flagged content, account signals, or content shared with moderators where needed for safety, legal compliance, or service integrity.",
      "Notifications are convenience features only. Delivery may be delayed, blocked, duplicated, or unavailable because of device settings, browser permissions, network issues, provider limits, or service changes.",
    ],
    cards: [
      "Do not send unsolicited nude requests, explicit images, sexual messages, or repeated unwanted contact.",
      "Do not record video rooms or redistribute room content without clear permission from everyone involved.",
      "Admins may remove unsafe rooms, messages, or participants without prior notice.",
      "Block, report, and disengage if a conversation becomes unsafe.",
    ],
  },
  {
    id: "safety",
    eyebrow: "Safety, Reports & Enforcement",
    title: "How reports and account actions work",
    body: [
      "Members can report profiles, posts, messages, media, map entries, or behavior that may violate policy. Reports may include context, lawful screenshots, timestamps, account identifiers, and relevant content references.",
      "Moderators may review reported content, account history, technical signals, previous enforcement, and safety risk. We may warn, hide content, limit features, request verification, suspend, ban, preserve records, notify affected users, or escalate to authorities where required or appropriate.",
      "Urgent safety decisions may be made before a full investigation. Members may contact support to ask for clarification or appeal an action unless doing so would create additional risk or compromise investigations.",
    ],
    cards: [
      "Immediate action may occur for child safety, non-consensual intimate imagery, credible threats, exploitation, or severe harassment.",
      "Zero tolerance for evading bans, retaliating against reporters, or coordinated harassment.",
      "Safety reports are confidential where possible, but legal or platform needs may require disclosure.",
      "False, malicious, misleading, or weaponized reports can also lead to enforcement.",
    ],
  },
  {
    id: "meetups",
    eyebrow: "Meetups, Travel & Personal Safety",
    title: "Offline decisions are your responsibility",
    body: [
      "BareUnity may help members discover people, discussions, and locations, but we do not verify every member’s identity, background, intentions, venue condition, local law, accessibility, or safety. Online trust signals are not guarantees.",
      "If you meet another member or visit a location, you are responsible for your own safety planning, transport, local-law compliance, emergency contacts, boundaries, insurance, health needs, and judgment.",
      "BareUnity is not responsible for offline interactions, injuries, property loss, venue disputes, travel disruption, weather, local enforcement, denied entry, personal incompatibility, or third-party conduct to the fullest extent allowed by law.",
    ],
    cards: [
      "Meet in safe, lawful, consent-based environments and tell a trusted person your plans.",
      "Never pressure anyone to meet, undress, be photographed, drink, travel, or share private details.",
      "Check local nudity, photography, alcohol, public-decency, and venue rules before attending.",
      "Use emergency services directly if there is immediate danger; BareUnity is not an emergency hotline.",
    ],
  },
  {
    id: "third-parties",
    eyebrow: "Third Parties, Locations & External Links",
    title: "Discovery links are not bookings or endorsements",
    body: [
      "BareUnity may display or link to naturist-friendly locations, stays, spas, activities, maps, websites, or venue-owned booking pages for discovery and informational purposes only.",
      "We do not own, operate, manage, inspect, insure, staff, endorse, guarantee, or control those venues. We do not process bookings, collect booking payments, confirm availability, set venue rules, hold deposits, issue refunds, handle cancellations, resolve damage claims, or provide customer service for third-party reservations.",
      "Before leaving BareUnity or making plans, review the third party’s policies, prices, accessibility, safety rules, age rules, cancellation terms, refund terms, privacy notices, insurance, licensing, and local laws directly with that provider.",
    ],
    cards: [
      "External links may change, break, become unsafe, or become inaccurate without notice.",
      "A listed location is not a promise of endorsement, safety, legality, quality, suitability, or availability.",
      "Bookings, payments, cancellations, refunds, chargebacks, deposits, damages, and disputes are between you and the external provider only.",
      "Report broken, unsafe, misleading, or inappropriate location links so we can review or remove them.",
    ],
  },
  {
    id: "payments-promotions",
    eyebrow: "Payments, Promotions & Commercial Activity",
    title: "Rules if paid features or promotions are introduced",
    body: [
      "If BareUnity later offers paid memberships, donations, premium features, sponsored placements, affiliate links, promotions, or merchandise, the applicable price, renewal, tax, cancellation, refund, and billing terms should be shown at the point of purchase.",
      "Unless a separate written agreement says otherwise, members may not sell goods or services, solicit money, promote adult services, recruit for commercial content, run giveaways, advertise venues, or use BareUnity for business outreach without written permission.",
      "Any sponsored content, affiliate relationship, gifted benefit, or material connection must be clearly disclosed by the person posting it and must not be deceptive, unsafe, illegal, or inconsistent with naturist values.",
    ],
    cards: [
      "BareUnity currently does not process third-party venue bookings or booking payments.",
      "Chargebacks, fraud, unpaid fees, or payment abuse may lead to account limits if paid features exist.",
      "Promotional claims must be truthful, substantiated, and clearly disclosed.",
      "We may remove commercial content that is spammy, undisclosed, unsafe, or not approved.",
    ],
  },
  {
    id: "cookies",
    eyebrow: "Cookie & Tracking Notice",
    title: "Sessions, local storage, and service technologies",
    body: [
      "BareUnity uses cookies, local storage, session storage, authentication tokens, cache keys, and similar technologies to keep you signed in, remember preferences, protect accounts, preload key routes, reduce load times, and maintain security.",
      "We may use essential analytics or diagnostic logs to understand crashes, abuse patterns, performance, fraud, and feature reliability. We do not design BareUnity around invasive behavioral advertising.",
      "You can clear browser storage or adjust browser settings, but doing so may sign you out, remove preferences, interrupt notifications, prevent trusted-device features, or reduce functionality.",
    ],
    cards: [
      "Essential storage: authentication, security, account state, CSRF/session protection, and anti-abuse.",
      "Preference storage: theme, trusted device, notification permission, and loading behavior.",
      "Performance storage: safe route/data cache for faster navigation.",
      "Compliance storage: cookie choices, consent records, and policy acceptance where required.",
    ],
  },
  {
    id: "ai-automation",
    eyebrow: "Automation, AI & Moderation Tools",
    title: "How automated systems may support safety",
    body: [
      "BareUnity may use automated or semi-automated tools to help detect spam, abuse, unsafe media, suspected underage activity, impersonation, duplicate accounts, malware, suspicious login patterns, or policy violations.",
      "Automated tools can make mistakes. Human review may be used for serious actions where practical, and members may contact support to request review unless doing so would create safety, security, or legal risk.",
      "You may not use BareUnity content, member data, images, messages, or profiles to train, fine-tune, benchmark, or operate AI systems, facial recognition, biometric databases, scraping tools, or surveillance systems without explicit written permission and all required consents.",
    ],
    cards: [
      "Safety classifiers are aids, not promises that all harmful content will be detected.",
      "We may hash, resize, scan, or compare media to protect members and enforce rules.",
      "Do not create deepfakes, synthetic intimate content, impersonations, or deceptive media.",
      "Do not automate follows, likes, messages, scraping, reporting, or account creation.",
    ],
  },
  {
    id: "ip-dmca",
    eyebrow: "Copyright, IP & DMCA-Style Notice",
    title: "Respect creative rights and report infringement",
    body: [
      "Do not upload content that infringes copyright, trademarks, publicity rights, privacy rights, database rights, contractual rights, or other intellectual-property rights. This includes copied photos, paywalled content, logos, articles, or images taken from another member or website without permission.",
      "Rights holders may send a notice identifying the protected work, the allegedly infringing BareUnity material, contact details, a good-faith statement, an accuracy statement, and a physical or electronic signature. The copyright and IP contact for BareUnity is jeroen@bareunity.com unless a formally registered agent is later published.",
      "Where appropriate, BareUnity may remove or disable access to disputed material, notify the uploader, accept a counter-notice, restore material when legally permitted, preserve evidence, and terminate repeat infringers.",
    ],
    cards: [
      "Include exact URLs, usernames, screenshots only if lawful, and ownership details in IP reports.",
      "Counter-notices should explain why the removal was mistaken and include required legal statements.",
      "False copyright claims can harm other members and may carry legal consequences.",
      "BareUnity trademarks, branding, UI, copy, and platform materials may not be copied or misused without permission.",
    ],
  },
  {
    id: "accessibility",
    eyebrow: "Accessibility & Availability",
    title: "Access needs, downtime, and service changes",
    body: [
      "BareUnity aims to provide an accessible and reliable service, but features may be unavailable because of maintenance, security incidents, vendor outages, network issues, browser/device limitations, legal restrictions, or product changes.",
      "If you encounter an accessibility barrier, contact support with the page, assistive technology, browser/device, and requested accommodation so we can review practical improvements.",
      "We may add, remove, restrict, rename, redesign, or discontinue features at any time. We are not liable for lost opportunities, reputational harm, unavailable content, or business interruption caused by changes or downtime to the fullest extent allowed by law.",
    ],
    cards: [
      "Do not rely on BareUnity as the only storage location for important personal content.",
      "Some features may require modern browsers, JavaScript, notifications, camera access, or stable internet.",
      "Security or legal issues may require immediate feature shutdown without notice.",
      "Accessibility feedback does not guarantee a specific fix or timeline, but it will help prioritize improvements.",
    ],
  },
  {
    id: "legal",
    eyebrow: "Legal Disclaimers, Indemnity & Liability",
    title: "Service limits and owner protections",
    body: [
      "BareUnity is provided as a community platform on an as-is and as-available basis. We work to keep the service safe and reliable, but we cannot promise uninterrupted access, error-free features, perfect moderation, complete data recovery, successful outcomes, or that every member is who they claim to be.",
      "To the fullest extent allowed by law, BareUnity disclaims implied warranties and limits liability for indirect, incidental, consequential, special, exemplary, punitive, reputational, emotional-distress, lost-profit, lost-data, travel, venue, or third-party damages, while preserving rights that cannot legally be waived.",
      "You agree to defend, indemnify, and hold harmless BareUnity, its operator, team members, contractors, vendors, and affiliates from claims, losses, liabilities, damages, costs, and expenses arising from your content, conduct, law violations, rights violations, misuse of the service, disputes with others, or breach of these policies, except where prohibited by law.",
    ],
    cards: [
      "Nothing here creates employment, partnership, agency, fiduciary, medical, travel-agent, venue-operator, or emergency-service duties.",
      "Some jurisdictions do not allow certain disclaimers or limits, so those limits apply only to the maximum lawful extent.",
      "If law requires a non-waivable warranty or remedy, that law controls only to the required extent.",
      "Headings are for convenience and do not limit the meaning of the policies.",
    ],
  },
  {
    id: "disputes",
    eyebrow: "Disputes, Governing Law & Termination",
    title: "How disagreements and account endings are handled",
    body: [
      "Before bringing a formal claim, you agree to contact BareUnity support and give us a reasonable opportunity to resolve the issue informally, unless urgent legal relief is required or local law gives you non-waivable rights.",
      "BareUnity will handle disputes through the contact route at jeroen@bareunity.com first. Any governing-law, venue, arbitration, class-action, consumer complaint, regulator, or country-specific dispute terms that are required or chosen for launch should be added here after legal review.",
      "You may stop using BareUnity at any time. BareUnity may suspend or terminate access, delete accounts, preserve records, or refuse future registration when needed for safety, legal compliance, non-payment, inactivity, fraud, abuse, or breach of policy.",
    ],
    cards: [
      "BareUnity will add jurisdiction-specific governing-law and venue wording after legal review if required for the launch market.",
      "Any arbitration, class-action waiver, or consumer-dispute wording should be drafted for the exact market before use.",
      "Termination does not erase obligations that should survive, including content licenses, safety records, payment duties, disclaimers, indemnity, and dispute terms.",
      "Account closure requests may be limited by active investigations, legal holds, fraud prevention, or unresolved disputes.",
    ],
  },
  {
    id: "law-enforcement",
    eyebrow: "Legal Requests & Law Enforcement",
    title: "How official requests are handled",
    body: [
      "BareUnity may review subpoenas, court orders, warrants, emergency disclosure requests, preservation requests, regulator notices, and other legal demands. We assess validity, scope, jurisdiction, and user safety before responding where possible.",
      "We may preserve or disclose account information when we believe it is legally required, necessary to protect someone from imminent harm, needed to investigate exploitation or abuse, or appropriate to protect BareUnity, members, or the public.",
      "Where legally permitted and safe, we may notify affected members about legal requests. We may delay or withhold notice if prohibited by law, risk of harm, fraud, abuse, or investigation integrity.",
    ],
    cards: [
      "Emergency requests should clearly identify the immediate risk and the data requested.",
      "Overbroad, informal, or unverifiable requests may be rejected or narrowed.",
      "We may challenge requests that conflict with privacy, speech, safety, jurisdiction, or due-process interests.",
      "Preservation does not guarantee disclosure without valid legal process.",
    ],
  },
  {
    id: "changes-contact",
    eyebrow: "Changes & Contact",
    title: "Policy updates and getting help",
    body: [
      "We may update these policies to reflect new features, legal requirements, safety needs, vendor changes, or operational changes. Material updates should be posted here and may also be announced in-product or by email.",
      "Your continued use of BareUnity after an update means you accept the revised policies, unless a separate consent flow is legally required. If you disagree, stop using the service and request account closure.",
      "For privacy, safety, IP, moderation, accessibility, or legal questions, contact BareUnity at jeroen@bareunity.com.",
    ],
    cards: [
      "Keep a dated archive of policy versions for accountability.",
      "Official legal name/domain is BareUnity and the universal contact email is jeroen@bareunity.com; add any legally required postal address, registered agent, or governing-law details for the launch market.",
      "Add region-specific notices if targeting specific countries, states, or regulated user groups.",
      "Review policies whenever verification, messaging, payments, ads, analytics, AI tools, or venue listings change.",
    ],
  },
];



export function getPolicyById(id: string) {
  return policyGroups.find((policy) => policy.id === id);
}