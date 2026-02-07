export const mapDomain = (domain: string) => {
  switch (domain) {
    case "follow_up":
      return "FOLLOW_UP";
    case "portal":
      return "PORTAL";
    case "job_application":
      return "JOB_APP";
    case "scholarship":
      return "SCHOLARSHIP";
    case "academic":
      return "ACADEMIC";
    case "financial":
      return "FINANCIAL";
    case "medical":
      return "MEDICAL";
    case "legal":
      return "LEGAL";
    case "housing":
      return "HOUSING";
    default:
      return "OTHER";
  }
};

export const mapUrgency = (urgency: string) => urgency.toUpperCase();

export const mapComplexity = (complexity: string) => complexity.toUpperCase();

export const mapEffort = (effort: string) => effort.toUpperCase();

export const mapDelegation = (delegation: string) => {
  switch (delegation) {
    case "can_draft":
      return "CAN_DRAFT";
    case "can_remind":
      return "CAN_REMIND";
    case "can_track":
      return "CAN_TRACK";
    default:
      return "USER_ONLY";
  }
};

export const mapStepStatus = (status: string) => {
  switch (status) {
    case "done":
      return "DONE";
    default:
      return "PENDING";
  }
};