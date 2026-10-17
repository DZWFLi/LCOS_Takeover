import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Slot = 'search' | 'where' | 'pin' | null;
interface HudSlot { readonly active: Slot; activate(slot: Exclude<Slot, null>): void; close(slot: Exclude<Slot, null>): void }
const Context = createContext<HudSlot | null>(null);
function useSlotState(): HudSlot {
  const [active, setActive] = useState<Slot>(null);
  const activate = useCallback((slot: Exclude<Slot, null>) => setActive(slot), []);
  const close = useCallback((slot: Exclude<Slot, null>) => setActive((current) => current === slot ? null : current), []);
  return useMemo(() => ({ active, activate, close }), [active, activate, close]);
}
/** Presentation arbitration only: search, occurrences and pin membership retain their owners. */
export function NavigationHudProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const value = useSlotState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNavigationHudSlot(): HudSlot {
  const shared = useContext(Context);
  const standalone = useSlotState();
  return shared ?? standalone;
}
