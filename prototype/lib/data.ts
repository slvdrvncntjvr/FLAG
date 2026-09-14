export type Outcome = "Positive" | "Mixed" | "Flagged";
export type RiskTag = "Late Payment" | "Non-Payment" | "Unresponsive" | "Scope Creep";
export type PosTag = "On-time Payment" | "Clear Scope" | "Responsive" | "Professional";
export type Tag = RiskTag | PosTag;

export const RISK_TAGS: RiskTag[] = ["Late Payment", "Non-Payment", "Unresponsive", "Scope Creep"];
export const POS_TAGS: PosTag[] = ["On-time Payment", "Clear Scope", "Responsive", "Professional"];
export const TAGS: Tag[] = [...POS_TAGS, ...RISK_TAGS];

export const TAG_STYLE: Record<Tag, string> = {
  "On-time Payment": "bg-leaf-soft text-leaf border-leaf/25",
  "Clear Scope": "bg-leaf-soft text-leaf border-leaf/25",
  "Responsive": "bg-cream text-ink-soft border-ink/15",
  "Professional": "bg-cream text-ink-soft border-ink/15",
  "Late Payment": "bg-amber-soft text-amber-warn border-amber-warn/25",
  "Non-Payment": "bg-melon-soft text-melon-deep border-melon-deep/25",
  "Unresponsive": "bg-cream text-ink-soft border-ink/15",
  "Scope Creep": "bg-amber-soft text-amber-warn border-amber-warn/25",
};

export type Client = {
  id: string;
  name: string;
  channel: string;
  location: string;
  firstSeen: string;
  total: number;
  positive: number;
  flagged: number;
  mixed: number;
  tags: Record<Tag, number>;
  lastActivity: string;
  standing: "Steady" | "Mixed" | "Caution";
};

export function share(c: Client) {
  return Math.round((c.positive / Math.max(1, c.total)) * 100);
}

export type Entry = {
  id: string;
  clientId: string;
  outcome: Outcome;
  tag: Tag;
  summary: string;
  amount: string;
  period: string;
  proof: string;
  status: string;
  reply: boolean;
  date: string;
};

export const CLIENTS: Client[] = [
  {
    id: "marikina-bakeshop", name: "Marikina Bakeshop Co.", channel: "Direct · Messenger", location: "Marikina City", firstSeen: "Nov 2025",
    total: 23, positive: 15, flagged: 7, mixed: 1, lastActivity: "2 days ago", standing: "Mixed",
    tags: { "On-time Payment": 11, "Clear Scope": 8, "Responsive": 9, "Professional": 7, "Late Payment": 4, "Non-Payment": 1, "Unresponsive": 2, "Scope Creep": 1 },
  },
  {
    id: "qc-agency-north", name: "North QC Creative Studio", channel: "Direct · Email + Drive", location: "Quezon City", firstSeen: "Oct 2025",
    total: 31, positive: 22, flagged: 5, mixed: 4, lastActivity: "5 days ago", standing: "Steady",
    tags: { "On-time Payment": 18, "Clear Scope": 12, "Responsive": 16, "Professional": 14, "Late Payment": 1, "Non-Payment": 0, "Unresponsive": 1, "Scope Creep": 4 },
  },
  {
    id: "cebu-logistics", name: "Cebu Port Logistics", channel: "Referral · Viber", location: "Cebu City", firstSeen: "Dec 2025",
    total: 12, positive: 7, flagged: 4, mixed: 1, lastActivity: "1 week ago", standing: "Mixed",
    tags: { "On-time Payment": 5, "Clear Scope": 4, "Responsive": 3, "Professional": 4, "Late Payment": 3, "Non-Payment": 0, "Unresponsive": 2, "Scope Creep": 0 },
  },
  {
    id: "makati-fintech", name: "Makati Fintech Startup", channel: "Direct · Contract", location: "Makati", firstSeen: "Jan 2026",
    total: 9, positive: 4, flagged: 3, mixed: 2, lastActivity: "2 weeks ago", standing: "Caution",
    tags: { "On-time Payment": 3, "Clear Scope": 2, "Responsive": 3, "Professional": 2, "Late Payment": 1, "Non-Payment": 1, "Unresponsive": 1, "Scope Creep": 1 },
  },
  {
    id: "davao-cafe", name: "Davao Riverside Cafe", channel: "Local gig · Walk-in", location: "Davao City", firstSeen: "Feb 2026",
    total: 14, positive: 12, flagged: 2, mixed: 0, lastActivity: "3 weeks ago", standing: "Steady",
    tags: { "On-time Payment": 10, "Clear Scope": 9, "Responsive": 8, "Professional": 9, "Late Payment": 2, "Non-Payment": 0, "Unresponsive": 0, "Scope Creep": 0 },
  },
  {
    id: "bgc-clothing", name: "BGC Clothing Label", channel: "IG DM · No contract", location: "Taguig", firstSeen: "Mar 2026",
    total: 7, positive: 3, flagged: 2, mixed: 2, lastActivity: "1 month ago", standing: "Mixed",
    tags: { "On-time Payment": 2, "Clear Scope": 1, "Responsive": 2, "Professional": 1, "Late Payment": 0, "Non-Payment": 1, "Unresponsive": 1, "Scope Creep": 1 },
  },
];

