import type { DomainPack } from "../contracts";

export interface RegisteredDomain {
    pack: DomainPack;

    registeredAt: Date;

    active: boolean;
}