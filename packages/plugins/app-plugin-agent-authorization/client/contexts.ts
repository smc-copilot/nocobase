import { createContext, useContext, type Context } from 'react';

export interface AgentAuthorizationContextValue {
  readonly welcomeMessage: string;
}

export const AgentAuthorizationContext: Context<
  AgentAuthorizationContextValue | undefined
> = createContext<AgentAuthorizationContextValue | undefined>(undefined);

export function useAgentAuthorization(): AgentAuthorizationContextValue {
  const value = useContext(AgentAuthorizationContext);
  if (!value) {
    throw new Error(
      'useAgentAuthorization must be used within AgentAuthorizationProvider.',
    );
  }
  return value;
}