export const ENTRIES: Entry[] = [
  { id: "R-1042", clientId: "marikina-bakeshop", outcome: "Flagged", tag: "Late Payment", summary: "Milestone paid 34 days after invoice. Two follow-ups went unanswered before partial release.", amount: "P18,500", period: "Jan 12 - Feb 28", proof: "Invoice + transfer receipt", status: "Published", reply: true, date: "Mar 02" },
  { id: "R-1041", clientId: "marikina-bakeshop", outcome: "Positive", tag: "On-time Payment", summary: "Second batch paid in 6 days with clear remittance note. No follow-up needed.", amount: "P14,000", period: "Feb 10 - Feb 18", proof: "Invoice + receipt", status: "Published", reply: false, date: "Feb 28" },
  { id: "R-1039", clientId: "marikina-bakeshop", outcome: "Flagged", tag: "Unresponsive", summary: "No reply for 11 days after final files were sent. Reappeared asking for source files.", amount: "P12,000", period: "Feb 01 - Feb 20", proof: "Thread export", status: "Published", reply: false, date: "Feb 27" },
  { id: "R-1031", clientId: "qc-agency-north", outcome: "Flagged", tag: "Scope Creep", summary: "10 social cards became 26 plus reels. No change order signed despite request.", amount: "P25,000", period: "Jan 05 - Jan 30", proof: "Brief vs delivery sheet", status: "Published", reply: true, date: "Feb 18" },
  { id: "R-1030", clientId: "qc-agency-north", outcome: "Positive", tag: "Clear Scope", summary: "Brief locked day one with deliverables table. Revisions stayed inside two rounds.", amount: "P28,000", period: "Jan 12 - Jan 26", proof: "Signed brief + approval", status: "Published", reply: false, date: "Feb 12" },
  { id: "R-1028", clientId: "cebu-logistics", outcome: "Flagged", tag: "Late Payment", summary: "30-day terms stretched to 58 days. Paid only after second invoice with late note.", amount: "P32,000", period: "Dec 10 - Jan 25", proof: "Invoice + bank slip", status: "Published", reply: false, date: "Feb 10" },
  { id: "R-1024", clientId: "makati-fintech", outcome: "Flagged", tag: "Non-Payment", summary: "Final 50 percent never released after handover. Last contact Feb 2.", amount: "P45,000", period: "Dec 15 - Jan 20", proof: "Contract + delivery log", status: "Published", reply: false, date: "Feb 04" },
  { id: "R-1019", clientId: "bgc-clothing", outcome: "Mixed", tag: "Scope Creep", summary: "Lookbook shoot added day of without fee change, but balance was paid on time after.", amount: "P15,000", period: "Jan 18 - Jan 19", proof: "DM screenshots + receipt", status: "Published", reply: true, date: "Jan 29" },
];

export const REPORTS = ENTRIES;

export const QUEUE = [
  { id: "R-1048", client: "Marikina Bakeshop Co.", tag: "Late Payment" as Tag, outcome: "Flagged" as Outcome, submitted: "6h ago", proof: "Invoice PDF + transfer slip", reporter: "Verified · ID + portfolio" },
  { id: "R-1047", client: "Cebu Port Logistics", tag: "Responsive" as Tag, outcome: "Positive" as Outcome, submitted: "14h ago", proof: "Thread export + receipt", reporter: "Verified · Work history" },
  { id: "R-1046", client: "North QC Creative Studio", tag: "Scope Creep" as Tag, outcome: "Mixed" as Outcome, submitted: "22h ago", proof: "Brief vs timesheet", reporter: "Verified · ID + portfolio" },
  { id: "R-1045", client: "Davao Riverside Cafe", tag: "On-time Payment" as Tag, outcome: "Positive" as Outcome, submitted: "31h ago", proof: "Invoice photo + receipt", reporter: "Pending review" },
];

export const STATS = [
  { value: 96, suffix: "", label: "Engagements logged" },
  { value: 63, suffix: "%", label: "Positive outcomes" },
  { value: 48, suffix: "h", label: "Max review time" },
  { value: 100, suffix: "%", label: "Proof attached" },
];

export function getClient(id: string) {
  return CLIENTS.find((c) => c.id === id);
}
export function reportsFor(id: string) {
  return ENTRIES.filter((r) => r.clientId === id);
}
