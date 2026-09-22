import { computeBaselineRisk } from "@flood-ai/risk-runtime";
import type { RiskFeatures, RiskResult } from "@flood-ai/shared";

export interface RiskWorkerRequest {
  requestId: number;
  features: RiskFeatures[];
  rainfallTotalInches: number;
  rainfallScenarioId: string;
  dataVersion: string;
}

export interface RiskWorkerResponse {
  requestId: number;
  results: RiskResult[];
}

self.onmessage = (event: MessageEvent<RiskWorkerRequest>) => {
  const { requestId, features, rainfallTotalInches, rainfallScenarioId, dataVersion } = event.data;
  const results = features.map((f) =>
    computeBaselineRisk(f, { rainfallTotalInches, rainfallScenarioId, dataVersion }),
  );
  const response: RiskWorkerResponse = { requestId, results };
  (self as unknown as Worker).postMessage(response);
};
