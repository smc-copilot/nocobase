declare module '@nocobase/app-client' {
  /** Published by `server/config/casdoor-identity.ts` (`public: ['browserSignIn']`). */
  interface PublicAppConfig {
    casdoorIdentity: {
      browserSignIn?: boolean;
    };
  }
}

export {};
