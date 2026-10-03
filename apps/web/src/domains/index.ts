import { education } from "./education";
import { finance } from "./finance";
import { healthcare } from "./healthcare";
import type { ChatConfig, DomainConfig } from "./types";

export type { ChatConfig, DomainConfig };

// Landing page order. Only domains with a chat config can be queried.
export const DOMAINS: readonly DomainConfig[] = [healthcare, education, finance];

type ChatDomain = DomainConfig & { chat: ChatConfig };

const chatDomain = DOMAINS.find(
  (domain): domain is ChatDomain => domain.status === "live" && domain.chat !== undefined,
);
if (!chatDomain) throw new Error("No live domain with a chat configuration is registered");

export const activeDomain = chatDomain;
