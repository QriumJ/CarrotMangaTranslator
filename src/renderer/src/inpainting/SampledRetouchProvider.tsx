import React from "react";
import {
  SampledRetouchContext,
  useSampledRetouchState,
} from "./sampledRetouchModel";
export function SampledRetouchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useSampledRetouchState();
  return (
    <SampledRetouchContext.Provider value={value}>
      {children}
    </SampledRetouchContext.Provider>
  );
}
