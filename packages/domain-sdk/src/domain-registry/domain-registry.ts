import type { DomainPack } from "../contracts";

import type { RegisteredDomain } from "./registered-domain";

import type { RegistryResult } from "./registry-result";

export interface DomainRegistry {

    register(pack: DomainPack): RegistryResult;

    unregister(id: string): RegistryResult;

    get(id: string): RegisteredDomain | undefined;

    getAll(): RegisteredDomain[];
}