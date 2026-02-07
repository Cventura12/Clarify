export const cases: Array<{
  id: string;
  rawInput: string;
  expected: {
    domains?: string[];
    minSteps?: number;
    mustMention?: string[];
    mustNotMention?: string[];
  };
}> = [
  {
    id: "financial_fafsa_portal",
    rawInput:
      "I need to finish my FAFSA for next year. I have my parent tax info but the portal keeps timing out. Deadline is in two weeks.",
    expected: {
      domains: ["FINANCIAL", "PORTAL"],
      minSteps: 3,
      mustMention: ["FAFSA", "portal", "deadline"],
    },
  },
  {
    id: "scholarship_recommendation",
    rawInput:
      "I want to apply for the Jack Kent Cooke scholarship. I haven't asked my counselor for a recommendation yet. The app is due next month.",
    expected: {
      domains: ["SCHOLARSHIP", "ACADEMIC"],
      minSteps: 4,
      mustMention: ["recommendation", "deadline"],
    },
  },
  {
    id: "academic_transcript_request",
    rawInput:
      "My college requires an official transcript sent to them. I don't know where to request it.",
    expected: {
      domains: ["ACADEMIC", "PORTAL"],
      minSteps: 2,
      mustMention: ["transcript"],
    },
  },
  {
    id: "financial_payment_plan",
    rawInput:
      "I need to set up a tuition payment plan before the fee due date. I already emailed the bursar last week.",
    expected: {
      domains: ["FINANCIAL", "FOLLOW_UP"],
      minSteps: 3,
      mustMention: ["payment plan", "bursar"],
    },
  },
  {
    id: "housing_lease_followup",
    rawInput:
      "My campus housing application says pending. I submitted it but never got a confirmation email. Can you help me follow up?",
    expected: {
      domains: ["HOUSING", "FOLLOW_UP"],
      minSteps: 2,
      mustMention: ["housing", "follow"],
    },
  },
  {
    id: "medical_insurance_form",
    rawInput:
      "The university needs proof of health insurance or I have to enroll. I have my policy but not sure where to upload it.",
    expected: {
      domains: ["MEDICAL", "PORTAL"],
      minSteps: 3,
      mustMention: ["insurance", "upload"],
    },
  },
  {
    id: "legal_name_change_docs",
    rawInput:
      "I need to update my student records after a legal name change. I have the court order but don't know the process.",
    expected: {
      domains: ["LEGAL", "ACADEMIC"],
      minSteps: 3,
      mustMention: ["court order", "records"],
    },
  },
  {
    id: "job_app_followup",
    rawInput:
      "I applied for a campus job 12 days ago and haven't heard back. Should I follow up?",
    expected: {
      domains: ["JOB_APP", "FOLLOW_UP"],
      minSteps: 2,
      mustMention: ["follow"],
    },
  },
  {
    id: "general_bill_dispute",
    rawInput:
      "My phone bill has a $40 charge I don't recognize. I want to dispute it and avoid late fees.",
    expected: {
      domains: ["FINANCIAL", "OTHER"],
      minSteps: 3,
      mustMention: ["charge", "dispute"],
    },
  },
  {
    id: "general_calendar_cleanup",
    rawInput:
      "I need to clean up my calendar and reschedule two meetings next week, but I'm not sure who to contact first.",
    expected: {
      domains: ["OTHER"],
      minSteps: 2,
      mustMention: ["reschedule", "meetings"],
    },
  },
];